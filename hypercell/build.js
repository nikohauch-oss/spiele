#!/usr/bin/env node
/* =========================================================================
 * HYPERCELL — build.js
 * Packs vendor + sources + stylesheet into self-contained HTML.
 *
 *   dist/HYPERCELL.html          full standalone document (open locally)
 *   dist/hypercell-artifact.html body-only fragment for the Artifact host
 *
 * No bundler, no network at runtime: the output has zero external
 * dependencies, which is the point — there is nothing that can 404.
 * ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const VENDOR = path.join(ROOT, 'vendor');
const DIST = path.resolve(ROOT, '..', 'dist');

const SOURCE_ORDER = [
  '00_core.js',
  '01_config.js',
  '02_weapons_data.js',
  '03_characters_data.js',
  '04_skins_data.js',
  '05_audio.js',
  '06_input.js',
  '07_save.js',
  '08_materials.js',
  '09_character_model.js',
  '10_weapon_model.js',
  '11_animation.js',
  '12_vfx.js',
  '13_physics.js',
  '14_nav.js',
  '14a_kit.js',
  '15_map_nova_district.js',
  '16_health.js',
  '17_weapon.js',
  '18_abilities.js',
  '19_actor.js',
  '20_ai.js',
  '21_camera.js',
  '22_arena.js',
  '23_hud.js',
  '24_menus.js',
  '25_postfx.js',
  '26_game.js'
];

function read(p) {
  if (!fs.existsSync(p)) {
    console.error('[build] missing file: ' + p);
    process.exit(1);
  }
  return fs.readFileSync(p, 'utf8');
}

function main() {
  const three = read(path.join(VENDOR, 'three.min.js'));
  const css = read(path.join(SRC, 'ui.css'));

  const sources = SOURCE_ORDER.map(name => {
    const code = read(path.join(SRC, name));
    return '/* ===== ' + name + ' ===== */\n' + code;
  });

  const banner =
    '/*! HYPERCELL — a stylised 3D hero shooter.\n' +
    ' *  Built ' + new Date().toISOString() + '\n' +
    ' *  All geometry, textures, animation and audio are generated at runtime.\n' +
    ' *  Bundled: three.js r160 (MIT).\n' +
    ' */\n';

  const body =
    '<div id="hc-root"></div>\n' +
    '<script>' + three + '</script>\n' +
    '<script>\n' + banner + sources.join('\n\n') + '\n</script>\n';

  const head =
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
    '<title>HYPERCELL</title>\n' +
    '<meta name="description" content="HYPERCELL — a stylised 3D hero shooter. Eight heroes, five modes, one district.">\n' +
    '<meta name="theme-color" content="#05070d">\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">\n' +
    '<style>\n' + css + '\n</style>\n';

  fs.mkdirSync(DIST, { recursive: true });

  const standalone =
    '<!doctype html>\n<html lang="en">\n<head>\n' + head + '</head>\n<body>\n' + body + '</body>\n</html>\n';
  fs.writeFileSync(path.join(DIST, 'HYPERCELL.html'), standalone);

  // The Artifact host injects its own <html>/<head>/<body>, so emit the
  // title + styles inline and skip the document skeleton.
  const artifact =
    '<title>HYPERCELL</title>\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">\n' +
    '<style>\n' + css + '\n</style>\n' + body;
  fs.writeFileSync(path.join(DIST, 'hypercell-artifact.html'), artifact);

  const kb = (s) => (Buffer.byteLength(s, 'utf8') / 1024).toFixed(0) + ' KB';
  console.log('[build] dist/HYPERCELL.html            ' + kb(standalone));
  console.log('[build] dist/hypercell-artifact.html   ' + kb(artifact));
  console.log('[build] sources: ' + SOURCE_ORDER.length + ' modules, ' +
    sources.reduce((n, s) => n + s.split('\n').length, 0) + ' lines');
}

main();
