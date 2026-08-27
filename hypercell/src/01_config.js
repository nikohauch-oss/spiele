/* =========================================================================
 * HYPERCELL — 01_config.js
 * Every gameplay tunable lives here. Nothing in the systems below is
 * allowed to hardcode a balance number.
 * ========================================================================= */
(function (HC) {
  'use strict';

  const CFG = HC.CFG = {

    /* ---------------- simulation ---------------- */
    sim: {
      tickRate: 120,                 // fixed gameplay steps per second
      maxSubSteps: 6,
      gravity: 26.0,                 // m/s^2 — snappier than real gravity
      terminalVelocity: 55.0
    },

    /* ---------------- character capsule ---------------- */
    body: {
      radius: 0.42,
      height: 1.86,
      crouchHeight: 1.16,
      eyeOffset: 0.14,               // below capsule top
      stepHeight: 0.48,              // auto-step for stairs / kerbs
      groundSnap: 0.28,              // stick to ground when running downhill
      crouchLerpRate: 14.0
    },

    /* ---------------- movement ---------------- *
     * Speeds are BASE values; each character scales them (see 03_characters).
     * Acceleration/deceleration are what stop the "sliding block" feel. */
    move: {
      walkSpeed: 4.25,
      runSpeed: 6.95,
      sprintSpeed: 10.10,
      crouchSpeed: 2.65,
      backpedalMul: 0.72,
      strafeMul: 0.88,
      aimMul: 0.52,

      groundAccel: 62.0,
      groundDecel: 48.0,
      turnAssist: 26.0,              // extra accel when reversing direction
      airAccel: 16.0,
      airDrag: 0.55,
      airControl: 0.62,

      jumpVelocity: 8.55,
      jumpCutMultiplier: 0.45,       // release jump early -> shorter hop
      coyoteTime: 0.11,
      jumpBuffer: 0.14,
      maxAirJumps: 0,                // Maya raises this via her ability

      sprintChargeTime: 0.16,        // hold-to-sprint ramp
      sprintMinSpeedFrac: 0.55,      // must be moving to start sprinting
      sprintForwardDot: 0.55,        // can only sprint roughly forward

      dodgeSpeed: 15.2,
      dodgeDuration: 0.36,
      dodgeCooldown: 1.15,
      dodgeIFrames: 0.16,            // brief damage reduction window
      dodgeDamageReduction: 0.45,
      dodgeUpKick: 1.6,

      slideMinSpeed: 7.4,
      slideDuration: 0.75,
      slideFriction: 3.4,
      slideCooldown: 0.9,

      landSoftThreshold: 9.0,        // |vy| below this = soft landing
      landHardThreshold: 17.0,       // above = hard landing (stagger + shake)
      landHardStun: 0.28,
      fallDamageThreshold: 24.0,
      fallDamagePerUnit: 5.5,

      leanMax: 0.16,                 // body roll radians during hard turns
      leanRate: 7.0,
      pitchMax: 0.09                 // body pitch on accel/decel
    },

    /* ---------------- camera ---------------- */
    camera: {
      fov: 76,
      aimFov: 54,
      sprintFov: 86,
      fovRate: 9.0,
      near: 0.08,
      far: 620,

      distance: 4.35,
      aimDistance: 2.05,
      sprintDistance: 4.95,
      height: 1.52,
      aimHeight: 1.58,
      shoulder: 0.78,
      aimShoulder: 0.52,

      followRate: 18.0,
      pitchMin: -68 * Math.PI / 180,
      pitchMax: 72 * Math.PI / 180,

      collisionRadius: 0.34,
      collisionPullRate: 34.0,
      collisionReturnRate: 6.5,

      shakeDecay: 5.5,
      shakeMax: 1.0,
      recoilReturnRate: 9.5,
      recoilSnappiness: 26.0,

      landDipScale: 0.055,
      landDipRate: 12.0,
      bobAmount: 0.030,
      bobRate: 1.85,
      sprintBobScale: 1.55
    },

    /* ---------------- input ---------------- */
    input: {
      mouseSensitivity: 0.0022,
      aimSensitivityScale: 0.62,
      scopeSensitivityScale: 0.40,
      padSensitivity: 3.1,
      padDeadZone: 0.16,
      padResponseCurve: 2.0,
      invertY: false,
      holdToAim: true,
      holdToSprint: true,
      holdToCrouch: false
    },

    /* ---------------- combat ---------------- */
    combat: {
      headshotHeightFrac: 0.845,     // fraction of capsule height = head zone
      headRadiusScale: 1.02,
      limbDamageScale: 0.88,

      shieldRegenDelay: 4.6,
      shieldRegenRate: 26.0,
      healthRegenDelay: 7.5,
      healthRegenRate: 8.0,

      respawnTime: 6.0,
      spawnProtection: 3.0,
      spectateDelay: 1.6,

      assistWindow: 6.0,
      assistDamageFrac: 0.20,

      ultChargePerDamage: 0.055,     // ult % per point of damage dealt
      ultChargePerHealing: 0.045,
      ultChargePerSecond: 1.05,      // passive trickle
      ultChargeOnKill: 8.0,
      ultChargeOnObjective: 12.0,

      /* Damage type interaction. Row = damage type, values = multiplier
       * against [shield, health, armor]. Gives each weapon an identity. */
      typeTable: {
        physical:  { shield: 0.90, health: 1.00, armor: 0.78 },
        explosive: { shield: 1.05, health: 1.00, armor: 1.12 },
        energy:    { shield: 1.35, health: 0.92, armor: 0.95 },
        shock:     { shield: 1.55, health: 0.82, armor: 0.90 },
        fire:      { shield: 0.80, health: 1.18, armor: 1.00 },
        melee:     { shield: 1.00, health: 1.15, armor: 0.85 }
      },

      friendlyFire: false,
      selfDamageScale: 0.38,         // rocket / blast jumping
      knockbackSelfScale: 1.0
    },

    /* ---------------- feedback / game feel ---------------- */
    feel: {
      hitMarkerTime: 0.22,
      critMarkerTime: 0.30,
      killMarkerTime: 0.55,
      damageNumberLife: 0.95,
      damageNumberRise: 1.35,
      damageIndicatorLife: 1.6,

      hitCameraKick: 0.055,          // taking damage
      firedShakeScale: 1.0,
      explosionShakeScale: 1.0,
      shakeDistanceFalloff: 26.0,

      hitStopEnabled: true,
      hitStopKill: 0.055,            // micro time-freeze on a kill
      hitStopUltimate: 0.10
    },

    /* ---------------- graphics ---------------- */
    gfx: {
      renderScale: 1.0,
      maxPixelRatio: 2.0,
      shadows: true,
      shadowMapSize: 2048,
      shadowDistance: 62,
      bloom: true,
      bloomStrength: 0.78,
      bloomThreshold: 0.72,
      bloomRadius: 0.85,
      fogEnabled: true,
      fogNear: 34,
      fogFar: 300,
      viewDistance: 1.0,
      particleBudget: 2600,
      decalBudget: 96,
      maxDynamicLights: 10,
      motionBlur: false,
      antialias: true,
      textureQuality: 2,             // 0 low / 1 med / 2 high
      exposure: 1.06
    },

    /* ---------------- audio ---------------- */
    audio: {
      master: 0.85,
      music: 0.42,
      sfx: 0.90,
      ui: 0.70,
      voice: 0.85,
      rolloffStart: 6.0,
      rolloffEnd: 78.0,
      maxConcurrentSfx: 26,
      reverbDecay: 1.35,
      reverbMix: 0.20
    },

    /* ---------------- accessibility ---------------- */
    access: {
      uiScale: 1.0,
      cameraShakeStrength: 1.0,
      subtitles: true,
      damageNumbers: true,
      colorBlindMode: 'off',         // off | protanopia | deuteranopia | tritanopia
      reduceFlashing: false,
      crosshairScale: 1.0
    },

    /* ---------------- AI ---------------- */
    ai: {
      difficulty: 'normal',
      tiers: {
        recruit:  { aim: 0.44, reaction: 0.52, burst: 0.55, ability: 0.35, lead: 0.55, strafe: 0.5 },
        normal:   { aim: 0.68, reaction: 0.32, burst: 0.75, ability: 0.65, lead: 0.80, strafe: 0.8 },
        veteran:  { aim: 0.84, reaction: 0.20, burst: 0.90, ability: 0.85, lead: 0.94, strafe: 1.0 },
        elite:    { aim: 0.94, reaction: 0.13, burst: 0.98, ability: 0.96, lead: 1.00, strafe: 1.15 }
      },
      sightRange: 62,
      hearingRange: 30,
      repathInterval: 0.55,
      targetSwitchPenalty: 0.35,
      loseTargetTime: 3.2,
      arrivalRadius: 1.5,
      avoidRadius: 1.9,
      combatStrafePeriod: 1.7,
      jitterAmplitude: 0.9
    },

    /* ---------------- match ---------------- */
    match: {
      teamSize: 5,
      introDuration: 7.0,
      countdownFrom: 3,
      warmupDuration: 3.0,
      timeLimit: 600,
      overtimeDuration: 45,
      finalMinuteThreshold: 60,
      resultsMinTime: 2.0
    }
  };

  /* Colour language — one place, used by UI, VFX, materials and minimap. */
  HC.PALETTE = {
    teamA: 0x36c7ff,      // Vanguard  — cyan
    teamAAlt: 0x0a86c8,
    teamB: 0xff5a3c,      // Ember     — orange-red
    teamBAlt: 0xc23415,
    neutral: 0xf2c14e,
    objective: 0x9b6bff,
    health: 0x4ce07a,
    shield: 0x62d6ff,
    armor: 0xf2c14e,
    danger: 0xff3355,
    crit: 0xffd23f,
    heal: 0x63f2a0,
    ui: 0xe8f2ff,
    uiDim: 0x7d90ab,
    ink: 0x070b12
  };

  /* Colour-blind safe substitutions for the two team colours. */
  HC.CB_PALETTE = {
    off:          null,
    protanopia:   { teamA: 0x39c8ff, teamB: 0xffd23f },
    deuteranopia: { teamA: 0x21b8ff, teamB: 0xffb03a },
    tritanopia:   { teamA: 0x22d3a0, teamB: 0xff5aa8 }
  };

  HC.rarityColor = {
    standard:  0x9fb2c8,
    rare:      0x4fa8ff,
    epic:      0xb46bff,
    legendary: 0xffb02e
  };

  HC.rarityLabel = {
    standard: 'Standard', rare: 'Rare', epic: 'Epic', legendary: 'Legendary'
  };

  /* Damage-type display names for the UI / codex. */
  HC.damageTypeLabel = {
    physical: 'Kinetic', explosive: 'Explosive', energy: 'Energy',
    shock: 'Shock', fire: 'Incendiary', melee: 'Melee'
  };

})(window.HC);
