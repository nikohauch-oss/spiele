#!/usr/bin/env node
'use strict';
/* =========================================================================
 * HYPERCELL — tools/kitsheet.js
 * Renders every imported kit prop into one contact sheet, lit and shaded the
 * way the game will light it, so the pieces can be judged rather than
 * guessed at from triangle counts.
 *
 *   node hypercell/tools/kitsheet.js  ->  dist/shots/kitsheet.png
 * ========================================================================= */
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const OUT = path.resolve(__dirname, '..', '..', 'dist', 'shots');
const FILE = 'file://' + path.resolve(__dirname, '..', '..', 'dist', 'HYPERCELL.html');
const COLS = 7;
const CELL = 210;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
           '--ignore-gpu-blocklist', '--disable-dev-shm-usage']
  });

  // Size the page to the grid we are about to draw.
  const probe = await browser.newPage();
  await probe.goto(FILE, { waitUntil: 'load' });
  await probe.waitForFunction(() => window.HC && window.HC.Kit);
  const names = await probe.evaluate(() => window.HC.Kit.names());
  await probe.close();

  const rows = Math.ceil(names.length / COLS);
  const page = await browser.newPage({ viewport: { width: COLS * CELL, height: rows * CELL } });
  page.setDefaultTimeout(300000);
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.HYPERCELL && window.HYPERCELL.state === 'menu');

  await page.evaluate(({ cols, cell }) => {
    const g = window.HYPERCELL;
    g.menus.hideAll();
    g.running = false;                       // stop the game loop owning the canvas
    document.querySelectorAll('#hc-menus, #hc-hud, #hc-grain').forEach(n => { n.style.display = 'none'; });

    const names = HC.Kit.names();
    const rows = Math.ceil(names.length / cols);
    const renderer = g.renderer;
    renderer.setPixelRatio(1);
    renderer.setSize(cols * cell, rows * cell, false);
    renderer.setScissorTest(true);

    const scene = new THREE.Scene();
    HC.Mats.applyEnvironment(scene, 1.1);
    const key = new THREE.DirectionalLight(0xfff2e0, 3.4); key.position.set(3, 5, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x88c4ff, 3.0); rim.position.set(-4, 2, -3); scene.add(rim);
    scene.add(new THREE.AmbientLight(0x46587a, 0.7));
    scene.add(new THREE.HemisphereLight(0x6a90c0, 0x1b2230, 0.8));

    const mat = HC.Mats.make({
      kind: 'plate', color: 0x8892a4, roughness: 0.52, metalness: 0.30,
      repeat: 1.2, seed: 5, rim: { color: 0x7fc0ff, strength: 0.22, power: 3.0 }
    });
    const floorMat = HC.Mats.make({ kind: 'concrete', color: 0x2a3140, roughness: 0.8, repeat: 2, seed: 9, rim: false });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.1, 32), floorMat);
    floor.position.y = -0.05;
    scene.add(floor);

    const holder = new THREE.Object3D();
    scene.add(holder);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);

    window.__drawSheet = () => {
      // setRenderTarget resets viewport and scissor, so it has to happen once
      // up front — calling it inside the loop wiped every cell but the last.
      renderer.setRenderTarget(null);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, cols * cell, rows * cell);
      renderer.setScissor(0, 0, cols * cell, rows * cell);
      renderer.clear();
      renderer.setScissorTest(true);
      renderer.autoClear = false;

      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        holder.clear();
        const geo = HC.Kit.geometry(name);
        if (!geo) continue;
        const mesh = new THREE.Mesh(geo, mat);
        holder.add(mesh);

        // Frame each piece on its own bounding sphere so small props are not
        // specks and big ones are not cropped.
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        const size = new THREE.Vector3(); bb.getSize(size);
        const centre = new THREE.Vector3(); bb.getCenter(centre);
        const radius = Math.max(0.25, size.length() * 0.5);
        const dist = radius / Math.tan((30 * Math.PI / 180) / 2) * 0.85;
        const dir = new THREE.Vector3(0.75, 0.55, 1).normalize();
        camera.position.copy(dir).multiplyScalar(dist).add(centre);
        camera.lookAt(centre);
        camera.updateProjectionMatrix();
        floor.position.y = -0.05;
        floor.scale.setScalar(Math.max(0.4, radius / 2));

        const col = i % cols, row = Math.floor(i / cols);
        // WebGL's viewport origin is bottom-left; the grid reads top-down.
        const x = col * cell, y = (rows - 1 - row) * cell;
        renderer.setViewport(x, y, cell, cell);
        renderer.setScissor(x, y, cell, cell);
        renderer.clearDepth();
        renderer.render(scene, camera);
      }
      renderer.setScissorTest(false);
      renderer.autoClear = true;
    };
    window.__names = names;
  }, { cols: COLS, cell: CELL });

  // Draw repeatedly: the canvas is not preserved between frames.
  await page.evaluate(() => {
    let n = 0;
    const tick = () => { window.__drawSheet(); if (n++ < 4) requestAnimationFrame(tick); };
    tick();
  });
  await new Promise(r => setTimeout(r, 3000));
  await page.evaluate(() => window.__drawSheet());

  const file = path.join(OUT, 'kitsheet.png');
  await page.screenshot({ path: file, timeout: 280000 });
  console.log('  ' + names.length + ' props -> dist/shots/kitsheet.png');
  console.log('  order: ' + names.join(', '));
  if (errs.length) [...new Set(errs)].slice(0, 6).forEach(e => console.log('    x ' + e.slice(0, 200)));
  await browser.close();
})().catch(e => { console.error('kitsheet failed:', e); process.exit(1); });
