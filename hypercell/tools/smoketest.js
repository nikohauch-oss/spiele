#!/usr/bin/env node
/* =========================================================================
 * HYPERCELL — tools/smoketest.js
 * Boots dist/HYPERCELL.html in headless Chromium, drives it through the
 * full match flow, and fails on any console error or thrown exception.
 * ========================================================================= */
'use strict';

const path = require('path');
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');

const FILE = 'file://' + path.resolve(__dirname, '..', '..', 'dist', 'HYPERCELL.html');
const SHOTS = path.resolve(__dirname, '..', '..', 'dist', 'shots');
const MODE = process.argv[2] || 'power_core';
const HERO = process.argv[3] || 'rex';
const SECONDS = parseFloat(process.argv[4] || '14');
const secs2 = SECONDS;

(async () => {
  require('fs').mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
           '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage',
           '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(180000);

  const errors = [];
  const warnings = [];
  // Google Fonts are a progressive enhancement; the CSS ships a full
  // fallback stack, so an offline font fetch is not a failure.
  const IGNORE = [/ERR_CONNECTION_RESET/, /ERR_NAME_NOT_RESOLVED/, /ERR_INTERNET_DISCONNECTED/,
                  /fonts\.googleapis\.com/, /fonts\.gstatic\.com/, /ERR_BLOCKED_BY_CLIENT/];
  page.on('console', m => {
    const t = m.type();
    const text = m.text();
    if (IGNORE.some(re => re.test(text))) return;
    if (t === 'error') errors.push(text);
    else if (t === 'warning' || t === 'warn') warnings.push(text);
  });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '')));

  const step = async (label, fn) => {
    process.stdout.write('  ' + label.padEnd(34, '.'));
    try { const r = await fn(); console.log(' ok' + (r ? ' (' + r + ')' : '')); return r; }
    catch (e) {
      console.log(' FAIL');
      console.log('      -> ' + String(e.message || e).split('\n').slice(0, 4).join('\n         '));
      errors.push(label + ': ' + e.message);
      return null;
    }
  };

  console.log('HYPERCELL smoke test — mode=' + MODE + ' hero=' + HERO);
  await page.goto(FILE, { waitUntil: 'load', timeout: 60000 });

  await step('boot', async () => {
    await page.waitForFunction(() => window.HYPERCELL && window.HYPERCELL.state === 'menu', { timeout: 30000 });
    return await page.evaluate(() => window.HC.VERSION);
  });

  await step('reduce render load', async () => {
    await page.evaluate(() => {
      HC.CFG.gfx.renderScale = 0.5;
      HC.Save.data.settings.graphics.renderScale = 0.5;
      HC.CFG.gfx.shadowMapSize = 1024;
      window.HYPERCELL.resize();
    });
  });

  await step('renderer online', async () => {
    const info = await page.evaluate(() => {
      const g = window.HYPERCELL;
      return { w: g.width, h: g.height, ctx: !!g.renderer.getContext() };
    });
    if (!info.ctx) throw new Error('no webgl context');
    return info.w + 'x' + info.h;
  });

  await page.screenshot({ path: path.join(SHOTS, '01-menu.png') });

  await step('registries populated', async () => {
    const r = await page.evaluate(() => ({
      chars: HC.Characters.size, weapons: HC.Weapons.size,
      skins: HC.Skins.size, abilities: HC.Abilities.size, modes: HC.Modes.size
    }));
    if (r.chars < 8) throw new Error('expected 8 characters, got ' + r.chars);
    if (r.abilities < 24) throw new Error('expected 24 abilities, got ' + r.abilities);
    return JSON.stringify(r);
  });

  await step('character select renders', async () => {
    await page.evaluate(() => window.HYPERCELL.menus.show('characters'));
    await new Promise(r => setTimeout(r, 900));
  });
  await page.screenshot({ path: path.join(SHOTS, '02-characters.png') });

  await step('every hero builds', async () => {
    const bad = await page.evaluate(() => {
      const out = [];
      HC.roster().forEach(c => {
        HC.skinsFor(c.id).forEach(s => {
          try {
            const m = HC.CharacterModel.build({ characterId: c.id, skinId: s.id, team: 'A' });
            if (!m.meshes.length) out.push(c.id + '/' + s.id + ': no meshes');
            m.dispose();
          } catch (e) { out.push(c.id + '/' + s.id + ': ' + e.message); }
        });
        try {
          const w = HC.WeaponModel.build({ weaponId: c.weapon, palette: c.palette });
          if (!w.sockets.muzzle) out.push(c.weapon + ': no muzzle');
          w.dispose();
        } catch (e) { out.push(c.weapon + ': ' + e.message); }
      });
      return out;
    });
    if (bad.length) throw new Error(bad.join(' | '));
    return 'all heroes + skins + weapons';
  });

  await step('model height matches capsule', async () => {
    const bad = await page.evaluate(() => {
      const out = [];
      const target = HC.CFG.body.height;
      HC.roster().forEach(c => {
        const m = HC.CharacterModel.build({ characterId: c.id, team: 'A', bodyHeight: target });
        m.root.updateMatrixWorld(true);
        const top = m.bones.headTop.getWorldPosition(new THREE.Vector3()).y;
        const expected = target * c.build.heightScale;
        if (Math.abs(top - expected) > 0.09) {
          out.push(c.id + ': crown ' + top.toFixed(3) + ' vs capsule ' + expected.toFixed(3));
        }
        m.dispose();
      });
      return out;
    });
    if (bad.length) throw new Error(bad.join(' | '));
    return 'all 8 within 9cm';
  });

  await step('weapon points where you aim', async () => {
    const report = await page.evaluate(() => {
      const out = [];
      const scene = new THREE.Scene();
      HC.roster().forEach(c => {
        const wdef = HC.Weapons.get(c.weapon);
        if (wdef.melee) return;                       // blades follow the hand
        const model = HC.CharacterModel.build({ characterId: c.id, team: 'A' });
        scene.add(model.root);
        const anim = HC.Animator(model, c);
        anim.setWeaponShape(!!wdef.akimbo, false);
        const weapon = HC.WeaponModel.build({ weaponId: c.weapon, palette: c.palette });
        model.bones.weaponSocket.add(weapon.root);

        // Settle the ready pose, then aim dead ahead (+Z) like the actor does.
        for (let i = 0; i < 240; i++) anim.update(1 / 120);
        model.root.updateMatrixWorld(true);

        const socket = model.bones.weaponSocket;
        const m = new THREE.Matrix4().copy(socket.matrixWorld).invert();
        const localAim = new THREE.Vector3(0, 0, 1).transformDirection(m).normalize();
        weapon.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), localAim);
        model.root.updateMatrixWorld(true);

        const muzzle = weapon.sockets.muzzle.getWorldPosition(new THREE.Vector3());
        const grip = weapon.root.getWorldPosition(new THREE.Vector3());
        const chest = model.bones.chest.getWorldPosition(new THREE.Vector3());
        const barrel = muzzle.clone().sub(grip).normalize();

        const forwardDot = barrel.z;                  // should be ~1 (facing +Z)
        const inFront = muzzle.z - chest.z;           // muzzle ahead of the body
        const height = muzzle.y;

        if (forwardDot < 0.97) out.push(c.id + ': barrel off-axis (dot ' + forwardDot.toFixed(2) + ')');
        if (inFront < 0.25) out.push(c.id + ': muzzle not in front (' + inFront.toFixed(2) + 'm)');
        if (height < 0.7 || height > 1.9) out.push(c.id + ': muzzle at odd height ' + height.toFixed(2));

        scene.remove(model.root);
        weapon.dispose();
        model.dispose();
      });
      return out;
    });
    if (report.length) throw new Error(report.join(' | '));
    return 'all ranged weapons aligned';
  });

  await step('deploy into match', async () => {
    await page.evaluate(([mode, hero]) => window.HYPERCELL._debug.forceMatch(mode, hero), [MODE, HERO]);
    await page.waitForFunction(() => ['intro', 'countdown', 'match'].includes(window.HYPERCELL.state), { timeout: 60000 });
    return await page.evaluate(() => window.HYPERCELL.state);
  });

  await step('nav graph built', async () => {
    const n = await page.evaluate(() => window.HYPERCELL.arena.nav.nodes.length);
    if (n < 200) throw new Error('nav graph too small: ' + n);
    return n + ' nodes';
  });

  await step('collision world built', async () => {
    const n = await page.evaluate(() => window.HYPERCELL.arena.world.shapeCount);
    if (n < 100) throw new Error('too few collision shapes: ' + n);
    return n + ' shapes';
  });

  await page.screenshot({ path: path.join(SHOTS, '03-intro.png') });

  await step('skip to live match', async () => {
    await page.evaluate(() => window.HYPERCELL._debug.skipIntro());
    await page.waitForFunction(() => window.HYPERCELL.state === 'match', { timeout: 30000 });
    await new Promise(r => setTimeout(r, 600));
  });

  // Headless simulation: exercises combat, AI and objectives at full tick
  // rate without waiting on a software rasteriser.
  const sim = await step('headless sim ' + SECONDS + 's', async () => {
    let total = { ticks: 0, simSeconds: 0, wallMs: 0 };
    const CHUNK = 4;
    for (let done = 0; done < SECONDS; done += CHUNK) {
      const r = await simChunk(Math.min(CHUNK, SECONDS - done), done);
      if (r && r.error) throw new Error(r.error);
      if (!r) throw new Error('simulate returned nothing');
      total.ticks += r.ticks; total.simSeconds += r.simSeconds; total.wallMs += r.wallMs;
    }
    return total.ticks + ' ticks / ' + total.simSeconds.toFixed(1) + 's sim in ' + total.wallMs + 'ms';
  });

  async function simChunk(secs, offset) {
    return await page.evaluate(([secs, offset]) => {
      const arena = window.HYPERCELL.arena;
      const player = arena.player;
      const V = new THREE.Vector3();
      // Point the player at the nearest hostile so hit registration, crits
      // and kills are genuinely exercised rather than shot into the sky.
      const aimAtEnemy = (c) => {
        let best = null, bestD = Infinity;
        for (const a of arena.actors) {
          if (a === player || !a.health.alive) continue;
          if (arena.modeDef.teamBased && a.team === player.team) continue;
          const d = a.position.distanceTo(player.position);
          if (d < bestD) { bestD = d; best = a; }
        }
        if (!best) return;
        const eye = player.eyePosition(new THREE.Vector3());
        const to = best.centerPosition(V).clone().sub(eye);
        const flat = Math.hypot(to.x, to.z);
        const yaw = Math.atan2(to.x, to.z);
        const pitch = -Math.atan2(to.y, flat);
        c.lookYaw = -HC.Util.shortAngle(player.yaw, yaw) * 0.35;
        c.lookPitch = (pitch - player.pitch) * 0.35;

        const wdef = player.weapon.def;
        const reach = wdef.melee ? wdef.meleeRange : wdef.range.falloffEnd;
        if (bestD > reach * 0.8) {
          // Close the distance instead of shooting into the void — this is
          // what makes the melee path (Nyx's blades) actually get exercised.
          c.moveY = 1; c.moveX = 0; c.sprint = bestD > reach * 3;
        }
        c.fire = bestD < reach * 1.05;
      };
      const mk = (t) => {
        const c = HC.blankCommands();
        c.moveY = Math.sin(t * 0.7) > 0 ? 1 : -0.6;
        c.moveX = Math.cos(t * 0.5);
        c.lookYaw = Math.sin(t * 0.9) * 0.012;
        c.lookPitch = Math.sin(t * 0.4) * 0.002;
        c.fire = (t % 2.2) < 1.3;
        c.aim = (t % 5) < 2;
        c.sprint = (t % 7) < 2.2;
        c.jumpPressed = Math.abs(t % 4.0) < 0.009;
        c.dodgePressed = Math.abs(t % 6.5) < 0.01;
        c.crouch = (t % 11) < 1.4;
        c.ability1 = Math.abs(t % 5.5) < 0.01;
        c.ability2 = Math.abs(t % 8.5) < 0.01;
        c.ultimate = Math.abs(t % 12.0) < 0.01;
        c.reloadPressed = Math.abs(t % 9.0) < 0.01;
        c.swapPressed = Math.abs(t % 14.0) < 0.01;
        aimAtEnemy(c);
        return c;
      };
      return window.HYPERCELL._debug.simulate(secs, (t) => mk(t + offset));
    }, [secs, offset]);
  }

  // Then a short real-time slice so the render path is exercised too.
  await step('live frames', async () => {
    await page.evaluate((secs) => {
      const g = window.HYPERCELL;
      // Inject synthetic commands so we don't need pointer lock.
      const orig = g.controller.update;
      let t = 0;
      g.controller.update = function (dt) {
        t += dt;
        const c = HC.blankCommands();
        c.moveY = Math.sin(t * 0.7) > 0 ? 1 : -0.6;
        c.moveX = Math.cos(t * 0.5);
        c.lookYaw = Math.sin(t * 0.9) * 0.02;
        c.lookPitch = Math.sin(t * 0.4) * 0.004;
        c.fire = (t % 2.2) < 1.3;
        c.aim = (t % 5) < 2;
        c.sprint = (t % 7) < 2.2;
        c.jumpPressed = Math.floor(t * 2) % 9 === 0;
        c.dodgePressed = Math.floor(t * 2) % 13 === 0;
        c.crouch = (t % 11) < 1.4;
        c.ability1 = Math.floor(t * 4) % 23 === 0;
        c.ability2 = Math.floor(t * 4) % 31 === 0;
        c.ultimate = Math.floor(t * 4) % 47 === 0;
        c.reloadPressed = Math.floor(t * 2) % 17 === 0;
        c.swapPressed = Math.floor(t * 2) % 29 === 0;
        return c;
      };
      g._testDriven = true;
    });
    await new Promise(r => setTimeout(r, 2500));
  });

  const telemetry = await step('collect telemetry', async () => {
    return await page.evaluate(() => {
      const g = window.HYPERCELL, a = g.arena, p = a.player;
      return {
        fps: Math.round(g.fps),
        drawCalls: g.renderer.info.render.calls,
        triangles: g.renderer.info.render.triangles,
        state: g.state,
        arenaState: a.state,
        matchTime: +a.matchTime.toFixed(1),
        actors: a.actors.length,
        aliveActors: a.actors.filter(x => x.health.alive).length,
        totalKills: a.actors.reduce((n, x) => n + x.score.kills, 0),
        totalDamage: Math.round(a.actors.reduce((n, x) => n + x.score.damage, 0)),
        playerPos: [p.position.x, p.position.y, p.position.z].map(v => +v.toFixed(1)),
        playerGrounded: p.grounded,
        playerShots: p.weapon.stats.shotsFired,
        playerHits: p.weapon.stats.shotsHit,
        botsMoved: a.actors.filter(x => x.isBot && x.planarSpeed > 0.2).length,
        botsWithPath: a.actors.filter(x => x.isBot && x.brain.path.length > 0).length,
        botsEverPathed: a.actors.filter(x => x.isBot && x.brain.pathsComputed > 0).length,
        botPathsTotal: a.actors.reduce((n, x) => n + (x.isBot ? x.brain.pathsComputed : 0), 0),
        playerWeapon: p.weapon.def.id,
        playerIsMelee: !!p.weapon.def.melee,
        botShots: a.actors.filter(x => x.isBot).reduce((n, x) => n + x.weapon.stats.shotsFired, 0),
        deployables: a.deployables.length,
        projectiles: a.projectiles.count,
        particles: HC.VFX.sparks.count + HC.VFX.smoke.count,
        teamScores: [Math.floor(a.teams.A.score), Math.floor(a.teams.B.score)],
        objective: a.mode.core ? a.mode.core.state : 'n/a',
        killFeed: a.killFeed.length,
        outOfBounds: a.actors.filter(x => Math.abs(x.position.y) > 40 ||
          Math.abs(x.position.x) > 90 || Math.abs(x.position.z) > 95).length,
        lowestActorY: +Math.min.apply(null, a.actors.map(x => x.position.y)).toFixed(1),
        audioReady: HC.Audio.ready,
        logErrors: HC.Log.history.filter(l => l.level === 'error').map(l => l.tag + ': ' + l.msg).slice(0, 12)
      };
    });
  });

  await step('screenshot match', async () => {
    await page.screenshot({ path: path.join(SHOTS, '04-match.png'), timeout: 170000 });
  });

  console.log('\n  telemetry:');
  Object.entries(telemetry || {}).forEach(([k, v]) => {
    console.log('    ' + k.padEnd(16) + ' ' + JSON.stringify(v));
  });

  await step('combat actually resolved', async () => {
    const t = telemetry || {};
    const problems = [];
    if (!(t.totalDamage > 120)) problems.push('no meaningful damage dealt: ' + t.totalDamage);
    // A melee hero has to walk into range, so the shot count is naturally low;
    // what matters is that swings connect at all.
    const minShots = t.playerIsMelee ? 1 : 10;
    if (!(t.playerShots >= minShots)) problems.push('player barely attacked: ' + t.playerShots);
    if (!(t.playerHits > 0)) problems.push('player never landed a shot with ' + t.playerWeapon);
    if (!(t.botShots > 10)) problems.push('bots barely fired: ' + t.botShots);
    // Bots holding an angle deliberately stop pathing, so assert on the
    // cumulative count rather than whichever instant we happened to sample.
    if (!(t.botsEverPathed >= 5)) problems.push('bots never pathed: ' + t.botsEverPathed);
    if (!(t.botPathsTotal > 20)) problems.push('too few paths computed: ' + t.botPathsTotal);
    if (!(t.matchTime > 5)) problems.push('match clock did not advance: ' + t.matchTime);
    if (t.arenaState !== 'active' && t.arenaState !== 'ended') problems.push('arena state ' + t.arenaState);
    if (t.outOfBounds > 0) problems.push(t.outOfBounds + ' actor(s) outside the map');
    if (Math.abs(t.playerPos[1]) > 40) problems.push('player left the world: y=' + t.playerPos[1]);
    if (problems.length) throw new Error(problems.join(' | '));
    return t.totalKills + ' kills, ' + t.totalDamage + ' dmg';
  });

  await step('scoreboard renders', async () => {
    await page.evaluate(() => window.HYPERCELL.hud.setScoreboard(true));
    await new Promise(r => setTimeout(r, 300));
  });
  await page.screenshot({ path: path.join(SHOTS, '05-scoreboard.png') });
  await page.evaluate(() => window.HYPERCELL.hud.setScoreboard(false));

  await step('settings screen renders', async () => {
    await page.evaluate(() => window.HYPERCELL.menus.show('settings'));
    await new Promise(r => setTimeout(r, 500));
  });
  await page.screenshot({ path: path.join(SHOTS, '06-settings.png') });

  console.log('');
  if (warnings.length) {
    console.log('  warnings (' + warnings.length + '):');
    [...new Set(warnings)].slice(0, 10).forEach(w => console.log('    ! ' + w.slice(0, 200)));
  }
  if (errors.length) {
    console.log('  ERRORS (' + errors.length + '):');
    [...new Set(errors)].slice(0, 20).forEach(e => console.log('    x ' + e.slice(0, 700)));
  }

  await browser.close();

  const logErrors = (telemetry && telemetry.logErrors) || [];
  const fail = errors.length > 0 || logErrors.length > 0;
  console.log('\n' + (fail ? 'RESULT: FAIL' : 'RESULT: PASS'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('harness crashed:', e); process.exit(2); });
