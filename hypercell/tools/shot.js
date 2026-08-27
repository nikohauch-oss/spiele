#!/usr/bin/env node
/* =========================================================================
 * HYPERCELL — tools/shot.js
 * Boots a real match headless and screenshots the live frame, so the
 * shipping render path (env light, bloom, SSAO, FXAA, grade) can be judged
 * instead of guessed.
 *
 *   node hypercell/tools/shot.js               # default third-person shot
 *   node hypercell/tools/shot.js --hero nyx --yaw 1.2 --wait 6
 * ========================================================================= */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const FILE = 'file://' + path.resolve(__dirname, '..', '..', 'dist', 'HYPERCELL.html');
const OUT = path.resolve(__dirname, '..', '..', 'dist', 'shots');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const HERO = arg('hero', 'rex');
const NAME = arg('name', HERO);
const WAIT = parseFloat(arg('wait', '7'));
const SIM = parseFloat(arg('sim', '2.5'));
const W = parseInt(arg('w', '1200'), 10);
const H = parseInt(arg('h', '675'), 10);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
           '--ignore-gpu-blocklist', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(300000);
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push(m.text()); });

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.HYPERCELL && window.HYPERCELL.state === 'menu');

  await page.evaluate((hero) => {
    const g = window.HYPERCELL;
    g._debug.forceMatch('power_core', hero);
  }, HERO);
  // The match builds across several animation frames; wait for the arena.
  await page.waitForFunction(
    () => ['intro', 'countdown', 'match'].indexOf(window.HYPERCELL.state) >= 0,
    null, { timeout: 180000 });

  // Push through intro + countdown until the match is actually live.
  for (let i = 0; i < 40; i++) {
    const st = await page.evaluate(() => {
      window.HYPERCELL._debug.skipIntro();
      return window.HYPERCELL._debug.state();
    });
    if (st === 'match') break;
    await new Promise(r => setTimeout(r, 400));
  }
  await page.evaluate(() => { window.HYPERCELL.menus.hideAll(); });

  // Let the arena settle: bots spread out, the player is on his feet.
  await page.evaluate((sim) => window.HYPERCELL._debug.simulate(sim), SIM);

  // A pinned camera makes shots comparable between builds; without it the
  // third-person rig ends up wherever the AI happened to push the player.
  const CAM = arg('cam', '');
  if (CAM) {
    const n = CAM.split(',').map(Number);
    if (n.length >= 6 && n.every(v => isFinite(v))) {
      await page.evaluate(([px, py, pz, lx, ly, lz, fov]) => {
        window.HYPERCELL._debug.placePlayer(lx, ly, lz);
        window.HYPERCELL._debug.freeCam({ pos: [px, py, pz], look: [lx, ly, lz], fov: fov || 0 });
      }, n);
    }
  }

  // Real frames now, so the whole post chain actually executes.
  await new Promise(r => setTimeout(r, WAIT * 1000));

  const DEBUG = arg('debug', '');
  const HIDE_HUD = process.argv.indexOf('--nohud') >= 0;
  if (DEBUG === 'ao') {
    await page.evaluate(() => { window.HYPERCELL.postfx.debugAO = true; });
    await new Promise(r => setTimeout(r, 2500));
  }
  if (HIDE_HUD) {
    await page.evaluate(() => {
      ['hc-hud', 'hc-grain'].forEach(id => {
        const n = document.getElementById(id); if (n) n.style.display = 'none';
      });
    });
    await new Promise(r => setTimeout(r, 600));
  }

  const file = path.join(OUT, NAME + '.png');
  await page.screenshot({ path: file, timeout: 280000 });
  console.log('  shot -> dist/shots/' + NAME + '.png');

  const info = await page.evaluate(() => {
    const g = window.HYPERCELL;
    return { state: g.state, fx: !!(g.postfx && g.postfx.depthTexture), ao: g.CFG ? 1 : 1 };
  }).catch(() => null);
  if (info) console.log('  state=' + info.state + ' depthTexture=' + info.fx);

  if (errs.length) {
    console.log('  ERRORS:');
    [...new Set(errs)].slice(0, 8).forEach(e => console.log('    x ' + e.slice(0, 300)));
  }
  await browser.close();
})().catch(e => { console.error('shot failed:', e); process.exit(1); });
