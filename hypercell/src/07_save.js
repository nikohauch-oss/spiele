/* =========================================================================
 * HYPERCELL — 07_save.js
 * Persistent profile: progression, unlocks, cosmetics, settings, binds.
 * Backed by localStorage, versioned and migration-safe; when storage is
 * unavailable the game runs on an in-memory profile instead of failing.
 * ========================================================================= */
(function (HC) {
  'use strict';

  const KEY = 'hypercell.profile.v1';
  const U = HC.Util, CFG = HC.CFG;

  const Save = HC.Save = { data: null, available: true };

  Save.defaultProfile = function () {
    return {
      version: 1,
      playerName: 'OPERATIVE',
      level: 1,
      xp: 0,
      career: {
        matchesPlayed: 0, wins: 0, losses: 0,
        eliminations: 0, assists: 0, deaths: 0,
        damageDealt: 0, healingDone: 0, objectiveScore: 0,
        shotsFired: 0, shotsHit: 0, criticalHits: 0,
        timePlayed: 0, bestKillstreak: 0, mvpCount: 0
      },
      selectedCharacter: 'rex',
      selectedSkins: {},           // characterId -> skinId
      unlockedCharacters: HC.Characters.ids().slice(),  // full roster available offline
      unlockedSkins: [],           // beyond the standard skins, which are always free
      mastery: {},                 // characterId -> { level, xp, matches, kills }
      settings: {
        graphics: {
          renderScale: CFG.gfx.renderScale, shadows: CFG.gfx.shadows, shadowQuality: 2,
          bloom: CFG.gfx.bloom, particles: 2, viewDistance: CFG.gfx.viewDistance,
          antialias: CFG.gfx.antialias, textureQuality: CFG.gfx.textureQuality,
          fpsLimit: 0, motionBlur: CFG.gfx.motionBlur, vsync: true, fullscreen: false
        },
        audio: {
          master: CFG.audio.master, music: CFG.audio.music, sfx: CFG.audio.sfx,
          ui: CFG.audio.ui, voice: CFG.audio.voice
        },
        controls: {
          mouseSensitivity: CFG.input.mouseSensitivity, aimSensitivityScale: CFG.input.aimSensitivityScale,
          padSensitivity: CFG.input.padSensitivity, padDeadZone: CFG.input.padDeadZone,
          invertY: CFG.input.invertY, holdToAim: CFG.input.holdToAim, holdToSprint: CFG.input.holdToSprint,
          holdToCrouch: CFG.input.holdToCrouch, binds: null
        },
        accessibility: {
          uiScale: CFG.access.uiScale, cameraShakeStrength: CFG.access.cameraShakeStrength,
          subtitles: CFG.access.subtitles, damageNumbers: CFG.access.damageNumbers,
          colorBlindMode: CFG.access.colorBlindMode, reduceFlashing: CFG.access.reduceFlashing,
          crosshairScale: CFG.access.crosshairScale
        },
        gameplay: { mode: 'power_core', difficulty: 'normal' }
      },
      lastPlayed: 0
    };
  };

  Save.load = function () {
    let raw = null;
    try { raw = localStorage.getItem(KEY); }
    catch (e) { Save.available = false; HC.Log.warn('Save', 'localStorage unavailable — profile is session-only.'); }

    const fresh = Save.defaultProfile();
    if (!raw) { Save.data = fresh; Save.apply(); return Save.data; }

    let parsed = null;
    try { parsed = JSON.parse(raw); }
    catch (e) { HC.Log.error('Save', 'profile corrupt, starting fresh:', e.message); }

    Save.data = parsed ? Save.migrate(parsed, fresh) : fresh;
    Save.apply();
    return Save.data;
  };

  /** Deep-merge a stored profile onto the current defaults so new fields
   *  added by an update never leave `undefined` holes in the game. */
  Save.migrate = function (stored, fresh) {
    function mergeInto(target, src) {
      for (const k in target) {
        if (!(k in src)) continue;
        const tv = target[k], sv = src[k];
        if (tv && typeof tv === 'object' && !Array.isArray(tv) && sv && typeof sv === 'object' && !Array.isArray(sv)) {
          mergeInto(tv, sv);
        } else if (sv !== undefined && sv !== null && (typeof sv === typeof tv || tv === null)) {
          target[k] = sv;
        }
      }
      return target;
    }
    const out = mergeInto(fresh, stored);
    // Repair references that may point at content that no longer exists.
    if (!HC.Characters.has(out.selectedCharacter)) {
      HC.Log.warn('Save', 'selected character "' + out.selectedCharacter + '" missing — reset to rex');
      out.selectedCharacter = 'rex';
    }
    for (const cid in out.selectedSkins) {
      if (!HC.Skins.tryGet(out.selectedSkins[cid])) delete out.selectedSkins[cid];
    }
    out.unlockedCharacters = HC.Characters.ids().slice();
    out.unlockedSkins = (out.unlockedSkins || []).filter(id => !!HC.Skins.tryGet(id));
    return out;
  };

  Save.save = function () {
    if (!Save.data) return false;
    Save.data.lastPlayed = Date.now();
    if (!Save.available) return false;
    try { localStorage.setItem(KEY, JSON.stringify(Save.data)); return true; }
    catch (e) { HC.Log.warn('Save', 'write failed: ' + e.message); return false; }
  };

  Save.reset = function () {
    Save.data = Save.defaultProfile();
    Save.apply();
    Save.save();
  };

  /** Push profile settings into the live config + input + audio. */
  Save.apply = function () {
    const s = Save.data.settings;
    Object.assign(CFG.gfx, {
      renderScale: s.graphics.renderScale, shadows: s.graphics.shadows,
      bloom: s.graphics.bloom, viewDistance: s.graphics.viewDistance,
      antialias: s.graphics.antialias, textureQuality: s.graphics.textureQuality,
      motionBlur: s.graphics.motionBlur
    });
    CFG.gfx.shadowMapSize = [1024, 1536, 2048, 4096][U.clamp(s.graphics.shadowQuality, 0, 3)];
    CFG.gfx.particleBudget = [700, 1500, 2600, 4200][U.clamp(s.graphics.particles, 0, 3)];

    Object.assign(CFG.audio, s.audio);
    Object.assign(CFG.input, {
      mouseSensitivity: s.controls.mouseSensitivity,
      aimSensitivityScale: s.controls.aimSensitivityScale,
      padSensitivity: s.controls.padSensitivity,
      padDeadZone: s.controls.padDeadZone,
      invertY: s.controls.invertY,
      holdToAim: s.controls.holdToAim,
      holdToSprint: s.controls.holdToSprint,
      holdToCrouch: s.controls.holdToCrouch
    });
    Object.assign(CFG.access, s.accessibility);
    CFG.ai.difficulty = s.gameplay.difficulty;

    if (s.controls.binds) HC.Input.binds = JSON.parse(JSON.stringify(s.controls.binds));
    if (HC.Audio.ready) {
      ['master', 'music', 'sfx', 'ui', 'voice'].forEach(b => HC.Audio.setVolume(b, s.audio[b]));
    }
  };

  Save.captureSettings = function () {
    const s = Save.data.settings;
    s.controls.binds = JSON.parse(JSON.stringify(HC.Input.binds));
    Save.save();
  };

  /* ---- progression ------------------------------------------------------ */
  Save.xpForLevel = function (level) { return Math.round(800 + (level - 1) * 260 + Math.pow(level, 1.6) * 34); };
  Save.masteryXpForLevel = function (level) { return Math.round(500 + (level - 1) * 180 + Math.pow(level, 1.4) * 22); };

  Save.addXp = function (amount) {
    const p = Save.data;
    p.xp += Math.max(0, Math.round(amount));
    const gained = [];
    let need = Save.xpForLevel(p.level);
    while (p.xp >= need) { p.xp -= need; p.level++; gained.push(p.level); need = Save.xpForLevel(p.level); }
    return gained;
  };

  Save.masteryFor = function (characterId) {
    const p = Save.data;
    if (!p.mastery[characterId]) p.mastery[characterId] = { level: 1, xp: 0, matches: 0, kills: 0, wins: 0 };
    return p.mastery[characterId];
  };

  Save.addMasteryXp = function (characterId, amount) {
    const m = Save.masteryFor(characterId);
    m.xp += Math.max(0, Math.round(amount));
    const gained = [];
    let need = Save.masteryXpForLevel(m.level);
    while (m.xp >= need) { m.xp -= need; m.level++; gained.push(m.level); need = Save.masteryXpForLevel(m.level); }
    if (gained.length) Save.unlockMasteryRewards(characterId, m.level);
    return gained;
  };

  /** Skins unlock at mastery thresholds; the standard skin is always free. */
  Save.unlockMasteryRewards = function (characterId, level) {
    const skins = HC.skinsFor(characterId);
    skins.forEach(s => {
      const need = HC.SKIN_UNLOCK_MASTERY[s.rarity] || 0;
      if (level >= need && Save.data.unlockedSkins.indexOf(s.id) < 0 && s.rarity !== 'standard') {
        Save.data.unlockedSkins.push(s.id);
        HC.Log.info('Save', 'unlocked skin: ' + s.name);
      }
    });
  };

  Save.isSkinUnlocked = function (skinId) {
    const s = HC.Skins.tryGet(skinId);
    if (!s) return false;
    if (s.rarity === 'standard') return true;
    if (Save.data.unlockedSkins.indexOf(skinId) >= 0) return true;
    const m = Save.masteryFor(s.character);
    return m.level >= (HC.SKIN_UNLOCK_MASTERY[s.rarity] || 0);
  };

  Save.selectedSkinFor = function (characterId) {
    const chosen = Save.data.selectedSkins[characterId];
    if (chosen && Save.isSkinUnlocked(chosen)) return chosen;
    return HC.defaultSkinFor(characterId);
  };

  Save.selectSkin = function (characterId, skinId) {
    if (!Save.isSkinUnlocked(skinId)) return false;
    Save.data.selectedSkins[characterId] = skinId;
    Save.save();
    return true;
  };

  Save.recordMatch = function (result) {
    const c = Save.data.career;
    c.matchesPlayed++;
    if (result.won) c.wins++; else c.losses++;
    c.eliminations += result.kills | 0;
    c.assists += result.assists | 0;
    c.deaths += result.deaths | 0;
    c.damageDealt += Math.round(result.damage || 0);
    c.healingDone += Math.round(result.healing || 0);
    c.objectiveScore += Math.round(result.objective || 0);
    c.shotsFired += result.shotsFired | 0;
    c.shotsHit += result.shotsHit | 0;
    c.criticalHits += result.crits | 0;
    c.timePlayed += result.duration || 0;
    c.bestKillstreak = Math.max(c.bestKillstreak, result.bestStreak | 0);
    if (result.mvp) c.mvpCount++;

    const m = Save.masteryFor(result.characterId);
    m.matches++; m.kills += result.kills | 0; if (result.won) m.wins++;

    const levels = Save.addXp(result.xp || 0);
    const mlevels = Save.addMasteryXp(result.characterId, Math.round((result.xp || 0) * 0.62));
    Save.save();
    return { accountLevels: levels, masteryLevels: mlevels };
  };

  Save.accuracy = function () {
    const c = Save.data.career;
    return c.shotsFired > 0 ? c.shotsHit / c.shotsFired : 0;
  };
  Save.kd = function () {
    const c = Save.data.career;
    return c.deaths > 0 ? c.eliminations / c.deaths : c.eliminations;
  };

})(window.HC);
