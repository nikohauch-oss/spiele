/* =========================================================================
 * HYPERCELL — 03_characters_data.js
 * The full hero roster. Everything a hero *is* — silhouette, palette, gear,
 * stats, gait, voice timbre, abilities — is declared here. The runtime code
 * has no per-hero branches.
 * ========================================================================= */
(function (HC) {
  'use strict';

  const Characters = HC.Characters = HC.Registry('Characters', function (id) {
    return {
      id: id || 'missing', name: 'Unknown Operative', missing: true, role: 'assault',
      health: 200, shield: 0, armor: 0, speedScale: 1.0,
      weapon: 'pulse_rifle', abilities: ['dash_generic'], ultimate: 'ult_generic',
      build: HC.Characters._defaultBuild(), palette: HC.Characters._defaultPalette(),
      gear: {}, gait: {}, voice: { pitch: 1.0, timbre: 'neutral' }, skins: ['missing_default']
    };
  });

  /* Shared defaults so a hero definition only states what makes it different. */
  Characters._defaultBuild = function () {
    return {
      heightScale: 1.00, bulk: 1.00, shoulderWidth: 1.00, chestDepth: 1.00,
      hipWidth: 1.00, legLength: 1.00, armLength: 1.00, neckLength: 1.00,
      headScale: 1.003, handScale: 1.22, footScale: 1.20, torsoTaper: 1.00,
      posture: 'upright'
    };
  };
  Characters._defaultPalette = function () {
    return {
      primary: 0x445780, secondary: 0x1a2133, accent: 0x36c7ff, emissive: 0x36c7ff,
      metal: 0x8d99ad, darkMetal: 0x3a4152, skin: 0xc98d6a, hair: 0x241c19,
      visor: 0x0e2233, cloth: 0x1d2430, leather: 0x4a3628, rubber: 0x1a1d24,
      trim: 0xe8eef7, eye: 0x4a6a78
    };
  };

  const merge = (base, over) => Object.assign({}, base, over || {});
  const B = (o) => merge(Characters._defaultBuild(), o);
  const P = (o) => merge(Characters._defaultPalette(), o);
  const def = Characters.define.bind(Characters);

  /* ===================================================================== *
   * REX — Assault. The baseline: honest rifle, mobility burst, big ult.
   * ===================================================================== */
  def('rex', {
    name: 'REX', title: 'Street Vanguard', role: 'assault', roleLabel: 'Assault',
    order: 0,
    bio: 'Ex-district enforcer turned freelance point-man. Rex sets the tempo of a fight: ' +
         'push the angle, overload the rifle, and make the enemy react.',
    lore: 'Nova District, Sector 7. Rex kept the peace there for nine years before the Cell went private.',
    health: 200, shield: 75, armor: 0, speedScale: 1.00,
    weapon: 'pulse_rifle', secondary: null,
    abilities: ['combat_dash', 'overcharge'], ultimate: 'shock_rocket',
    difficulty: 1,
    build: B({ bulk: 1.06, shoulderWidth: 1.10, chestDepth: 1.05, headScale: 0.986 }),
    palette: P({
      primary: 0x4d7ba3, secondary: 0x1d2c3d, accent: 0x36c7ff, emissive: 0x4ad4ff,
      metal: 0x93a2b6, darkMetal: 0x333c4c, skin: 0xba7f5c, hair: 0x1f1a17,
      cloth: 0x1e2a36, trim: 0xf0f5fb, leather: 0x4b3a2c
    }),
    gear: {
      shoulderPads: 'light', helmet: 'none', hair: 'short_fade', jacket: 'bomber',
      backpack: 'ammo', kneePads: true, gloves: 'tactical', chestRig: true,
      beltTech: true, boots: 'high', collar: true
    },
    gait: { stride: 1.00, bounce: 1.00, armSwing: 1.00, hipSway: 1.00, weight: 1.00, idleSway: 1.0 },
    voice: { pitch: 0.94, timbre: 'grit' },
    personality: { idlePose: 'ready', victoryPose: 'salute_rifle', tauntPose: 'chest_tap' },
    skins: ['rex_standard', 'rex_night_ops', 'rex_arctic', 'rex_inferno', 'rex_cyber_warlord'],
    stats: { damage: 0.72, mobility: 0.58, survivability: 0.60, utility: 0.45, complexity: 0.25 }
  });

  /* ===================================================================== *
   * MAYA — Mobility. Vertical, evasive, punishes anyone who tracks slowly.
   * ===================================================================== */
  def('maya', {
    name: 'MAYA', title: 'Skyline Runner', role: 'mobility', roleLabel: 'Mobility',
    order: 1,
    bio: 'Freerunner turned combat courier. Maya wins duels by never being where the ' +
         'crosshair expects. Two SMGs, one extra jump, and a decoy that lies for her.',
    lore: 'She ran packages across the Nova rooftops for six years. Nobody ever caught her.',
    health: 165, shield: 60, armor: 0, speedScale: 1.13,
    weapon: 'dual_smg', secondary: null,
    abilities: ['air_jump', 'hologram'], ultimate: 'hyper_mode',
    difficulty: 2,
    build: B({
      heightScale: 0.955, bulk: 0.86, shoulderWidth: 0.92, chestDepth: 0.92, hipWidth: 1.03,
      legLength: 1.07, armLength: 1.02, headScale: 1.021, handScale: 1.14, footScale: 1.12,
      posture: 'coiled'
    }),
    palette: P({
      primary: 0x474d8a, secondary: 0x181a33, accent: 0xff5ad0, emissive: 0xff6ee0,
      metal: 0xa9b3c9, darkMetal: 0x2d3145, skin: 0x8f5f43, hair: 0x1a1420,
      cloth: 0x1b1d2e, trim: 0xf6e9ff, rubber: 0x15171f
    }),
    gear: {
      shoulderPads: 'none', helmet: 'visor_light', hair: 'high_ponytail', jacket: 'cropped',
      backpack: 'tech', kneePads: true, gloves: 'fingerless', chestRig: false,
      beltTech: true, boots: 'runner', collar: false, legWrap: true, scarf: true
    },
    gait: { stride: 0.94, bounce: 1.22, armSwing: 1.16, hipSway: 1.20, weight: 0.78, idleSway: 1.35 },
    voice: { pitch: 1.16, timbre: 'bright' },
    personality: { idlePose: 'loose', victoryPose: 'spin_flourish', tauntPose: 'beckon' },
    skins: ['maya_standard', 'maya_midnight', 'maya_solar', 'maya_prism_ghost'],
    stats: { damage: 0.62, mobility: 0.96, survivability: 0.38, utility: 0.62, complexity: 0.60 }
  });

  /* ===================================================================== *
   * BRUTUS — Tank. Space control by sheer mass.
   * ===================================================================== */
  def('brutus', {
    name: 'BRUTUS', title: 'Siege Bulwark', role: 'tank', roleLabel: 'Tank',
    order: 2,
    bio: 'Two metres of reinforced plate with a rotary cannon bolted to it. ' +
         'Brutus does not take angles — he becomes one.',
    lore: 'Salvage-yard demolition rig, retrofitted after the Kestrel Collapse. He kept the plating.',
    health: 340, shield: 0, armor: 110, speedScale: 0.83,
    weapon: 'rotary_cannon', secondary: null,
    abilities: ['energy_shield', 'ground_slam'], ultimate: 'juggernaut',
    difficulty: 1,
    build: B({
      heightScale: 1.16, bulk: 1.62, shoulderWidth: 1.72, chestDepth: 1.48, hipWidth: 1.34,
      legLength: 0.90, armLength: 1.10, neckLength: 0.55, headScale: 0.898,
      handScale: 1.68, footScale: 1.55, torsoTaper: 1.22, posture: 'hunched'
    }),
    palette: P({
      primary: 0x8e9271, secondary: 0x33361f, accent: 0xf2b23f, emissive: 0xffc24a,
      metal: 0x7f8794, darkMetal: 0x2c2f34, skin: 0x7d5138, hair: 0x2b2b28,
      cloth: 0x26271d, trim: 0xd9c07a, rubber: 0x18191c, leather: 0x40301f
    }),
    gear: {
      shoulderPads: 'heavy', helmet: 'half_mask', hair: 'buzz', jacket: 'plated',
      backpack: 'tank', kneePads: true, gloves: 'gauntlet', chestRig: true,
      beltTech: false, boots: 'stomper', collar: true, hipPlates: true
    },
    gait: { stride: 1.30, bounce: 0.62, armSwing: 0.72, hipSway: 0.68, weight: 2.10, idleSway: 0.65 },
    voice: { pitch: 0.72, timbre: 'deep' },
    personality: { idlePose: 'heavy', victoryPose: 'ground_pound', tauntPose: 'flex' },
    skins: ['brutus_standard', 'brutus_quarry', 'brutus_magma', 'brutus_titan_forge'],
    stats: { damage: 0.66, mobility: 0.24, survivability: 0.98, utility: 0.58, complexity: 0.30 }
  });

  /* ===================================================================== *
   * NYX — Assassin. Melee burst with an escape plan.
   * ===================================================================== */
  def('nyx', {
    name: 'NYX', title: 'Rift Shadow', role: 'assassin', roleLabel: 'Assassin',
    order: 3,
    bio: 'A blink, a blade, and a body on the floor. Nyx trades every point of health ' +
         'for the ability to choose exactly when a fight starts.',
    lore: 'The Cell has no record of her before the Rift trials. She prefers it that way.',
    health: 155, shield: 70, armor: 0, speedScale: 1.09,
    weapon: 'energy_blades', secondary: 'shade_pistol',
    abilities: ['blink', 'cloak'], ultimate: 'shadow_strike',
    difficulty: 3,
    build: B({
      heightScale: 1.02, bulk: 0.83, shoulderWidth: 0.94, chestDepth: 0.88, hipWidth: 0.98,
      legLength: 1.10, armLength: 1.06, headScale: 0.968, handScale: 1.12, footScale: 1.08,
      torsoTaper: 0.92, posture: 'coiled'
    }),
    palette: P({
      primary: 0x453a5e, secondary: 0x120e1c, accent: 0xa964ff, emissive: 0xc06bff,
      metal: 0x6f6a86, darkMetal: 0x1b1726, skin: 0xa9a5b8, hair: 0x0f0c15,
      cloth: 0x140f1c, trim: 0xd6b8ff, visor: 0x2a0f4a, rubber: 0x120f18
    }),
    gear: {
      shoulderPads: 'asym', helmet: 'mask_full', hair: 'undercut_long', jacket: 'wrap',
      backpack: 'none', kneePads: false, gloves: 'blade_gauntlet', chestRig: false,
      beltTech: true, boots: 'stalker', collar: true, cape: 'short', legWrap: true
    },
    gait: { stride: 0.98, bounce: 0.92, armSwing: 0.86, hipSway: 1.10, weight: 0.82, idleSway: 0.90 },
    voice: { pitch: 1.05, timbre: 'whisper' },
    personality: { idlePose: 'predator', victoryPose: 'blade_flick', tauntPose: 'slow_point' },
    skins: ['nyx_standard', 'nyx_ivory', 'nyx_venom', 'nyx_void_empress'],
    stats: { damage: 0.90, mobility: 0.86, survivability: 0.32, utility: 0.50, complexity: 0.85 }
  });

  /* ===================================================================== *
   * JAX — Demolition. Area denial and self-propelled chaos.
   * ===================================================================== */
  def('jax', {
    name: 'JAX', title: 'Boom Technician', role: 'demolition', roleLabel: 'Demolition',
    order: 4,
    bio: 'Jax believes every problem is a geometry problem, and geometry can be edited. ' +
         'Arc the grenade, stick the charge, ride the blast.',
    lore: 'Formerly of the Nova District demolition guild. Formerly.',
    health: 210, shield: 50, armor: 0, speedScale: 0.98,
    weapon: 'grenade_launcher', secondary: null,
    abilities: ['sticky_charge', 'blast_jump'], ultimate: 'mega_bomb',
    difficulty: 2,
    build: B({
      heightScale: 0.98, bulk: 1.20, shoulderWidth: 1.14, chestDepth: 1.16, hipWidth: 1.10,
      legLength: 0.95, headScale: 1.056, handScale: 1.34, footScale: 1.30, posture: 'upright'
    }),
    palette: P({
      primary: 0xc08434, secondary: 0x3d2a12, accent: 0xffa02e, emissive: 0xff8c1a,
      metal: 0x9a8f78, darkMetal: 0x35302a, skin: 0xc48a5e, hair: 0x5c3a1c,
      cloth: 0x2f2114, trim: 0xffd79a, leather: 0x53381d, rubber: 0x1c1a17
    }),
    gear: {
      shoulderPads: 'asym', helmet: 'goggles', hair: 'messy', jacket: 'workwear',
      backpack: 'ammo', kneePads: true, gloves: 'heavy', chestRig: true,
      beltTech: true, boots: 'work', collar: false, hipPlates: true
    },
    gait: { stride: 1.06, bounce: 1.05, armSwing: 1.10, hipSway: 1.02, weight: 1.25, idleSway: 1.15 },
    voice: { pitch: 0.99, timbre: 'rowdy' },
    personality: { idlePose: 'restless', victoryPose: 'toss_catch', tauntPose: 'shrug_big' },
    skins: ['jax_standard', 'jax_hazard', 'jax_scrapyard', 'jax_doomsday'],
    stats: { damage: 0.86, mobility: 0.62, survivability: 0.55, utility: 0.72, complexity: 0.65 }
  });

  /* ===================================================================== *
   * NOVA — Energy. Zone pressure from unusual angles.
   * ===================================================================== */
  def('nova', {
    name: 'NOVA', title: 'Arc Weaver', role: 'energy', roleLabel: 'Energy',
    order: 5,
    bio: 'Nova fights in three dimensions. Hover above the fray, seed the ground with ' +
         'plasma, and collapse a star on anyone who closes in.',
    lore: 'The first successful Cell integration. She calls the reactor in her spine "the quiet part".',
    health: 180, shield: 90, armor: 0, speedScale: 1.02,
    weapon: 'plasma_rifle', secondary: null,
    abilities: ['hover', 'plasma_orb'], ultimate: 'supernova',
    difficulty: 2,
    build: B({
      heightScale: 1.00, bulk: 0.90, shoulderWidth: 0.98, chestDepth: 0.94, hipWidth: 1.02,
      legLength: 1.05, armLength: 1.03, headScale: 1.012, handScale: 1.16, footScale: 1.12
    }),
    palette: P({
      primary: 0x357e88, secondary: 0x0f2a30, accent: 0x3ff0c0, emissive: 0x66ffd9,
      metal: 0xa3bcc2, darkMetal: 0x1c3238, skin: 0xd8b49a, hair: 0xd8f2ee,
      cloth: 0x0f2b30, trim: 0xd9fff6, visor: 0x0a3a3f, rubber: 0x10191b
    }),
    gear: {
      shoulderPads: 'light', helmet: 'crown', hair: 'long_flow', jacket: 'robe_tech',
      backpack: 'tech', kneePads: false, gloves: 'energy', chestRig: false,
      beltTech: true, boots: 'levitator', collar: true, cape: 'long', halo: true
    },
    gait: { stride: 0.96, bounce: 0.88, armSwing: 0.92, hipSway: 1.06, weight: 0.86, idleSway: 1.20 },
    voice: { pitch: 1.10, timbre: 'ethereal' },
    personality: { idlePose: 'serene', victoryPose: 'ascend', tauntPose: 'orb_spin' },
    skins: ['nova_standard', 'nova_solar_flare', 'nova_deep_current', 'nova_singularity'],
    stats: { damage: 0.74, mobility: 0.66, survivability: 0.56, utility: 0.78, complexity: 0.70 }
  });

  /* ===================================================================== *
   * KODA — Hunter. Information and traps.
   * ===================================================================== */
  def('koda', {
    name: 'KODA', title: 'Wildline Tracker', role: 'hunter', roleLabel: 'Hunter',
    order: 6,
    bio: 'Koda hunts the way he was taught outside the walls: know where they are before ' +
         'they know where you are, then close the distance in one breath.',
    lore: 'He came into Nova District chasing a signal. He stayed for the work.',
    health: 205, shield: 55, armor: 0, speedScale: 1.04,
    weapon: 'tactical_shotgun', secondary: null,
    abilities: ['hunter_trap', 'scout_drone'], ultimate: 'predator_mode',
    difficulty: 2,
    build: B({
      heightScale: 1.04, bulk: 1.12, shoulderWidth: 1.16, chestDepth: 1.08, hipWidth: 1.04,
      legLength: 1.03, armLength: 1.05, headScale: 0.986, handScale: 1.26, footScale: 1.26
    }),
    palette: P({
      primary: 0x647f57, secondary: 0x21301c, accent: 0xc8f24e, emissive: 0xd6ff5e,
      metal: 0x8d9483, darkMetal: 0x2b3128, skin: 0x8e5c3c, hair: 0x2a1d13,
      cloth: 0x232c1d, trim: 0xe9f7c2, leather: 0x513a24, rubber: 0x16180f
    }),
    gear: {
      shoulderPads: 'asym', helmet: 'hood', hair: 'braids', jacket: 'pelt_tech',
      backpack: 'tech', kneePads: true, gloves: 'wrapped', chestRig: true,
      beltTech: true, boots: 'trekker', collar: true, legWrap: true
    },
    gait: { stride: 1.05, bounce: 1.02, armSwing: 1.04, hipSway: 1.00, weight: 1.10, idleSway: 0.95 },
    voice: { pitch: 0.90, timbre: 'calm' },
    personality: { idlePose: 'watchful', victoryPose: 'kneel_scan', tauntPose: 'howl' },
    skins: ['koda_standard', 'koda_ashfall', 'koda_tundra', 'koda_apex_beast'],
    stats: { damage: 0.82, mobility: 0.68, survivability: 0.58, utility: 0.84, complexity: 0.55 }
  });

  /* ===================================================================== *
   * ZERO — Technology. Long-range control and hard cover.
   * ===================================================================== */
  def('zero', {
    name: 'ZERO', title: 'Orbital Marshal', role: 'controller', roleLabel: 'Controller',
    order: 7,
    bio: 'Sealed armour, cold voice, perfect information. Zero decides which parts of the ' +
         'map still exist, then removes the rest from orbit.',
    lore: 'Nobody has seen the face behind the plate. The Cell insists there is one.',
    health: 195, shield: 105, armor: 30, speedScale: 0.94,
    weapon: 'precision_rifle', secondary: null,
    abilities: ['scanner_pulse', 'energy_barrier'], ultimate: 'orbital_beam',
    difficulty: 3,
    build: B({
      heightScale: 1.06, bulk: 1.22, shoulderWidth: 1.26, chestDepth: 1.18, hipWidth: 1.06,
      legLength: 1.02, armLength: 1.04, neckLength: 0.75, headScale: 0.933,
      handScale: 1.30, footScale: 1.32
    }),
    palette: P({
      primary: 0xd8dee8, secondary: 0x8e97a6, accent: 0x2f7bff, emissive: 0x4f9bff,
      metal: 0xc3cbd8, darkMetal: 0x2a3140, skin: 0x9aa4b3, hair: 0x000000,
      cloth: 0x1c222d, trim: 0x0e1626, visor: 0x081a3a, rubber: 0x171b23
    }),
    gear: {
      shoulderPads: 'heavy', helmet: 'full_sealed', hair: 'none', jacket: 'armor_suit',
      backpack: 'tech', kneePads: true, gloves: 'armored', chestRig: false,
      beltTech: true, boots: 'armored', collar: true, hipPlates: true, antenna: true
    },
    gait: { stride: 1.08, bounce: 0.80, armSwing: 0.86, hipSway: 0.84, weight: 1.45, idleSway: 0.70 },
    voice: { pitch: 0.86, timbre: 'vocoder' },
    personality: { idlePose: 'sentinel', victoryPose: 'scan_sweep', tauntPose: 'dismiss' },
    skins: ['zero_standard', 'zero_carbon', 'zero_signal', 'zero_orbital_sovereign'],
    stats: { damage: 0.88, mobility: 0.40, survivability: 0.72, utility: 0.90, complexity: 0.80 }
  });

  /* Roster helpers -------------------------------------------------------- */
  HC.roster = function () {
    return Characters.all().sort((a, b) => (a.order | 0) - (b.order | 0));
  };
  /** Heroes marked as the shipped launch four (see brief §69). */
  HC.LAUNCH_ROSTER = ['rex', 'maya', 'brutus', 'nyx'];

  HC.roleIcon = {
    assault: 'M4 20 L12 3 L20 20 L12 15 Z',
    mobility: 'M3 18 L11 5 L12 12 L21 6 L13 20 L12 13 Z',
    tank: 'M12 2 L21 6 V13 C21 18 12 22 12 22 C12 22 3 18 3 13 V6 Z',
    assassin: 'M12 2 L15 9 L22 12 L15 15 L12 22 L9 15 L2 12 L9 9 Z',
    demolition: 'M12 22 A7 7 0 1 1 12 8 A7 7 0 0 1 12 22 M12 8 V3 M12 3 L17 2',
    energy: 'M13 2 L4 14 H11 L10 22 L20 9 H13 Z',
    hunter: 'M12 2 L14 8 H21 L15 12 L17 20 L12 15 L7 20 L9 12 L3 8 H10 Z',
    controller: 'M12 3 A9 9 0 1 1 11.99 3 M12 8 A4 4 0 1 0 12.01 8'
  };

})(window.HC);
