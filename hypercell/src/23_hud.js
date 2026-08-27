/* =========================================================================
 * HYPERCELL — 23_hud.js
 * In-match HUD: vitals, abilities, ammo, objective, kill feed, dynamic
 * crosshair, hit markers, floating damage, nameplates, world markers,
 * damage-direction indicators, minimap, scoreboard and banners.
 * ========================================================================= */
(function (HC, THREE) {
  'use strict';

  const U = HC.Util;
  const CFG = HC.CFG;

  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function svgIcon(path, size) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 24) + '" height="' + (size || 24) +
      '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="' + path + '"/></svg>';
  }

  HC.HUD = function HUD(rootEl) {
    const H = {
      root: rootEl, visible: false, arena: null, camera: null,
      _dmgNumbers: [], _markers: [], _plates: new Map(), _arrows: [],
      _hitMarkerTimer: 0, _hitMarkerKind: 'normal',
      _lastScore: { A: -1, B: -1 },
      _time: 0, _toasts: []
    };

    /* ---- structure ----------------------------------------------------- */
    const layer = el('div', 'hc-layer hc-hidden');
    layer.id = 'hc-hud';
    rootEl.appendChild(layer);

    const worldUI = el('div'); worldUI.id = 'hc-worldui';
    layer.appendChild(worldUI);

    const lowHealth = el('div'); lowHealth.id = 'hc-lowhealth';
    layer.appendChild(lowHealth);

    /* vitals */
    const bl = el('div', 'hc-hud-corner hc-hud-bl');
    bl.innerHTML =
      '<div class="hc-hero-tag"><span class="nm" data-hero>—</span><span class="rl" data-role></span></div>' +
      '<div class="hc-vitals">' +
      '  <div class="hc-vital-row"><span class="hc-vital-label">HP</span>' +
      '    <div class="hc-vital-bar health"><u data-hp-ghost></u><i data-hp></i></div>' +
      '    <span class="hc-vital-value hc-mono" data-hp-val>0</span></div>' +
      '  <div class="hc-vital-row" data-shield-row><span class="hc-vital-label">SHD</span>' +
      '    <div class="hc-vital-bar shield"><u data-sh-ghost></u><i data-sh></i></div>' +
      '    <span class="hc-vital-value hc-mono" data-sh-val>0</span></div>' +
      '  <div class="hc-vital-row" data-armor-row><span class="hc-vital-label">ARM</span>' +
      '    <div class="hc-vital-bar armor"><u data-ar-ghost></u><i data-ar></i></div>' +
      '    <span class="hc-vital-value hc-mono" data-ar-val>0</span></div>' +
      '</div>' +
      '<div class="hc-spawnguard hc-hidden" data-spawnguard>' +
      '  SPAWN PROTECTION <b class="hc-mono" data-spawnguard-t>0.0</b>' +
      '  <span class="sub">ends when you attack</span></div>';
    layer.appendChild(bl);

    /* abilities */
    const bc = el('div', 'hc-hud-corner hc-hud-bc');
    const abilityWrap = el('div', 'hc-abilities');
    bc.appendChild(abilityWrap);
    layer.appendChild(bc);

    const abilitySlots = [];
    for (let i = 0; i < 3; i++) {
      const isUlt = i === 2;
      const slot = el('div', 'hc-ability-slot' + (isUlt ? ' ult' : ''));
      slot.innerHTML =
        '<span class="ico"></span>' +
        '<span class="cool"></span>' +
        '<span class="cdtext"></span>' +
        '<span class="charges"></span>' +
        (isUlt ? '<span class="ultbar"><i></i></span>' : '') +
        '<span class="keybind"></span>';
      abilityWrap.appendChild(slot);
      abilitySlots.push({
        root: slot,
        ico: slot.querySelector('.ico'),
        cool: slot.querySelector('.cool'),
        cdtext: slot.querySelector('.cdtext'),
        charges: slot.querySelector('.charges'),
        ultbar: isUlt ? slot.querySelector('.ultbar > i') : null,
        keybind: slot.querySelector('.keybind'),
        lastIcon: null
      });
    }

    /* ammo */
    const br = el('div', 'hc-hud-corner hc-hud-br');
    br.innerHTML =
      '<div class="hc-ammo"><span class="mag hc-mono" data-mag>0</span><span class="res hc-mono" data-res>/ 0</span></div>' +
      '<div class="hc-weapon-name" data-wname>—</div>' +
      '<div class="hc-reload-bar" data-reload-wrap><i data-reload></i></div>' +
      '<div class="hc-weapon-swap" data-swap></div>';
    layer.appendChild(br);

    /* top-centre score */
    const tc = el('div', 'hc-hud-corner hc-hud-tc');
    tc.innerHTML =
      '<div class="hc-panel hc-scorebar">' +
      '  <div class="team a"><span class="dot"></span><span class="sc hc-mono" data-score-a>0</span></div>' +
      '  <div class="clock hc-mono" data-clock>0:00</div>' +
      '  <div class="team b"><span class="sc hc-mono" data-score-b>0</span><span class="dot"></span></div>' +
      '</div>' +
      '<div class="hc-objective" data-objective></div>';
    layer.appendChild(tc);

    /* crosshair + hitmarker */
    const cross = el('div'); cross.id = 'hc-crosshair';
    const crossParts = [];
    ['top', 'bottom', 'left', 'right'].forEach(dir => {
      const p = el('span', 'part ' + dir);
      cross.appendChild(p);
      crossParts.push({ el: p, dir });
    });
    const crossDot = el('span', 'part dot');
    cross.appendChild(crossDot);
    layer.appendChild(cross);

    const hitMarker = el('div');
    hitMarker.id = 'hc-hitmarker';
    hitMarker.innerHTML =
      '<svg viewBox="0 0 34 34" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">' +
      '<line x1="5" y1="5" x2="12" y2="12"/><line x1="29" y1="5" x2="22" y2="12"/>' +
      '<line x1="5" y1="29" x2="12" y2="22"/><line x1="29" y1="29" x2="22" y2="22"/></svg>';
    layer.appendChild(hitMarker);

    /* kill feed */
    const killFeed = el('div'); killFeed.id = 'hc-killfeed';
    layer.appendChild(killFeed);

    /* damage direction */
    const dmgDir = el('div'); dmgDir.id = 'hc-dmgdir';
    layer.appendChild(dmgDir);

    /* minimap */
    const minimap = el('div'); minimap.id = 'hc-minimap';
    const mmCanvas = el('canvas');
    mmCanvas.width = 344; mmCanvas.height = 344;
    minimap.appendChild(mmCanvas);
    layer.appendChild(minimap);
    const mmCtx = mmCanvas.getContext('2d');

    /* banners / death / toast / subtitles */
    const banner = el('div', 'hc-hidden'); banner.id = 'hc-banner';
    banner.innerHTML = '<div class="big"></div><div class="small"></div>';
    layer.appendChild(banner);

    const death = el('div', 'hc-hidden'); death.id = 'hc-death';
    death.innerHTML = '<div class="t">ELIMINATED</div><div class="k"></div><div class="c hc-mono">0</div>' +
      '<div class="k" style="margin-top:.6em;opacity:.7">RESPAWNING</div>';
    layer.appendChild(death);

    const toastWrap = el('div'); toastWrap.id = 'hc-toast';
    layer.appendChild(toastWrap);

    const subtitles = el('div'); subtitles.id = 'hc-subtitles';
    layer.appendChild(subtitles);

    const capture = el('div', 'hc-hidden'); capture.id = 'hc-capture';
    capture.innerHTML = '<div class="box"><div class="t">Click to Play</div>' +
      '<div class="s" data-capture-sub>Captures the mouse · ESC to release</div></div>';
    layer.appendChild(capture);

    const perf = el('div'); perf.id = 'hc-perf';
    layer.appendChild(perf);

    /* scoreboard */
    const scoreboard = el('div', 'hc-panel hc-hidden'); scoreboard.id = 'hc-scoreboard';
    layer.appendChild(scoreboard);

    /* cached refs */
    const q = (sel) => layer.querySelector(sel);
    const R = {
      hero: q('[data-hero]'), role: q('[data-role]'),
      hp: q('[data-hp]'), hpGhost: q('[data-hp-ghost]'), hpVal: q('[data-hp-val]'),
      sh: q('[data-sh]'), shGhost: q('[data-sh-ghost]'), shVal: q('[data-sh-val]'), shRow: q('[data-shield-row]'),
      ar: q('[data-ar]'), arGhost: q('[data-ar-ghost]'), arVal: q('[data-ar-val]'), arRow: q('[data-armor-row]'),
      mag: q('[data-mag]'), res: q('[data-res]'), wname: q('[data-wname]'),
      reload: q('[data-reload]'), reloadWrap: q('[data-reload-wrap]'), swap: q('[data-swap]'),
      scoreA: q('[data-score-a]'), scoreB: q('[data-score-b]'), clock: q('[data-clock]'),
      objective: q('[data-objective]'), ammoBox: layer.querySelector('.hc-ammo'),
      spawnGuard: q('[data-spawnguard]'), spawnGuardT: q('[data-spawnguard-t]')
    };

    /* ---- attachment ---------------------------------------------------- */
    H.attach = function (arena, camera) {
      H.arena = arena;
      H.camera = camera;
      H._lastScore.A = -1; H._lastScore.B = -1;
      killFeed.innerHTML = '';
      arena.events.on('killFeed', addKillFeedRow);
      arena.events.on('hitmarker', onHitMarker);
      arena.events.on('playerDamaged', onPlayerDamaged);
      // Only surface callouts the local player caused — otherwise nine bots
      // spam the toast stack with their own ability chatter.
      arena.events.on('feed', (e) => { if (!e.actor || e.actor === arena.player) H.toast(e.text); });
      arena.events.on('objective', onObjectiveEvent);
      arena.events.on('overtime', () => H.showBanner('OVERTIME', 'SUDDEN DEATH', 2.4, 'var(--armor)'));
      setupAbilityIcons();
      H.show(true);
    };

    H.show = function (v) {
      H.visible = v;
      layer.classList.toggle('hc-hidden', !v);
    };

    function setupAbilityIcons() {
      const a = H.arena.player;
      if (!a) return;
      const list = a.abilities.slotList();
      const binds = ['ability1', 'ability2', 'ultimate'];
      list.forEach((s, i) => {
        const ui = abilitySlots[i];
        if (ui.lastIcon !== s.def.icon) {
          ui.ico.innerHTML = svgIcon(s.def.icon, i === 2 ? 38 : 30);
          ui.lastIcon = s.def.icon;
        }
        ui.keybind.textContent = HC.Input.bindLabel(binds[i]);
        ui.root.title = s.def.name + ' — ' + s.def.description;
      });
      R.hero.textContent = a.charDef.name;
      R.role.textContent = a.charDef.roleLabel;
    }

    /* ---- per-frame update ----------------------------------------------- */
    H.update = function (dt) {
      if (!H.visible || !H.arena) return;
      H._time += dt;
      const arena = H.arena;
      const p = arena.player;
      if (!p) return;

      updateVitals(p);
      updateAbilities(p);
      updateWeapon(p);
      updateScore(arena);
      updateCrosshair(p, dt);
      updateHitMarker(dt);
      updateWorldUI(dt);
      updateDamageArrows(dt);
      updateDeathScreen(p);
      updateMinimap(arena, p);
      updateToasts(dt);
      updateBanner(dt);
      updateLowHealth(p);
      // In drag-look mode the prompt is only needed until the first drag.
      const needPrompt = H.wantCapture && !HC.Input.locked &&
        !(HC.Input.dragLook && H._hasDragged);
      if (HC.Input.dragLook && HC.Input.dragging) H._hasDragged = true;
      if (HC.Input.dragLook && capture.dataset.mode !== 'drag') {
        capture.dataset.mode = 'drag';
        capture.querySelector('.t').textContent = 'Hold & Drag to Aim';
        capture.querySelector('[data-capture-sub]').textContent =
          'Mouse capture is blocked here · WASD to move · hold the left button to aim and fire';
      }
      capture.classList.toggle('hc-hidden', !needPrompt);
    };

    /** The game sets this while a match is live and unpaused. */
    H.wantCapture = false;
    H.setWantCapture = function (v) {
      H.wantCapture = !!v;
      if (!v) capture.classList.add('hc-hidden');
    };

    /* --- vitals --- */
    let ghostHp = 1, ghostSh = 1, ghostAr = 1;
    function updateVitals(p) {
      const h = p.health;
      const hp = h.maxHealth > 0 ? h.health / h.maxHealth : 0;
      const sh = h.effectiveMaxShield() > 0 ? h.shield / h.effectiveMaxShield() : 0;
      const ar = h.maxArmor > 0 ? h.armor / h.maxArmor : 0;

      R.hp.style.transform = 'scaleX(' + hp.toFixed(4) + ')';
      R.sh.style.transform = 'scaleX(' + sh.toFixed(4) + ')';
      R.ar.style.transform = 'scaleX(' + ar.toFixed(4) + ')';
      // Ghost bars trail behind so the player sees how much they just lost.
      ghostHp = ghostHp < hp ? hp : U.damp(ghostHp, hp, 2.4, 0.016);
      ghostSh = ghostSh < sh ? sh : U.damp(ghostSh, sh, 2.4, 0.016);
      ghostAr = ghostAr < ar ? ar : U.damp(ghostAr, ar, 2.4, 0.016);
      R.hpGhost.style.transform = 'scaleX(' + ghostHp.toFixed(4) + ')';
      R.shGhost.style.transform = 'scaleX(' + ghostSh.toFixed(4) + ')';
      R.arGhost.style.transform = 'scaleX(' + ghostAr.toFixed(4) + ')';

      R.hpVal.textContent = Math.ceil(h.health);
      R.shVal.textContent = Math.ceil(h.shield);
      R.arVal.textContent = Math.ceil(h.armor);
      R.shRow.style.display = h.effectiveMaxShield() > 0 ? '' : 'none';
      R.arRow.style.display = h.maxArmor > 0 ? '' : 'none';

      const guarded = h.alive && h.spawnProtected;
      R.spawnGuard.classList.toggle('hc-hidden', !guarded);
      if (guarded) R.spawnGuardT.textContent = h.spawnProtectionTimer.toFixed(1);
    }

    /* --- abilities --- */
    function updateAbilities(p) {
      const list = p.abilities.slotList();
      list.forEach((s, i) => {
        const ui = abilitySlots[i];
        if (!ui) return;
        if (ui.lastIcon !== s.def.icon) {
          ui.ico.innerHTML = svgIcon(s.def.icon, i === 2 ? 38 : 30);
          ui.lastIcon = s.def.icon;
        }
        if (i === 2) {
          const pct = p.abilities.ultReady ? 100 : p.abilities.ultCharge;
          ui.ultbar.style.width = pct.toFixed(1) + '%';
          ui.root.classList.toggle('ready', p.abilities.ultReady);
          ui.cool.style.transform = 'scaleY(' + (p.abilities.ultReady ? 0 : 1 - pct / 100).toFixed(3) + ')';
          ui.cdtext.textContent = p.abilities.ultReady ? '' : Math.floor(pct) + '%';
          ui.charges.innerHTML = '';
        } else {
          const ready = s.charges > 0 || s.infiniteCharges;
          ui.root.classList.toggle('ready', ready && !s.active);
          const cd = s.cooldown > 0 ? s.cooldown / s.def.cooldown : 0;
          ui.cool.style.transform = 'scaleY(' + cd.toFixed(3) + ')';
          ui.cdtext.textContent = s.cooldown > 0.05 && s.charges < s.maxCharges ? s.cooldown.toFixed(1) : '';
          if (s.maxCharges > 1) {
            let html = '';
            for (let c = 0; c < s.maxCharges; c++) html += '<i class="' + (c < s.charges ? '' : 'off') + '"></i>';
            if (ui.charges.innerHTML !== html) ui.charges.innerHTML = html;
          } else if (ui.charges.innerHTML) ui.charges.innerHTML = '';
        }
        ui.root.classList.toggle('active', s.active);
      });
    }

    /* --- weapon --- */
    let lastUltReady = false;
    function updateWeapon(p) {
      const w = p.weapon;
      if (!w.def) return;
      const mag = isFinite(w.magazine) ? w.magazine : '∞';
      if (R.mag.textContent !== String(mag)) R.mag.textContent = mag;
      const res = isFinite(w.reserve) ? '/ ' + w.reserve : '';
      if (R.res.textContent !== res) R.res.textContent = res;
      R.wname.textContent = w.def.shortName || w.def.name;
      const low = isFinite(w.magazine) && w.magazine <= w.def.magazine * 0.25;
      R.ammoBox.classList.toggle('low', low);

      if (w.reloading) {
        R.reloadWrap.style.opacity = '1';
        let frac;
        if (w.def.reloadType === 'shell') frac = w.magazine / w.def.magazine;
        else frac = 1 - w.reloadTimer / Math.max(0.01, w.def.reloadTime * w.mods.reload);
        R.reload.style.width = (U.clamp01(frac) * 100).toFixed(1) + '%';
      } else {
        R.reloadWrap.style.opacity = '0';
      }
      R.swap.textContent = p.weaponSlots.length > 1
        ? '[' + HC.Input.bindLabel('swapWeapon') + '] ' + HC.Weapons.get(p.weaponSlots[(p.weaponIndex + 1) % p.weaponSlots.length].id).shortName
        : '';

      if (p.abilities.ultReady && !lastUltReady) {
        HC.Audio.ui('ult_ready');
        H.toast('ULTIMATE READY');
      }
      lastUltReady = p.abilities.ultReady;
    }

    /* --- score / timer --- */
    function updateScore(arena) {
      const teamBased = arena.modeDef.teamBased;
      let a, b;
      if (teamBased) { a = Math.floor(arena.teams.A.score); b = Math.floor(arena.teams.B.score); }
      else {
        a = arena.player ? arena.player.score.kills : 0;
        b = 0;
        arena.actors.forEach(x => { if (x !== arena.player) b = Math.max(b, x.score.kills); });
      }
      if (a !== H._lastScore.A) { R.scoreA.textContent = a; pop(R.scoreA); H._lastScore.A = a; }
      if (b !== H._lastScore.B) { R.scoreB.textContent = b; pop(R.scoreB); H._lastScore.B = b; }

      const t = arena.timeRemaining;
      R.clock.textContent = U.formatTime(t);
      R.clock.classList.toggle('urgent', t < CFG.match.finalMinuteThreshold);
      R.objective.innerHTML = objectiveText(arena);
    }

    function pop(node) {
      node.style.transition = 'none';
      node.style.transform = 'scale(1.32)';
      requestAnimationFrame(() => {
        node.style.transition = 'transform .32s cubic-bezier(.2,.9,.3,1.4)';
        node.style.transform = 'scale(1)';
      });
    }

    function objectiveText(arena) {
      const m = arena.mode;
      if (m.id === 'power_core') {
        const core = m.core;
        if (core.state === 'spawning') return 'CORE RESPAWNS IN <b>' + Math.ceil(core.respawnTimer) + 's</b>';
        if (core.state === 'idle') return 'CORE IS LIVE IN THE PLAZA';
        if (core.state === 'dropped') return 'CORE DROPPED — <b>' + Math.ceil(core.dropTimer) + 's</b>';
        if (core.carrier === arena.player) return '<b>YOU HAVE THE CORE</b> — REACH YOUR PAD';
        return (core.carrier.team === arena.player.team ? 'ALLY' : 'ENEMY') + ' CARRIER: <b>' + core.carrier.name + '</b>';
      }
      if (m.id === 'zone_control') {
        return m.zones.map(z => {
          const c = z.contested ? 'var(--armor)' : (z.owner ? (z.owner === 'A' ? 'var(--team-a)' : 'var(--team-b)') : 'var(--text-faint)');
          return '<span style="color:' + c + '">' + z.name + '</span>';
        }).join(' · ');
      }
      if (m.id === 'crystal_control') {
        if (m.countdown.active) return '<b>' + arena.teams[m.countdown.team].name + ' WINS IN ' + Math.ceil(m.countdown.timer) + 's</b>';
        return 'CRYSTALS: FIRST TO ' + arena.modeDef.scoreLimit;
      }
      if (m.id === 'solo_arena') return 'FREE FOR ALL — FIRST TO ' + arena.modeDef.scoreLimit;
      return 'ELIMINATIONS — FIRST TO ' + arena.modeDef.scoreLimit;
    }

    /* --- crosshair --- */
    function updateCrosshair(p, dt) {
      const w = p.weapon;
      const scale = CFG.access.crosshairScale;
      if (w.scoped) { cross.style.opacity = '0'; return; }
      cross.style.opacity = '1';
      const state = {
        moving: p.planarSpeed > 0.6,
        speedFrac: U.clamp01(p.planarSpeed / CFG.move.runSpeed),
        grounded: p.grounded, crouching: p.crouchBlend > 0.5,
        sprinting: p.sprinting, sliding: p.sliding
      };
      const spreadRad = w.def ? w.currentSpread(state) : 0.02;
      // Convert the cone angle into a screen-space gap.
      const gap = Math.max(3, Math.tan(spreadRad) * (window.innerHeight * 0.5) /
        Math.tan(H.camera.fov * 0.5 * U.DEG)) * scale;
      const len = (7 + (p.sprinting ? 4 : 0)) * scale;
      const thick = Math.max(1, Math.round(1.6 * scale));
      crossParts.forEach(part => {
        const e = part.el;
        if (part.dir === 'top') { e.style.cssText = css(thick, len, -thick / 2, -gap - len); }
        else if (part.dir === 'bottom') { e.style.cssText = css(thick, len, -thick / 2, gap); }
        else if (part.dir === 'left') { e.style.cssText = css(len, thick, -gap - len, -thick / 2); }
        else { e.style.cssText = css(len, thick, gap, -thick / 2); }
      });
      crossDot.style.opacity = w.aim > 0.5 ? '1' : '0.55';
      function css(wpx, hpx, left, top) {
        return 'width:' + wpx + 'px;height:' + hpx + 'px;left:' + left + 'px;top:' + top + 'px;';
      }
    }

    /* --- hit markers --- */
    function onHitMarker(e) {
      H._hitMarkerTimer = e.killed ? CFG.feel.killMarkerTime
        : (e.critical ? CFG.feel.critMarkerTime : CFG.feel.hitMarkerTime);
      H._hitMarkerKind = e.killed ? 'kill' : (e.critical ? 'crit' : (e.shield ? 'shield' : 'normal'));
      HC.Audio.ui(e.killed ? 'kill_confirm' : (e.critical ? 'hitmarker_crit' : (e.shield ? 'hitmarker_shield' : 'hitmarker')),
        { volume: 0.85 });
      if (CFG.access.damageNumbers && e.position && e.amount) {
        spawnDamageNumber(e.position, e.amount, e.critical, e.shield);
      }
    }

    function updateHitMarker(dt) {
      if (H._hitMarkerTimer <= 0) { hitMarker.style.opacity = '0'; return; }
      H._hitMarkerTimer -= dt;
      const k = H._hitMarkerKind;
      const color = k === 'kill' ? 'var(--danger)' : (k === 'crit' ? 'var(--crit)' :
        (k === 'shield' ? 'var(--shield)' : '#ffffff'));
      hitMarker.style.color = color;
      const life = U.clamp01(H._hitMarkerTimer / CFG.feel.hitMarkerTime);
      hitMarker.style.opacity = String(Math.min(1, life * 1.5));
      const s = k === 'kill' ? 1.34 : (k === 'crit' ? 1.18 : 1);
      hitMarker.style.transform = 'translate(-50%,-50%) scale(' + (s * (1 + (1 - life) * 0.22)).toFixed(3) + ')';
    }

    /* --- floating damage numbers --- */
    function spawnDamageNumber(worldPos, amount, critical, shield) {
      const node = el('div', 'hc-dmgnum' + (critical ? ' crit' : (shield ? ' shield' : '')),
        Math.round(amount) + (critical ? '!' : ''));
      worldUI.appendChild(node);
      H._dmgNumbers.push({
        node,
        pos: worldPos.clone(),
        life: CFG.feel.damageNumberLife,
        maxLife: CFG.feel.damageNumberLife,
        drift: (Math.random() - 0.5) * 34
      });
      if (H._dmgNumbers.length > 26) {
        const old = H._dmgNumbers.shift();
        old.node.remove();
      }
    }

    /* --- world-space UI: damage numbers, nameplates, objective markers --- */
    function updateWorldUI(dt) {
      const cam = H.camera;
      const arena = H.arena;
      const w = window.innerWidth, h = window.innerHeight;

      for (let i = H._dmgNumbers.length - 1; i >= 0; i--) {
        const d = H._dmgNumbers[i];
        d.life -= dt;
        if (d.life <= 0) { d.node.remove(); H._dmgNumbers.splice(i, 1); continue; }
        const k = 1 - d.life / d.maxLife;
        d.pos.y += CFG.feel.damageNumberRise * dt;
        _v.copy(d.pos).project(cam);
        if (_v.z > 1) { d.node.style.opacity = '0'; continue; }
        d.node.style.left = ((_v.x * 0.5 + 0.5) * w + d.drift * k) + 'px';
        d.node.style.top = ((-_v.y * 0.5 + 0.5) * h) + 'px';
        d.node.style.opacity = String(1 - U.easeInCubic(k));
        d.node.style.transform = 'translate(-50%,-50%) scale(' + (1 + (1 - k) * 0.25).toFixed(2) + ')';
      }

      // Nameplates for allies and marked/visible enemies.
      const player = arena.player;
      const now = arena.time;
      for (let i = 0; i < arena.actors.length; i++) {
        const a = arena.actors[i];
        if (a === player) continue;
        let plate = H._plates.get(a);
        const ally = arena.modeDef.teamBased && a.team === player.team;
        const marked = a.markedUntil > now && a.markedBy === player.team;
        const visible = a.health.alive && (ally || marked || isOnScreenAndVisible(a));
        if (!visible) { if (plate) { plate.node.style.display = 'none'; } continue; }

        if (!plate) {
          const node = el('div', 'hc-nameplate',
            '<div class="nm"></div><div class="bar"><i></i><u></u></div>');
          worldUI.appendChild(node);
          plate = { node, nm: node.querySelector('.nm'), bar: node.querySelector('.bar > i'), sh: node.querySelector('.bar > u') };
          H._plates.set(a, plate);
        }
        a.headPosition(_v);
        _v.y += 0.42;
        _v2.copy(_v).project(cam);
        if (_v2.z > 1) { plate.node.style.display = 'none'; continue; }
        const dist = cam.position.distanceTo(a.position);
        plate.node.style.display = '';
        plate.node.style.left = ((_v2.x * 0.5 + 0.5) * w) + 'px';
        plate.node.style.top = ((-_v2.y * 0.5 + 0.5) * h) + 'px';
        plate.node.style.opacity = String(U.clamp01(1 - (dist - 42) / 22));
        const col = ally ? 'var(--team-a)' : 'var(--team-b)';
        plate.nm.style.color = ally ? colorForTeam(a.team) : colorForTeam(a.team);
        if (plate.nm.textContent !== a.name) plate.nm.textContent = a.name;
        plate.bar.style.width = (a.health.health / a.health.maxHealth * 100).toFixed(0) + '%';
        plate.bar.style.background = ally ? 'var(--health)' : 'var(--danger)';
        plate.sh.style.width = a.health.effectiveMaxShield() > 0
          ? (a.health.shield / a.health.effectiveMaxShield() * 100).toFixed(0) + '%' : '0%';
      }

      // Objective marker (Power Core / zones / delivery pad).
      updateObjectiveMarkers(w, h);
    }

    function colorForTeam(team) {
      const c = HC.Mats.teamColor(team);
      return '#' + c.toString(16).padStart(6, '0');
    }

    function isOnScreenAndVisible(a) {
      if (!a.health.alive) return false;
      if (a.cloakBlend > 0.6) return false;
      const cam = H.camera;
      a.centerPosition(_v);
      const d = cam.position.distanceTo(_v);
      if (d > 64) return false;
      return H.arena.world.lineOfSight(cam.position, _v);
    }

    function updateObjectiveMarkers(w, h) {
      const arena = H.arena;
      const cam = H.camera;
      const points = [];
      const m = arena.mode;
      if (m.id === 'power_core') {
        const core = m.core;
        if (core.state !== 'spawning') {
          points.push({ pos: core.position, label: core.carrier ? core.carrier.name : 'CORE',
            icon: 'M12 3 L20 8 V16 L12 21 L4 16 V8 Z', color: '#9b6bff' });
        }
        const zone = arena.map.deliveryZones[arena.player.team];
        if (core.carrier === arena.player && zone) {
          points.push({ pos: zone.position, label: 'DELIVER', icon: 'M12 21 V5 M6 11 L12 5 L18 11', color: colorForTeam(arena.player.team) });
        }
      } else if (m.id === 'zone_control') {
        m.zones.forEach(z => points.push({
          pos: z.position, label: z.name,
          icon: 'M12 3 A9 9 0 1 1 11.9 3', color: z.owner ? colorForTeam(z.owner) : '#f2c14e'
        }));
      }

      while (H._markers.length < points.length) {
        const node = el('div', 'hc-marker', '<span class="ic"></span><span class="lb"></span>');
        worldUI.appendChild(node);
        H._markers.push({ node, ic: node.querySelector('.ic'), lb: node.querySelector('.lb'), lastIcon: null });
      }
      H._markers.forEach((mk, i) => {
        if (i >= points.length) { mk.node.style.display = 'none'; return; }
        const p = points[i];
        _v.copy(p.pos); _v.y += 1.8;
        _v2.copy(_v).project(cam);
        const behind = _v2.z > 1;
        let x = (_v2.x * 0.5 + 0.5) * w;
        let y = (-_v2.y * 0.5 + 0.5) * h;
        if (behind) { x = w - x; y = h - 40; }
        x = U.clamp(x, 40, w - 40);
        y = U.clamp(y, 60, h - 120);
        mk.node.style.display = '';
        mk.node.style.left = x + 'px';
        mk.node.style.top = y + 'px';
        mk.node.style.color = p.color;
        if (mk.lastIcon !== p.icon) { mk.ic.innerHTML = svgIcon(p.icon, 22); mk.lastIcon = p.icon; }
        const dist = Math.round(cam.position.distanceTo(p.pos));
        mk.lb.textContent = p.label + '  ' + dist + 'm';
      });
    }

    /* --- damage direction indicators --- */
    function onPlayerDamaged(e) {
      const dir = e.info.direction ? e.info.direction.clone() : new THREE.Vector3(0, 0, 1);
      const node = el('div', 'hc-dmgarrow');
      node.innerHTML = '<svg viewBox="0 0 190 190"><path d="M95 12 L112 42 L95 34 L78 42 Z" fill="rgba(255,50,80,0.9)"/></svg>';
      dmgDir.appendChild(node);
      H._arrows.push({ node, dir, life: CFG.feel.damageIndicatorLife, maxLife: CFG.feel.damageIndicatorLife });
      HC.Audio.ui('damage_taken', { scale: U.clamp01(e.result.applied / 45), volume: 0.8 });
      if (H.arena.camera) H.arena.camera.addShake(CFG.feel.hitCameraKick * U.clamp01(e.result.applied / 40), 0.2);
    }

    function updateDamageArrows(dt) {
      const p = H.arena.player;
      for (let i = H._arrows.length - 1; i >= 0; i--) {
        const a = H._arrows[i];
        a.life -= dt;
        if (a.life <= 0) { a.node.remove(); H._arrows.splice(i, 1); continue; }
        // Rotate the arrow into the player's current facing.
        const angle = Math.atan2(a.dir.x, a.dir.z);
        const rel = U.shortAngle(p.yaw, angle + Math.PI);
        a.node.style.transform = 'rotate(' + (-rel) + 'rad)';
        a.node.style.opacity = String(U.clamp01(a.life / a.maxLife));
      }
    }

    /* --- death screen --- */
    function updateDeathScreen(p) {
      if (p.health.alive) { death.classList.add('hc-hidden'); return; }
      death.classList.remove('hc-hidden');
      const killer = p.health.lastAttacker;
      death.querySelector('.k').textContent = killer ? 'ELIMINATED BY ' + killer.name.toUpperCase() : 'ELIMINATED';
      death.querySelector('.c').textContent = Math.max(0, Math.ceil(p.respawnTimer));
    }

    /* --- low health vignette --- */
    function updateLowHealth(p) {
      const frac = p.health.health / p.health.maxHealth;
      const danger = p.health.alive && frac < 0.34 ? (1 - frac / 0.34) : 0;
      lowHealth.style.opacity = String(danger * 0.9 *
        (CFG.access.reduceFlashing ? 0.5 : (0.72 + Math.sin(H._time * 5) * 0.28)));
    }

    /* --- kill feed --- */
    function addKillFeedRow(entry) {
      const row = el('div', 'hc-kf-row' + (entry.critical ? ' crit' : '') + (entry.system ? ' system' : ''));
      if (entry.system) {
        row.textContent = entry.text;
        if (entry.team) row.style.borderRightColor = colorForTeam(entry.team);
      } else {
        const kc = entry.killerTeam === 'B' ? ' b' : '';
        const vc = entry.victimTeam === 'B' ? ' b' : '';
        row.innerHTML =
          (entry.killer ? '<span class="k' + kc + '">' + entry.killer + '</span>' : '<span class="w">WORLD</span>') +
          '<span class="w">' + weaponLabel(entry.weapon) + '</span>' +
          '<span class="v' + vc + '" style="color:' + colorForTeam(entry.victimTeam) + '">' + entry.victim + '</span>';
      }
      killFeed.appendChild(row);
      while (killFeed.children.length > 6) killFeed.removeChild(killFeed.firstChild);
      setTimeout(() => {
        row.style.transition = 'opacity .4s ease, transform .4s ease';
        row.style.opacity = '0';
        row.style.transform = 'translateX(18px)';
        setTimeout(() => row.remove(), 420);
      }, 5200);
    }

    function weaponLabel(id) {
      const w = HC.Weapons.tryGet(id);
      if (w) return w.shortName || w.name;
      const ab = HC.Abilities.tryGet(id);
      if (ab) return ab.short || ab.name;
      return String(id || '').toUpperCase();
    }

    /* --- objective events --- */
    function onObjectiveEvent(e) {
      if (e.type === 'spawn') H.showBanner('CORE LIVE', 'PLAZA', 1.5, 'var(--accent-2)');
      else if (e.type === 'score') {
        const mine = e.team === H.arena.player.team;
        H.showBanner(mine ? 'SCORE' : 'CONCEDED',
          H.arena.teams.A.score + ' — ' + H.arena.teams.B.score, 1.8,
          mine ? 'var(--accent)' : 'var(--team-b)');
      } else if (e.type === 'pickup' && e.actor === H.arena.player) {
        H.showBanner('CORE SECURED', 'GET TO YOUR PAD', 1.6, 'var(--accent-2)');
      }
    }

    /* --- banners --- */
    let bannerTimer = 0;
    H.showBanner = function (big, small, duration, color) {
      banner.classList.remove('hc-hidden');
      const b = banner.querySelector('.big');
      b.textContent = big;
      b.style.color = color || 'var(--text)';
      banner.querySelector('.small').textContent = small || '';
      bannerTimer = duration || 2;
      banner.style.animation = 'none';
      void banner.offsetWidth;
      banner.style.animation = 'hcFadeUp .34s cubic-bezier(.2,.9,.3,1.2) both';
    };
    function updateBanner(dt) {
      if (bannerTimer <= 0) return;
      bannerTimer -= dt;
      banner.style.opacity = String(U.clamp01(bannerTimer * 2.2));
      if (bannerTimer <= 0) banner.classList.add('hc-hidden');
    }

    /* --- toasts --- */
    H.toast = function (text, duration) {
      const node = el('div', 'hc-toast-item', text);
      toastWrap.appendChild(node);
      H._toasts.push({ node, life: duration || 2.4 });
      while (H._toasts.length > 4) { const t = H._toasts.shift(); t.node.remove(); }
    };
    function updateToasts(dt) {
      for (let i = H._toasts.length - 1; i >= 0; i--) {
        const t = H._toasts[i];
        t.life -= dt;
        if (t.life <= 0) { t.node.remove(); H._toasts.splice(i, 1); continue; }
        if (t.life < 0.4) t.node.style.opacity = String(t.life / 0.4);
      }
    }

    H.subtitle = function (text, duration) {
      if (!CFG.access.subtitles) return;
      subtitles.textContent = text;
      subtitles.style.opacity = '1';
      clearTimeout(H._subTimer);
      H._subTimer = setTimeout(() => { subtitles.style.opacity = '0'; }, (duration || 2.5) * 1000);
    };

    /* --- minimap --- */
    function updateMinimap(arena, p) {
      const c = mmCtx;
      const size = mmCanvas.width;
      const range = 58;
      c.clearRect(0, 0, size, size);
      c.save();
      c.translate(size / 2, size / 2);
      // Rotate so the player always faces up.
      c.rotate(p.yaw);
      const s = size / (range * 2);

      c.strokeStyle = 'rgba(120,168,220,0.16)';
      c.lineWidth = 1;
      arena.map.minimap.walls.forEach(wl => {
        const dx = (wl.x - p.position.x) * s, dz = (wl.z - p.position.z) * s;
        if (Math.abs(dx) > size || Math.abs(dz) > size) return;
        c.fillStyle = 'rgba(90,130,180,0.20)';
        c.fillRect(dx - wl.w * s / 2, dz - wl.d * s / 2, wl.w * s, wl.d * s);
      });

      // Delivery zones
      if (arena.map.deliveryZones) {
        ['A', 'B'].forEach(t => {
          const z = arena.map.deliveryZones[t];
          if (!z) return;
          const dx = (z.position.x - p.position.x) * s, dz = (z.position.z - p.position.z) * s;
          c.strokeStyle = colorForTeam(t);
          c.lineWidth = 2;
          c.beginPath(); c.arc(dx, dz, z.radius * s, 0, U.TAU); c.stroke();
        });
      }

      // Objective
      if (arena.mode.id === 'power_core' && arena.mode.core.state !== 'spawning') {
        const core = arena.mode.core;
        const dx = (core.position.x - p.position.x) * s, dz = (core.position.z - p.position.z) * s;
        c.fillStyle = '#9b6bff';
        c.beginPath(); c.arc(dx, dz, 6, 0, U.TAU); c.fill();
      }

      // Actors
      arena.actors.forEach(a => {
        if (a === p || !a.health.alive) return;
        const ally = arena.modeDef.teamBased && a.team === p.team;
        const marked = a.markedUntil > arena.time && a.markedBy === p.team;
        if (!ally && !marked) return;
        const dx = (a.position.x - p.position.x) * s, dz = (a.position.z - p.position.z) * s;
        if (Math.hypot(dx, dz) > size / 2 - 6) return;
        c.fillStyle = ally ? colorForTeam(a.team) : '#ff3355';
        c.beginPath(); c.arc(dx, dz, 4.5, 0, U.TAU); c.fill();
      });
      c.restore();

      // Player arrow (always centred, always pointing up)
      c.save();
      c.translate(size / 2, size / 2);
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(0, -9); c.lineTo(6.5, 7); c.lineTo(0, 3.6); c.lineTo(-6.5, 7);
      c.closePath(); c.fill();
      c.restore();
    }

    /* --- scoreboard --- */
    H.setScoreboard = function (visible) {
      scoreboard.classList.toggle('hc-hidden', !visible);
      if (visible) renderScoreboard();
    };

    function renderScoreboard() {
      const arena = H.arena;
      if (!arena) return;
      let html = '';
      const groups = arena.modeDef.teamBased
        ? [{ key: 'A', label: arena.teams.A.name, cls: 'a', list: arena.actors.filter(a => a.team === 'A') },
           { key: 'B', label: arena.teams.B.name, cls: 'b', list: arena.actors.filter(a => a.team === 'B') }]
        : [{ key: 'all', label: 'SOLO ARENA', cls: 'a', list: arena.actors.slice() }];

      groups.forEach(g => {
        g.list.sort((x, y) => (y.score.kills * 3 + y.score.objective / 20) - (x.score.kills * 3 + x.score.objective / 20));
        html += '<div class="hc-sbteam ' + g.cls + '"><h4>' + g.label +
          (arena.modeDef.teamBased ? '<span class="hc-mono">' + Math.floor(arena.teams[g.key].score) + '</span>' : '') + '</h4>' +
          '<table class="hc-sbtable"><thead><tr><th>Operative</th><th>Hero</th><th>K</th><th>A</th><th>D</th><th>DMG</th><th>OBJ</th></tr></thead><tbody>';
        g.list.forEach(a => {
          html += '<tr class="' + (a === arena.player ? 'me' : '') + (a.health.alive ? '' : ' dead') + '">' +
            '<td class="nm">' + a.name + '</td>' +
            '<td class="nm">' + a.charDef.name + '</td>' +
            '<td>' + a.score.kills + '</td><td>' + a.score.assists + '</td><td>' + a.score.deaths + '</td>' +
            '<td>' + Math.round(a.score.damage) + '</td><td>' + Math.round(a.score.objective) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      });
      scoreboard.innerHTML = html;
    }

    H.setPerf = function (text) { perf.textContent = text; };

    H.detach = function () {
      H.show(false);
      H._dmgNumbers.forEach(d => d.node.remove());
      H._dmgNumbers.length = 0;
      H._plates.forEach(p => p.node.remove());
      H._plates.clear();
      H._arrows.forEach(a => a.node.remove());
      H._arrows.length = 0;
      H._markers.forEach(m => m.node.remove());
      H._markers.length = 0;
      killFeed.innerHTML = '';
      H.arena = null;
    };

    return H;
  };

})(window.HC, window.THREE);
