/* =========================================================================
 * HYPERCELL — 26_game.js
 * Bootstrap, renderer, the fixed-step game loop and the match flow:
 *   boot → main menu → lobby → character select → loading → intro →
 *   countdown → match → victory/defeat → results → lobby
 * ========================================================================= */
(function (HC, THREE) {
  'use strict';

  const U = HC.Util;
  const CFG = HC.CFG;

  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

  HC.Game = function Game(container) {
    const G = {
      container, state: 'boot',
      renderer: null, camera: null, scene: null, postfx: null,
      arena: null, rig: null, controller: null, hud: null, menus: null,
      clock: null, running: false,
      frame: 0, fps: 0, frameTimes: [], lastTime: 0,
      hitStop: 0, timeScale: 1,
      paused: false, scoreboardOpen: false,
      intro: null, countdown: 0, resultTimer: 0,
      events: HC.Events('game')
    };

    /* ================================================================== *
     * Renderer
     * ================================================================== */
    function createRenderer() {
      const canvas = document.createElement('canvas');
      canvas.id = 'hc-canvas';
      container.appendChild(canvas);

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({
          canvas, antialias: CFG.gfx.antialias, powerPreference: 'high-performance',
          stencil: false, alpha: false
        });
      } catch (e) {
        HC.Log.error('Game', 'WebGL init failed: ' + e.message);
        showFatal('This browser could not create a WebGL context. HYPERCELL needs hardware 3D acceleration.');
        return null;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CFG.gfx.maxPixelRatio));
      renderer.shadowMap.enabled = CFG.gfx.shadows;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = CFG.gfx.exposure;
      if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.autoClear = true;
      renderer.info.autoReset = false;
      return renderer;
    }

    function showFatal(msg) {
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
        'background:#05070d;color:#e8f2ff;font-family:system-ui,sans-serif;text-align:center;padding:6vw;' +
        'font-size:1.05rem;line-height:1.6;z-index:9999';
      box.innerHTML = '<div><div style="font-size:2rem;letter-spacing:.3em;margin-bottom:1rem">HYPERCELL</div>' +
        '<div style="opacity:.75;max-width:52ch">' + msg + '</div></div>';
      document.body.appendChild(box);
    }

    /* ================================================================== *
     * Init
     * ================================================================== */
    G.init = function () {
      HC.Save.load();
      document.documentElement.style.setProperty('--ui-scale', CFG.access.uiScale);
      const cb = HC.CB_PALETTE[CFG.access.colorBlindMode];
      if (cb) {
        document.documentElement.style.setProperty('--team-a', '#' + cb.teamA.toString(16).padStart(6, '0'));
        document.documentElement.style.setProperty('--team-b', '#' + cb.teamB.toString(16).padStart(6, '0'));
      }

      G.renderer = createRenderer();
      if (!G.renderer) return false;

      G.camera = new THREE.PerspectiveCamera(CFG.camera.fov, 1, CFG.camera.near, CFG.camera.far);
      G.postfx = HC.PostFX(G.renderer);

      G.hud = HC.HUD(container);
      G.menus = HC.Menus(container, G.renderer, G);
      G.clock = HC.StepClock(1 / CFG.sim.tickRate, CFG.sim.maxSubSteps);

      HC.Input.attach(G.renderer.domElement);
      wireEvents();
      G.resize();
      window.addEventListener('resize', G.resize);

      G.state = 'menu';
      G.menus.setLoading(false);
      G.menus.show('menu');
      G.running = true;
      G.lastTime = performance.now();
      requestAnimationFrame(loop);
      HC.Log.info('Game', 'HYPERCELL ready');
      return true;
    };

    function wireEvents() {
      G.menus.events.on('deploy', (opts) => startMatch(opts));
      G.menus.events.on('resume', () => setPaused(false));
      G.menus.events.on('quitMatch', () => endMatchToMenu());
      G.menus.events.on('settingsChanged', () => {
        G.renderer.shadowMap.enabled = CFG.gfx.shadows;
        G.renderer.shadowMap.needsUpdate = true;
        G.resize();
      });

      HC.Input.events.on('lockchange', (locked) => {
        if (!locked && G.state === 'match' && !G.paused && !G.menus.current) setPaused(true);
      });

      window.addEventListener('keydown', (e) => {
        if (e.code === 'Escape') {
          if (G.state === 'match') { e.preventDefault(); setPaused(!G.paused); }
        }
        if (e.code === HC.Input.binds.scoreboard[0] && G.state === 'match' && !G.paused) {
          e.preventDefault();
          if (!G.scoreboardOpen) { G.scoreboardOpen = true; G.hud.setScoreboard(true); }
        }
      });
      window.addEventListener('keyup', (e) => {
        if (e.code === HC.Input.binds.scoreboard[0] && G.scoreboardOpen) {
          G.scoreboardOpen = false;
          G.hud.setScoreboard(false);
        }
      });

      // The first interaction unlocks WebAudio; browsers require a gesture.
      const unlock = () => {
        if (HC.Audio.init()) {
          HC.Music.setState(G.state === 'match' ? 'match_calm' : 'menu');
          window.removeEventListener('pointerdown', unlock);
          window.removeEventListener('keydown', unlock);
        }
      };
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);

      G.renderer.domElement.addEventListener('click', () => {
        if (G.state === 'match' && !G.paused && !HC.Input.locked) HC.Input.requestLock();
      });

      window.addEventListener('error', (e) => {
        HC.Log.error('Runtime', e.message, e.filename + ':' + e.lineno);
      });
    }

    /* ================================================================== *
     * Match lifecycle
     * ================================================================== */
    function startMatch(opts) {
      G.menus.hideAll();
      G.menus.setLoading(true, 0.02, 'ALLOCATING ARENA');
      G.state = 'loading';
      HC.Input.uiCapture = false;

      // Yield between build steps so the loading UI can actually paint.
      const steps = [
        [0.10, 'BUILDING NOVA DISTRICT', () => {
          disposeArena();
          G.scene = new THREE.Scene();
          HC.VFX.init(G.scene, G.camera);
          G.arena = HC.Arena({ scene: G.scene, mode: opts.mode, map: 'nova_district' });
        }],
        [0.45, 'GENERATING NAVIGATION', () => { /* nav built inside Arena */ }],
        [0.60, 'DEPLOYING OPERATIVES', () => populateTeams(opts)],
        [0.82, 'CALIBRATING SYSTEMS', () => {
          G.rig = HC.CameraRig(G.camera, G.arena.world);
          G.rig.setTarget(G.arena.player, true);
          G.arena.setCamera(G.rig);
          G.controller = HC.PlayerController(G.arena.player, G.rig);
          G.hud.attach(G.arena, G.camera);
          G.arena.events.on('matchEnd', onMatchEnd);
          G.arena.events.on('kill', onKill);
        }],
        [1.00, 'READY', () => beginIntro()]
      ];

      let i = 0;
      function next() {
        if (i >= steps.length) return;
        const [p, label, fn] = steps[i++];
        G.menus.setLoading(true, p, label);
        setTimeout(() => {
          try { fn(); }
          catch (e) {
            HC.Log.error('Game', 'match build failed at "' + label + '": ' + e.message, e.stack);
            G.menus.setLoading(false);
            G.state = 'menu';
            G.menus.show('menu');
            return;
          }
          next();
        }, 40);
      }
      next();
    }

    function populateTeams(opts) {
      const arena = G.arena;
      const mode = arena.modeDef;
      const names = HC.botNames.slice();
      U.rng(Date.now() & 0xffff);
      names.sort(() => Math.random() - 0.5);

      const roster = HC.roster().map(c => c.id);
      const pickHero = (exclude) => {
        const pool = roster.filter(r => exclude.indexOf(r) < 0);
        return pool.length ? U.pick(Math.random, pool) : U.pick(Math.random, roster);
      };

      if (mode.teamBased) {
        const size = mode.teamSize;
        const usedA = [opts.character], usedB = [];
        const player = arena.addActor({
          characterId: opts.character, skinId: opts.skin, team: 'A',
          name: HC.Save.data.playerName, isPlayer: true
        });
        for (let i = 1; i < size; i++) {
          const hero = pickHero(usedA); usedA.push(hero);
          arena.addActor({ characterId: hero, skinId: HC.defaultSkinFor(hero), team: 'A',
            name: names.pop() || 'ALLY-' + i, difficulty: CFG.ai.difficulty });
        }
        for (let i = 0; i < size; i++) {
          const hero = pickHero(usedB); usedB.push(hero);
          arena.addActor({ characterId: hero, skinId: HC.defaultSkinFor(hero), team: 'B',
            name: names.pop() || 'HOSTILE-' + i, difficulty: CFG.ai.difficulty });
        }
      } else {
        arena.addActor({
          characterId: opts.character, skinId: opts.skin, team: 'A',
          name: HC.Save.data.playerName, isPlayer: true
        });
        const count = (mode.playerCount || 8) - 1;
        for (let i = 0; i < count; i++) {
          const hero = U.pick(Math.random, roster);
          arena.addActor({ characterId: hero, skinId: HC.defaultSkinFor(hero),
            team: i % 2 ? 'B' : 'A', name: names.pop() || 'RIVAL-' + i, difficulty: CFG.ai.difficulty });
        }
        // Free-for-all: everybody is hostile to everybody. Team identity is
        // meaningless here, so colour the player friendly and the rest hostile.
        arena.actors.forEach((a, idx) => {
          a.team = 'T' + idx;
          a.model.setTeamColor(a.isPlayer ? 'A' : 'B');
        });
      }

      arena.actors.forEach(a => arena.respawn(a));
    }

    /* ---- intro ---- */
    function beginIntro() {
      G.menus.setLoading(false);
      G.state = 'intro';
      G.menus.showIntro(G.arena);
      HC.Music.setState('intro');
      G.hud.show(false);

      const map = G.arena.map;
      const spawn = G.arena.player.position;
      const points = [
        { position: new THREE.Vector3(0, 30, -48), lookAt: new THREE.Vector3(0, 2, 0), fov: 52 },
        { position: new THREE.Vector3(-22, 12, -22), lookAt: new THREE.Vector3(0, 3, 0), fov: 58 },
        { position: new THREE.Vector3(0, 6.5, -14), lookAt: new THREE.Vector3(0, 2.5, 0), fov: 62 },
        { position: new THREE.Vector3(18, 9, 16), lookAt: new THREE.Vector3(0, 2, 0), fov: 58 },
        { position: new THREE.Vector3(spawn.x + 5, spawn.y + 3.6, spawn.z + (G.arena.player.team === 'A' ? -7 : 7)),
          lookAt: new THREE.Vector3(spawn.x, spawn.y + 1.4, spawn.z), fov: 56 }
      ];
      G.arena.actors.forEach(a => a.setPoseOverride('select'));
      G.rig.playCinematic(points, CFG.match.introDuration, () => {
        G.arena.actors.forEach(a => a.setPoseOverride(null));
        G.menus.hideIntro();
        startCountdown();
      });
    }

    function startCountdown() {
      G.state = 'countdown';
      G.countdown = CFG.match.countdownFrom + 0.999;
      G.hud.show(true);
      HC.Input.requestLock();
    }

    function onKill(e) {
      if (e.killer === G.arena.player) {
        const streak = e.killer.score.streak;
        if (streak >= 2) G.hud.toast(streak + ' IN A ROW');
        HC.Audio.ui('elimination', { volume: 0.7 });
      }
      if (e.victim === G.arena.player) {
        HC.Audio.setDucking(0.75);
        setTimeout(() => HC.Audio.setDucking(0), 1600);
      }
      // Music intensity follows how hot the fight is.
      updateMusicIntensity();
    }

    let musicTimer = 0;
    function updateMusicIntensity() {
      const arena = G.arena;
      if (!arena || G.state !== 'match') return;
      if (arena.timeRemaining < CFG.match.finalMinuteThreshold) { HC.Music.setState('final'); return; }
      const p = arena.player;
      let near = 0;
      arena.actors.forEach(a => {
        if (a === p || !a.health.alive) return;
        if (arena.modeDef.teamBased && a.team === p.team) return;
        if (a.position.distanceTo(p.position) < 26) near++;
      });
      const recentDamage = (performance.now() / 1000 - p.health.lastDamageTime) < 5;
      HC.Music.setState(near > 0 || recentDamage ? 'match_fight' : 'match_calm');
    }

    /* ---- end ---- */
    function onMatchEnd(res) {
      G.state = 'ending';
      G.resultTimer = 4.2;
      HC.Input.releaseLock();
      const player = G.arena.player;
      const teamBased = G.arena.modeDef.teamBased;
      const won = teamBased ? res.winner === player.team : (res.leader === player);
      const draw = res.winner === 'draw';

      G.hud.showBanner(draw ? 'DRAW' : (won ? 'VICTORY' : 'DEFEAT'),
        teamBased ? G.arena.teams.A.score + ' — ' + G.arena.teams.B.score : '',
        4.0, draw ? 'var(--armor)' : (won ? 'var(--accent)' : 'var(--team-b)'));
      HC.Audio.ui(won ? 'match_victory' : 'match_defeat');
      HC.Music.setState(won ? 'victory' : 'defeat');

      G.arena.actors.forEach(a => {
        if (!a.health.alive) return;
        const aWon = teamBased ? a.team === res.winner : a === res.leader;
        a.setPoseOverride(aWon ? 'victory' : 'defeat');
        a.weapon.setTrigger(false);
        a.setInputLocked(true);
      });
      G.result = { res, won, draw };
    }

    function showResults() {
      const arena = G.arena;
      const p = arena.player;
      const w = p.weapon.stats;
      const teamBased = arena.modeDef.teamBased;
      const won = G.result.won;

      // XP: participation + performance + a win bonus.
      const xp = Math.round(
        120 +
        p.score.kills * 42 +
        p.score.assists * 18 +
        p.score.objective * 0.9 +
        p.score.damage * 0.06 +
        arena.matchTime * 0.6 +
        (won ? 320 : 0));

      // MVP: highest combined contribution on the winning side.
      let mvp = null, mvpScore = -1;
      arena.actors.forEach(a => {
        const s = a.score.kills * 3 + a.score.assists * 1.5 + a.score.objective * 0.05 + a.score.damage * 0.004;
        const eligible = !teamBased || a.team === (G.result.res.winner || a.team);
        if (eligible && s > mvpScore) { mvpScore = s; mvp = a; }
      });

      const accuracy = w.shotsFired > 0 ? (w.shotsHit / w.shotsFired * 100) : 0;
      const before = HC.Save.data.unlockedSkins.slice();
      const progress = HC.Save.recordMatch({
        won, kills: p.score.kills, assists: p.score.assists, deaths: p.score.deaths,
        damage: p.score.damage, healing: p.score.healing, objective: p.score.objective,
        shotsFired: w.shotsFired, shotsHit: w.shotsHit, crits: w.crits,
        duration: arena.matchTime, bestStreak: p.score.bestStreak,
        mvp: mvp === p, characterId: p.characterId, xp
      });
      const unlocks = HC.Save.data.unlockedSkins.filter(s => before.indexOf(s) < 0)
        .map(id => (HC.Skins.tryGet(id) || {}).name || id);
      if (progress.accountLevels.length) unlocks.push('ACCOUNT LEVEL ' + HC.Save.data.level);

      G.state = 'results';
      G.hud.detach();
      G.menus.show('results', {
        verdict: G.result.draw ? 'DRAW' : (won ? 'VICTORY' : 'DEFEAT'),
        verdictClass: G.result.draw ? 'draw' : (won ? 'win' : 'lose'),
        subtitle: arena.modeDef.name + ' · NOVA DISTRICT · ' + U.formatTime(arena.matchTime),
        won, characterId: p.characterId, xp,
        mvp: mvp ? mvp.name + ' (' + mvp.charDef.name + ')' : null,
        unlocks,
        stats: [
          ['Eliminations', p.score.kills],
          ['Assists', p.score.assists],
          ['Deaths', p.score.deaths],
          ['K/D', (p.score.deaths ? p.score.kills / p.score.deaths : p.score.kills).toFixed(2)],
          ['Damage', U.formatNumber(p.score.damage)],
          ['Objective', Math.round(p.score.objective)],
          ['Accuracy', accuracy.toFixed(1) + '%'],
          ['Critical Hits', w.crits],
          ['Best Streak', p.score.bestStreak]
        ]
      });
    }

    function endMatchToMenu() {
      setPaused(false);
      HC.Input.releaseLock();
      G.hud.detach();
      disposeArena();
      G.state = 'menu';
      G.menus.show('menu');
      HC.Music.setState('menu');
    }

    function disposeArena() {
      if (!G.arena) return;
      G.arena.dispose();
      HC.VFX.dispose();
      G.arena = null;
      G.rig = null;
      G.controller = null;
      if (G.scene) {
        G.scene.traverse(o => { if (o.isMesh && o.geometry && !o.userData.keep) { /* owned by systems */ } });
        G.scene = null;
      }
    }

    function setPaused(v) {
      if (G.state !== 'match' && G.state !== 'countdown') return;
      G.paused = v;
      G.menus.setPause(v);
      HC.Audio.setDucking(v ? 0.9 : 0);
      if (v) HC.Input.releaseLock();
      else HC.Input.requestLock();
    }

    /* ================================================================== *
     * Main loop
     * ================================================================== */
    function loop(now) {
      if (!G.running) return;
      requestAnimationFrame(loop);

      let dt = (now - G.lastTime) / 1000;
      G.lastTime = now;
      if (!isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.1);

      // FPS limiter
      const limit = HC.Save.data.settings.graphics.fpsLimit;
      if (limit > 0) {
        G._accum = (G._accum || 0) + dt;
        if (G._accum < 1 / limit) return;
        dt = G._accum;
        G._accum = 0;
      }

      G.frame++;
      trackFps(dt);

      try {
        update(dt);
        render();
      } catch (e) {
        HC.Log.error('Game', 'frame failed: ' + e.message, e.stack);
        // Keep the loop alive: a single bad frame must not end the session.
      }

      HC.Input.endFrame();
    }

    function trackFps(dt) {
      G.frameTimes.push(dt);
      if (G.frameTimes.length > 45) G.frameTimes.shift();
      let sum = 0;
      for (let i = 0; i < G.frameTimes.length; i++) sum += G.frameTimes[i];
      G.fps = G.frameTimes.length / Math.max(0.0001, sum);
    }

    function update(dt) {
      HC.Input.pollGamepad();
      G.menus.update(dt);

      if (G.state === 'menu' || G.state === 'results' || G.state === 'loading') {
        HC.Music.update(dt);
        return;
      }
      if (!G.arena) return;

      if (G.state === 'intro') {
        G.rig.updateCinematic(dt);
        stepWorld(dt, true);
        HC.Music.update(dt);
        return;
      }

      if (G.paused) { HC.Music.update(dt); return; }

      if (G.state === 'countdown') {
        const before = Math.ceil(G.countdown);
        G.countdown -= dt;
        const after = Math.ceil(G.countdown);
        if (after !== before && after > 0) {
          G.hud.showBanner(String(after), '', 0.9, 'var(--accent)');
          HC.Audio.ui('countdown_tick', { pitch: 1 + (CFG.match.countdownFrom - after) * 0.12 });
        }
        if (G.countdown <= 0) {
          G.state = 'match';
          G.arena.start();
          G.hud.showBanner('GO', '', 1.0, 'var(--health)');
          HC.Audio.ui('countdown_go');
          HC.Music.setState('match_calm');
        }
        stepWorld(dt, true);
        HC.Music.update(dt);
        return;
      }

      if (G.state === 'ending') {
        G.resultTimer -= dt;
        stepWorld(dt, true);
        HC.Music.update(dt);
        if (G.resultTimer <= 0) showResults();
        return;
      }

      /* --- active match --- */
      // Hit-stop: a few frames of slowed time on a kill. Small, but it is
      // the difference between "the enemy died" and "I killed them".
      const stop = G.arena.consumeHitStop();
      if (stop > 0) G.hitStop = stop;
      if (G.hitStop > 0) {
        G.hitStop -= dt;
        G.timeScale = U.damp(G.timeScale, 0.12, 30, dt);
      } else {
        G.timeScale = U.damp(G.timeScale, 1, 12, dt);
      }
      const scaled = dt * G.timeScale;

      G.arena.playerCommands = G.controller.update(dt);
      stepWorld(scaled, false);

      musicTimer -= dt;
      if (musicTimer <= 0) { musicTimer = 1.0; updateMusicIntensity(); }
      HC.Music.update(dt);

      if (G.scoreboardOpen) G.hud.setScoreboard(true);
      G.hud.update(dt);

      if (G.frame % 24 === 0) {
        G.hud.setPerf(
          Math.round(G.fps) + ' FPS · ' +
          G.renderer.info.render.calls + ' DC · ' +
          (G.renderer.info.render.triangles / 1000).toFixed(0) + 'k TRI');
      }
    }

    /** Steps the simulation with a fixed tick, then updates presentation. */
    function stepWorld(dt, frozen) {
      const arena = G.arena;
      G.clock.advance(dt, (step) => {
        if (!frozen) arena.tick(step);
        else {
          // During intro/countdown the world still animates but nothing fights.
          arena.actors.forEach(a => a.update(step, HC.blankCommands()));
          arena.map.update(step);
        }
      });

      HC.VFX.update(dt);
      if (G.state !== 'intro') G.rig.update(dt);

      // Audio listener follows the camera.
      G.camera.getWorldDirection(_v);
      _v2.set(_v.z, 0, -_v.x).normalize();
      HC.Audio.setListener(G.camera.position, _v, _v2);

      // Ambient emitters
      updateAmbience(dt);
    }

    let ambienceTimer = 0;
    function updateAmbience(dt) {
      ambienceTimer -= dt;
      if (ambienceTimer > 0) return;
      ambienceTimer = 1.4;
      const list = G.arena.map.ambientEmitters;
      if (!list || !list.length) return;
      for (let i = 0; i < 3; i++) {
        const e = list[(Math.random() * list.length) | 0];
        if (!e) continue;
        e.timer = (e.timer || 0) - 1.4;
        if (e.timer <= 0) {
          e.timer = e.interval;
          if (e.pos.distanceTo(G.camera.position) < 40) {
            HC.Audio.play(e.sound, { position: e.pos, volume: 0.5, dur: 2.0 });
          }
        }
      }
    }

    function render() {
      const r = G.renderer;
      r.info.reset();
      r.setViewport(0, 0, G.width, G.height);
      if (G.scene && (G.state === 'match' || G.state === 'countdown' ||
          G.state === 'intro' || G.state === 'ending')) {
        G.postfx.render(G.scene, G.camera);
      } else {
        r.setRenderTarget(null);
        r.clear();
      }
      G.menus.renderStage();
    }

    /* ================================================================== *
     * Resize
     * ================================================================== */
    G.resize = function () {
      const w = window.innerWidth, h = window.innerHeight;
      G.width = w; G.height = h;
      const scale = CFG.gfx.renderScale;
      G.renderer.setPixelRatio(Math.min((window.devicePixelRatio || 1) * scale, CFG.gfx.maxPixelRatio * scale));
      G.renderer.setSize(w, h, false);
      G.camera.aspect = w / h;
      G.camera.updateProjectionMatrix();
      const dpr = G.renderer.getPixelRatio();
      G.postfx.setSize(Math.floor(w * dpr), Math.floor(h * dpr));
      G.menus.onResize();
    };

    G.destroy = function () {
      G.running = false;
      window.removeEventListener('resize', G.resize);
      HC.Input.detach();
      disposeArena();
      G.postfx.dispose();
      G.renderer.dispose();
    };

    /* Exposed for the automated smoke test. */
    G._debug = {
      /**
       * Runs the simulation at the fixed tick with no rendering at all.
       * Software-rasterised browsers cannot render fast enough to exercise
       * combat and AI in real time, so the test drives the game logic
       * directly — same code path, just without the frames.
       */
      simulate(seconds, commandFn) {
        if (!G.arena || G.state !== 'match') return { error: 'not in a match: ' + G.state };
        const step = 1 / CFG.sim.tickRate;
        const ticks = Math.floor(seconds / step);
        const t0 = performance.now();
        for (let i = 0; i < ticks; i++) {
          const t = i * step;
          G.arena.playerCommands = commandFn ? commandFn(t) : HC.blankCommands();
          G.arena.tick(step);
          HC.VFX.update(step);
          if (G.arena.state === 'ended') break;
        }
        return { ticks, simSeconds: +(ticks * step).toFixed(2), wallMs: Math.round(performance.now() - t0) };
      },
      forceMatch(mode, character) {
        startMatch({ mode: mode || 'power_core', character: character || 'rex',
          skin: HC.defaultSkinFor(character || 'rex') });
      },
      skipIntro() {
        if (G.state === 'intro') { G.rig.cinematic = null; G.menus.hideIntro(); startCountdown(); }
        if (G.state === 'countdown') G.countdown = 0.01;
      },
      state() { return G.state; }
    };

    return G;
  };

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  HC.boot = function () {
    const root = document.getElementById('hc-root') || (function () {
      const d = document.createElement('div');
      d.id = 'hc-root';
      document.body.appendChild(d);
      return d;
    })();

    const grain = document.createElement('div');
    grain.id = 'hc-grain';
    root.appendChild(grain);

    if (!window.THREE) {
      HC.Log.error('Boot', 'three.js failed to load');
      return null;
    }
    const game = HC.Game(root);
    window.HYPERCELL = game;
    game.init();
    return game;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => HC.boot());
  } else {
    HC.boot();
  }

})(window.HC, window.THREE);
