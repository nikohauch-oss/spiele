/* =========================================================================
 * HYPERCELL — 02_weapons_data.js
 * Data-driven weapon definitions. The weapon component (15_weapon.js)
 * contains no per-weapon special cases; everything is described here.
 * ========================================================================= */
(function (HC) {
  'use strict';

  const Weapons = HC.Weapons = HC.Registry('Weapons', function (id) {
    // Fallback weapon: functional, clearly flagged, never crashes a match.
    return {
      id: id || 'missing', name: 'Unknown Weapon', archetype: 'rifle', missing: true,
      damage: 10, critMultiplier: 1.5, damageType: 'physical', rpm: 400,
      magazine: 20, reserveMagazines: 6, reloadTime: 2.0, reloadType: 'magazine',
      pellets: 1, spread: { base: 1.5, moving: 2.0, air: 3.0, crouch: -0.5, aim: -0.8, max: 5, bloomPerShot: 0.25, recoverRate: 4 },
      recoil: { vertical: 0.4, horizontal: 0.2, kick: 0.1, visualKick: 0.06, pattern: 'random', recovery: 8 },
      range: { falloffStart: 20, falloffEnd: 45, minMultiplier: 0.5, max: 90 },
      projectile: null, fireMode: 'auto', handling: { ads: 0.25, swap: 0.5, sprintOut: 0.2 },
      audio: { fire: 'fire_rifle', reload: 'reload_generic', empty: 'empty_click' },
      vfx: { tracer: 0x9fb2c8, muzzleScale: 1, flashColor: 0xffd9a0 }
    };
  });

  const def = Weapons.define.bind(Weapons);

  /* -- shared spread/recoil archetypes ------------------------------------
   * Spread values are in degrees of cone half-angle.
   * bloomPerShot accumulates while firing, recoverRate bleeds it off.  */

  def('pulse_rifle', {
    name: 'Pulse Rifle', shortName: 'PULSE', archetype: 'assault_rifle',
    description: 'Burst-stabilised energy carbine. Rewards controlled taps at range, forgiving up close.',
    damage: 18.5, critMultiplier: 1.85, damageType: 'energy',
    rpm: 645, magazine: 32, reserveMagazines: 7, reloadTime: 1.95, reloadType: 'magazine',
    pellets: 1, fireMode: 'auto',
    spread: { base: 0.55, moving: 1.55, air: 2.60, crouch: -0.25, aim: -0.42, max: 4.2, bloomPerShot: 0.115, recoverRate: 5.2 },
    recoil: { vertical: 0.58, horizontal: 0.21, kick: 0.135, visualKick: 0.075, pattern: 'vertical_drift', recovery: 9.0, firstShotMul: 1.35 },
    range: { falloffStart: 30, falloffEnd: 58, minMultiplier: 0.55, max: 140 },
    projectile: null,
    handling: { ads: 0.21, swap: 0.44, sprintOut: 0.17 },
    audio: { fire: 'fire_pulse', reload: 'reload_rifle', empty: 'empty_click', tail: 'tail_mid' },
    vfx: { tracer: 0x67e8ff, tracerWidth: 0.035, muzzleScale: 1.0, flashColor: 0x9beeff, shellEject: true }
  });

  def('dual_smg', {
    name: 'Whisper SMGs', shortName: 'WHISPER', archetype: 'smg',
    description: 'Paired micro-SMGs. Alternating barrels, brutal close-range DPS, punishing spread past mid.',
    damage: 11.2, critMultiplier: 1.60, damageType: 'physical',
    rpm: 925, magazine: 46, reserveMagazines: 7, reloadTime: 1.72, reloadType: 'magazine',
    pellets: 1, fireMode: 'auto', akimbo: true,
    spread: { base: 1.10, moving: 1.15, air: 1.75, crouch: -0.30, aim: -0.55, max: 6.0, bloomPerShot: 0.165, recoverRate: 6.6 },
    recoil: { vertical: 0.31, horizontal: 0.34, kick: 0.085, visualKick: 0.05, pattern: 'random', recovery: 11.0, firstShotMul: 1.0 },
    range: { falloffStart: 15, falloffEnd: 33, minMultiplier: 0.44, max: 90 },
    projectile: null,
    handling: { ads: 0.16, swap: 0.32, sprintOut: 0.12 },
    audio: { fire: 'fire_smg', reload: 'reload_smg', empty: 'empty_click', tail: 'tail_tight' },
    vfx: { tracer: 0xff8de0, tracerWidth: 0.026, muzzleScale: 0.72, flashColor: 0xffc2f0, shellEject: true }
  });

  def('rotary_cannon', {
    name: 'Bulwark Rotary', shortName: 'ROTARY', archetype: 'minigun',
    description: 'Six-barrel suppression cannon. Spins up to a wall of lead; you trade mobility for it.',
    damage: 9.4, critMultiplier: 1.32, damageType: 'physical',
    rpm: 1150, magazine: 130, reserveMagazines: 3, reloadTime: 3.65, reloadType: 'magazine',
    pellets: 1, fireMode: 'auto',
    spinUpTime: 0.62, spinDownTime: 0.85, moveSpeedWhileFiring: 0.48,
    spread: { base: 2.65, moving: 1.35, air: 3.20, crouch: -0.55, aim: -0.75, max: 6.5, bloomPerShot: 0.045, recoverRate: 5.0, spinUpBonus: -1.55 },
    recoil: { vertical: 0.14, horizontal: 0.16, kick: 0.055, visualKick: 0.028, pattern: 'vibration', recovery: 14.0, firstShotMul: 1.0 },
    range: { falloffStart: 20, falloffEnd: 44, minMultiplier: 0.40, max: 110 },
    projectile: null,
    handling: { ads: 0.42, swap: 0.86, sprintOut: 0.40 },
    audio: { fire: 'fire_rotary', reload: 'reload_heavy', empty: 'empty_click', spinUp: 'rotary_spin', tail: 'tail_wide' },
    vfx: { tracer: 0xffb44a, tracerWidth: 0.030, muzzleScale: 1.25, flashColor: 0xffd08a, shellEject: true, shellRate: 2 }
  });

  def('energy_blades', {
    name: 'Rift Blades', shortName: 'BLADES', archetype: 'melee',
    description: 'Twin hard-light blades. Wide arc, no ammo, all commitment.',
    damage: 58, critMultiplier: 2.0, damageType: 'melee',
    rpm: 148, magazine: Infinity, reserveMagazines: 0, reloadTime: 0, reloadType: 'none',
    pellets: 1, fireMode: 'auto', melee: true,
    meleeArc: 105 * Math.PI / 180, meleeRange: 3.15, meleeLunge: 3.4, meleeWindup: 0.09, meleeActive: 0.14,
    spread: { base: 0, moving: 0, air: 0, crouch: 0, aim: 0, max: 0, bloomPerShot: 0, recoverRate: 1 },
    recoil: { vertical: 0.06, horizontal: 0.10, kick: 0.06, visualKick: 0.14, pattern: 'random', recovery: 12 },
    range: { falloffStart: 3.15, falloffEnd: 3.15, minMultiplier: 1.0, max: 3.15 },
    projectile: null,
    handling: { ads: 0.14, swap: 0.26, sprintOut: 0.10 },
    audio: { fire: 'fire_blade', reload: 'none', empty: 'none', tail: 'none' },
    vfx: { tracer: 0xc06bff, tracerWidth: 0, muzzleScale: 0, flashColor: 0xc06bff, trail: true }
  });

  def('shade_pistol', {
    name: 'Shade Sidearm', shortName: 'SHADE', archetype: 'pistol',
    description: 'Suppressed backup pistol. Precise, quiet, keeps pressure on from cover.',
    damage: 17.5, critMultiplier: 2.0, damageType: 'physical',
    rpm: 405, magazine: 18, reserveMagazines: 6, reloadTime: 1.34, reloadType: 'magazine',
    pellets: 1, fireMode: 'semi',
    spread: { base: 0.42, moving: 1.45, air: 2.4, crouch: -0.24, aim: -0.40, max: 3.6, bloomPerShot: 0.30, recoverRate: 7.5 },
    recoil: { vertical: 0.52, horizontal: 0.19, kick: 0.12, visualKick: 0.09, pattern: 'vertical_drift', recovery: 13.0, firstShotMul: 1.0 },
    range: { falloffStart: 22, falloffEnd: 42, minMultiplier: 0.55, max: 100 },
    projectile: null,
    handling: { ads: 0.15, swap: 0.28, sprintOut: 0.11 },
    audio: { fire: 'fire_pistol', reload: 'reload_smg', empty: 'empty_click', tail: 'tail_tight' },
    vfx: { tracer: 0xb98bff, tracerWidth: 0.024, muzzleScale: 0.62, flashColor: 0xd7b6ff, shellEject: true }
  });

  def('grenade_launcher', {
    name: 'Crackerjack GL', shortName: 'CRACKER', archetype: 'grenade_launcher',
    description: 'Bouncing arc-fired demolition tube. Read the ricochet, own the corridor.',
    damage: 66, critMultiplier: 1.0, damageType: 'explosive',
    rpm: 92, magazine: 6, reserveMagazines: 6, reloadTime: 2.55, reloadType: 'magazine',
    pellets: 1, fireMode: 'semi',
    spread: { base: 0.30, moving: 0.55, air: 0.9, crouch: -0.15, aim: -0.25, max: 2.0, bloomPerShot: 0.12, recoverRate: 4.0 },
    recoil: { vertical: 0.95, horizontal: 0.28, kick: 0.30, visualKick: 0.22, pattern: 'vertical_drift', recovery: 7.5, firstShotMul: 1.0 },
    range: { falloffStart: 90, falloffEnd: 120, minMultiplier: 1.0, max: 130 },
    projectile: {
      speed: 36, gravity: 17.5, radius: 0.20, bounce: 0.42, bounces: 3, life: 3.4,
      fuse: 1.35, impactFuse: 0.0, detonateOnEnemy: true,
      splash: { radius: 4.6, innerRadius: 1.4, minFrac: 0.30, knockback: 11.0, selfKnockback: 13.5 },
      color: 0xffa02e, trailColor: 0xff7a1a, model: 'grenade'
    },
    handling: { ads: 0.26, swap: 0.50, sprintOut: 0.22 },
    audio: { fire: 'fire_launcher', reload: 'reload_heavy', empty: 'empty_click', tail: 'tail_wide' },
    vfx: { tracer: 0, tracerWidth: 0, muzzleScale: 1.15, flashColor: 0xffb254, shellEject: false }
  });

  def('plasma_rifle', {
    name: 'Solstice Plasma', shortName: 'SOLSTICE', archetype: 'energy_rifle',
    description: 'Charged plasma bolts with a small ignition bloom. Leads targets, melts shields.',
    damage: 27, critMultiplier: 1.5, damageType: 'energy',
    rpm: 306, magazine: 26, reserveMagazines: 6, reloadTime: 2.15, reloadType: 'magazine',
    pellets: 1, fireMode: 'auto',
    spread: { base: 0.48, moving: 1.20, air: 1.90, crouch: -0.20, aim: -0.36, max: 3.4, bloomPerShot: 0.14, recoverRate: 5.0 },
    recoil: { vertical: 0.44, horizontal: 0.17, kick: 0.11, visualKick: 0.065, pattern: 'vertical_drift', recovery: 9.5, firstShotMul: 1.15 },
    range: { falloffStart: 60, falloffEnd: 90, minMultiplier: 0.80, max: 120 },
    projectile: {
      speed: 62, gravity: 0, radius: 0.24, bounce: 0, bounces: 0, life: 2.2,
      fuse: 0, impactFuse: 0, detonateOnEnemy: true,
      splash: { radius: 1.85, innerRadius: 0.4, minFrac: 0.34, knockback: 2.4, selfKnockback: 0 },
      color: 0x66ffd9, trailColor: 0x22e0b0, model: 'plasma'
    },
    handling: { ads: 0.22, swap: 0.46, sprintOut: 0.18 },
    audio: { fire: 'fire_plasma', reload: 'reload_rifle', empty: 'empty_click', tail: 'tail_mid' },
    vfx: { tracer: 0x66ffd9, tracerWidth: 0, muzzleScale: 0.95, flashColor: 0x99ffe8, shellEject: false }
  });

  def('tactical_shotgun', {
    name: 'Timberline 12', shortName: 'TIMBER', archetype: 'shotgun',
    description: 'Shell-fed hunting shotgun. Devastating inside ten metres, a rumour beyond twenty.',
    damage: 11.6, critMultiplier: 1.5, damageType: 'physical',
    rpm: 96, magazine: 6, reserveMagazines: 6, reloadTime: 0.42, reloadType: 'shell',
    reloadFirstShell: 0.55, reloadEndTime: 0.38,
    pellets: 9, fireMode: 'semi',
    spread: { base: 4.35, moving: 0.85, air: 1.60, crouch: -0.65, aim: -1.45, max: 7.5, bloomPerShot: 0.0, recoverRate: 4.0 },
    recoil: { vertical: 2.05, horizontal: 0.52, kick: 0.46, visualKick: 0.34, pattern: 'single_kick', recovery: 6.0, firstShotMul: 1.0 },
    range: { falloffStart: 8.5, falloffEnd: 20, minMultiplier: 0.22, max: 42 },
    projectile: null,
    handling: { ads: 0.24, swap: 0.48, sprintOut: 0.20 },
    audio: { fire: 'fire_shotgun', reload: 'reload_shell', reloadEnd: 'reload_pump', empty: 'empty_click', tail: 'tail_wide' },
    vfx: { tracer: 0xffd7a0, tracerWidth: 0.020, muzzleScale: 1.35, flashColor: 0xffcf8a, shellEject: true }
  });

  def('precision_rifle', {
    name: 'Meridian DMR', shortName: 'MERIDIAN', archetype: 'precision_rifle',
    description: 'Stabilised marksman platform with a true scope. One breath, one shot.',
    damage: 82, critMultiplier: 2.25, damageType: 'physical',
    rpm: 58, magazine: 5, reserveMagazines: 8, reloadTime: 2.42, reloadType: 'magazine',
    pellets: 1, fireMode: 'semi',
    scope: { zoomFov: 26, holdBreath: true, breathDuration: 3.2, breathRecover: 4.0, scopeInTime: 0.32 },
    spread: { base: 1.35, moving: 2.60, air: 4.2, crouch: -0.45, aim: -1.35, max: 6.0, bloomPerShot: 0.55, recoverRate: 3.2 },
    recoil: { vertical: 2.60, horizontal: 0.30, kick: 0.58, visualKick: 0.42, pattern: 'single_kick', recovery: 5.0, firstShotMul: 1.0 },
    range: { falloffStart: 120, falloffEnd: 165, minMultiplier: 0.80, max: 240 },
    projectile: null,
    handling: { ads: 0.34, swap: 0.62, sprintOut: 0.28 },
    audio: { fire: 'fire_precision', reload: 'reload_rifle', empty: 'empty_click', tail: 'tail_long' },
    vfx: { tracer: 0xd8f0ff, tracerWidth: 0.045, muzzleScale: 1.45, flashColor: 0xe7f6ff, shellEject: true }
  });

  /* Derived helpers used across the codebase. --------------------------- */

  HC.WeaponMath = {
    /** Seconds between shots. */
    shotInterval(w) { return 60 / Math.max(1, w.rpm); },
    /** Damage multiplier at a given distance. */
    falloff(w, dist) {
      const r = w.range;
      if (dist <= r.falloffStart) return 1;
      if (dist >= r.falloffEnd) return r.minMultiplier;
      const t = (dist - r.falloffStart) / Math.max(0.001, r.falloffEnd - r.falloffStart);
      return HC.Util.lerp(1, r.minMultiplier, HC.Util.smoothstep(t));
    },
    /** Theoretical DPS at point blank, body shots only. Used by the UI. */
    dps(w) {
      if (w.melee) return w.damage * (w.rpm / 60);
      return w.damage * w.pellets * (w.rpm / 60);
    },
    /** Damage needed per magazine — used for the stat bars in the UI. */
    magDamage(w) {
      if (!isFinite(w.magazine)) return w.damage * w.pellets;
      return w.damage * w.pellets * w.magazine;
    },
    /** 0..1 normalised stat bars for the character select screen. */
    statBars(w) {
      const U = HC.Util;
      return {
        damage:   U.clamp01(U.inverseLerp(8, 90, w.damage * (w.pellets > 1 ? w.pellets * 0.55 : 1))),
        rate:     U.clamp01(U.inverseLerp(55, 1150, w.rpm)),
        range:    U.clamp01(U.inverseLerp(6, 150, w.range.falloffStart)),
        control:  U.clamp01(1 - U.inverseLerp(0.1, 2.6, w.recoil.vertical)),
        handling: U.clamp01(1 - U.inverseLerp(0.12, 0.5, w.handling.ads))
      };
    }
  };

})(window.HC);
