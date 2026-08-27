/* =========================================================================
 * HYPERCELL — 04_skins_data.js
 * Skins are palette + material + gear + VFX overlays on a base hero.
 * Legendary skins additionally replace silhouette pieces, ability VFX
 * colours, spawn/victory poses and audio timbre — never colour alone.
 * ========================================================================= */
(function (HC) {
  'use strict';

  const Skins = HC.Skins = HC.Registry('Skins', function (id) {
    return {
      id: id || 'missing', name: 'Default', character: null, rarity: 'standard',
      missing: true, palette: {}, gear: {}, materials: {}, vfx: {}, audio: {}
    };
  });
  const def = Skins.define.bind(Skins);

  /* ---- REX ------------------------------------------------------------- */
  def('rex_standard', {
    name: 'Street Vanguard', character: 'rex', rarity: 'standard',
    description: 'Rex as the district knows him: scuffed bomber, service rifle, no ceremony.',
    palette: {}, gear: {}, materials: { wear: 0.35, fabricRough: 0.86 },
    vfx: {}, audio: {}
  });
  def('rex_night_ops', {
    name: 'Night Ops', character: 'rex', rarity: 'rare',
    description: 'Matte-black infiltration kit with low-signature amber optics.',
    palette: { primary: 0x1b2027, secondary: 0x0e1116, accent: 0xffb23f, emissive: 0xffb23f,
               cloth: 0x1e242c, metal: 0x5a626e, trim: 0x9aa3ae, darkMetal: 0x14171c },
    gear: { helmet: 'visor_light', shoulderPads: 'light', hair: 'short_fade' },
    materials: { wear: 0.22, fabricRough: 0.94, metalRough: 0.62 },
    vfx: { muzzle: 0xffcf7a, tracer: 0xffb23f, ability: 0xffb23f },
    audio: { firePitch: 0.94 }
  });
  def('rex_arctic', {
    name: 'Whiteout', character: 'rex', rarity: 'rare',
    description: 'Cold-weather overlayer with frost-etched plating and a rimed rifle shroud.',
    palette: { primary: 0xdfe7ee, secondary: 0x9fb0bf, accent: 0x8ee6ff, emissive: 0xa9efff,
               cloth: 0xc9d6e0, metal: 0xb8c6d2, trim: 0x5c7488, darkMetal: 0x6a7a89 },
    gear: { jacket: 'parka', collar: true, hair: 'short_fade' },
    materials: { wear: 0.30, frost: 0.65, fabricRough: 0.92 },
    vfx: { muzzle: 0xd8f6ff, tracer: 0x8ee6ff, ability: 0x8ee6ff, trailParticle: 'frost' },
    audio: { firePitch: 1.03 }
  });
  def('rex_inferno', {
    name: 'Inferno', character: 'rex', rarity: 'epic',
    description: 'Scorched, half-melted plating that still holds an ember charge.',
    palette: { primary: 0x2a1410, secondary: 0x140907, accent: 0xff5a1e, emissive: 0xff7a2a,
               cloth: 0x33150f, metal: 0x6b4a3c, trim: 0xffb46a, darkMetal: 0x1a0d09 },
    gear: { shoulderPads: 'heavy', helmet: 'half_mask', hair: 'none' },
    materials: { wear: 0.85, glowSeams: 0.9, emberEmissive: 0.7, metalRough: 0.48 },
    vfx: { muzzle: 0xff8a3a, tracer: 0xff5a1e, ability: 0xff5a1e, aura: 'embers' },
    audio: { firePitch: 0.90, extraLayer: 'fire' }
  });
  def('rex_cyber_warlord', {
    name: 'Cyber Warlord', character: 'rex', rarity: 'legendary',
    description: 'A full reforge: sovereign war-plate, sealed command mask, and a rifle ' +
                 'rebuilt around a captured Cell shard.',
    palette: { primary: 0x2a1a4a, secondary: 0x140c26, accent: 0x00ffc8, emissive: 0x2affd8,
               cloth: 0x241543, metal: 0xc9a94a, darkMetal: 0x1a1030, trim: 0xffe9a8,
               visor: 0x00201c, skin: 0x2a2438 },
    gear: { shoulderPads: 'warlord', helmet: 'warlord_mask', hair: 'none', jacket: 'warlord_plate',
            cape: 'long', backpack: 'tech', collar: true, hipPlates: true, antenna: true, halo: true },
    materials: { wear: 0.12, metalRough: 0.28, goldTrim: 1.0, glowSeams: 1.0 },
    vfx: { muzzle: 0x6affe0, tracer: 0x00ffc8, ability: 0x00ffc8, ultimate: 0x00ffc8, aura: 'shard' },
    audio: { firePitch: 0.84, extraLayer: 'resonance', voiceFilter: 'warlord' },
    overrides: {
      weaponModel: 'warlord_rifle',
      spawnPose: 'warlord_descend', victoryPose: 'warlord_crown', idlePose: 'sovereign',
      abilityVfx: { combat_dash: 'shard_dash', overcharge: 'shard_overcharge', shock_rocket: 'shard_rocket' }
    }
  });

  /* ---- MAYA ------------------------------------------------------------ */
  def('maya_standard', {
    name: 'Skyline Runner', character: 'maya', rarity: 'standard',
    description: 'Courier kit: cropped shell, grip wraps, and a scarf that never sits still.',
    palette: {}, gear: {}, materials: { wear: 0.28, fabricRough: 0.82 }, vfx: {}, audio: {}
  });
  def('maya_midnight', {
    name: 'Midnight Circuit', character: 'maya', rarity: 'rare',
    description: 'Deep indigo weave threaded with reactive circuitry.',
    palette: { primary: 0x161b3a, secondary: 0x0a0c1e, accent: 0x5affe0, emissive: 0x5affe0,
               cloth: 0x1b2148, trim: 0xc9fff4, metal: 0x7d8aa6 },
    gear: { hair: 'high_ponytail', scarf: true },
    materials: { wear: 0.16, glowSeams: 0.8 },
    vfx: { muzzle: 0x9dfff0, tracer: 0x5affe0, ability: 0x5affe0 }, audio: { firePitch: 1.05 }
  });
  def('maya_solar', {
    name: 'Solar Sprint', character: 'maya', rarity: 'epic',
    description: 'Heat-bleached racing shell with a solar collector spine.',
    palette: { primary: 0xf2a63c, secondary: 0x8c4d12, accent: 0xfff06a, emissive: 0xffe14a,
               cloth: 0xffbf5e, trim: 0x4a2a08, metal: 0xd8c9a8, rubber: 0x2a1c10 },
    gear: { jacket: 'cropped', backpack: 'tech', halo: true },
    materials: { wear: 0.34, glowSeams: 0.55 },
    vfx: { muzzle: 0xfff2a0, tracer: 0xffe14a, ability: 0xffd23f, aura: 'heat' },
    audio: { firePitch: 1.10 }
  });
  def('maya_prism_ghost', {
    name: 'Prism Ghost', character: 'maya', rarity: 'legendary',
    description: 'A refraction suit that leaves an afterimage of itself. Her hologram is ' +
                 'no longer a copy — it is a shard of light with its own edge.',
    palette: { primary: 0xdff6ff, secondary: 0x9fd9ee, accent: 0xff6ee0, emissive: 0xd0f4ff,
               cloth: 0xeaf9ff, trim: 0xff9df0, metal: 0xe8f6ff, skin: 0xdff0f8, hair: 0xbfe8ff },
    gear: { hair: 'prism_crest', helmet: 'visor_light', jacket: 'prism_shell', cape: 'short',
            scarf: true, halo: true },
    materials: { wear: 0.0, iridescent: 1.0, metalRough: 0.14, glowSeams: 1.0 },
    vfx: { muzzle: 0xffd4f6, tracer: 0xff6ee0, ability: 0xff6ee0, ultimate: 0xffffff, aura: 'prism' },
    audio: { firePitch: 1.14, extraLayer: 'crystal', voiceFilter: 'shimmer' },
    overrides: {
      weaponModel: 'prism_smgs',
      spawnPose: 'prism_refract', victoryPose: 'prism_shatter', idlePose: 'weightless',
      abilityVfx: { air_jump: 'prism_leap', hologram: 'prism_shard', hyper_mode: 'prism_burst' }
    }
  });

  /* ---- BRUTUS ---------------------------------------------------------- */
  def('brutus_standard', {
    name: 'Siege Bulwark', character: 'brutus', rarity: 'standard',
    description: 'Salvage plate, hydraulic gauntlets, and a cannon that has never been cleaned.',
    palette: {}, gear: {}, materials: { wear: 0.62, metalRough: 0.74 }, vfx: {}, audio: {}
  });
  def('brutus_quarry', {
    name: 'Quarry Foreman', character: 'brutus', rarity: 'rare',
    description: 'High-visibility site rig with reflective banding and dust-caked joints.',
    palette: { primary: 0xf2a316, secondary: 0x6b4508, accent: 0xffe14a, emissive: 0xffd23f,
               metal: 0x9aa1ac, trim: 0xf2f5f8, cloth: 0x6f5a2a },
    gear: { helmet: 'hardhat', shoulderPads: 'heavy' },
    materials: { wear: 0.80, dust: 0.7 },
    vfx: { muzzle: 0xffd68a, tracer: 0xffc24a, ability: 0xffd23f }, audio: { firePitch: 0.97 }
  });
  def('brutus_magma', {
    name: 'Magma Core', character: 'brutus', rarity: 'epic',
    description: 'The armour cracked and something molten decided to stay inside it.',
    palette: { primary: 0x241511, secondary: 0x120906, accent: 0xff4a14, emissive: 0xff6a1e,
               metal: 0x5a4238, darkMetal: 0x160c08, trim: 0xffa050 },
    gear: { helmet: 'half_mask', shoulderPads: 'heavy', hipPlates: true },
    materials: { wear: 0.72, glowSeams: 1.0, emberEmissive: 0.85 },
    vfx: { muzzle: 0xff9a4a, tracer: 0xff4a14, ability: 0xff4a14, aura: 'embers' },
    audio: { firePitch: 0.88, extraLayer: 'fire' }
  });
  def('brutus_titan_forge', {
    name: 'Titan Forge', character: 'brutus', rarity: 'legendary',
    description: 'Not armour any more — a walking foundry. The rotary cannon feeds from a ' +
                 'furnace slung across his back, and the ground remembers where he lands.',
    palette: { primary: 0x3a3f4a, secondary: 0x191c22, accent: 0x00d9ff, emissive: 0x39e6ff,
               metal: 0xb9c4d2, darkMetal: 0x101318, trim: 0xd8a63f, cloth: 0x2a2f38 },
    gear: { shoulderPads: 'titan', helmet: 'titan_forge', hair: 'none', jacket: 'titan_plate',
            backpack: 'forge', hipPlates: true, collar: true, antenna: true },
    materials: { wear: 0.30, metalRough: 0.34, glowSeams: 1.0, goldTrim: 0.6 },
    vfx: { muzzle: 0x8af2ff, tracer: 0x00d9ff, ability: 0x00d9ff, ultimate: 0x00d9ff, aura: 'forge' },
    audio: { firePitch: 0.78, extraLayer: 'forge', voiceFilter: 'titan' },
    overrides: {
      weaponModel: 'titan_rotary',
      spawnPose: 'titan_drop', victoryPose: 'titan_anvil', idlePose: 'furnace',
      abilityVfx: { energy_shield: 'titan_wall', ground_slam: 'titan_quake', juggernaut: 'titan_overdrive' }
    }
  });

  /* ---- NYX ------------------------------------------------------------- */
  def('nyx_standard', {
    name: 'Rift Shadow', character: 'nyx', rarity: 'standard',
    description: 'Wrapped matte weave, sealed mask, twin hard-light emitters.',
    palette: {}, gear: {}, materials: { wear: 0.20, fabricRough: 0.90 }, vfx: {}, audio: {}
  });
  def('nyx_ivory', {
    name: 'Ivory Edict', character: 'nyx', rarity: 'rare',
    description: 'Ceremonial white wrap issued for Rift tribunal duty.',
    palette: { primary: 0xe8e4dc, secondary: 0xb3ada2, accent: 0x3fd8ff, emissive: 0x66e6ff,
               cloth: 0xdfd9cf, trim: 0x4a5560, metal: 0xd8d2c6, visor: 0x123043 },
    gear: { cape: 'long', helmet: 'mask_full' },
    materials: { wear: 0.10, fabricRough: 0.80 },
    vfx: { tracer: 0x3fd8ff, ability: 0x3fd8ff, blade: 0x66e6ff }, audio: { firePitch: 1.06 }
  });
  def('nyx_venom', {
    name: 'Venom Protocol', character: 'nyx', rarity: 'epic',
    description: 'Toxin-etched plating; the blades leave a lingering green scar in the air.',
    palette: { primary: 0x14261a, secondary: 0x081008, accent: 0x7dff3f, emissive: 0x9dff5e,
               cloth: 0x142014, trim: 0xd6ffb0, metal: 0x5f7a5a, visor: 0x0f2a10 },
    gear: { helmet: 'mask_full', cape: 'short', legWrap: true },
    materials: { wear: 0.26, glowSeams: 0.85 },
    vfx: { tracer: 0x7dff3f, ability: 0x7dff3f, blade: 0x9dff5e, aura: 'toxin' },
    audio: { firePitch: 0.98, extraLayer: 'hiss' }
  });
  def('nyx_void_empress', {
    name: 'Void Empress', character: 'nyx', rarity: 'legendary',
    description: 'Rift authority made physical. The blades are no longer projected — they ' +
                 'are torn out of the space in front of her, and they close behind her.',
    palette: { primary: 0x0b0714, secondary: 0x05030b, accent: 0xff2ea6, emissive: 0xff56bd,
               cloth: 0x120a1e, trim: 0xffb6e4, metal: 0x6a4a7a, visor: 0x2a0020, skin: 0x8b7fa8 },
    gear: { helmet: 'empress_crown', hair: 'void_veil', jacket: 'empress_wrap', cape: 'regal',
            shoulderPads: 'asym', collar: true, halo: true, legWrap: true },
    materials: { wear: 0.0, voidShimmer: 1.0, metalRough: 0.22, glowSeams: 1.0 },
    vfx: { tracer: 0xff2ea6, ability: 0xff2ea6, blade: 0xff56bd, ultimate: 0xff2ea6, aura: 'void' },
    audio: { firePitch: 0.92, extraLayer: 'void', voiceFilter: 'empress' },
    overrides: {
      weaponModel: 'void_blades',
      spawnPose: 'void_unfold', victoryPose: 'void_throne', idlePose: 'regal_predator',
      abilityVfx: { blink: 'void_step', cloak: 'void_veil', shadow_strike: 'void_execution' }
    }
  });

  /* ---- JAX / NOVA / KODA / ZERO ---------------------------------------- */
  def('jax_standard', { name: 'Boom Technician', character: 'jax', rarity: 'standard',
    description: 'Guild workwear, a rig full of charges, and singed eyebrows.',
    palette: {}, gear: {}, materials: { wear: 0.55 }, vfx: {}, audio: {} });
  def('jax_hazard', { name: 'Hazard Crew', character: 'jax', rarity: 'rare',
    description: 'Chevron-striped blast suit rated for things it should not be rated for.',
    palette: { primary: 0xf2d21e, secondary: 0x2a2408, accent: 0xff3b1e, emissive: 0xff5a2a, cloth: 0xd9bd1a, trim: 0x14120a },
    gear: { helmet: 'blast_hood' }, materials: { wear: 0.62 },
    vfx: { ability: 0xff3b1e, tracer: 0xffa02e }, audio: { firePitch: 1.02 } });
  def('jax_scrapyard', { name: 'Scrapyard King', character: 'jax', rarity: 'epic',
    description: 'Bolted-together plate from six different rigs, and a crown of exhaust pipes.',
    palette: { primary: 0x6b5a3f, secondary: 0x2c2517, accent: 0xff8a1e, emissive: 0xffa03a, metal: 0x8f8271, trim: 0xd9c08a },
    gear: { shoulderPads: 'heavy', helmet: 'scrap_crown', backpack: 'ammo', hipPlates: true },
    materials: { wear: 0.90, dust: 0.5, glowSeams: 0.4 },
    vfx: { ability: 0xff8a1e, tracer: 0xffa02e, aura: 'smoke' }, audio: { firePitch: 0.95 } });
  def('jax_doomsday', { name: 'Doomsday Engine', character: 'jax', rarity: 'legendary',
    description: 'The launcher and the man are now one assembly. Every charge he throws is ' +
                 'assembled mid-flight by the arms on his back.',
    palette: { primary: 0x21140a, secondary: 0x0d0705, accent: 0xff2e00, emissive: 0xff5a14,
               metal: 0x6f5a45, darkMetal: 0x120a06, trim: 0xffb46a },
    gear: { shoulderPads: 'doomsday', helmet: 'doomsday_rig', jacket: 'doomsday_plate',
            backpack: 'forge', hipPlates: true, antenna: true },
    materials: { wear: 0.45, glowSeams: 1.0, emberEmissive: 0.9 },
    vfx: { ability: 0xff2e00, tracer: 0xff5a14, ultimate: 0xff2e00, aura: 'embers' },
    audio: { firePitch: 0.82, extraLayer: 'forge', voiceFilter: 'doom' },
    overrides: { weaponModel: 'doomsday_launcher', spawnPose: 'doom_assemble',
                 victoryPose: 'doom_detonate', idlePose: 'unstable',
                 abilityVfx: { sticky_charge: 'doom_charge', blast_jump: 'doom_launch', mega_bomb: 'doom_finale' } } });

  def('nova_standard', { name: 'Arc Weaver', character: 'nova', rarity: 'standard',
    description: 'Tech-weave robe over a containment harness; the spine reactor hums.',
    palette: {}, gear: {}, materials: { wear: 0.12, glowSeams: 0.5 }, vfx: {}, audio: {} });
  def('nova_solar_flare', { name: 'Solar Flare', character: 'nova', rarity: 'rare',
    description: 'Reactor tuned to the yellow band. Warmer, louder, harder to look at.',
    palette: { primary: 0x5c3a12, secondary: 0x2a1a06, accent: 0xffb02e, emissive: 0xffcf5e, trim: 0xffe9b0, cloth: 0x6b4416 },
    gear: { hair: 'long_flow', halo: true }, materials: { glowSeams: 0.9 },
    vfx: { ability: 0xffb02e, tracer: 0xffcf5e, aura: 'heat' }, audio: { firePitch: 0.96 } });
  def('nova_deep_current', { name: 'Deep Current', character: 'nova', rarity: 'epic',
    description: 'Pressure-rated abyssal weave with bioluminescent bloom along every seam.',
    palette: { primary: 0x0c2440, secondary: 0x050f1e, accent: 0x2e9bff, emissive: 0x5ab6ff, trim: 0xbfe6ff, cloth: 0x123a5c },
    gear: { cape: 'long', helmet: 'crown' }, materials: { glowSeams: 1.0, iridescent: 0.6 },
    vfx: { ability: 0x2e9bff, tracer: 0x5ab6ff, aura: 'bubbles' }, audio: { firePitch: 1.04 } });
  def('nova_singularity', { name: 'Singularity', character: 'nova', rarity: 'legendary',
    description: 'The reactor won. What walks the arena is a shell held together by the ' +
                 'gravity well where her spine used to be.',
    palette: { primary: 0x0a0a12, secondary: 0x040407, accent: 0xb46bff, emissive: 0xd39cff,
               metal: 0x4a4460, trim: 0xe8d4ff, skin: 0x2a2438, hair: 0xd8c4ff },
    gear: { helmet: 'singularity_crown', hair: 'void_flow', jacket: 'singularity_robe',
            cape: 'regal', halo: true, antenna: true },
    materials: { voidShimmer: 1.0, glowSeams: 1.0, metalRough: 0.2 },
    vfx: { ability: 0xb46bff, tracer: 0xd39cff, ultimate: 0xffffff, aura: 'void' },
    audio: { firePitch: 0.90, extraLayer: 'void', voiceFilter: 'singular' },
    overrides: { weaponModel: 'singularity_lance', spawnPose: 'singularity_collapse',
                 victoryPose: 'singularity_bloom', idlePose: 'orbital',
                 abilityVfx: { hover: 'sing_float', plasma_orb: 'sing_orb', supernova: 'sing_collapse' } } });

  def('koda_standard', { name: 'Wildline Tracker', character: 'koda', rarity: 'standard',
    description: 'Layered pelt-tech, hand wraps, and a shotgun he built himself.',
    palette: {}, gear: {}, materials: { wear: 0.48 }, vfx: {}, audio: {} });
  def('koda_ashfall', { name: 'Ashfall', character: 'koda', rarity: 'rare',
    description: 'Soot-grey field kit from the burn season.',
    palette: { primary: 0x3a3a3a, secondary: 0x1c1c1c, accent: 0xff7a3f, emissive: 0xff9a5e, cloth: 0x424242, trim: 0xd8d0c4 },
    gear: { helmet: 'hood' }, materials: { wear: 0.68, dust: 0.6 },
    vfx: { ability: 0xff7a3f, tracer: 0xff9a5e }, audio: { firePitch: 0.96 } });
  def('koda_tundra', { name: 'Tundra Line', character: 'koda', rarity: 'epic',
    description: 'Pale winter shell with breath-fog venting and frost-locked traps.',
    palette: { primary: 0xd6e2e8, secondary: 0x8fa2ad, accent: 0x6ae0ff, emissive: 0x9df0ff, cloth: 0xc2d2da, trim: 0x3f5560 },
    gear: { helmet: 'hood', legWrap: true }, materials: { wear: 0.30, frost: 0.7 },
    vfx: { ability: 0x6ae0ff, tracer: 0x9df0ff, aura: 'frost' }, audio: { firePitch: 1.05 } });
  def('koda_apex_beast', { name: 'Apex Beast', character: 'koda', rarity: 'legendary',
    description: 'The hunt rewrote him. Elongated silhouette, quadruped crouch, and a drone ' +
                 'that behaves less like a machine and more like a pack member.',
    palette: { primary: 0x1e2a18, secondary: 0x0b120a, accent: 0xc8ff2e, emissive: 0xdcff5e,
               metal: 0x4f5c46, trim: 0xeaffc0, skin: 0x5c4030, hair: 0x141008 },
    gear: { helmet: 'beast_skull', hair: 'mane', jacket: 'beast_hide', shoulderPads: 'beast',
            legWrap: true, cape: 'short' },
    materials: { wear: 0.40, glowSeams: 0.9, fur: 1.0 },
    vfx: { ability: 0xc8ff2e, tracer: 0xdcff5e, ultimate: 0xc8ff2e, aura: 'feral' },
    audio: { firePitch: 0.86, extraLayer: 'growl', voiceFilter: 'beast' },
    overrides: { weaponModel: 'beast_shotgun', spawnPose: 'beast_prowl',
                 victoryPose: 'beast_roar', idlePose: 'four_point',
                 abilityVfx: { hunter_trap: 'beast_snare', scout_drone: 'beast_hound', predator_mode: 'beast_frenzy' } } });

  def('zero_standard', { name: 'Orbital Marshal', character: 'zero', rarity: 'standard',
    description: 'Sealed white marshal plate. No visible seams, no visible face.',
    palette: {}, gear: {}, materials: { wear: 0.10, metalRough: 0.36 }, vfx: {}, audio: {} });
  def('zero_carbon', { name: 'Carbon Writ', character: 'zero', rarity: 'rare',
    description: 'Weave-carbon variant issued for deniable operations.',
    palette: { primary: 0x24272e, secondary: 0x131519, accent: 0xff3355, emissive: 0xff5f7a, metal: 0x50565f, trim: 0x9aa3ae },
    gear: { helmet: 'full_sealed' }, materials: { wear: 0.14, metalRough: 0.42 },
    vfx: { ability: 0xff3355, tracer: 0xff5f7a }, audio: { firePitch: 0.94 } });
  def('zero_signal', { name: 'Signal Ghost', character: 'zero', rarity: 'epic',
    description: 'Half-phased plating that reads as static on every sensor but the eye.',
    palette: { primary: 0x2a3a4a, secondary: 0x101820, accent: 0x39ffdc, emissive: 0x6effe8, metal: 0x7f97a8, trim: 0xd0fff8 },
    gear: { helmet: 'full_sealed', antenna: true, cape: 'short' },
    materials: { wear: 0.06, glowSeams: 1.0, iridescent: 0.75 },
    vfx: { ability: 0x39ffdc, tracer: 0x6effe8, aura: 'static' }, audio: { firePitch: 1.02, extraLayer: 'static' } });
  def('zero_orbital_sovereign', { name: 'Orbital Sovereign', character: 'zero', rarity: 'legendary',
    description: 'Command authority in physical form: a mantled war-plate with a live orbital ' +
                 'link ring that hangs behind the shoulders and never stops turning.',
    palette: { primary: 0xf2f5fa, secondary: 0x8b98ab, accent: 0x2f7bff, emissive: 0x6aa8ff,
               metal: 0xe4ebf4, darkMetal: 0x1a2233, trim: 0xd8a63f, visor: 0x041538 },
    gear: { helmet: 'sovereign_crown', jacket: 'sovereign_plate', shoulderPads: 'sovereign',
            cape: 'regal', backpack: 'orbital_ring', hipPlates: true, antenna: true, halo: true },
    materials: { wear: 0.0, metalRough: 0.20, goldTrim: 1.0, glowSeams: 1.0 },
    vfx: { ability: 0x2f7bff, tracer: 0xbcd8ff, ultimate: 0xffffff, aura: 'orbital' },
    audio: { firePitch: 0.80, extraLayer: 'resonance', voiceFilter: 'sovereign' },
    overrides: { weaponModel: 'sovereign_dmr', spawnPose: 'sovereign_deploy',
                 victoryPose: 'sovereign_verdict', idlePose: 'command',
                 abilityVfx: { scanner_pulse: 'sov_scan', energy_barrier: 'sov_wall', orbital_beam: 'sov_judgement' } } });

  /* Lookup helpers -------------------------------------------------------- */
  HC.skinsFor = function (characterId) {
    return Skins.all().filter(s => s.character === characterId);
  };
  HC.defaultSkinFor = function (characterId) {
    const c = HC.Characters.tryGet(characterId);
    if (c && c.skins && c.skins.length) return c.skins[0];
    const list = HC.skinsFor(characterId);
    return list.length ? list[0].id : 'rex_standard';
  };
  /** Skins that are free from the start; the rest unlock through mastery. */
  HC.SKIN_UNLOCK_MASTERY = { standard: 0, rare: 3, epic: 6, legendary: 10 };

})(window.HC);
