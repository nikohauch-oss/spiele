/* =========================================================================
 * HYPERCELL — 24_menus.js
 * Front end: loading, main menu, lobby, character select (with a live 3D
 * hero stage), skins, career, settings, pause and the results screen.
 *
 * The hero stage is a second scene rendered by the same renderer, so the
 * character you pick is the exact model that walks into the match.
 * ========================================================================= */
(function (HC, THREE) {
  'use strict';

  const U = HC.Util;
  const CFG = HC.CFG;

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
  function hexCss(h) { return '#' + (h >>> 0).toString(16).padStart(6, '0'); }

  const TIPS = [
    'The Core carrier moves 22% slower and is visible to the whole enemy team. Escort them.',
    'Recoil on the Pulse Rifle climbs then drifts right — pull down and left through a burst.',
    'Dodging grants a brief 45% damage reduction. Roll through a shotgun, not away from it.',
    'Brutus can body-block a doorway. Weight decides who gets pushed.',
    'Aiming down sights suppresses camera bob but costs you half your movement speed.',
    'Nyx breaks Cloak the instant she fires. Open with the blades, not the pistol.',
    'Shell-fed weapons can be interrupted mid-reload — one shell may be enough.',
    'Falling further than 24 m/s hurts. Blast Jump is a tool, not a taxi.',
    'Marked enemies show through walls for your entire team, not just you.',
    'Ultimates charge from damage dealt, objective work, and a slow passive trickle.'
  ];

  HC.Menus = function Menus(rootEl, renderer, game) {
    const M = {
      root: rootEl, renderer, game,
      current: null, stage: null,
      selectedCharacter: HC.Save.data.selectedCharacter,
      selectedSkin: null,
      selectedMode: HC.Save.data.settings.gameplay.mode,
      keyListening: null,
      events: HC.Events('menus')
    };
    M.selectedSkin = HC.Save.selectedSkinFor(M.selectedCharacter);

    const layer = el('div', 'hc-layer interactive');
    layer.id = 'hc-menus';
    rootEl.appendChild(layer);

    /* ================================================================== *
     * Hero stage (3D preview)
     * ================================================================== */
    const stage = M.stage = {
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(38, 1, 0.1, 60),
      model: null, animator: null, weapon: null,
      rotation: 0, targetRotation: 0, autoSpin: 0.18,
      viewport: { x: 0, y: 0, w: 0, h: 0 }, enabled: false,
      pose: 'lobby', time: 0
    };
    (function setupStage() {
      const s = stage.scene;
      s.background = null;
      HC.Mats.applyEnvironment(s, 1.15);
      /* Three-point showcase lighting.
       *
       * The first version put a near-frontal key on top of a heavy ambient
       * and hemisphere fill, and flat light is what makes sculpted forms — a
       * brow, a nose, a cheekbone — disappear into a mask. The key now comes
       * in high and well off-axis so the face has a lit side and a shadow
       * side, and the ambient is a fraction of what it was. */
      const key = new THREE.DirectionalLight(0xfff4e6, 4.6);
      key.position.set(3.4, 4.0, 2.4);
      key.castShadow = false;
      s.add(key);
      const rim = new THREE.DirectionalLight(0x7fc4ff, 5.4);
      rim.position.set(-3.0, 2.4, -3.4);
      s.add(rim);
      const warm = new THREE.PointLight(0xff9a5e, 95, 12, 2);
      warm.position.set(2.6, 1.5, -2.2);
      s.add(warm);
      // Bounce fill: low, cool, and weak — it lifts the shadow side without
      // erasing it.
      const fillLight = new THREE.PointLight(0x7fb0e0, 46, 12, 2);
      fillLight.position.set(-2.4, 0.5, 2.4);
      s.add(fillLight);
      s.add(new THREE.AmbientLight(0x3c4e66, 0.55));
      s.add(new THREE.HemisphereLight(0x5a80ae, 0x181f2c, 0.65));

      // Stage floor: a lit disc so the hero is not floating in a void.
      const discGeo = new THREE.CylinderGeometry(1.35, 1.5, 0.10, 48);
      // Brushed metal here streaked into bright radial stripes that pulled
      // the eye straight off the hero. A dark, near-matte plate reads as a
      // stage, which is all it needs to do.
      const discMat = HC.Mats.make({ kind: 'plate', color: 0x131a25, roughness: 0.52, metalness: 0.35,
        repeat: 2.5, normalScale: 0.35, rim: { color: 0x54c8ff, strength: 0.30, power: 2.8 } });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.position.y = -0.05;
      s.add(disc);
      const ringGeo = new THREE.TorusGeometry(1.42, 0.022, 6, 64);
      const ring = new THREE.Mesh(ringGeo, HC.Mats.additive(0x36c7ff, 0.85));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.02;
      s.add(ring);
      stage.ring = ring;

      stage.camera.position.set(0, 1.05, 3.5);
      stage.camera.lookAt(0, 0.95, 0);
    })();

    stage.setCharacter = function (charId, skinId, pose) {
      if (stage.model) {
        stage.scene.remove(stage.model.root);
        stage.model.dispose();
        if (stage.weapon) { stage.weapon.dispose(); stage.weapon = null; }
      }
      const charDef = HC.Characters.get(charId);
      stage.model = HC.CharacterModel.build({
        characterId: charId, skinId: skinId, team: null, bodyHeight: CFG.body.height
      });
      stage.model.setCastShadow(false);
      stage.scene.add(stage.model.root);
      stage.animator = HC.Animator(stage.model, charDef);
      stage.pose = pose || 'lobby';
      stage.animator.setPoseOverride(stage.pose);

      const skinDef = HC.Skins.tryGet(skinId) || {};
      stage.weapon = HC.WeaponModel.build({
        weaponId: charDef.weapon,
        palette: Object.assign({}, charDef.palette, skinDef.palette || {}),
        skinMaterials: skinDef.materials || {},
        glowColor: stage.model.vfxColors.muzzle
      });
      stage.model.bones.weaponSocket.add(stage.weapon.root);
      stage.weapon.root.rotation.set(Math.PI * 0.5, 0, 0);
      const wdef = HC.Weapons.get(charDef.weapon);
      stage.akimbo = !!wdef.akimbo;
      stage.animator.setWeaponShape(stage.akimbo, !!wdef.melee);

      // Frame the hero: taller heroes get pushed back a little.
      const h = stage.model.measure.height;
      stage.camera.position.set(0, h * 0.56, h * 1.95);
      stage.camera.lookAt(0, h * 0.52, 0);
      stage.ring.material.color.set(charDef.palette.accent);
    };

    // Same solve the actor uses in-match: express the model's forward axis in
    // the hand socket's frame and rotate the weapon's +Z onto it, so the
    // showcase pose matches what you get in the arena.
    const _stageM = new THREE.Matrix4();
    const _stageDir = new THREE.Vector3();
    const STAGE_FORWARD = new THREE.Vector3(0, 0, 1);

    stage.update = function (dt) {
      if (!stage.enabled || !stage.model) return;
      stage.time += dt;
      stage.rotation = U.damp(stage.rotation, stage.targetRotation, 6, dt);
      stage.model.root.rotation.y = stage.rotation + Math.sin(stage.time * 0.4) * 0.06;
      stage.ring.rotation.z += dt * 0.4;
      stage.animator.update(dt);

      if (stage.weapon && !stage.weapon.melee) {
        const socket = stage.model.bones.weaponSocket;
        socket.updateWorldMatrix(true, false);
        _stageDir.copy(STAGE_FORWARD).applyQuaternion(stage.model.root.quaternion);
        _stageM.copy(socket.matrixWorld).invert();
        _stageDir.transformDirection(_stageM);
        if (_stageDir.lengthSq() > 1e-8) {
          stage.weapon.root.quaternion.setFromUnitVectors(STAGE_FORWARD, _stageDir.normalize());
        }
        // The showcase pose carries the weapon low in one hand, so there is
        // no foregrip to solve for; the arena keeps the two-handed IK.
        if (stage.pose !== 'select') {
          const grip = stage.weapon.sockets && stage.weapon.sockets.foregrip;
          if (grip && !stage.akimbo) {
            stage.model.root.updateWorldMatrix(false, true);
            HC.CharacterModel.solveGripIK(stage.model, grip, 1);
          }
        }
      }
    };

    stage.render = function () {
      if (!stage.enabled || !stage.model) return;
      const v = stage.viewport;
      if (v.w <= 0 || v.h <= 0) return;
      // setViewport/setScissor already scale by the renderer pixel ratio —
      // pre-multiplying here would square it.
      renderer.setScissorTest(true);
      renderer.setViewport(v.x, v.y, v.w, v.h);
      renderer.setScissor(v.x, v.y, v.w, v.h);
      stage.camera.aspect = v.w / v.h;
      stage.camera.updateProjectionMatrix();
      renderer.render(stage.scene, stage.camera);
      renderer.setScissorTest(false);
    };

    /** Anchor the stage viewport to a DOM element. */
    stage.attachTo = function (node) {
      stage.anchor = node;
      stage.enabled = true;
      stage.layout();
    };
    stage.layout = function () {
      if (!stage.anchor) return;
      const r = stage.anchor.getBoundingClientRect();
      stage.viewport.x = r.left;
      stage.viewport.y = window.innerHeight - r.bottom;
      stage.viewport.w = r.width;
      stage.viewport.h = r.height;
    };
    stage.detach = function () { stage.enabled = false; stage.anchor = null; };

    /* ================================================================== *
     * Screen registry
     * ================================================================== */
    const screens = {};
    function makeScreen(id, builder) {
      const node = el('div', 'hc-screen');
      node.id = 'hc-' + id;
      layer.appendChild(node);
      screens[id] = { node, build: builder, built: false, id };
      return screens[id];
    }

    M.show = function (id, opts) {
      if (M.current && screens[M.current]) {
        screens[M.current].node.classList.remove('active');
        if (screens[M.current].onHide) screens[M.current].onHide();
      }
      const s = screens[id];
      if (!s) { HC.Log.error('Menus', 'unknown screen "' + id + '"'); return; }
      if (!s.built) { s.build(s.node, s); s.built = true; }
      if (s.onShow) s.onShow(opts);
      s.node.classList.add('active');
      M.current = id;
      layer.classList.remove('hc-hidden');
      HC.Input.uiCapture = true;
      M.events.emit('screen', id);
    };

    M.hideAll = function () {
      if (M.current && screens[M.current]) {
        screens[M.current].node.classList.remove('active');
        if (screens[M.current].onHide) screens[M.current].onHide();
      }
      M.current = null;
      layer.classList.add('hc-hidden');
      HC.Input.uiCapture = false;
      stage.detach();
    };

    /** Wire hover/click audio onto every button in a subtree. */
    function wireButtons(node) {
      node.querySelectorAll('.hc-btn, .hc-hero-row, .hc-skin-chip, .hc-toggle, .hc-keybtn').forEach(b => {
        if (b.dataset.wired) return;
        b.dataset.wired = '1';
        b.addEventListener('mouseenter', () => {
          if (b.classList.contains('disabled') || b.hasAttribute('disabled')) return;
          HC.Audio.ui('ui_hover');
        });
        b.addEventListener('click', () => {
          if (b.classList.contains('disabled') || b.hasAttribute('disabled')) { HC.Audio.ui('ui_error'); return; }
          HC.Audio.ui(b.dataset.sound || 'ui_click');
        });
      });
    }

    /* ================================================================== *
     * LOADING
     * ================================================================== */
    const loading = el('div', 'hc-hidden');
    loading.id = 'hc-loading';
    loading.innerHTML =
      '<div class="mark">HYPERCELL</div>' +
      '<div class="bar"><i></i></div>' +
      '<div class="status">INITIALISING</div>' +
      '<div class="tip"></div>';
    layer.appendChild(loading);

    M.setLoading = function (visible, progress, status) {
      loading.classList.toggle('hc-hidden', !visible);
      if (visible) {
        loading.querySelector('.bar > i').style.width = (U.clamp01(progress) * 100).toFixed(1) + '%';
        if (status) loading.querySelector('.status').textContent = status;
        if (!loading.dataset.tip) {
          loading.querySelector('.tip').textContent = 'TIP — ' + U.pick(Math.random, TIPS);
          loading.dataset.tip = '1';
        }
      } else {
        delete loading.dataset.tip;
      }
    };

    /* ================================================================== *
     * MAIN MENU
     * ================================================================== */
    makeScreen('menu', (node, s) => {
      node.innerHTML =
        '<div class="hc-menu-brand hc-anim-in"><h1>HYPERCELL</h1><div class="sub">Nova District Protocol</div></div>' +
        '<div class="hc-menu-nav"></div>' +
        '<div class="hc-panel hc-profile-card">' +
        '  <div class="name" data-pname></div>' +
        '  <div class="lvl" data-plvl></div>' +
        '  <div class="hc-xpbar"><i data-pxp></i></div>' +
        '  <div class="hc-profile-stats">' +
        '    <div><span>Matches</span><b data-s-matches>0</b></div>' +
        '    <div><span>Wins</span><b data-s-wins>0</b></div>' +
        '    <div><span>Elims</span><b data-s-kills>0</b></div>' +
        '    <div><span>K/D</span><b data-s-kd>0</b></div>' +
        '    <div><span>Accuracy</span><b data-s-acc>0%</b></div>' +
        '    <div><span>MVPs</span><b data-s-mvp>0</b></div>' +
        '  </div>' +
        '</div>' +
        '<div class="hc-menu-foot"><span>HYPERCELL v' + HC.VERSION + '</span><span data-fps></span></div>' +
        '<div style="position:absolute;right:4vw;bottom:4vh;width:min(30vw,420px);height:min(64vh,620px);" data-stage></div>';

      const nav = node.querySelector('.hc-menu-nav');
      const items = [
        ['PLAY', () => M.show('lobby'), 'primary'],
        ['CHARACTERS', () => M.show('characters')],
        ['LOADOUT', () => M.show('characters', { tab: 'loadout' })],
        ['SKINS', () => M.show('characters', { tab: 'skins' })],
        ['CAREER', () => M.show('career')],
        ['SETTINGS', () => M.show('settings')]
      ];
      items.forEach(([label, fn, cls]) => {
        const b = el('button', 'hc-btn hc-anim-in' + (cls ? ' ' + cls : ''), label);
        b.addEventListener('click', fn);
        nav.appendChild(b);
      });
      wireButtons(node);

      s.onShow = () => {
        refreshProfile(node);
        stage.setCharacter(M.selectedCharacter, M.selectedSkin, 'lobby');
        stage.targetRotation = -0.42;
        stage.attachTo(node.querySelector('[data-stage]'));
        HC.Music.setState('menu');
      };
      s.onHide = () => {};
    });

    function refreshProfile(node) {
      const p = HC.Save.data;
      const c = p.career;
      node.querySelector('[data-pname]').textContent = p.playerName;
      node.querySelector('[data-plvl]').textContent = 'LEVEL ' + p.level;
      node.querySelector('[data-pxp]').style.width =
        (p.xp / HC.Save.xpForLevel(p.level) * 100).toFixed(1) + '%';
      node.querySelector('[data-s-matches]').textContent = c.matchesPlayed;
      node.querySelector('[data-s-wins]').textContent = c.wins;
      node.querySelector('[data-s-kills]').textContent = c.eliminations;
      node.querySelector('[data-s-kd]').textContent = HC.Save.kd().toFixed(2);
      node.querySelector('[data-s-acc]').textContent = (HC.Save.accuracy() * 100).toFixed(1) + '%';
      node.querySelector('[data-s-mvp]').textContent = c.mvpCount;
    }

    /* ================================================================== *
     * LOBBY
     * ================================================================== */
    makeScreen('lobby', (node, s) => {
      node.innerHTML =
        '<div class="hc-sub-header"><h2>LOBBY</h2><div class="rule"></div>' +
        '<button class="hc-btn small" data-back>BACK</button></div>' +
        '<div class="hc-sub-body">' +
        '  <div style="width:min(340px,28vw);display:flex;flex-direction:column;gap:1em;">' +
        '    <div class="hc-panel" style="padding:1.1em 1.2em;">' +
        '      <div style="font-size:.7em;letter-spacing:.22em;color:var(--text-faint)">OPERATIVE</div>' +
        '      <div class="hc-title" style="font-size:1.5em" data-lname></div>' +
        '      <div style="font-size:.78em;color:var(--accent);letter-spacing:.18em" data-llvl></div>' +
        '      <div style="margin-top:.9em;font-size:.7em;letter-spacing:.22em;color:var(--text-faint)">HERO</div>' +
        '      <div class="hc-title" style="font-size:1.2em" data-lhero></div>' +
        '      <div style="font-size:.76em;color:var(--text-dim)" data-lskin></div>' +
        '      <button class="hc-btn small" style="margin-top:1em;width:100%" data-changehero>CHANGE HERO</button>' +
        '    </div>' +
        '    <div class="hc-panel" style="padding:1.1em 1.2em;">' +
        '      <div style="font-size:.7em;letter-spacing:.22em;color:var(--text-faint);margin-bottom:.6em">GAME MODE</div>' +
        '      <div data-modes style="display:flex;flex-direction:column;gap:.35em"></div>' +
        '    </div>' +
        '    <div class="hc-panel" style="padding:1.1em 1.2em;">' +
        '      <div style="font-size:.7em;letter-spacing:.22em;color:var(--text-faint);margin-bottom:.6em">BOT DIFFICULTY</div>' +
        '      <div data-diff style="display:flex;gap:.35em;flex-wrap:wrap"></div>' +
        '    </div>' +
        '  </div>' +
        '  <div style="flex:1;display:flex;flex-direction:column;min-width:0">' +
        '    <div class="hc-panel" style="padding:1.2em 1.4em;">' +
        '      <div class="hc-title" style="font-size:1.4em" data-modename></div>' +
        '      <div style="color:var(--text-dim);font-size:.9em;line-height:1.5;margin-top:.4em" data-modedesc></div>' +
        '      <ul style="margin:.9em 0 0;padding-left:1.1em;color:var(--text-dim);font-size:.84em;line-height:1.7" data-moderules></ul>' +
        '    </div>' +
        '    <div style="flex:1;min-height:0;position:relative" data-stage></div>' +
        '    <div style="display:flex;gap:1em;align-items:center;justify-content:flex-end">' +
        '      <div style="font-size:.78em;color:var(--text-faint);letter-spacing:.16em" data-teaminfo></div>' +
        '      <button class="hc-btn primary" data-deploy>DEPLOY</button>' +
        '    </div>' +
        '  </div>' +
        '</div>';

      node.querySelector('[data-back]').addEventListener('click', () => M.show('menu'));
      node.querySelector('[data-changehero]').addEventListener('click', () => M.show('characters'));
      node.querySelector('[data-deploy]').addEventListener('click', () => {
        HC.Audio.ui('ui_confirm');
        M.events.emit('deploy', { mode: M.selectedMode, character: M.selectedCharacter, skin: M.selectedSkin });
      });

      const modeWrap = node.querySelector('[data-modes]');
      HC.Modes.all().forEach(m => {
        const b = el('button', 'hc-btn small', m.name);
        b.style.width = '100%';
        b.dataset.mode = m.id;
        b.addEventListener('click', () => { M.selectedMode = m.id; HC.Save.data.settings.gameplay.mode = m.id; HC.Save.save(); refreshLobby(node); });
        modeWrap.appendChild(b);
      });

      const diffWrap = node.querySelector('[data-diff]');
      ['recruit', 'normal', 'veteran', 'elite'].forEach(d => {
        const b = el('button', 'hc-btn small', d.toUpperCase());
        b.dataset.diff = d;
        b.addEventListener('click', () => {
          CFG.ai.difficulty = d;
          HC.Save.data.settings.gameplay.difficulty = d;
          HC.Save.save(); refreshLobby(node);
        });
        diffWrap.appendChild(b);
      });
      wireButtons(node);

      s.onShow = () => {
        refreshLobby(node);
        stage.setCharacter(M.selectedCharacter, M.selectedSkin, 'lobby');
        stage.targetRotation = 0.3;
        stage.attachTo(node.querySelector('[data-stage]'));
        HC.Music.setState('lobby');
      };
    });

    function refreshLobby(node) {
      const p = HC.Save.data;
      const charDef = HC.Characters.get(M.selectedCharacter);
      const skinDef = HC.Skins.tryGet(M.selectedSkin);
      node.querySelector('[data-lname]').textContent = p.playerName;
      node.querySelector('[data-llvl]').textContent = 'LEVEL ' + p.level +
        ' · MASTERY ' + HC.Save.masteryFor(M.selectedCharacter).level;
      node.querySelector('[data-lhero]').textContent = charDef.name + '  ·  ' + charDef.roleLabel;
      node.querySelector('[data-lskin]').textContent = skinDef ? skinDef.name : 'Standard';

      const mode = HC.Modes.get(M.selectedMode);
      node.querySelector('[data-modename]').textContent = mode.name;
      node.querySelector('[data-modedesc]').textContent = mode.description;
      node.querySelector('[data-moderules]').innerHTML = (mode.rules || []).map(r => '<li>' + r + '</li>').join('');
      node.querySelector('[data-teaminfo]').textContent = mode.teamBased
        ? mode.teamSize + ' v ' + mode.teamSize + ' · NOVA DISTRICT'
        : (mode.playerCount || 8) + ' OPERATIVES · NOVA DISTRICT';

      node.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('selected', b.dataset.mode === M.selectedMode));
      node.querySelectorAll('[data-diff]').forEach(b => b.classList.toggle('selected', b.dataset.diff === CFG.ai.difficulty));
      stage.setCharacter(M.selectedCharacter, M.selectedSkin, 'lobby');
    }

    /* ================================================================== *
     * CHARACTERS / LOADOUT / SKINS
     * ================================================================== */
    makeScreen('characters', (node, s) => {
      node.innerHTML =
        '<div class="hc-sub-header"><h2>CHARACTERS</h2><div class="rule"></div>' +
        '<button class="hc-btn small" data-back>BACK</button></div>' +
        '<div class="hc-sub-body">' +
        '  <div class="hc-hero-list hc-scroll" data-list></div>' +
        '  <div class="hc-hero-detail">' +
        '    <div class="headline"><h3 data-hname></h3><span class="role" data-hrole></span></div>' +
        '    <div class="bio" data-hbio></div>' +
        '    <div style="display:flex;gap:2vw;flex:1;min-height:0;margin-top:1em">' +
        '      <div style="flex:0 0 40%;min-width:0;position:relative" data-stage></div>' +
        '      <div class="hc-scroll" style="flex:1;min-width:0;padding-right:.6em">' +
        '        <div class="hc-statgrid" data-stats></div>' +
        '        <div class="hc-ability-cards" data-abilities></div>' +
        '        <div style="margin-top:1.4em;font-size:.72em;letter-spacing:.22em;color:var(--text-faint)">SKINS</div>' +
        '        <div class="hc-skin-strip" data-skins></div>' +
        '        <div style="margin-top:1.2em;font-size:.78em;color:var(--text-dim);line-height:1.6" data-skindesc></div>' +
        '      </div>' +
        '    </div>' +
        '    <div style="display:flex;justify-content:flex-end;gap:1em;margin-top:1em">' +
        '      <button class="hc-btn" data-select>SELECT HERO</button>' +
        '    </div>' +
        '  </div>' +
        '</div>';

      node.querySelector('[data-back]').addEventListener('click', () => M.show(M.cameFrom || 'menu'));
      node.querySelector('[data-select]').addEventListener('click', () => {
        HC.Save.data.selectedCharacter = M.selectedCharacter;
        HC.Save.selectSkin(M.selectedCharacter, M.selectedSkin);
        HC.Save.save();
        HC.Audio.ui('ui_select_hero');
        M.show('lobby');
      });

      const list = node.querySelector('[data-list]');
      HC.roster().forEach(c => {
        const row = el('div', 'hc-hero-row');
        row.dataset.char = c.id;
        let diff = '';
        for (let i = 0; i < 3; i++) diff += '<i class="' + (i < c.difficulty ? 'on' : '') + '"></i>';
        row.innerHTML =
          '<span class="icon" style="color:' + hexCss(c.palette.accent) + '">' + svgIcon(HC.roleIcon[c.role] || HC.roleIcon.assault, 26) + '</span>' +
          '<span class="meta"><span class="hname">' + c.name + '</span><br><span class="hrole">' + c.roleLabel + '</span></span>' +
          '<span class="diff">' + diff + '</span>';
        row.addEventListener('click', () => {
          M.selectedCharacter = c.id;
          M.selectedSkin = HC.Save.selectedSkinFor(c.id);
          refreshCharacters(node);
          HC.Audio.ui('ui_click');
        });
        list.appendChild(row);
      });
      wireButtons(node);

      s.onShow = (opts) => {
        M.cameFrom = (opts && opts.from) || 'menu';
        refreshCharacters(node);
        stage.attachTo(node.querySelector('[data-stage]'));
        stage.targetRotation = 0.4;
        HC.Music.setState('select');
      };
    });

    function refreshCharacters(node) {
      const c = HC.Characters.get(M.selectedCharacter);
      node.querySelectorAll('[data-char]').forEach(r => r.classList.toggle('selected', r.dataset.char === c.id));
      node.querySelector('[data-hname]').textContent = c.name;
      node.querySelector('[data-hrole]').textContent = c.roleLabel + ' · ' + c.title;
      node.querySelector('[data-hbio]').textContent = c.bio;

      const w = HC.Weapons.get(c.weapon);
      const bars = HC.WeaponMath.statBars(w);
      const stats = [
        ['Health', U.clamp01(c.health / 360)],
        ['Shield', U.clamp01((c.shield + c.armor) / 200)],
        ['Speed', U.clamp01((c.speedScale - 0.75) / 0.45)],
        ['Damage', bars.damage], ['Fire Rate', bars.rate],
        ['Range', bars.range], ['Control', bars.control], ['Handling', bars.handling]
      ];
      node.querySelector('[data-stats]').innerHTML = stats.map(([k, v]) =>
        '<label>' + k + '</label><div class="hc-bar"><i style="width:' + (v * 100).toFixed(0) + '%"></i></div>').join('');

      const binds = ['ability1', 'ability2', 'ultimate'];
      const abilityIds = [c.abilities[0], c.abilities[1], c.ultimate];
      node.querySelector('[data-abilities]').innerHTML =
        '<div class="hc-ability-card"><span class="key">' + HC.Input.bindLabel('fire') + '</span>' +
        svgIcon('M3 12 H14 L18 8 V16 L14 12', 28) +
        '<div class="an">' + w.name + '</div><div class="ad">' + w.description + '</div>' +
        '<div class="cd">' + Math.round(w.rpm) + ' RPM · ' + w.damage + ' DMG · ' +
        (isFinite(w.magazine) ? w.magazine + ' RDS' : 'NO AMMO') + '</div></div>' +
        abilityIds.map((id, i) => {
          const a = HC.Abilities.get(id);
          return '<div class="hc-ability-card' + (i === 2 ? ' ult' : '') + '">' +
            '<span class="key">' + HC.Input.bindLabel(binds[i]) + '</span>' +
            svgIcon(a.icon, 28) +
            '<div class="an">' + a.name + '</div><div class="ad">' + a.description + '</div>' +
            '<div class="cd">' + (i === 2 ? 'ULTIMATE' :
              (a.cooldown + 's CD' + (a.charges > 1 ? ' · ' + a.charges + ' CHARGES' : ''))) + '</div></div>';
        }).join('');

      const skinWrap = node.querySelector('[data-skins]');
      skinWrap.innerHTML = '';
      HC.skinsFor(c.id).forEach(sk => {
        const unlocked = HC.Save.isSkinUnlocked(sk.id);
        const chip = el('div', 'hc-skin-chip' + (sk.id === M.selectedSkin ? ' selected' : '') + (unlocked ? '' : ' locked'));
        chip.style.setProperty('--rarity', hexCss(HC.rarityColor[sk.rarity]));
        chip.innerHTML = sk.name + '<span class="rar">' + HC.rarityLabel[sk.rarity] +
          (unlocked ? '' : ' · MASTERY ' + HC.SKIN_UNLOCK_MASTERY[sk.rarity]) + '</span>';
        chip.addEventListener('click', () => {
          if (!unlocked) { HC.Audio.ui('ui_error'); return; }
          M.selectedSkin = sk.id;
          HC.Save.selectSkin(c.id, sk.id);
          refreshCharacters(node);
        });
        skinWrap.appendChild(chip);
      });
      const sd = HC.Skins.tryGet(M.selectedSkin);
      node.querySelector('[data-skindesc]').textContent = sd ? sd.description : '';

      stage.setCharacter(c.id, M.selectedSkin, 'select');
      wireButtons(node);
    }

    /* ================================================================== *
     * CAREER
     * ================================================================== */
    makeScreen('career', (node, s) => {
      node.innerHTML =
        '<div class="hc-sub-header"><h2>CAREER</h2><div class="rule"></div>' +
        '<button class="hc-btn small" data-back>BACK</button></div>' +
        '<div class="hc-sub-body"><div class="hc-scroll" style="flex:1" data-body></div></div>';
      node.querySelector('[data-back]').addEventListener('click', () => M.show('menu'));
      wireButtons(node);
      s.onShow = () => {
        const p = HC.Save.data, c = p.career;
        const stats = [
          ['Account Level', p.level], ['Matches', c.matchesPlayed], ['Wins', c.wins],
          ['Losses', c.losses], ['Win Rate', c.matchesPlayed ? (c.wins / c.matchesPlayed * 100).toFixed(1) + '%' : '—'],
          ['Eliminations', c.eliminations], ['Assists', c.assists], ['Deaths', c.deaths],
          ['K/D', HC.Save.kd().toFixed(2)], ['Damage Dealt', U.formatNumber(c.damageDealt)],
          ['Objective Score', U.formatNumber(c.objectiveScore)], ['Accuracy', (HC.Save.accuracy() * 100).toFixed(1) + '%'],
          ['Critical Hits', c.criticalHits], ['Best Streak', c.bestKillstreak],
          ['MVPs', c.mvpCount], ['Time Played', Math.floor(c.timePlayed / 60) + 'm']
        ];
        let html = '<div class="hc-res-grid" style="padding:0">' +
          stats.map(([k, v]) => '<div class="hc-res-stat"><label>' + k + '</label><b>' + v + '</b></div>').join('') +
          '</div>';
        html += '<h3 class="hc-title" style="margin:2em 0 .8em;letter-spacing:.24em">HERO MASTERY</h3>';
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:.8em">';
        HC.roster().forEach(ch => {
          const m = HC.Save.masteryFor(ch.id);
          const need = HC.Save.masteryXpForLevel(m.level);
          html += '<div class="hc-panel" style="padding:.9em 1.1em">' +
            '<div style="display:flex;justify-content:space-between;align-items:baseline">' +
            '<span class="hc-title" style="letter-spacing:.16em">' + ch.name + '</span>' +
            '<span class="hc-mono" style="color:' + hexCss(ch.palette.accent) + '">LV ' + m.level + '</span></div>' +
            '<div class="hc-bar" style="margin-top:.5em"><i style="width:' + (m.xp / need * 100).toFixed(1) + '%"></i></div>' +
            '<div style="font-size:.72em;color:var(--text-faint);margin-top:.45em;letter-spacing:.1em">' +
            m.matches + ' MATCHES · ' + m.kills + ' ELIMS · ' + m.wins + ' WINS</div></div>';
        });
        html += '</div>';
        node.querySelector('[data-body]').innerHTML = html;
        stage.detach();
        HC.Music.setState('menu');
      };
    });

    /* ================================================================== *
     * SETTINGS
     * ================================================================== */
    makeScreen('settings', (node, s) => {
      node.innerHTML =
        '<div class="hc-sub-header"><h2>SETTINGS</h2><div class="rule"></div>' +
        '<button class="hc-btn small" data-reset>RESET DEFAULTS</button>' +
        '<button class="hc-btn small" data-back>BACK</button></div>' +
        '<div class="hc-settings-tabs" data-tabs></div>' +
        '<div class="hc-sub-body"><div class="hc-scroll" style="flex:1;max-width:900px" data-body></div></div>';

      node.querySelector('[data-back]').addEventListener('click', () => {
        HC.Save.captureSettings();
        M.show(M.settingsReturn || 'menu');
      });
      s.backButton = node.querySelector('[data-back]');
      node.querySelector('[data-reset]').addEventListener('click', () => {
        HC.Save.data.settings = HC.Save.defaultProfile().settings;
        HC.Input.resetBinds();
        HC.Save.apply(); HC.Save.save();
        renderSettings(node, currentTab);
      });

      let currentTab = 'graphics';
      const tabs = node.querySelector('[data-tabs]');
      ['graphics', 'audio', 'controls', 'accessibility'].forEach(t => {
        const b = el('button', 'hc-btn small', t.toUpperCase());
        b.dataset.tab = t;
        b.addEventListener('click', () => { currentTab = t; renderSettings(node, t); });
        tabs.appendChild(b);
      });
      wireButtons(node);
      s.onShow = (opts) => {
        M.settingsReturn = (opts && opts.from) || 'menu';
        renderSettings(node, currentTab);
        stage.detach();
      };
      s.renderSettings = () => renderSettings(node, currentTab);
    });

    function renderSettings(node, tab) {
      node.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('selected', b.dataset.tab === tab));
      const body = node.querySelector('[data-body]');
      body.innerHTML = '';
      const S = HC.Save.data.settings;

      const row = (label, desc, ctl) => {
        const r = el('div', 'hc-setting-row');
        r.innerHTML = '<label>' + label + (desc ? '<span class="desc">' + desc + '</span>' : '') + '</label>';
        const c = el('div', 'ctl');
        c.appendChild(ctl);
        r.appendChild(c);
        body.appendChild(r);
        return r;
      };
      const slider = (value, min, max, step, fmt, onChange) => {
        const wrap = el('div');
        wrap.style.cssText = 'display:flex;align-items:center;gap:.7em';
        const i = el('input');
        i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = value;
        const v = el('span', 'val', fmt(value));
        i.addEventListener('input', () => {
          const val = parseFloat(i.value);
          v.textContent = fmt(val);
          onChange(val);
        });
        wrap.appendChild(i); wrap.appendChild(v);
        return wrap;
      };
      const toggle = (value, onChange) => {
        const t = el('div', 'hc-toggle' + (value ? ' on' : ''), '<i></i>');
        t.addEventListener('click', () => {
          const on = !t.classList.contains('on');
          t.classList.toggle('on', on);
          HC.Audio.ui('ui_click');
          onChange(on);
        });
        return t;
      };
      const select = (value, options, onChange) => {
        const sel = el('select');
        options.forEach(([v, label]) => {
          const o = el('option', null, label);
          o.value = v;
          if (String(v) === String(value)) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener('change', () => { HC.Audio.ui('ui_click'); onChange(sel.value); });
        return sel;
      };
      const apply = () => { HC.Save.apply(); HC.Save.save(); M.events.emit('settingsChanged'); };

      if (tab === 'graphics') {
        const g = S.graphics;
        row('Render Scale', 'Internal resolution multiplier.',
          slider(g.renderScale, 0.5, 2.0, 0.05, v => v.toFixed(2) + '×', v => { g.renderScale = v; apply(); }));
        row('Fullscreen', 'Toggle browser fullscreen.',
          toggle(!!document.fullscreenElement, v => {
            if (v && rootEl.requestFullscreen) rootEl.requestFullscreen().catch(() => {});
            else if (!v && document.exitFullscreen) document.exitFullscreen().catch(() => {});
          }));
        row('Shadows', 'Dynamic sun shadows.', toggle(g.shadows, v => { g.shadows = v; apply(); }));
        row('Shadow Quality', 'Shadow map resolution.',
          select(g.shadowQuality, [[0, 'LOW'], [1, 'MEDIUM'], [2, 'HIGH'], [3, 'ULTRA']],
            v => { g.shadowQuality = parseInt(v, 10); apply(); }));
        row('Bloom', 'Glow around bright emissive surfaces.', toggle(g.bloom, v => { g.bloom = v; apply(); }));
        row('Particle Budget', 'Maximum simultaneous particles.',
          select(g.particles, [[0, 'LOW'], [1, 'MEDIUM'], [2, 'HIGH'], [3, 'ULTRA']],
            v => { g.particles = parseInt(v, 10); apply(); }));
        row('Texture Quality', 'Procedural texture resolution (applies next match).',
          select(g.textureQuality, [[0, 'LOW'], [1, 'MEDIUM'], [2, 'HIGH']],
            v => { g.textureQuality = parseInt(v, 10); apply(); }));
        row('View Distance', 'Fog distance multiplier.',
          slider(g.viewDistance, 0.5, 1.6, 0.05, v => v.toFixed(2) + '×', v => { g.viewDistance = v; apply(); }));
        row('Anti-Aliasing', 'MSAA (applies on reload).', toggle(g.antialias, v => { g.antialias = v; apply(); }));
        row('Motion Blur', 'Camera motion blur.', toggle(g.motionBlur, v => { g.motionBlur = v; apply(); }));
        row('FPS Limit', '0 = unlimited (uses vsync).',
          select(g.fpsLimit, [[0, 'UNLIMITED'], [30, '30'], [60, '60'], [90, '90'], [120, '120'], [144, '144']],
            v => { g.fpsLimit = parseInt(v, 10); apply(); }));
      } else if (tab === 'audio') {
        const a = S.audio;
        [['master', 'Master'], ['music', 'Music'], ['sfx', 'Effects'], ['voice', 'Voice'], ['ui', 'Interface']]
          .forEach(([k, label]) => {
            row(label, null, slider(a[k], 0, 1, 0.01, v => Math.round(v * 100) + '%', v => {
              a[k] = v; HC.Audio.setVolume(k, v); HC.Save.save();
            }));
          });
      } else if (tab === 'controls') {
        const c = S.controls;
        row('Mouse Sensitivity', null,
          slider(c.mouseSensitivity * 1000, 0.4, 8, 0.05, v => v.toFixed(2),
            v => { c.mouseSensitivity = v / 1000; apply(); }));
        row('ADS Sensitivity', 'Multiplier applied while aiming.',
          slider(c.aimSensitivityScale, 0.2, 1.4, 0.02, v => v.toFixed(2) + '×',
            v => { c.aimSensitivityScale = v; apply(); }));
        row('Controller Sensitivity', null,
          slider(c.padSensitivity, 0.5, 8, 0.1, v => v.toFixed(1), v => { c.padSensitivity = v; apply(); }));
        row('Controller Dead Zone', null,
          slider(c.padDeadZone, 0.02, 0.4, 0.01, v => v.toFixed(2), v => { c.padDeadZone = v; apply(); }));
        row('Invert Y', null, toggle(c.invertY, v => { c.invertY = v; apply(); }));
        row('Hold to Aim', 'Off = toggle aim.', toggle(c.holdToAim, v => { c.holdToAim = v; apply(); }));
        row('Hold to Sprint', 'Off = toggle sprint.', toggle(c.holdToSprint, v => { c.holdToSprint = v; apply(); }));
        row('Hold to Crouch', 'Off = toggle crouch.', toggle(c.holdToCrouch, v => { c.holdToCrouch = v; apply(); }));

        body.appendChild(el('h3', 'hc-title', 'KEY BINDINGS'));
        const actions = ['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'jump', 'sprint', 'crouch',
          'dodge', 'fire', 'aim', 'reload', 'swapWeapon', 'ability1', 'ability2', 'ultimate',
          'scoreboard', 'swapShoulder', 'emote'];
        actions.forEach(action => {
          const btn = el('button', 'hc-keybtn', HC.Input.bindLabel(action));
          btn.addEventListener('click', () => {
            if (M.keyListening) M.keyListening.classList.remove('listening');
            M.keyListening = btn;
            btn.classList.add('listening');
            btn.textContent = 'PRESS A KEY';
            const onKey = (e) => {
              e.preventDefault();
              cleanup();
              if (e.code !== 'Escape') HC.Input.rebind(action, e.code);
              HC.Save.captureSettings();
              renderSettings(node, tab);
            };
            const onMouse = (e) => {
              e.preventDefault();
              cleanup();
              HC.Input.rebind(action, 'Mouse' + e.button);
              HC.Save.captureSettings();
              renderSettings(node, tab);
            };
            function cleanup() {
              window.removeEventListener('keydown', onKey, true);
              window.removeEventListener('mousedown', onMouse, true);
              btn.classList.remove('listening');
              M.keyListening = null;
            }
            setTimeout(() => {
              window.addEventListener('keydown', onKey, true);
              window.addEventListener('mousedown', onMouse, true);
            }, 30);
          });
          row(prettyAction(action), null, btn);
        });
      } else {
        const acc = S.accessibility;
        row('UI Scale', null, slider(acc.uiScale, 0.7, 1.6, 0.05, v => v.toFixed(2) + '×',
          v => { acc.uiScale = v; document.documentElement.style.setProperty('--ui-scale', v); apply(); }));
        row('Crosshair Scale', null, slider(acc.crosshairScale, 0.5, 2.2, 0.05, v => v.toFixed(2) + '×',
          v => { acc.crosshairScale = v; apply(); }));
        row('Camera Shake', 'Scales all screen shake.', slider(acc.cameraShakeStrength, 0, 1.5, 0.05,
          v => Math.round(v * 100) + '%', v => { acc.cameraShakeStrength = v; apply(); }));
        row('Damage Numbers', null, toggle(acc.damageNumbers, v => { acc.damageNumbers = v; apply(); }));
        row('Subtitles', 'Callouts and system messages.', toggle(acc.subtitles, v => { acc.subtitles = v; apply(); }));
        row('Reduce Flashing', 'Softens strobing and the low-health pulse.',
          toggle(acc.reduceFlashing, v => { acc.reduceFlashing = v; apply(); }));
        row('Colour Blind Mode', 'Changes both team colours.',
          select(acc.colorBlindMode, [['off', 'OFF'], ['protanopia', 'PROTANOPIA'],
            ['deuteranopia', 'DEUTERANOPIA'], ['tritanopia', 'TRITANOPIA']],
            v => {
              acc.colorBlindMode = v; apply();
              const cb = HC.CB_PALETTE[v];
              document.documentElement.style.setProperty('--team-a', hexCss(cb ? cb.teamA : HC.PALETTE.teamA));
              document.documentElement.style.setProperty('--team-b', hexCss(cb ? cb.teamB : HC.PALETTE.teamB));
            }));
      }
      wireButtons(node);
    }

    function prettyAction(a) {
      return a.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
    }

    /* ================================================================== *
     * PAUSE
     * ================================================================== */
    const pause = el('div', 'hc-hidden');
    pause.id = 'hc-pause';
    pause.innerHTML =
      '<div class="hc-panel box">' +
      '  <h3>PAUSED</h3>' +
      '  <button class="hc-btn primary" data-resume>RESUME</button>' +
      '  <button class="hc-btn" data-settings>SETTINGS</button>' +
      '  <button class="hc-btn ghost" data-quit>LEAVE MATCH</button>' +
      '</div>';
    layer.appendChild(pause);
    pause.querySelector('[data-resume]').addEventListener('click', () => M.events.emit('resume'));
    pause.querySelector('[data-settings]').addEventListener('click', () => {
      M.setPause(false);
      M.show('settings', { from: 'menu' });
      M.events.emit('pauseToSettings');
    });
    pause.querySelector('[data-quit]').addEventListener('click', () => M.events.emit('quitMatch'));
    wireButtons(pause);

    M.setPause = function (visible) {
      pause.classList.toggle('hc-hidden', !visible);
      layer.classList.toggle('hc-hidden', !visible && !M.current);
      HC.Input.uiCapture = visible || !!M.current;
    };

    /* ================================================================== *
     * MATCH INTRO overlay
     * ================================================================== */
    const intro = el('div', 'hc-hidden');
    intro.id = 'hc-intro';
    intro.innerHTML =
      '<div class="mapname"><div class="n"></div><div class="m"></div></div>' +
      '<div class="roster"></div>';
    layer.appendChild(intro);

    M.showIntro = function (arena) {
      intro.classList.remove('hc-hidden');
      layer.classList.remove('hc-hidden');
      intro.querySelector('.mapname .n').textContent = arena.map.name;
      intro.querySelector('.mapname .m').textContent = arena.modeDef.name;
      const roster = intro.querySelector('.roster');
      roster.innerHTML = '';
      const team = arena.modeDef.teamBased
        ? arena.actors.filter(a => a.team === arena.player.team)
        : [arena.player];
      team.forEach((a, i) => {
        const card = el('div', 'rcard', a.charDef.name + '<div style="font-size:.7em;letter-spacing:.2em;color:var(--text-faint)">' + a.name + '</div>');
        card.style.animationDelay = (i * 0.10) + 's';
        card.style.borderBottomColor = hexCss(HC.Mats.teamColor(a.team));
        roster.appendChild(card);
      });
    };
    M.hideIntro = function () {
      intro.classList.add('hc-hidden');
      if (!M.current) layer.classList.add('hc-hidden');
    };

    /* ================================================================== *
     * RESULTS
     * ================================================================== */
    makeScreen('results', (node, s) => {
      node.innerHTML =
        '<div class="hc-scroll" style="flex:1">' +
        '<div class="hc-res-head"><div class="verdict"></div><div class="sub"></div></div>' +
        '<div class="hc-mvp hc-hidden"></div>' +
        '<div class="hc-res-grid"></div>' +
        '<div class="hc-res-xp"></div>' +
        '<div class="hc-res-actions">' +
        '  <button class="hc-btn primary" data-again>PLAY AGAIN</button>' +
        '  <button class="hc-btn" data-lobby>LOBBY</button>' +
        '  <button class="hc-btn ghost" data-menu>MAIN MENU</button>' +
        '</div></div>';
      node.querySelector('[data-again]').addEventListener('click', () => M.events.emit('deploy', {
        mode: M.selectedMode, character: M.selectedCharacter, skin: M.selectedSkin
      }));
      node.querySelector('[data-lobby]').addEventListener('click', () => M.show('lobby'));
      node.querySelector('[data-menu]').addEventListener('click', () => M.show('menu'));
      wireButtons(node);

      s.onShow = (data) => {
        if (!data) return;
        const verdict = node.querySelector('.verdict');
        verdict.textContent = data.verdict;
        verdict.className = 'verdict ' + data.verdictClass;
        node.querySelector('.sub').textContent = data.subtitle;

        const mvp = node.querySelector('.hc-mvp');
        mvp.classList.toggle('hc-hidden', !data.mvp);
        if (data.mvp) mvp.textContent = 'MATCH MVP — ' + data.mvp;

        node.querySelector('.hc-res-grid').innerHTML = data.stats.map(([k, v]) =>
          '<div class="hc-res-stat"><label>' + k + '</label><b>' + v + '</b></div>').join('');

        const xp = node.querySelector('.hc-res-xp');
        xp.innerHTML =
          '<div style="display:flex;justify-content:space-between;font-size:.78em;letter-spacing:.2em;color:var(--text-faint)">' +
          '<span>ACCOUNT LEVEL ' + HC.Save.data.level + '</span><span>+' + data.xp + ' XP</span></div>' +
          '<div class="hc-bar" style="margin-top:.4em;height:8px"><i style="width:0"></i></div>' +
          '<div style="display:flex;justify-content:space-between;font-size:.78em;letter-spacing:.2em;color:var(--text-faint);margin-top:1.1em">' +
          '<span>' + HC.Characters.get(data.characterId).name + ' MASTERY ' + HC.Save.masteryFor(data.characterId).level + '</span>' +
          '<span>+' + Math.round(data.xp * 0.62) + ' XP</span></div>' +
          '<div class="hc-bar" style="margin-top:.4em;height:8px"><i style="width:0"></i></div>' +
          (data.unlocks && data.unlocks.length
            ? '<div style="margin-top:1.4em;color:var(--crit);letter-spacing:.2em;font-size:.86em">UNLOCKED — ' +
              data.unlocks.join(' · ') + '</div>' : '');
        // Animate the XP bars filling.
        const bars = xp.querySelectorAll('.hc-bar > i');
        requestAnimationFrame(() => {
          const p = HC.Save.data;
          bars[0].style.transition = 'width 1.1s cubic-bezier(.2,.9,.3,1)';
          bars[0].style.width = (p.xp / HC.Save.xpForLevel(p.level) * 100).toFixed(1) + '%';
          const m = HC.Save.masteryFor(data.characterId);
          bars[1].style.transition = 'width 1.1s cubic-bezier(.2,.9,.3,1) .18s';
          bars[1].style.width = (m.xp / HC.Save.masteryXpForLevel(m.level) * 100).toFixed(1) + '%';
        });

        stage.setCharacter(M.selectedCharacter, M.selectedSkin, data.won ? 'victory' : 'defeat');
        stage.detach();
        HC.Music.setState(data.won ? 'victory' : 'defeat');
      };
    });

    /* ---- resize ---- */
    M.onResize = function () { stage.layout(); };
    window.addEventListener('resize', () => stage.layout());

    M.update = function (dt) { stage.update(dt); };
    M.renderStage = function () { stage.render(); };

    return M;
  };

})(window.HC, window.THREE);
