/* =========================================================================
 * HYPERCELL — 06_input.js
 * Keyboard + mouse + gamepad with rebindable actions, pointer lock,
 * dead zones, response curves and hold/toggle modifiers.
 * ========================================================================= */
(function (HC) {
  'use strict';

  const U = HC.Util, CFG = HC.CFG;

  const DEFAULT_BINDS = {
    moveForward: ['KeyW', 'ArrowUp'],
    moveBack: ['KeyS', 'ArrowDown'],
    moveLeft: ['KeyA', 'ArrowLeft'],
    moveRight: ['KeyD', 'ArrowRight'],
    jump: ['Space'],
    sprint: ['ShiftLeft', 'ShiftRight'],
    crouch: ['ControlLeft', 'KeyC'],
    dodge: ['KeyQ'],
    reload: ['KeyR'],
    swapWeapon: ['KeyX'],
    ability1: ['KeyE'],
    ability2: ['KeyF'],
    ultimate: ['KeyG'],
    interact: ['KeyE'],
    scoreboard: ['Tab'],
    emote: ['KeyB'],
    swapShoulder: ['KeyV'],
    pause: ['Escape'],
    fire: ['Mouse0'],
    aim: ['Mouse2'],
    melee: ['KeyV']
  };

  const Input = HC.Input = {
    keys: Object.create(null),
    pressed: Object.create(null),
    released: Object.create(null),
    mouse: { dx: 0, dy: 0, buttons: [false, false, false], wheel: 0 },
    locked: false,
    enabled: true,
    binds: JSON.parse(JSON.stringify(DEFAULT_BINDS)),
    defaults: DEFAULT_BINDS,
    gamepadIndex: -1,
    gamepad: { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: [] },
    _element: null,
    _listeners: [],
    events: null,
    /** Pointer lock is unavailable in some embeds (sandboxed iframes without
     *  allow="pointer-lock"). When we detect that, the game falls back to
     *  drag-to-look so it stays fully playable instead of feeling broken. */
    lockAvailable: true,
    lockDenied: false,
    dragLook: false,
    dragging: false,
    /** Set true while a text field / menu has focus so gameplay ignores keys. */
    uiCapture: false
  };

  Input.events = HC.Events('input');

  Input.attach = function (element) {
    Input._element = element;
    const add = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      Input._listeners.push([target, type, fn]);
    };

    add(window, 'keydown', (e) => {
      if (e.repeat) return;
      // Never swallow browser-critical combos.
      if (e.ctrlKey && (e.code === 'KeyR' || e.code === 'KeyW')) return;
      if (Input.uiCapture && e.code !== 'Escape') return;
      Input.keys[e.code] = true;
      Input.pressed[e.code] = true;
      Input.events.emit('keydown', e.code);
      if (Input._consumes(e.code)) e.preventDefault();
    });
    add(window, 'keyup', (e) => {
      Input.keys[e.code] = false;
      Input.released[e.code] = true;
      Input.events.emit('keyup', e.code);
    });
    add(window, 'blur', () => Input.clear());

    add(element, 'mousedown', (e) => {
      if (!Input.locked && !Input.dragLook) return;
      Input.mouse.buttons[e.button] = true;
      Input.keys['Mouse' + e.button] = true;
      Input.pressed['Mouse' + e.button] = true;
      if (Input.dragLook) {
        Input.dragging = true;
        Input._lastX = e.clientX; Input._lastY = e.clientY;
      }
      e.preventDefault();
    });
    add(window, 'mouseup', (e) => {
      Input.mouse.buttons[e.button] = false;
      Input.keys['Mouse' + e.button] = false;
      Input.released['Mouse' + e.button] = true;
      if (!Input.mouse.buttons[0] && !Input.mouse.buttons[2]) Input.dragging = false;
    });
    add(window, 'mousemove', (e) => {
      if (Input.locked) {
        Input.mouse.dx += e.movementX || 0;
        Input.mouse.dy += e.movementY || 0;
      } else if (Input.dragLook && Input.dragging) {
        Input.mouse.dx += e.clientX - Input._lastX;
        Input.mouse.dy += e.clientY - Input._lastY;
        Input._lastX = e.clientX; Input._lastY = e.clientY;
      }
    });
    add(element, 'wheel', (e) => { if (Input.locked) { Input.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });
    add(element, 'contextmenu', (e) => e.preventDefault());

    add(document, 'pointerlockchange', () => {
      Input.locked = document.pointerLockElement === element;
      Input.events.emit('lockchange', Input.locked);
      if (!Input.locked) Input.clearMouseButtons();
    });
    add(document, 'pointerlockerror', () => {
      Input.lockDenied = true;
      Input.setDragLook(true);
      HC.Log.warn('Input', 'pointer lock denied — falling back to drag-to-look');
    });

    add(window, 'gamepadconnected', (e) => {
      Input.gamepadIndex = e.gamepad.index;
      HC.Log.info('Input', 'gamepad connected: ' + e.gamepad.id);
      Input.events.emit('gamepad', true);
    });
    add(window, 'gamepaddisconnected', () => {
      Input.gamepadIndex = -1;
      Input.events.emit('gamepad', false);
    });
  };

  Input.detach = function () {
    Input._listeners.forEach(([t, type, fn]) => t.removeEventListener(type, fn));
    Input._listeners.length = 0;
  };

  /** Keys the game consumes so the page never scrolls under the player. */
  Input._consumes = function (code) {
    return code === 'Space' || code === 'Tab' || code.startsWith('Arrow');
  };

  Input.requestLock = function () {
    if (!Input._element || Input.locked) return;
    if (!Input._element.requestPointerLock) {
      Input.lockAvailable = false;
      Input.setDragLook(true);
      return;
    }
    if (Input.lockDenied) return;   // don't spam a request the host refuses
    try {
      const p = Input._element.requestPointerLock();
      if (p && p.catch) p.catch(() => { Input.lockDenied = true; Input.setDragLook(true); });
    } catch (e) {
      Input.lockDenied = true;
      Input.setDragLook(true);
    }
  };

  Input.setDragLook = function (on) {
    if (Input.dragLook === on) return;
    Input.dragLook = on;
    Input.dragging = false;
    Input.events.emit('draglook', on);
  };
  Input.releaseLock = function () {
    if (document.pointerLockElement) document.exitPointerLock();
  };

  Input.clear = function () {
    for (const k in Input.keys) Input.keys[k] = false;
    Input.clearMouseButtons();
    Input.mouse.dx = Input.mouse.dy = 0;
  };
  Input.clearMouseButtons = function () {
    Input.mouse.buttons[0] = Input.mouse.buttons[1] = Input.mouse.buttons[2] = false;
    Input.keys.Mouse0 = Input.keys.Mouse1 = Input.keys.Mouse2 = false;
    Input.dragging = false;
  };

  /* ---- action queries -------------------------------------------------- */
  Input.isDown = function (action) {
    if (!Input.enabled) return false;
    const list = Input.binds[action];
    if (!list) return false;
    for (let i = 0; i < list.length; i++) if (Input.keys[list[i]]) return true;
    return false;
  };
  Input.wasPressed = function (action) {
    if (!Input.enabled) return false;
    const list = Input.binds[action];
    if (!list) return false;
    for (let i = 0; i < list.length; i++) if (Input.pressed[list[i]]) return true;
    return false;
  };
  Input.wasReleased = function (action) {
    const list = Input.binds[action];
    if (!list) return false;
    for (let i = 0; i < list.length; i++) if (Input.released[list[i]]) return true;
    return false;
  };

  Input.rebind = function (action, code) {
    if (!Input.binds[action]) { HC.Log.warn('Input', 'unknown action "' + action + '"'); return false; }
    // Remove the code from any other action so binds stay unambiguous.
    for (const a in Input.binds) {
      if (a === action) continue;
      const i = Input.binds[a].indexOf(code);
      if (i >= 0) Input.binds[a].splice(i, 1);
    }
    Input.binds[action] = [code];
    return true;
  };
  Input.resetBinds = function () { Input.binds = JSON.parse(JSON.stringify(DEFAULT_BINDS)); };

  Input.bindLabel = function (action) {
    const list = Input.binds[action];
    if (!list || !list.length) return '—';
    return Input.keyLabel(list[0]);
  };
  Input.keyLabel = function (code) {
    if (!code) return '—';
    if (code.startsWith('Mouse')) return ['LMB', 'MMB', 'RMB'][+code.slice(5)] || code;
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Arrow')) return code.slice(5) + ' Arrow';
    const map = { Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT',
      ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', Escape: 'ESC', Tab: 'TAB' };
    return map[code] || code.toUpperCase();
  };

  /* ---- gamepad --------------------------------------------------------- */
  function curve(v, dead, exp) {
    const a = Math.abs(v);
    if (a < dead) return 0;
    const n = (a - dead) / (1 - dead);
    return Math.sign(v) * Math.pow(n, exp);
  }

  Input.pollGamepad = function () {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let pad = Input.gamepadIndex >= 0 ? pads[Input.gamepadIndex] : null;
    if (!pad) { for (let i = 0; i < pads.length; i++) if (pads[i]) { pad = pads[i]; Input.gamepadIndex = i; break; } }
    const g = Input.gamepad;
    if (!pad) { g.lx = g.ly = g.rx = g.ry = g.lt = g.rt = 0; g.buttons = []; return; }
    const d = CFG.input.padDeadZone, e = CFG.input.padResponseCurve;
    g.lx = curve(pad.axes[0] || 0, d, e);
    g.ly = curve(pad.axes[1] || 0, d, e);
    g.rx = curve(pad.axes[2] || 0, d, e);
    g.ry = curve(pad.axes[3] || 0, d, e);
    g.buttons = pad.buttons.map(b => b.pressed);
    g.lt = pad.buttons[6] ? pad.buttons[6].value : 0;
    g.rt = pad.buttons[7] ? pad.buttons[7].value : 0;
  };

  /** Composite move axis from keyboard + left stick. x=strafe, y=forward */
  Input.moveAxis = function () {
    let x = 0, y = 0;
    if (Input.isDown('moveForward')) y += 1;
    if (Input.isDown('moveBack')) y -= 1;
    if (Input.isDown('moveRight')) x += 1;
    if (Input.isDown('moveLeft')) x -= 1;
    const g = Input.gamepad;
    if (Math.abs(g.lx) > 0 || Math.abs(g.ly) > 0) { x += g.lx; y -= g.ly; }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y, magnitude: Math.min(1, len) };
  };

  /** Look delta in radians for this frame. */
  Input.lookDelta = function (dt, sensScale) {
    const s = CFG.input.mouseSensitivity * (sensScale || 1) * (Input.dragLook ? 1.45 : 1);
    let dx = Input.mouse.dx * s;
    let dy = Input.mouse.dy * s;
    const g = Input.gamepad;
    const ps = CFG.input.padSensitivity * (sensScale || 1) * dt;
    dx += g.rx * ps;
    dy += g.ry * ps;
    if (CFG.input.invertY) dy = -dy;
    Input.mouse.dx = 0; Input.mouse.dy = 0;
    return { dx, dy };
  };

  Input.padDown = function (index) { return !!Input.gamepad.buttons[index]; };

  /** Called once per rendered frame, after all systems have read input. */
  Input.endFrame = function () {
    for (const k in Input.pressed) Input.pressed[k] = false;
    for (const k in Input.released) Input.released[k] = false;
    Input.mouse.wheel = 0;
  };

})(window.HC);
