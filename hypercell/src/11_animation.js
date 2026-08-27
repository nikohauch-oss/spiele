/* =========================================================================
 * HYPERCELL — 11_animation.js
 * Procedural animation state machine.
 *
 * There are no baked clips: every pose is computed from the character's
 * physical state. This is deliberate — it means locomotion cycles are
 * driven by DISTANCE TRAVELLED rather than time, which is what removes
 * foot sliding entirely (brief §14), and it means a hero's `gait` block
 * changes how they move without needing new animation data.
 *
 * Layers, lowest to highest priority:
 *   base pose → locomotion → crouch/slide/air → aim → action (reload /
 *   fire / melee / ability) → hit reaction → death → cloth sim
 * ========================================================================= */
(function (HC, THREE) {
  'use strict';

  const U = HC.Util;
  const CFG = HC.CFG;

  /* A pose is a flat map of boneName -> [rx, ry, rz] plus a few offsets. */
  function blankPose() {
    return {
      hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
      shoulderL: [0, 0, 0], shoulderR: [0, 0, 0],
      armUpperL: [0, 0, 0], armUpperR: [0, 0, 0],
      armLowerL: [0, 0, 0], armLowerR: [0, 0, 0],
      handL: [0, 0, 0], handR: [0, 0, 0],
      thighL: [0, 0, 0], thighR: [0, 0, 0],
      shinL: [0, 0, 0], shinR: [0, 0, 0],
      footL: [0, 0, 0], footR: [0, 0, 0],
      hipsOffset: [0, 0, 0],
      rootTilt: [0, 0, 0]
    };
  }

  const BONE_KEYS = Object.keys(blankPose()).filter(k => k !== 'hipsOffset' && k !== 'rootTilt');

  function addPose(target, key, x, y, z, weight) {
    const t = target[key];
    if (!t) return;
    t[0] += x * weight; t[1] += y * weight; t[2] += z * weight;
  }

  /* ------------------------------------------------------------------ *
   * Animator
   * ------------------------------------------------------------------ */
  HC.Animator = function Animator(model, charDef) {
    const gait = Object.assign(
      { stride: 1, bounce: 1, armSwing: 1, hipSway: 1, weight: 1, idleSway: 1 },
      charDef.gait || {});
    const personality = charDef.personality || {};
    const bones = model.bones;
    const m = model.measure;

    // Reference stride: how far the character travels per full leg cycle.
    const strideLength = m.legLen * 1.42 * gait.stride;

    const A = {
      model, gait, personality,
      /* live inputs, written by the actor each tick */
      input: {
        speed: 0, planarVel: new THREE.Vector3(), localVelX: 0, localVelZ: 0,
        grounded: true, crouch: 0, aiming: 0, sprinting: false, sliding: false,
        airTime: 0, verticalVel: 0, lookPitch: 0, turnRate: 0, dead: false,
        moveIntensity: 0
      },
      /* cycle + timers */
      phase: 0, idleTime: 0, time: 0,
      lastFootDown: [false, false],
      /* action layer */
      action: null, actionTime: 0, actionDuration: 0, actionData: null,
      /* additive impulses */
      recoil: 0, recoilYaw: 0, hitReact: { x: 0, y: 0, timer: 0 },
      landDip: 0, deathTimer: -1, deathDir: 0,
      poseOverride: null, poseOverrideBlend: 0,
      /* smoothing state */
      current: blankPose(),
      target: blankPose(),
      _swingWeight: 0,
      events: HC.Events('anim')
    };

    /* ---- public control ------------------------------------------------ */
    A.playAction = function (name, duration, data) {
      A.action = name;
      A.actionTime = 0;
      A.actionDuration = Math.max(0.01, duration);
      A.actionData = data || null;
    };
    A.cancelAction = function () { A.action = null; A.actionTime = 0; };
    A.isPlaying = function (name) { return A.action === name; };

    A.addRecoil = function (amount, yaw) {
      A.recoil = Math.min(1.6, A.recoil + amount);
      A.recoilYaw = (yaw || 0);
    };
    A.addHitReaction = function (localX, localZ, power) {
      A.hitReact.x = U.clamp(localX * power, -1, 1);
      A.hitReact.y = U.clamp(localZ * power, -1, 1);
      A.hitReact.timer = 0.42;
    };
    A.addLandDip = function (power) { A.landDip = Math.min(1.4, A.landDip + power); };
    A.startDeath = function (dirX, dirZ) {
      A.deathTimer = 0;
      A.deathDir = Math.atan2(dirX, dirZ);
      A.action = null;
    };
    A.reset = function () {
      A.deathTimer = -1; A.action = null; A.recoil = 0; A.landDip = 0;
      A.hitReact.timer = 0; A.phase = 0; A.idleTime = 0;
      A.current = blankPose();
    };
    /** Menu / results poses: 'lobby', 'victory', 'defeat', 'select', 'emote_*' */
    A.setPoseOverride = function (name) { A.poseOverride = name; };

    /* ---- pose builders -------------------------------------------------- */

    function poseIdle(P, dt, w) {
      const t = A.time;
      const sway = gait.idleSway;
      const breathe = Math.sin(t * 1.35) * 0.5 + 0.5;
      addPose(P, 'chest', 0.018 * breathe + 0.02, 0, 0, w);
      addPose(P, 'spine', -0.012 * breathe, Math.sin(t * 0.62) * 0.020 * sway, 0, w);
      addPose(P, 'hips', 0, Math.sin(t * 0.62 + 0.4) * 0.014 * sway, Math.sin(t * 0.51) * 0.010 * sway, w);
      addPose(P, 'head', -0.03 + Math.sin(t * 0.9) * 0.02 * sway, Math.sin(t * 0.44) * 0.05 * sway, 0, w);
      P.hipsOffset[1] += Math.sin(t * 1.35) * 0.006 * gait.bounce * w;

      // Personality: distinct idle stances
      const stance = A.model.overrides.idlePose || personality.idlePose || 'ready';
      switch (stance) {
        case 'heavy':
          addPose(P, 'spine', 0.10, 0, 0, w); addPose(P, 'chest', 0.06, 0, 0, w);
          addPose(P, 'shoulderL', 0, 0, 0.22, w); addPose(P, 'shoulderR', 0, 0, -0.22, w);
          addPose(P, 'thighL', 0, 0, 0.13, w); addPose(P, 'thighR', 0, 0, -0.13, w); break;
        case 'loose': case 'weightless':
          addPose(P, 'hips', 0, 0, Math.sin(t * 1.1) * 0.05, w);
          addPose(P, 'chest', 0, Math.sin(t * 0.8) * 0.06, 0, w); break;
        case 'predator': case 'regal_predator': case 'four_point':
          addPose(P, 'spine', 0.16, 0, 0, w); addPose(P, 'chest', -0.06, 0, 0, w);
          addPose(P, 'head', -0.14, 0, 0, w);
          addPose(P, 'thighL', -0.14, 0, 0.05, w); addPose(P, 'shinL', 0.20, 0, 0, w); break;
        case 'restless': case 'unstable':
          addPose(P, 'hips', 0, Math.sin(t * 2.3) * 0.05, 0, w);
          addPose(P, 'head', 0, Math.sin(t * 1.7) * 0.12, 0, w); break;
        case 'serene': case 'orbital':
          addPose(P, 'chest', -0.05, 0, 0, w); addPose(P, 'head', 0.04, 0, 0, w);
          P.hipsOffset[1] += Math.sin(t * 0.7) * 0.02 * w; break;
        case 'sentinel': case 'command': case 'sovereign': case 'furnace':
          addPose(P, 'spine', -0.03, 0, 0, w); addPose(P, 'chest', -0.02, 0, 0, w);
          addPose(P, 'thighL', 0, 0, 0.07, w); addPose(P, 'thighR', 0, 0, -0.07, w); break;
        case 'watchful':
          addPose(P, 'head', 0, Math.sin(t * 0.5) * 0.22, 0, w);
          addPose(P, 'spine', 0.05, 0, 0, w); break;
      }
    }

    /**
     * Locomotion. `phase` advances with distance, so stride length is fixed
     * in world space and the feet stay planted.
     */
    function poseLocomotion(P, w, speedFrac, sprintFrac) {
      const ph = A.phase;
      const s = Math.sin(ph), c = Math.cos(ph);
      const amp = U.lerp(0.30, 0.78, speedFrac) * (1 + sprintFrac * 0.30);
      const armAmp = amp * gait.armSwing * 0.85;
      const heavy = gait.weight;

      // Legs: thigh swings, shin follows with a lag and only bends backwards.
      addPose(P, 'thighL', s * amp, 0, 0, w);
      addPose(P, 'thighR', -s * amp, 0, 0, w);
      const shinL = Math.max(0, -Math.sin(ph - 0.75)) * amp * 1.45;
      const shinR = Math.max(0, -Math.sin(ph + Math.PI - 0.75)) * amp * 1.45;
      addPose(P, 'shinL', shinL, 0, 0, w);
      addPose(P, 'shinR', shinR, 0, 0, w);
      // Ankles roll through the step so the foot toes off and heel-strikes.
      addPose(P, 'footL', -s * amp * 0.55 + 0.06, 0, 0, w);
      addPose(P, 'footR', s * amp * 0.55 + 0.06, 0, 0, w);

      // Arms counter-swing
      addPose(P, 'armUpperL', -s * armAmp, 0, 0.12, w);
      addPose(P, 'armUpperR', s * armAmp, 0, -0.12, w);
      addPose(P, 'armLowerL', -Math.max(0, -s) * armAmp * 0.7 - 0.25, 0, 0, w);
      addPose(P, 'armLowerR', -Math.max(0, s) * armAmp * 0.7 - 0.25, 0, 0, w);

      // Hips sway + counter-rotate, chest leads the turn
      addPose(P, 'hips', 0, -s * 0.14 * gait.hipSway * speedFrac, c * 0.055 * gait.hipSway, w);
      addPose(P, 'chest', 0, s * 0.12 * speedFrac, 0, w);
      addPose(P, 'spine', 0.05 * speedFrac + sprintFrac * 0.16, 0, 0, w);
      addPose(P, 'head', -0.04 * speedFrac - sprintFrac * 0.10, 0, 0, w);

      // Vertical bob: two bumps per cycle, heavier characters bob less but lower.
      const bob = -Math.abs(Math.cos(ph)) * 0.055 * gait.bounce * speedFrac * (2 - Math.min(1.6, heavy) * 0.5);
      P.hipsOffset[1] += bob * w;
      P.hipsOffset[0] += -s * 0.022 * gait.hipSway * speedFrac * w;
    }

    function poseStrafeLean(P, w, lx, lz) {
      // Body angles into the direction of travel — sells momentum.
      addPose(P, 'spine', lz * -0.10, lx * 0.10, -lx * 0.14, w);
      addPose(P, 'hips', 0, lx * 0.16, -lx * 0.06, w);
      addPose(P, 'head', 0, -lx * 0.10, 0, w);
    }

    function poseCrouch(P, w) {
      addPose(P, 'thighL', 0.85, 0, 0.16, w); addPose(P, 'thighR', 0.85, 0, -0.16, w);
      addPose(P, 'shinL', -1.55, 0, 0, w); addPose(P, 'shinR', -1.55, 0, 0, w);
      addPose(P, 'footL', 0.70, 0, 0, w); addPose(P, 'footR', 0.70, 0, 0, w);
      addPose(P, 'spine', 0.22, 0, 0, w); addPose(P, 'chest', 0.10, 0, 0, w);
      addPose(P, 'head', -0.22, 0, 0, w);
      P.hipsOffset[1] -= (m.hipHeight - CFG.body.crouchHeight * 0.52) * 0.55 * w;
    }

    function poseAir(P, w, vy) {
      const rising = U.clamp01(vy / 8);
      const falling = U.clamp01(-vy / 12);
      addPose(P, 'thighL', 0.62 * rising + 0.14 * falling, 0, 0.10, w);
      addPose(P, 'thighR', 0.20 * rising - 0.18 * falling, 0, -0.10, w);
      addPose(P, 'shinL', -1.05 * rising - 0.30 * falling, 0, 0, w);
      addPose(P, 'shinR', -0.40 * rising - 0.15 * falling, 0, 0, w);
      addPose(P, 'footL', 0.35, 0, 0, w); addPose(P, 'footR', 0.20, 0, 0, w);
      addPose(P, 'armUpperL', -0.55 * rising - 0.9 * falling, 0, 0.5 * (rising + falling), w);
      addPose(P, 'armUpperR', -0.35 * rising - 0.7 * falling, 0, -0.4 * (rising + falling), w);
      addPose(P, 'spine', -0.10 * rising + 0.16 * falling, 0, 0, w);
      addPose(P, 'chest', 0.10 * falling, 0, 0, w);
    }

    function poseSlide(P, w) {
      addPose(P, 'thighL', 1.15, 0, 0.28, w); addPose(P, 'shinL', -1.85, 0, 0, w);
      addPose(P, 'thighR', -0.30, 0, -0.14, w); addPose(P, 'shinR', -0.35, 0, 0, w);
      addPose(P, 'spine', -0.30, 0, 0, w); addPose(P, 'chest', -0.16, 0, 0, w);
      addPose(P, 'head', 0.30, 0, 0, w);
      addPose(P, 'armUpperL', -0.6, 0, 0.9, w); addPose(P, 'armUpperR', -0.4, 0, -0.5, w);
      P.hipsOffset[1] -= m.hipHeight * 0.42 * w;
      P.rootTilt[0] += -0.22 * w;
    }

    /** Weapon-ready upper body. Blends in with aim and whenever armed. */
    function poseWeaponReady(P, w, aim, akimbo, melee) {
      if (melee) {
        addPose(P, 'armUpperR', -0.75 - aim * 0.35, 0, -0.42, w);
        addPose(P, 'armLowerR', -1.15 - aim * 0.25, 0, 0, w);
        addPose(P, 'handR', 0, 0, -0.3, w);
        addPose(P, 'armUpperL', -0.55 - aim * 0.25, 0, 0.62, w);
        addPose(P, 'armLowerL', -1.30, 0, 0, w);
        addPose(P, 'chest', 0, -0.24 - aim * 0.10, 0, w);
        return;
      }
      // Right hand on grip, left on foregrip: shoulders rotate into the weapon.
      const raise = U.lerp(0.55, 1.0, aim);
      addPose(P, 'armUpperR', -1.05 * raise, -0.18, -0.30 - 0.16 * aim, w);
      addPose(P, 'armLowerR', -0.95 * raise, 0, 0.12, w);
      addPose(P, 'handR', 0.12, 0, 0, w);
      if (akimbo) {
        addPose(P, 'armUpperL', -1.05 * raise, 0.18, 0.30 + 0.16 * aim, w);
        addPose(P, 'armLowerL', -0.95 * raise, 0, -0.12, w);
        addPose(P, 'handL', 0.12, 0, 0, w);
      } else {
        addPose(P, 'armUpperL', -1.28 * raise, 0.42, 0.52 - 0.18 * aim, w);
        addPose(P, 'armLowerL', -1.32 * raise, 0, -0.30, w);
        addPose(P, 'handL', 0.22, 0, 0.2, w);
      }
      addPose(P, 'chest', -0.04 * aim, -0.30 - 0.12 * aim, 0, w);
      addPose(P, 'spine', 0, -0.10 - 0.05 * aim, 0, w);
      addPose(P, 'head', 0, -0.10 * aim, 0, w);
    }

    /* --- action clips: pure functions of normalised time t (0..1) --------- */
    const ACTIONS = {
      reload(P, t, w, d) {
        // 3 beats: mag out (0-.35), mag in (.35-.75), charge (.75-1)
        let arm = 0, hand = 0, chest = 0;
        if (t < 0.35) { const k = U.easeOutCubic(t / 0.35); arm = k; hand = k * 0.6; }
        else if (t < 0.75) { const k = U.pulse((t - 0.35) / 0.40, 0.5); arm = 1 - (t - 0.35) / 0.40 * 0.4; hand = 0.6 + k * 0.5; }
        else { const k = U.pulse((t - 0.75) / 0.25, 0.4); arm = 0.4 * (1 - (t - 0.75) / 0.25); chest = k; }
        addPose(P, 'armUpperL', -0.55 - arm * 0.55, 0.30 + arm * 0.55, 0.55 - arm * 0.42, w);
        addPose(P, 'armLowerL', -1.20 - hand * 0.85, 0, -0.30 + hand * 0.44, w);
        addPose(P, 'handL', 0.24 + hand * 0.60, 0, 0, w);
        addPose(P, 'armUpperR', -0.85, -0.20, -0.24, w * 0.5);
        addPose(P, 'chest', 0.10 + chest * 0.16, -0.20, 0, w);
        addPose(P, 'head', 0.14 * (1 - t), -0.14, 0, w);
      },
      reload_shell(P, t, w) {
        const k = U.pulse(t, 0.45);
        addPose(P, 'armUpperL', -0.60 - k * 0.75, 0.35 + k * 0.55, 0.50 - k * 0.55, w);
        addPose(P, 'armLowerL', -1.25 - k * 0.55, 0, -0.24, w);
        addPose(P, 'handL', 0.3 + k * 0.5, 0, 0, w);
        addPose(P, 'chest', 0.08 + k * 0.10, -0.22, 0, w);
      },
      swap(P, t, w) {
        const k = U.pulse(t, 0.4);
        addPose(P, 'armUpperR', -0.55 - k * 0.75, -0.20 - k * 0.35, -0.30 + k * 0.30, w);
        addPose(P, 'armLowerR', -0.85 - k * 0.55, 0, 0, w);
        addPose(P, 'armUpperL', -0.9 - k * 0.4, 0.32, 0.5, w);
        addPose(P, 'chest', 0, -0.18 - k * 0.14, 0, w);
      },
      melee_swing(P, t, w, d) {
        const dir = (d && d.side) || 1;
        // windup → strike → recover
        let k;
        if (t < 0.28) k = -U.easeOutCubic(t / 0.28);
        else if (t < 0.55) k = U.lerp(-1, 1.25, U.easeOutQuint((t - 0.28) / 0.27));
        else k = U.lerp(1.25, 0, U.easeOutCubic((t - 0.55) / 0.45));
        addPose(P, 'chest', 0, -k * 0.62 * dir, 0, w);
        addPose(P, 'spine', k * 0.10, -k * 0.30 * dir, 0, w);
        addPose(P, 'hips', 0, -k * 0.22 * dir, 0, w);
        addPose(P, 'armUpperR', -1.0 - k * 0.35, -0.20 - k * 0.55 * dir, -0.42 + k * 0.5, w);
        addPose(P, 'armLowerR', -0.85 + k * 0.55, 0, 0, w);
        addPose(P, 'armUpperL', -0.75 + k * 0.30, 0.55 - k * 0.45 * dir, 0.55, w);
        addPose(P, 'head', 0, -k * 0.28 * dir, 0, w);
      },
      dodge_roll(P, t, w, d) {
        const dirX = d ? d.x : 0, dirZ = d ? d.z : 1;
        const spin = U.easeInOutSine(t) * U.TAU;
        // Forward dodges roll, lateral dodges are a sidestep vault.
        if (Math.abs(dirZ) > Math.abs(dirX)) {
          P.rootTilt[0] += (dirZ > 0 ? spin : -spin) * w;
          const tuck = Math.sin(t * Math.PI);
          addPose(P, 'thighL', 1.5 * tuck, 0, 0.2, w); addPose(P, 'thighR', 1.5 * tuck, 0, -0.2, w);
          addPose(P, 'shinL', -2.0 * tuck, 0, 0, w); addPose(P, 'shinR', -2.0 * tuck, 0, 0, w);
          addPose(P, 'spine', 0.75 * tuck, 0, 0, w); addPose(P, 'chest', 0.45 * tuck, 0, 0, w);
          addPose(P, 'armUpperL', -1.2 * tuck, 0, 0.55, w); addPose(P, 'armUpperR', -1.2 * tuck, 0, -0.55, w);
          P.hipsOffset[1] -= m.hipHeight * 0.34 * tuck * w;
        } else {
          const k = Math.sin(t * Math.PI);
          const s = Math.sign(dirX) || 1;
          P.rootTilt[2] += s * k * 0.75 * w;
          addPose(P, 'spine', 0.25 * k, s * 0.3 * k, -s * 0.35 * k, w);
          addPose(P, 'thighL', 0.9 * k, 0, s * 0.4 * k, w);
          addPose(P, 'thighR', 0.5 * k, 0, s * 0.4 * k, w);
          addPose(P, 'shinL', -1.3 * k, 0, 0, w); addPose(P, 'shinR', -0.8 * k, 0, 0, w);
          addPose(P, 'armUpperL', -0.9 * k, 0, 0.9 * k, w);
          addPose(P, 'armUpperR', -0.9 * k, 0, -0.9 * k, w);
          P.hipsOffset[1] -= m.hipHeight * 0.16 * k * w;
        }
      },
      cast_forward(P, t, w) {
        const k = U.pulse(t, 0.28);
        addPose(P, 'armUpperR', -1.45 * k - 0.4, -0.3, -0.35, w);
        addPose(P, 'armLowerR', -0.35 - k * 0.2, 0, 0, w);
        addPose(P, 'chest', -0.18 * k, -0.10, 0, w);
        addPose(P, 'spine', -0.12 * k, 0, 0, w);
        addPose(P, 'head', -0.14 * k, 0, 0, w);
      },
      cast_ground(P, t, w) {
        let k;
        if (t < 0.35) k = -U.easeOutCubic(t / 0.35);
        else k = U.lerp(-1, 1, U.easeOutQuint((t - 0.35) / 0.65));
        addPose(P, 'armUpperL', -1.2 - k * 0.9, 0.4, 0.5, w);
        addPose(P, 'armUpperR', -1.2 - k * 0.9, -0.4, -0.5, w);
        addPose(P, 'armLowerL', -0.6, 0, 0, w); addPose(P, 'armLowerR', -0.6, 0, 0, w);
        addPose(P, 'spine', k * 0.55, 0, 0, w); addPose(P, 'chest', k * 0.30, 0, 0, w);
        addPose(P, 'thighL', k * 0.45, 0, 0.15, w); addPose(P, 'thighR', k * 0.45, 0, -0.15, w);
        addPose(P, 'shinL', -k * 0.7, 0, 0, w); addPose(P, 'shinR', -k * 0.7, 0, 0, w);
        P.hipsOffset[1] -= m.hipHeight * 0.20 * Math.max(0, k) * w;
      },
      cast_overhead(P, t, w) {
        const k = U.pulse(t, 0.40);
        addPose(P, 'armUpperL', -2.35 * k - 0.3, 0.2, 0.35, w);
        addPose(P, 'armUpperR', -2.35 * k - 0.3, -0.2, -0.35, w);
        addPose(P, 'armLowerL', -0.25, 0, 0, w); addPose(P, 'armLowerR', -0.25, 0, 0, w);
        addPose(P, 'spine', -0.34 * k, 0, 0, w); addPose(P, 'chest', -0.22 * k, 0, 0, w);
        addPose(P, 'head', -0.42 * k, 0, 0, w);
        P.hipsOffset[1] += 0.06 * k * w;
      },
      cast_self(P, t, w) {
        const k = U.pulse(t, 0.32);
        addPose(P, 'armUpperL', -0.9 - k * 0.6, 0.55 + k * 0.4, 0.7, w);
        addPose(P, 'armUpperR', -0.9 - k * 0.6, -0.55 - k * 0.4, -0.7, w);
        addPose(P, 'armLowerL', -1.5 - k * 0.4, 0, 0, w); addPose(P, 'armLowerR', -1.5 - k * 0.4, 0, 0, w);
        addPose(P, 'chest', -0.24 * k, 0, 0, w); addPose(P, 'head', -0.30 * k, 0, 0, w);
        addPose(P, 'spine', -0.16 * k, 0, 0, w);
      },
      spawn(P, t, w) {
        const k = 1 - U.easeOutQuint(t);
        addPose(P, 'thighL', 1.2 * k, 0, 0.2, w); addPose(P, 'thighR', 1.2 * k, 0, -0.2, w);
        addPose(P, 'shinL', -1.9 * k, 0, 0, w); addPose(P, 'shinR', -1.9 * k, 0, 0, w);
        addPose(P, 'spine', 0.55 * k, 0, 0, w); addPose(P, 'chest', 0.30 * k, 0, 0, w);
        addPose(P, 'head', -0.45 * k, 0, 0, w);
        addPose(P, 'armUpperL', -0.6 * k, 0, 0.6 * k, w); addPose(P, 'armUpperR', -0.6 * k, 0, -0.6 * k, w);
        P.hipsOffset[1] -= m.hipHeight * 0.42 * k * w;
      },
      emote(P, t, w, d) {
        const kind = (d && d.kind) || 'wave';
        const k = Math.sin(t * Math.PI);
        if (kind === 'wave') {
          addPose(P, 'armUpperR', -2.1 * k, -0.3, -0.5, w);
          addPose(P, 'armLowerR', -0.5 - Math.sin(t * Math.PI * 6) * 0.35, 0, 0, w);
          addPose(P, 'chest', 0, -0.12, 0, w);
        } else if (kind === 'flex') {
          addPose(P, 'armUpperL', -1.5 * k, 0.4, 1.2 * k, w); addPose(P, 'armLowerL', -2.1 * k, 0, 0, w);
          addPose(P, 'armUpperR', -1.5 * k, -0.4, -1.2 * k, w); addPose(P, 'armLowerR', -2.1 * k, 0, 0, w);
          addPose(P, 'chest', -0.15 * k, 0, 0, w); addPose(P, 'spine', -0.1 * k, 0, 0, w);
        } else if (kind === 'taunt') {
          addPose(P, 'armUpperR', -1.7 * k, -0.5, -0.4, w);
          addPose(P, 'chest', 0, -0.35 * k, 0, w); addPose(P, 'head', -0.15 * k, -0.2 * k, 0, w);
          addPose(P, 'hips', 0, -0.15 * k, 0, w);
        } else {
          addPose(P, 'chest', -0.2 * k, 0, 0, w); addPose(P, 'armUpperL', -0.6 * k, 0, 0.8 * k, w);
          addPose(P, 'armUpperR', -0.6 * k, 0, -0.8 * k, w);
        }
      }
    };

    /* --- static poses for menus / results -------------------------------- */
    const POSES = {
      /* Lobby and select both start from the exact in-match weapon carriage
       * so the hero you inspect is posed like the hero you play; only the
       * stance and flourish differ. */
      lobby(P, t, w) {
        poseWeaponReady(P, w * 0.92, 0, A.akimbo, A.melee);
        addPose(P, 'spine', 0.03, 0.02, 0, w); addPose(P, 'chest', 0.02, 0.04, 0, w);
        addPose(P, 'armUpperR', 0.26, 0, 0.06, w);      // relax toward a low carry
        addPose(P, 'armLowerR', 0.18, 0, 0, w);
        addPose(P, 'armUpperL', 0.24, 0, -0.08, w);
        addPose(P, 'armLowerL', 0.20, 0, 0, w);
        addPose(P, 'thighL', 0, 0, 0.09, w); addPose(P, 'thighR', -0.10, 0, -0.12, w);
        addPose(P, 'head', 0, 0.10, 0, w);
        P.hipsOffset[1] += Math.sin(A.time * 1.2) * 0.006 * w;
      },
      select(P, t, w) {
        /* Showcase stance, not a combat stance.
         *
         * Holding the weapon up at the chest crossed both arms in front of
         * the torso, hid the hands behind the chest rig, and left the rifle
         * looking detached. A hero card wants the opposite: weight on one
         * leg, shoulders open, weapon carried low at the hip where the whole
         * silhouette — face, chest, weapon — reads at once. */
        const k = U.pulse(U.clamp01(t * 1.6), 0.35);
        const breathe = Math.sin(A.time * 1.1);

        if (A.melee) {
          // Blades ride low and out, away from the body line.
          addPose(P, 'armUpperR', 0.12, 0, -0.34, w);
          addPose(P, 'armLowerR', -0.42, 0, 0, w);
          addPose(P, 'armUpperL', 0.06, 0, 0.34, w);
          addPose(P, 'armLowerL', -0.38, 0, 0, w);
        } else if (A.akimbo) {
          // Two sidearms, both carried low and symmetrical.
          addPose(P, 'armUpperR', 0.16, -0.06, -0.20, w);
          addPose(P, 'armLowerR', -0.52, 0, 0.08, w);
          addPose(P, 'armUpperL', 0.16, 0.06, 0.20, w);
          addPose(P, 'armLowerL', -0.52, 0, -0.08, w);
        } else {
          // Weapon hand low at the hip, off hand relaxed at the side.
          addPose(P, 'armUpperR', 0.22, -0.10, -0.16, w);
          addPose(P, 'armLowerR', -0.48, 0, 0.10, w);
          addPose(P, 'handR', 0.10, 0, 0, w);
          addPose(P, 'armUpperL', 0.04, 0.06, 0.17, w);
          addPose(P, 'armLowerL', -0.30, 0, -0.06, w);
          addPose(P, 'handL', 0.06, 0, 0.10, w);
        }

        // Contrapposto: weight on the right leg, left leg eased forward.
        addPose(P, 'hips', 0, 0.10, -0.045, w);
        addPose(P, 'spine', 0.02, -0.12, 0.03, w);
        addPose(P, 'chest', -0.05 * k, -0.16, 0.02, w);
        addPose(P, 'head', -0.03, 0.20, -0.02, w);
        addPose(P, 'thighR', -0.03, 0, -0.055, w); addPose(P, 'shinR', 0.05, 0, 0, w);
        addPose(P, 'thighL', 0.16, 0, 0.09, w); addPose(P, 'shinL', -0.14, 0, 0, w);
        P.hipsOffset[1] += breathe * 0.006 * w;
      },
      victory(P, t, w) {
        const pose = A.model.overrides.victoryPose || personality.victoryPose || 'salute_rifle';
        const b = Math.sin(A.time * 1.6) * 0.5 + 0.5;
        switch (pose) {
          case 'ground_pound': case 'titan_anvil':
            addPose(P, 'spine', 0.28, 0, 0, w); addPose(P, 'chest', 0.14, 0, 0, w);
            addPose(P, 'armUpperL', -1.9, 0.3, 0.7, w); addPose(P, 'armUpperR', -1.9, -0.3, -0.7, w);
            addPose(P, 'armLowerL', -1.5, 0, 0, w); addPose(P, 'armLowerR', -1.5, 0, 0, w);
            addPose(P, 'thighL', 0.35, 0, 0.25, w); addPose(P, 'thighR', 0.35, 0, -0.25, w);
            addPose(P, 'shinL', -0.6, 0, 0, w); addPose(P, 'shinR', -0.6, 0, 0, w);
            P.hipsOffset[1] -= m.hipHeight * 0.18 * w; break;
          case 'spin_flourish': case 'prism_shatter':
            P.rootTilt[1] += A.time * 1.2 * w;
            addPose(P, 'armUpperL', -1.7 - b * 0.2, 0.4, 1.0, w); addPose(P, 'armUpperR', -0.9, -0.4, -1.2, w);
            addPose(P, 'chest', -0.12, -0.3, 0, w); addPose(P, 'head', -0.12, 0.2, 0, w);
            addPose(P, 'thighR', -0.5, 0, -0.2, w); addPose(P, 'shinR', 0.8, 0, 0, w); break;
          case 'blade_flick': case 'void_throne':
            addPose(P, 'chest', -0.06, -0.55, 0, w); addPose(P, 'spine', 0.04, -0.25, 0, w);
            addPose(P, 'armUpperR', -0.75, -0.9, -0.65, w); addPose(P, 'armLowerR', -0.55, 0, 0, w);
            addPose(P, 'armUpperL', -0.35, 0.5, 0.75, w);
            addPose(P, 'head', -0.10, -0.4, 0, w); break;
          case 'kneel_scan': case 'beast_roar':
            addPose(P, 'thighL', 1.4, 0, 0.2, w); addPose(P, 'shinL', -2.2, 0, 0, w);
            addPose(P, 'thighR', 0.3, 0, -0.2, w); addPose(P, 'shinR', -0.4, 0, 0, w);
            addPose(P, 'spine', 0.30, 0, 0, w); addPose(P, 'head', -0.55, 0, 0, w);
            addPose(P, 'armUpperR', -0.9, -0.2, -0.3, w);
            P.hipsOffset[1] -= m.hipHeight * 0.45 * w; break;
          case 'ascend': case 'singularity_bloom': case 'sovereign_verdict':
            addPose(P, 'armUpperL', -2.4, 0.25, 0.4, w); addPose(P, 'armUpperR', -2.4, -0.25, -0.4, w);
            addPose(P, 'chest', -0.28, 0, 0, w); addPose(P, 'head', -0.42, 0, 0, w);
            addPose(P, 'thighL', -0.15, 0, 0.1, w); addPose(P, 'thighR', -0.15, 0, -0.1, w);
            P.hipsOffset[1] += (0.10 + b * 0.06) * w; break;
          case 'toss_catch': case 'doom_detonate':
            addPose(P, 'armUpperR', -1.5 - b * 0.5, -0.3, -0.4, w); addPose(P, 'armLowerR', -0.9, 0, 0, w);
            addPose(P, 'chest', -0.10, -0.2, 0, w); addPose(P, 'head', -0.25 - b * 0.15, 0, 0, w);
            addPose(P, 'hips', 0, 0.1, 0, w); break;
          case 'warlord_crown': case 'scan_sweep':
            addPose(P, 'armUpperR', -1.35, -0.35, -0.55, w); addPose(P, 'armLowerR', -1.2, 0, 0, w);
            addPose(P, 'chest', -0.12, -0.25, 0, w); addPose(P, 'head', -0.18, -0.15, 0, w);
            addPose(P, 'armUpperL', -0.4, 0.2, 0.5, w); break;
          default:
            addPose(P, 'armUpperR', -1.85, -0.25, -0.45, w); addPose(P, 'armLowerR', -1.15, 0, 0, w);
            addPose(P, 'armUpperL', -0.9, 0.35, 0.55, w); addPose(P, 'armLowerL', -1.35, 0, 0, w);
            addPose(P, 'chest', -0.14, -0.14, 0, w); addPose(P, 'head', -0.16, 0, 0, w);
            addPose(P, 'thighL', 0, 0, 0.12, w); addPose(P, 'thighR', -0.12, 0, -0.16, w);
        }
        P.hipsOffset[1] += Math.sin(A.time * 1.6) * 0.008 * w;
      },
      defeat(P, t, w) {
        addPose(P, 'spine', 0.30, 0, 0, w); addPose(P, 'chest', 0.22, 0, 0, w);
        addPose(P, 'head', 0.42, 0, 0, w); addPose(P, 'neck', 0.14, 0, 0, w);
        addPose(P, 'armUpperL', 0.10, 0, 0.12, w); addPose(P, 'armUpperR', 0.10, 0, -0.12, w);
        addPose(P, 'armLowerL', -0.25, 0, 0, w); addPose(P, 'armLowerR', -0.25, 0, 0, w);
        addPose(P, 'thighL', 0.18, 0, 0.10, w); addPose(P, 'thighR', 0.10, 0, -0.10, w);
        addPose(P, 'shinL', -0.28, 0, 0, w); addPose(P, 'shinR', -0.18, 0, 0, w);
        P.hipsOffset[1] -= m.hipHeight * 0.08 * w;
      }
    };

    /** Death: a three-phase collapse driven by the hit direction. */
    function poseDeath(P, t, w) {
      const fall = U.easeOutCubic(U.clamp01(t / 0.85));
      const settle = U.clamp01((t - 0.6) / 0.9);
      const back = Math.cos(A.deathDir), side = Math.sin(A.deathDir);
      P.rootTilt[0] += back * (Math.PI * 0.5) * fall * w;
      P.rootTilt[2] += -side * (Math.PI * 0.5) * fall * w;
      P.hipsOffset[1] -= (m.hipHeight - m.limbR * 1.6) * fall * w;
      const limp = U.lerp(0.4, 1.0, settle);
      addPose(P, 'spine', 0.35 * limp, 0, side * 0.2, w);
      addPose(P, 'chest', 0.20 * limp, 0, 0, w);
      addPose(P, 'head', 0.55 * limp, side * 0.3, 0, w);
      addPose(P, 'armUpperL', 0.9 * limp, 0, 0.9 * limp, w);
      addPose(P, 'armUpperR', 0.9 * limp, 0, -0.9 * limp, w);
      addPose(P, 'armLowerL', -0.5 * limp, 0, 0, w); addPose(P, 'armLowerR', -0.5 * limp, 0, 0, w);
      addPose(P, 'thighL', 0.5 * limp, 0, 0.25 * limp, w);
      addPose(P, 'thighR', 0.3 * limp, 0, -0.30 * limp, w);
      addPose(P, 'shinL', -0.85 * limp, 0, 0, w); addPose(P, 'shinR', -0.55 * limp, 0, 0, w);
    }

    /* ---- main update ---------------------------------------------------- */
    A.update = function (dt) {
      const I = A.input;
      A.time += dt;

      /* advance the locomotion cycle by distance, not time */
      const planar = I.speed;
      if (I.grounded && planar > 0.15) {
        A.phase += (planar * dt / Math.max(0.2, strideLength)) * U.TAU;
        A.idleTime = 0;
      } else {
        A.idleTime += dt;
        if (I.grounded) {
          // ease the cycle back to a neutral stance instead of snapping
          const target = Math.round(A.phase / Math.PI) * Math.PI;
          A.phase = U.damp(A.phase, target, 8, dt);
        } else {
          A.phase += dt * 2.2;
        }
      }
      if (A.phase > 1e5) A.phase = A.phase % U.TAU;

      /* decay impulses */
      A.recoil = U.damp(A.recoil, 0, 11.0, dt);
      A.landDip = U.damp(A.landDip, 0, 8.5, dt);
      if (A.hitReact.timer > 0) A.hitReact.timer -= dt;
      if (A.action) {
        A.actionTime += dt;
        if (A.actionTime >= A.actionDuration) { A.events.emit('actionEnd', A.action); A.action = null; }
      }
      if (A.deathTimer >= 0) A.deathTimer += dt;

      /* build the target pose */
      const P = blankPose();
      const dead = A.deathTimer >= 0;
      const overrideName = A.poseOverride;
      A.poseOverrideBlend = U.damp(A.poseOverrideBlend, overrideName ? 1 : 0, 6.0, dt);
      const ow = A.poseOverrideBlend;

      if (dead) {
        poseDeath(P, A.deathTimer, 1);
      } else if (overrideName && ow > 0.01) {
        const poseFn = POSES[overrideName] || POSES.lobby;
        poseIdle(P, dt, 1 - ow);
        poseFn(P, A.time, ow);
        if (ow < 0.99) poseWeaponReady(P, (1 - ow) * 0.85, 0, A.akimbo, A.melee);
      } else {
        const maxSpeed = CFG.move.sprintSpeed * (charDef.speedScale || 1);
        const speedFrac = U.clamp01(planar / Math.max(1, maxSpeed * 0.72));
        const sprintFrac = I.sprinting ? U.clamp01((planar - CFG.move.runSpeed * 0.8) / 3) : 0;
        const airborne = !I.grounded ? U.clamp01(I.airTime / 0.12) : 0;
        const groundW = 1 - airborne;

        poseIdle(P, dt, groundW * (1 - speedFrac) * (I.sliding ? 0 : 1));
        if (speedFrac > 0.01 && !I.sliding) poseLocomotion(P, groundW * (I.crouch > 0.5 ? 0.45 : 1), speedFrac, sprintFrac);
        if (!I.sliding) poseStrafeLean(P, groundW * speedFrac, I.localVelX / Math.max(1, maxSpeed), I.localVelZ / Math.max(1, maxSpeed));
        if (I.crouch > 0.01 && !I.sliding) poseCrouch(P, I.crouch * groundW);
        if (I.sliding) poseSlide(P, groundW);
        if (airborne > 0.01) poseAir(P, airborne, I.verticalVel);

        /* weapon carriage (suppressed while sprinting hard, restored on aim) */
        const carry = U.clamp01(1 - sprintFrac * 0.75) * (I.sliding ? 0.35 : 1);
        poseWeaponReady(P, carry, I.aiming, A.akimbo, A.melee);

        /* action layer */
        if (A.action && ACTIONS[A.action]) {
          const t = U.clamp01(A.actionTime / A.actionDuration);
          // Blend in/out so actions never pop.
          const blend = Math.min(1, Math.min(t / 0.10, (1 - t) / 0.14) * 1.6 + 0.35);
          ACTIONS[A.action](P, t, blend, A.actionData);
        }

        /* recoil: shoulders absorb, chest and head follow through */
        if (A.recoil > 0.001) {
          const r = A.recoil;
          addPose(P, 'armUpperR', -r * 0.30, 0, 0, 1);
          addPose(P, 'armLowerR', r * 0.22, 0, 0, 1);
          addPose(P, 'armUpperL', -r * 0.22, 0, 0, 1);
          addPose(P, 'chest', -r * 0.14, A.recoilYaw * r * 0.20, 0, 1);
          addPose(P, 'head', -r * 0.09, 0, 0, 1);
          addPose(P, 'spine', -r * 0.06, 0, 0, 1);
        }

        /* hit reaction: flinch away from the hit */
        if (A.hitReact.timer > 0) {
          const k = U.pulse(1 - A.hitReact.timer / 0.42, 0.22);
          addPose(P, 'chest', A.hitReact.y * 0.32 * k, -A.hitReact.x * 0.22 * k, -A.hitReact.x * 0.28 * k, 1);
          addPose(P, 'spine', A.hitReact.y * 0.20 * k, 0, -A.hitReact.x * 0.16 * k, 1);
          addPose(P, 'head', A.hitReact.y * 0.30 * k, A.hitReact.x * 0.24 * k, 0, 1);
          addPose(P, 'armUpperL', A.hitReact.y * 0.24 * k, 0, 0.20 * k, 1);
          addPose(P, 'armUpperR', A.hitReact.y * 0.24 * k, 0, -0.20 * k, 1);
        }

        /* landing dip */
        if (A.landDip > 0.001) {
          const d = A.landDip;
          addPose(P, 'thighL', d * 0.55, 0, 0.10, 1); addPose(P, 'thighR', d * 0.55, 0, -0.10, 1);
          addPose(P, 'shinL', -d * 0.95, 0, 0, 1); addPose(P, 'shinR', -d * 0.95, 0, 0, 1);
          addPose(P, 'spine', d * 0.22, 0, 0, 1); addPose(P, 'head', -d * 0.16, 0, 0, 1);
          P.hipsOffset[1] -= m.hipHeight * 0.16 * d;
        }

        /* head/spine look — aims the character where the camera is aiming */
        const pitch = U.clamp(I.lookPitch, -0.9, 0.9);
        addPose(P, 'head', pitch * 0.55, 0, 0, 1);
        addPose(P, 'neck', pitch * 0.22, 0, 0, 1);
        addPose(P, 'chest', pitch * 0.20 * U.lerp(0.4, 1, I.aiming), 0, 0, 1);

        /* turn lean */
        addPose(P, 'spine', 0, 0, -U.clamp(I.turnRate * 0.10, -CFG.move.leanMax, CFG.move.leanMax), 1);
      }

      /* ---- commit: damp toward the target so nothing ever pops ---------- */
      const rate = dead ? 12 : (A.action ? 26 : 17);
      const cur = A.current;
      for (let i = 0; i < BONE_KEYS.length; i++) {
        const k = BONE_KEYS[i];
        const c = cur[k], t = P[k];
        c[0] = U.damp(c[0], t[0], rate, dt);
        c[1] = U.damp(c[1], t[1], rate, dt);
        c[2] = U.damp(c[2], t[2], rate, dt);
        const b = bones[k];
        if (b) b.rotation.set(c[0], c[1], c[2]);
      }
      const ho = cur.hipsOffset;
      ho[0] = U.damp(ho[0], P.hipsOffset[0], rate, dt);
      ho[1] = U.damp(ho[1], P.hipsOffset[1], rate, dt);
      ho[2] = U.damp(ho[2], P.hipsOffset[2], rate, dt);
      if (bones.hips) bones.hips.position.set(ho[0], m.hipHeight + ho[1], ho[2]);

      const rt = cur.rootTilt;
      rt[0] = U.damp(rt[0], P.rootTilt[0], dead ? 8 : rate, dt);
      rt[1] = U.damp(rt[1], P.rootTilt[1], rate, dt);
      rt[2] = U.damp(rt[2], P.rootTilt[2], dead ? 8 : rate, dt);

      /* cloth: capes and scarves swing from hip velocity + a wind term */
      updateCloth(dt);

      return { rootTilt: rt };
    };

    /* ---- footstep detection (drives audio + dust) ----------------------- */
    A.consumeFootsteps = function () {
      const out = [];
      if (!A.input.grounded || A.input.speed < 0.6 || A.deathTimer >= 0) return out;
      const s = Math.sin(A.phase);
      const down = [s < -0.55, s > 0.55];
      for (let i = 0; i < 2; i++) {
        if (down[i] && !A.lastFootDown[i]) out.push(i === 0 ? 'L' : 'R');
        A.lastFootDown[i] = down[i];
      }
      return out;
    };

    /* ---- cloth ---------------------------------------------------------- */
    const clothState = [];
    function initCloth(list, damping, gravity) {
      list.forEach((seg, i) => clothState.push({ seg, ax: 0, az: 0, vx: 0, vz: 0, damping, gravity, index: i }));
    }
    initCloth(model.cloth.cape, 6.5, 5.0);
    initCloth(model.cloth.scarf, 9.0, 3.0);

    const _prevPos = new THREE.Vector3();
    let _clothInit = false;
    function updateCloth(dt) {
      if (!clothState.length) return;
      const root = model.root;
      if (!_clothInit) { _prevPos.copy(root.position); _clothInit = true; }
      const dx = (root.position.x - _prevPos.x) / Math.max(0.0001, dt);
      const dz = (root.position.z - _prevPos.z) / Math.max(0.0001, dt);
      _prevPos.copy(root.position);

      // Convert world velocity into the character's local frame.
      const yaw = root.rotation.y;
      const cos = Math.cos(-yaw), sin = Math.sin(-yaw);
      const lvx = dx * cos - dz * sin;
      const lvz = dx * sin + dz * cos;

      const wind = Math.sin(A.time * 2.1) * 0.35 + Math.sin(A.time * 0.83) * 0.2;
      for (let i = 0; i < clothState.length; i++) {
        const c = clothState[i];
        const drag = -lvz * 0.055 - (c.index === 0 ? 0 : 0.02);
        const targetX = U.clamp(drag + c.gravity * 0.012 + wind * 0.05, -0.9, 0.9);
        const targetZ = U.clamp(-lvx * 0.035, -0.6, 0.6);
        c.vx += (targetX - c.ax) * (28 / (1 + c.index)) * dt;
        c.vz += (targetZ - c.az) * (24 / (1 + c.index)) * dt;
        c.vx -= c.vx * c.damping * dt;
        c.vz -= c.vz * c.damping * dt;
        c.ax += c.vx * dt; c.az += c.vz * dt;
        c.seg.rotation.set(c.ax, 0, c.az);
      }
    }

    /* Weapon-shape flags used by the ready pose. */
    A.akimbo = false;
    A.melee = false;
    A.setWeaponShape = function (akimbo, melee) { A.akimbo = !!akimbo; A.melee = !!melee; };

    return A;
  };

})(window.HC, window.THREE);
