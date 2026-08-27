/* =========================================================================
 * HYPERCELL — 25_postfx.js
 * A compact bloom + grade pipeline written directly against the core
 * renderer (no examples bundle): bright-pass → separable blur at three
 * scales → additive composite with vignette and chromatic edge tint.
 *
 * Bloom is what makes the neon, muzzle flashes and energy weapons read as
 * "lit" rather than "bright coloured". It is the single highest-value
 * post effect for this art direction, so it gets a real implementation.
 * ========================================================================= */
(function (HC, THREE) {
  'use strict';

  const U = HC.Util;
  const CFG = HC.CFG;

  const QUAD_VS = `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

  const BRIGHT_FS = `
    uniform sampler2D tDiffuse;
    uniform float uThreshold;
    uniform float uSoftKnee;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      float knee = uThreshold * uSoftKnee + 1e-5;
      float soft = clamp(lum - uThreshold + knee, 0.0, 2.0 * knee);
      soft = soft * soft / (4.0 * knee);
      float contrib = max(soft, lum - uThreshold) / max(lum, 1e-5);
      gl_FragColor = vec4(c.rgb * contrib, 1.0);
    }`;

  const BLUR_FS = `
    uniform sampler2D tDiffuse;
    uniform vec2 uDirection;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      // 9-tap gaussian, linear-sampled to halve the fetch count.
      vec2 off1 = uDirection * uTexel * 1.3846153846;
      vec2 off2 = uDirection * uTexel * 3.2307692308;
      vec4 c = texture2D(tDiffuse, vUv) * 0.2270270270;
      c += texture2D(tDiffuse, vUv + off1) * 0.3162162162;
      c += texture2D(tDiffuse, vUv - off1) * 0.3162162162;
      c += texture2D(tDiffuse, vUv + off2) * 0.0702702703;
      c += texture2D(tDiffuse, vUv - off2) * 0.0702702703;
      gl_FragColor = c;
    }`;

  const COMPOSITE_FS = `
    uniform sampler2D tDiffuse;
    uniform sampler2D tBloom0;
    uniform sampler2D tBloom1;
    uniform sampler2D tBloom2;
    uniform sampler2D tAO;
    uniform float uAOEnabled;
    uniform float uStrength;
    uniform float uVignette;
    uniform float uGrade;
    uniform vec3 uTint;
    varying vec2 vUv;
    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      if (uAOEnabled > 1.5) {
        // Debug view: the raw occlusion term, for tuning radius/intensity.
        gl_FragColor = vec4(vec3(texture2D(tAO, vUv).r), 1.0);
        return;
      }
      if (uAOEnabled > 0.5) {
        // Occlusion darkens ambient response; bloom is added after so bright
        // emissive surfaces are never dimmed by a crease behind them.
        base *= mix(1.0, texture2D(tAO, vUv).r, 0.85);
      }
      vec3 bloom =
        texture2D(tBloom0, vUv).rgb * 0.55 +
        texture2D(tBloom1, vUv).rgb * 0.32 +
        texture2D(tBloom2, vUv).rgb * 0.20;
      vec3 col = base + bloom * uStrength;

      // Subtle filmic S-curve keeps highlights from flattening out.
      //
      // smoothstep's polynomial is only well behaved on [0,1]: at col = 2 it
      // evaluates to -4, and a negative channel clipped to zero is how a
      // bright light came out with a red core and a green fringe. Curve the
      // in-range part and let overbright energy pass through untouched, so a
      // blown highlight ends up white instead of coloured.
      vec3 low = clamp(col, 0.0, 1.0);
      vec3 over = max(col - 1.0, 0.0);
      vec3 curved = low * low * (3.0 - 2.0 * low) + over;
      col = mix(col, curved, uGrade * 0.35);
      col *= uTint;

      vec2 d = vUv - 0.5;
      float vig = 1.0 - dot(d, d) * uVignette;
      col *= clamp(vig, 0.0, 1.0);

      // The scene was rendered into a linear target, so this pass owns the
      // sRGB transfer that the renderer would normally apply on the canvas.
      col = max(col, vec3(0.0));
      vec3 lo = col * 12.92;
      vec3 hi = 1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055;
      col = mix(hi, lo, step(col, vec3(0.0031308)));

      gl_FragColor = vec4(col, 1.0);
    }`;

  /* Screen-space ambient occlusion.
   *
   * Reconstructs view-space position and normal from the depth buffer, then
   * samples a hemisphere around each pixel. This is what puts contact shadow
   * into every crease, under every shoulder pad and where a boot meets the
   * ground — the difference between "objects floating near each other" and
   * "objects that are actually in the same room". */
  const SSAO_FS = `
    uniform sampler2D tDepth;
    uniform mat4 uProjection;
    uniform mat4 uInverseProjection;
    uniform vec2 uResolution;
    uniform float uRadius;
    uniform float uBias;
    uniform float uIntensity;
    uniform float uNear;
    uniform float uFar;
    varying vec2 vUv;

    const int KERNEL = 12;

    vec3 viewPos(vec2 uv, float d) {
      vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      vec4 v = uInverseProjection * clip;
      return v.xyz / v.w;
    }

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      float d = texture2D(tDepth, vUv).x;
      if (d >= 0.9999) { gl_FragColor = vec4(1.0); return; }

      vec3 p = viewPos(vUv, d);
      vec2 texel = 1.0 / uResolution;

      // Reconstruct the normal from whichever neighbour is closer in depth.
      // Taking the forward difference blindly smears the normal across every
      // silhouette and turns the whole pass into an edge detector.
      vec3 pR = viewPos(vUv + vec2(texel.x, 0.0), texture2D(tDepth, vUv + vec2(texel.x, 0.0)).x);
      vec3 pL = viewPos(vUv - vec2(texel.x, 0.0), texture2D(tDepth, vUv - vec2(texel.x, 0.0)).x);
      vec3 pU = viewPos(vUv + vec2(0.0, texel.y), texture2D(tDepth, vUv + vec2(0.0, texel.y)).x);
      vec3 pD = viewPos(vUv - vec2(0.0, texel.y), texture2D(tDepth, vUv - vec2(0.0, texel.y)).x);
      vec3 dx = abs(pR.z - p.z) < abs(p.z - pL.z) ? (pR - p) : (p - pL);
      vec3 dy = abs(pU.z - p.z) < abs(p.z - pD.z) ? (pU - p) : (p - pD);
      vec3 n = normalize(cross(dx, dy));
      if (n.z < 0.0) n = -n;

      float a = rand(vUv) * 6.2831853;
      vec3 rvec = normalize(vec3(cos(a), sin(a), 0.0));
      vec3 tangent = normalize(rvec - n * dot(rvec, n));
      vec3 bitangent = cross(n, tangent);
      mat3 tbn = mat3(tangent, bitangent, n);

      float occlusion = 0.0;
      for (int i = 0; i < KERNEL; i++) {
        float fi = float(i);
        // Deterministic hemisphere points, weighted toward the origin.
        float s1 = rand(vec2(fi, 0.37)) * 2.0 - 1.0;
        float s2 = rand(vec2(fi, 0.71)) * 2.0 - 1.0;
        float s3 = rand(vec2(fi, 0.13));
        vec3 samp = normalize(vec3(s1, s2, s3 * 0.85 + 0.15));
        samp *= mix(0.25, 1.0, (fi / float(KERNEL)) * (fi / float(KERNEL)));

        vec3 sp = p + tbn * samp * uRadius;
        vec4 off = uProjection * vec4(sp, 1.0);
        off.xyz /= off.w;
        vec2 suv = off.xy * 0.5 + 0.5;
        if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;

        float sd = texture2D(tDepth, suv).x;
        vec3 sampleView = viewPos(suv, sd);
        float rangeCheck = smoothstep(0.0, 1.0, uRadius / max(0.0001, abs(p.z - sampleView.z)));
        if (sampleView.z >= sp.z + uBias) occlusion += rangeCheck;
      }
      float ao = 1.0 - (occlusion / float(KERNEL)) * uIntensity;
      gl_FragColor = vec4(clamp(ao, 0.0, 1.0));
    }`;

  /* A 4-tap cross blur is enough to kill SSAO noise at this sample count. */
  const AO_BLUR_FS = `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      float s = texture2D(tDiffuse, vUv).r;
      s += texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).r;
      s += texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).r;
      s += texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).r;
      s += texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).r;
      s += texture2D(tDiffuse, vUv + uTexel).r;
      s += texture2D(tDiffuse, vUv - uTexel).r;
      s += texture2D(tDiffuse, vUv + vec2(uTexel.x, -uTexel.y)).r;
      s += texture2D(tDiffuse, vUv + vec2(-uTexel.x, uTexel.y)).r;
      gl_FragColor = vec4(s / 9.0);
    }`;

  /* Compact luma FXAA. MSAA is unavailable on a multisampled float target in
   * several browsers, and jagged silhouettes are a loud cheapness cue. */
  const FXAA_FS = `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    varying vec2 vUv;
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main() {
      vec3 rgbM = texture2D(tDiffuse, vUv).rgb;
      float lM = luma(rgbM);
      float lNW = luma(texture2D(tDiffuse, vUv + vec2(-uTexel.x, -uTexel.y)).rgb);
      float lNE = luma(texture2D(tDiffuse, vUv + vec2( uTexel.x, -uTexel.y)).rgb);
      float lSW = luma(texture2D(tDiffuse, vUv + vec2(-uTexel.x,  uTexel.y)).rgb);
      float lSE = luma(texture2D(tDiffuse, vUv + vec2( uTexel.x,  uTexel.y)).rgb);

      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
      float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      if (lMax - lMin < max(0.035, lMax * 0.125)) { gl_FragColor = vec4(rgbM, 1.0); return; }

      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
      float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
      float rcpDir = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
      dir = clamp(dir * rcpDir, -8.0, 8.0) * uTexel;

      vec3 rgbA = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb +
                         texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
      vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - dir * 0.5).rgb +
                                       texture2D(tDiffuse, vUv + dir * 0.5).rgb);
      float lB = luma(rgbB);
      gl_FragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);
    }`;

  const BLEND_FS = `
    uniform sampler2D tCurrent;
    uniform sampler2D tHistory;
    uniform float uAmount;
    varying vec2 vUv;
    void main() {
      vec3 cur = texture2D(tCurrent, vUv).rgb;
      vec3 his = texture2D(tHistory, vUv).rgb;
      gl_FragColor = vec4(mix(cur, his, uAmount), 1.0);
    }`;

  const COPY_FS = `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() { gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0); }`;

  HC.PostFX = function PostFX(renderer) {
    const P = {
      renderer, enabled: true, width: 1, height: 1,
      _targets: null, _quad: null, _camera: null, _scene: null
    };

    const quadGeo = new THREE.PlaneGeometry(2, 2);
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadScene = new THREE.Scene();
    const quadMesh = new THREE.Mesh(quadGeo, null);
    quadMesh.frustumCulled = false;
    quadScene.add(quadMesh);

    const halfFloat = (function () {
      try { return renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType; }
      catch (e) { return THREE.UnsignedByteType; }
    })();

    function makeTarget(w, h) {
      const t = new THREE.WebGLRenderTarget(Math.max(2, Math.floor(w)), Math.max(2, Math.floor(h)), {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat, type: halfFloat, depthBuffer: false, stencilBuffer: false
      });
      if ('colorSpace' in t.texture) t.texture.colorSpace = THREE.NoColorSpace;
      return t;
    }

    const brightMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: CFG.gfx.bloomThreshold }, uSoftKnee: { value: 0.6 } },
      vertexShader: QUAD_VS, fragmentShader: BRIGHT_FS, depthTest: false, depthWrite: false
    });
    const blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDirection: { value: new THREE.Vector2(1, 0) }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false
    });
    const compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tBloom0: { value: null }, tBloom1: { value: null }, tBloom2: { value: null },
        tAO: { value: null }, uAOEnabled: { value: 0 },
        uStrength: { value: CFG.gfx.bloomStrength }, uVignette: { value: 0.62 },
        uGrade: { value: 1.0 }, uTint: { value: new THREE.Color(1.02, 1.0, 1.05) }
      },
      vertexShader: QUAD_VS, fragmentShader: COMPOSITE_FS, depthTest: false, depthWrite: false
    });

    const blendMat = new THREE.ShaderMaterial({
      uniforms: { tCurrent: { value: null }, tHistory: { value: null }, uAmount: { value: 0 } },
      vertexShader: QUAD_VS, fragmentShader: BLEND_FS, depthTest: false, depthWrite: false
    });
    const copyMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: QUAD_VS, fragmentShader: COPY_FS, depthTest: false, depthWrite: false
    });

    const ssaoMat = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null },
        uProjection: { value: new THREE.Matrix4() },
        uInverseProjection: { value: new THREE.Matrix4() },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uRadius: { value: CFG.gfx.ssaoRadius },
        uBias: { value: 0.022 },
        uIntensity: { value: CFG.gfx.ssaoIntensity },
        uNear: { value: 0.1 }, uFar: { value: 500 }
      },
      vertexShader: QUAD_VS, fragmentShader: SSAO_FS, depthTest: false, depthWrite: false
    });
    const aoBlurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VS, fragmentShader: AO_BLUR_FS, depthTest: false, depthWrite: false
    });
    const fxaaMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VS, fragmentShader: FXAA_FS, depthTest: false, depthWrite: false
    });

    /* SSAO reads the depth buffer as a texture. A multisampled colour target
     * cannot hand out its depth attachment on every driver, so when occlusion
     * is on the scene target drops MSAA and FXAA takes over edge duty. */
    function ssaoOn() { return !!(CFG.gfx.ssao && renderer.capabilities.isWebGL2); }

    /* Motion blur is a temporal smear whose weight follows how fast the
     * camera is actually turning, so it only appears when you whip the view
     * around — never as a permanent softening of the image. */
    P.motionAmount = 0;
    const _prevQuat = new THREE.Quaternion();
    let _hasPrevQuat = false;

    P.updateMotion = function (camera, dt) {
      if (!CFG.gfx.motionBlur || dt <= 0) { P.motionAmount = 0; _hasPrevQuat = false; return; }
      if (!_hasPrevQuat) { _prevQuat.copy(camera.quaternion); _hasPrevQuat = true; P.motionAmount = 0; return; }
      const angle = 2 * Math.acos(Math.min(1, Math.abs(_prevQuat.dot(camera.quaternion))));
      _prevQuat.copy(camera.quaternion);
      const rate = angle / dt;                       // radians per second
      const target = U.clamp01((rate - 0.6) / 5.0) * 0.55;
      P.motionAmount = U.damp(P.motionAmount, target, 22, dt);
    };

    P.setSize = function (width, height) {
      P.width = width; P.height = height;
      if (P._targets) P._targets.forEach(t => t.dispose());
      if (P.sceneTarget) P.sceneTarget.dispose();

      if (P.depthTexture) P.depthTexture.dispose();
      P.depthTexture = null;

      const wantAO = ssaoOn();
      P.sceneTarget = new THREE.WebGLRenderTarget(Math.max(2, width), Math.max(2, height), {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat, type: halfFloat,
        depthBuffer: true, stencilBuffer: false,
        samples: (!wantAO && CFG.gfx.antialias && renderer.capabilities.isWebGL2) ? 4 : 0
      });
      if ('colorSpace' in P.sceneTarget.texture) P.sceneTarget.texture.colorSpace = THREE.NoColorSpace;

      if (wantAO) {
        P.depthTexture = new THREE.DepthTexture(Math.max(2, width), Math.max(2, height));
        P.depthTexture.type = THREE.UnsignedIntType;
        P.depthTexture.format = THREE.DepthFormat;
        P.depthTexture.minFilter = THREE.NearestFilter;
        P.depthTexture.magFilter = THREE.NearestFilter;
        P.sceneTarget.depthTexture = P.depthTexture;
      }

      P.bright = makeTarget(width / 2, height / 2);
      P.levels = [];
      let w = width / 2, h = height / 2;
      for (let i = 0; i < 3; i++) {
        P.levels.push({ a: makeTarget(w, h), b: makeTarget(w, h), w, h });
        w /= 2; h /= 2;
      }
      P.post = makeTarget(width, height);
      P.history = [makeTarget(width, height), makeTarget(width, height)];
      P.historyIndex = 0;
      P.historyValid = false;

      // Occlusion is a low-frequency signal; half resolution is free quality.
      P.aoW = Math.max(2, Math.floor(width / 2));
      P.aoH = Math.max(2, Math.floor(height / 2));
      P.aoRaw = makeTarget(P.aoW, P.aoH);
      P.aoSmooth = makeTarget(P.aoW, P.aoH);

      P._targets = [P.bright, P.post, P.history[0], P.history[1], P.aoRaw, P.aoSmooth]
        .concat(P.levels.reduce((acc, l) => acc.concat([l.a, l.b]), []));
    };

    function draw(material, target) {
      quadMesh.material = material;
      renderer.setRenderTarget(target || null);
      renderer.render(quadScene, quadCam);
    }

    /**
     * Renders `scene` through the pipeline. Falls back to a direct render
     * when bloom is disabled so the setting is genuinely free.
     */
    P.render = function (scene, camera) {
      if (!P.enabled || !CFG.gfx.bloom || !P.sceneTarget) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }

      renderer.setRenderTarget(P.sceneTarget);
      renderer.clear();
      renderer.render(scene, camera);

      // ---- ambient occlusion ------------------------------------------------
      if (P.depthTexture && CFG.gfx.ssao) {
        ssaoMat.uniforms.tDepth.value = P.depthTexture;
        ssaoMat.uniforms.uProjection.value.copy(camera.projectionMatrix);
        ssaoMat.uniforms.uInverseProjection.value.copy(camera.projectionMatrixInverse);
        ssaoMat.uniforms.uResolution.value.set(P.aoW, P.aoH);
        ssaoMat.uniforms.uRadius.value = CFG.gfx.ssaoRadius;
        ssaoMat.uniforms.uIntensity.value = CFG.gfx.ssaoIntensity;
        ssaoMat.uniforms.uNear.value = camera.near;
        ssaoMat.uniforms.uFar.value = camera.far;
        draw(ssaoMat, P.aoRaw);

        aoBlurMat.uniforms.tDiffuse.value = P.aoRaw.texture;
        aoBlurMat.uniforms.uTexel.value.set(1 / P.aoW, 1 / P.aoH);
        draw(aoBlurMat, P.aoSmooth);

        compositeMat.uniforms.tAO.value = P.aoSmooth.texture;
        compositeMat.uniforms.uAOEnabled.value = P.debugAO ? 2 : 1;
      } else {
        compositeMat.uniforms.uAOEnabled.value = 0;
      }

      brightMat.uniforms.tDiffuse.value = P.sceneTarget.texture;
      brightMat.uniforms.uThreshold.value = CFG.gfx.bloomThreshold;
      draw(brightMat, P.bright);

      let source = P.bright.texture;
      for (let i = 0; i < P.levels.length; i++) {
        const L = P.levels[i];
        blurMat.uniforms.tDiffuse.value = source;
        blurMat.uniforms.uDirection.value.set(1, 0);
        blurMat.uniforms.uTexel.value.set(1 / L.w, 1 / L.h);
        draw(blurMat, L.a);

        blurMat.uniforms.tDiffuse.value = L.a.texture;
        blurMat.uniforms.uDirection.value.set(0, 1);
        draw(blurMat, L.b);

        source = L.b.texture;
      }

      compositeMat.uniforms.tDiffuse.value = P.sceneTarget.texture;
      compositeMat.uniforms.tBloom0.value = P.levels[0].b.texture;
      compositeMat.uniforms.tBloom1.value = P.levels[1].b.texture;
      compositeMat.uniforms.tBloom2.value = P.levels[2].b.texture;
      compositeMat.uniforms.uStrength.value = CFG.gfx.bloomStrength * (CFG.access.reduceFlashing ? 0.6 : 1);

      // FXAA runs last, on the graded sRGB image, where edge contrast lives.
      const useFxaa = !!CFG.gfx.fxaa;
      if (useFxaa) fxaaMat.uniforms.uTexel.value.set(1 / P.width, 1 / P.height);

      function present(texture) {
        if (!useFxaa) { copyMat.uniforms.tDiffuse.value = texture; draw(copyMat, null); return; }
        fxaaMat.uniforms.tDiffuse.value = texture;
        draw(fxaaMat, null);
      }

      const blurAmount = CFG.gfx.motionBlur ? P.motionAmount : 0;
      if (blurAmount <= 0.004) {
        P.historyValid = false;
        if (!useFxaa) { draw(compositeMat, null); return; }
        draw(compositeMat, P.post);
        present(P.post.texture);
        return;
      }

      // composite -> post, blend with history -> next history, then to screen.
      draw(compositeMat, P.post);
      const prev = P.history[P.historyIndex];
      const next = P.history[1 - P.historyIndex];

      blendMat.uniforms.tCurrent.value = P.post.texture;
      blendMat.uniforms.tHistory.value = P.historyValid ? prev.texture : P.post.texture;
      blendMat.uniforms.uAmount.value = P.historyValid ? blurAmount : 0;
      draw(blendMat, next);

      present(next.texture);

      P.historyIndex = 1 - P.historyIndex;
      P.historyValid = true;
    };

    /* Exposed so tools can inspect and tune the chain from the console. */
    P.materials = { bright: brightMat, blur: blurMat, composite: compositeMat,
                    ssao: ssaoMat, aoBlur: aoBlurMat, fxaa: fxaaMat };
    P.debugAO = false;

    P.dispose = function () {
      if (P._targets) P._targets.forEach(t => t.dispose());
      if (P.sceneTarget) P.sceneTarget.dispose();
      if (P.post) P.post.dispose();
      if (P.history) P.history.forEach(t => t.dispose());
      if (P.depthTexture) P.depthTexture.dispose();
      quadGeo.dispose();
      brightMat.dispose(); blurMat.dispose(); compositeMat.dispose();
      blendMat.dispose(); copyMat.dispose();
      ssaoMat.dispose(); aoBlurMat.dispose(); fxaaMat.dispose();
    };

    return P;
  };

})(window.HC, window.THREE);
