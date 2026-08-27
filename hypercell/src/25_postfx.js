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
    uniform float uStrength;
    uniform float uVignette;
    uniform float uGrade;
    uniform vec3 uTint;
    varying vec2 vUv;
    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      vec3 bloom =
        texture2D(tBloom0, vUv).rgb * 0.55 +
        texture2D(tBloom1, vUv).rgb * 0.32 +
        texture2D(tBloom2, vUv).rgb * 0.20;
      vec3 col = base + bloom * uStrength;

      // Subtle filmic S-curve keeps highlights from flattening out.
      col = mix(col, col * col * (3.0 - 2.0 * col), uGrade * 0.35);
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
        uStrength: { value: CFG.gfx.bloomStrength }, uVignette: { value: 0.62 },
        uGrade: { value: 1.0 }, uTint: { value: new THREE.Color(1.02, 1.0, 1.05) }
      },
      vertexShader: QUAD_VS, fragmentShader: COMPOSITE_FS, depthTest: false, depthWrite: false
    });

    P.setSize = function (width, height) {
      P.width = width; P.height = height;
      if (P._targets) P._targets.forEach(t => t.dispose());
      if (P.sceneTarget) P.sceneTarget.dispose();

      P.sceneTarget = new THREE.WebGLRenderTarget(Math.max(2, width), Math.max(2, height), {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat, type: halfFloat,
        depthBuffer: true, stencilBuffer: false,
        samples: CFG.gfx.antialias && renderer.capabilities.isWebGL2 ? 4 : 0
      });
      if ('colorSpace' in P.sceneTarget.texture) P.sceneTarget.texture.colorSpace = THREE.NoColorSpace;

      P.bright = makeTarget(width / 2, height / 2);
      P.levels = [];
      let w = width / 2, h = height / 2;
      for (let i = 0; i < 3; i++) {
        P.levels.push({ a: makeTarget(w, h), b: makeTarget(w, h), w, h });
        w /= 2; h /= 2;
      }
      P._targets = [P.bright].concat(P.levels.reduce((acc, l) => acc.concat([l.a, l.b]), []));
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
      draw(compositeMat, null);
    };

    P.dispose = function () {
      if (P._targets) P._targets.forEach(t => t.dispose());
      if (P.sceneTarget) P.sceneTarget.dispose();
      quadGeo.dispose();
      brightMat.dispose(); blurMat.dispose(); compositeMat.dispose();
    };

    return P;
  };

})(window.HC, window.THREE);
