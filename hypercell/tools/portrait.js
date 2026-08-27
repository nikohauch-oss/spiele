#!/usr/bin/env node
/* =========================================================================
 * HYPERCELL — tools/portrait.js
 * Renders large, well-lit hero portraits straight out of the game's own
 * model + material code, so visual work can be judged instead of guessed.
 *
 *   node hypercell/tools/portrait.js rex maya brutus
 * ========================================================================= */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const FILE = 'file://' + path.resolve(__dirname, '..', '..', 'dist', 'HYPERCELL.html');
const OUT = path.resolve(__dirname, '..', '..', 'dist', 'portraits');
const ARGS = process.argv.slice(2).filter(a => a[0] !== '-');
const HEROES = ARGS.length ? ARGS : ['rex'];
const HEAD = process.argv.indexOf('--head') >= 0;   // tight facial close-up
const SIZE = 900;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
           '--ignore-gpu-blocklist', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
  page.setDefaultTimeout(240000);
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push(m.text()); });

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.HYPERCELL && window.HYPERCELL.state === 'menu');

  // Take over the whole viewport with the hero stage, framed as a portrait.
  await page.evaluate(() => {
    const g = window.HYPERCELL;
    g.menus.hideAll();
    document.querySelectorAll('#hc-menus, #hc-hud, #hc-grain').forEach(n => { n.style.display = 'none'; });
    const holder = document.createElement('div');
    holder.id = 'portrait-holder';
    holder.style.cssText = 'position:fixed;inset:0;';
    document.getElementById('hc-root').appendChild(holder);
    g.menus.stage.attachTo(holder);
    window.__setHero = (id, head) => {
      const skin = HC.defaultSkinFor(id);
      const st = g.menus.stage;
      st.setCharacter(id, skin, 'select');
      st.targetRotation = head ? 0.28 : 0.55;
      st.rotation = st.targetRotation;
      if (head) {
        // Frame the face: eye-level, slightly below, close enough to read.
        const m = st.model.measure;
        const eye = m.height - m.headR * 1.25;
        st.camera.fov = 24;
        st.camera.position.set(0.05, eye, m.headR * 8.6);
        if (st.weapon) st.weapon.root.visible = false;
        st.camera.lookAt(0, eye, 0);
        st.camera.updateProjectionMatrix();
        // Freeze the idle sway so the close-up is repeatable.
        st.update = function (dt) {
          st.animator.update(dt);
          st.model.root.rotation.y = st.rotation;
        };
      }
    };
  });

  console.log(await page.evaluate(() => {
    const st = window.HYPERCELL.menus.stage;
    return 'stage viewport=' + JSON.stringify(st.viewport) +
           ' cam=' + JSON.stringify(st.camera.position.toArray().map(v => +v.toFixed(2))) +
           ' fov=' + st.camera.fov;
  }));

  for (const hero of HEROES) {
    await page.evaluate(([h, head]) => window.__setHero(h, head), [hero, HEAD]);
    // Let the pose settle and the stage render a few frames.
    await new Promise(r => setTimeout(r, 4000));
    await page.screenshot({ path: path.join(OUT, hero + (HEAD ? '-head' : '') + '.png'), timeout: 220000 });
    console.log('  rendered ' + hero + ' ' + await page.evaluate(() => {
      const st = window.HYPERCELL.menus.stage;
      const m = st.model.measure;
      return 'h=' + m.height.toFixed(2) + ' headR=' + m.headR.toFixed(3) +
             ' cam=' + JSON.stringify(st.camera.position.toArray().map(v => +v.toFixed(2))) +
             ' rootY=' + st.model.root.position.y.toFixed(2);
    }));
  }

  if (errs.length) {
    console.log('  ERRORS:');
    [...new Set(errs)].slice(0, 6).forEach(e => console.log('    x ' + e.slice(0, 300)));
  }
  await browser.close();
  console.log('portraits -> dist/portraits/');
})().catch(e => { console.error('portrait failed:', e); process.exit(1); });
