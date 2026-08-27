/* =========================================================================
 * HYPERCELL — 21_camera.js
 * Third-person camera rig and the player controller that feeds it.
 *
 * The camera does a lot of the game's feel work: shoulder offset, ADS
 * transition, sprint FOV and pull-back, collision, recoil, shake, landing
 * dip and a subtle bob whose amplitude follows the hero's weight.
 * ========================================================================= */
(function (HC, THREE) {
  'use strict';

  const U = HC.Util;
  const CFG = HC.CFG;

  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  const _dir = new THREE.Vector3();

  HC.CameraRig = function CameraRig(camera, world) {
    const R = {
      camera, world,
      target: null,
      shoulder: 1,                 // +1 right, -1 left
      distance: CFG.camera.distance,
      currentDistance: CFG.camera.distance,
      height: CFG.camera.height,
      fov: CFG.camera.fov,
      shake: 0, shakeTime: 0,
      recoilPitch: 0, recoilYaw: 0,
      landDip: 0, bobPhase: 0, bobAmount: 0,
      aimBlend: 0, sprintBlend: 0,
      position: new THREE.Vector3(),
      lookPoint: new THREE.Vector3(),
      smoothPos: new THREE.Vector3(),
      spectating: false,
      _initialised: false,
      _kick: 0, _kickDecay: 0,
      time: 0
    };

    R.setTarget = function (actor, snap) {
      R.target = actor;
      if (snap) R._initialised = false;
    };

    R.addShake = function (amount, duration) {
      const scaled = amount * CFG.access.cameraShakeStrength;
      R.shake = Math.min(CFG.camera.shakeMax, R.shake + scaled);
      R.shakeTime = Math.max(R.shakeTime, duration || 0.3);
    };

    /** Distance-attenuated shake, used by explosions. */
    R.addWorldShake = function (position, amount, duration) {
      if (!R.target) return;
      const d = R.target.position.distanceTo(position);
      const falloff = U.clamp01(1 - d / CFG.feel.shakeDistanceFalloff);
      if (falloff <= 0) return;
      R.addShake(amount * falloff * falloff, duration);
    };

    R.addRecoil = function (pitch, yaw) {
      R.recoilPitch += pitch;
      R.recoilYaw += yaw;
    };

    R.toggleShoulder = function () { R.shoulder = -R.shoulder; };

    R.update = function (dt) {
      R.time += dt;
      const a = R.target;
      if (!a) return;

      const aim = a.weapon ? a.weapon.aim : 0;
      const scoped = a.weapon ? a.weapon.scoped : false;
      R.aimBlend = U.damp(R.aimBlend, aim, 16, dt);
      R.sprintBlend = U.damp(R.sprintBlend, a.sprinting ? 1 : 0, 7, dt);

      /* --- FOV --- */
      let targetFov = CFG.camera.fov;
      targetFov = U.lerp(targetFov, CFG.camera.sprintFov, R.sprintBlend);
      if (scoped && a.weapon.def.scope) targetFov = a.weapon.def.scope.zoomFov;
      else targetFov = U.lerp(targetFov, CFG.camera.aimFov, R.aimBlend);
      targetFov += R._kick * 4.5;
      R.fov = U.damp(R.fov, targetFov, CFG.camera.fovRate, dt);
      if (Math.abs(camera.fov - R.fov) > 0.01) {
        camera.fov = R.fov;
        camera.updateProjectionMatrix();
      }

      /* --- desired offsets --- */
      const distTarget = U.lerp(
        U.lerp(CFG.camera.distance, CFG.camera.sprintDistance, R.sprintBlend),
        CFG.camera.aimDistance, R.aimBlend);
      const shoulderTarget = U.lerp(CFG.camera.shoulder, CFG.camera.aimShoulder, R.aimBlend) * R.shoulder;
      const heightTarget = U.lerp(CFG.camera.height, CFG.camera.aimHeight, R.aimBlend)
        * (a.currentHeight() / CFG.body.height);

      R.distance = U.damp(R.distance, distTarget, 10, dt);

      /* --- recoil + landing dip + bob --- */
      const rec = a.weapon ? a.weapon.consumeRecoil() : { pitch: 0, yaw: 0 };
      R.recoilPitch += rec.pitch * 0.0016;
      R.recoilYaw += rec.yaw * 0.0016;
      R.recoilPitch = U.damp(R.recoilPitch, 0, CFG.camera.recoilReturnRate, dt);
      R.recoilYaw = U.damp(R.recoilYaw, 0, CFG.camera.recoilReturnRate, dt);

      if (a.cameraKick > R._kick) { R._kick = a.cameraKick; }
      R._kick = U.damp(R._kick, 0, 6.5, dt);

      const speedFrac = U.clamp01(a.planarSpeed / CFG.move.sprintSpeed);
      if (a.grounded && speedFrac > 0.05) {
        R.bobPhase += dt * CFG.camera.bobRate * (4 + speedFrac * 9);
        const weight = a.charDef.gait.weight || 1;
        R.bobAmount = U.damp(R.bobAmount,
          CFG.camera.bobAmount * speedFrac * (a.sprinting ? CFG.camera.sprintBobScale : 1) * (0.7 + weight * 0.3),
          8, dt);
      } else {
        R.bobAmount = U.damp(R.bobAmount, 0, 9, dt);
      }
      // Bob is suppressed while aiming — precision must feel stable.
      const bobScale = (1 - R.aimBlend * 0.85);
      const bobY = Math.sin(R.bobPhase * 2) * R.bobAmount * bobScale;
      const bobX = Math.sin(R.bobPhase) * R.bobAmount * 1.3 * bobScale;

      /* --- pivot --- */
      const pivot = _v.copy(a.position);
      pivot.y += heightTarget + bobY - R._kick * CFG.camera.landDipScale * 6;

      /* --- orientation --- */
      const yaw = a.yaw + R.recoilYaw;
      let pitch = a.pitch + R.recoilPitch;
      if (a.weapon && a.weapon.scoped) {
        const sway = a.weapon.scopeSway(R.time);
        pitch += sway.y; // vertical sway only; horizontal is applied to the offset
      }
      pitch = U.clamp(pitch, CFG.camera.pitchMin, CFG.camera.pitchMax);

      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      _dir.set(Math.sin(yaw) * cp, -sp, Math.cos(yaw) * cp).normalize();
      const right = _v2.set(_dir.z, 0, -_dir.x).normalize();

      /* --- desired camera position behind the pivot --- */
      const desired = _v3.copy(pivot)
        .addScaledVector(_dir, -R.distance)
        .addScaledVector(right, shoulderTarget + bobX);

      /* --- collision: pull in so the camera never enters geometry --- */
      const toCam = desired.clone().sub(pivot);
      const camDist = toCam.length();
      let allowed = camDist;
      if (camDist > 0.01) {
        toCam.multiplyScalar(1 / camDist);
        const hit = world.raycast(pivot, toCam, camDist + CFG.camera.collisionRadius, null, 'movement');
        if (hit) allowed = Math.max(CFG.camera.minDistance, hit.distance - CFG.camera.collisionRadius);
      }
      // Pull in fast, ease back out slowly — snapping outwards looks broken.
      const rate = allowed < R.currentDistance ? CFG.camera.collisionPullRate : CFG.camera.collisionReturnRate;
      R.currentDistance = U.damp(R.currentDistance, allowed, rate, dt);

      R.position.copy(pivot).addScaledVector(toCam, R.currentDistance);

      /* --- shake --- */
      if (R.shake > 0.001) {
        R.shakeTime -= dt;
        R.shake = U.damp(R.shake, 0, CFG.camera.shakeDecay, dt);
        if (R.shakeTime <= 0) R.shake = U.damp(R.shake, 0, CFG.camera.shakeDecay * 2.5, dt);
        const s = R.shake * 0.22;
        const t = R.time * 46;
        R.position.x += Math.sin(t * 1.7) * s;
        R.position.y += Math.sin(t * 2.3 + 1.1) * s;
        R.position.z += Math.sin(t * 1.3 + 2.7) * s;
      }

      /* --- commit --- */
      if (!R._initialised) {
        R.smoothPos.copy(R.position);
        R._initialised = true;
      } else {
        const follow = CFG.camera.followRate * (a.dodging ? 0.65 : 1);
        R.smoothPos.x = U.damp(R.smoothPos.x, R.position.x, follow, dt);
        R.smoothPos.y = U.damp(R.smoothPos.y, R.position.y, follow * 0.85, dt);
        R.smoothPos.z = U.damp(R.smoothPos.z, R.position.z, follow, dt);
      }
      camera.position.copy(R.smoothPos);
      R.distanceToTarget = R.smoothPos.distanceTo(pivot);

      R.lookPoint.copy(pivot).addScaledVector(_dir, 40);
      camera.lookAt(R.lookPoint);
      if (R.shake > 0.002) camera.rotateZ(Math.sin(R.time * 37) * R.shake * 0.035);
    };

    /** Cinematic fly-through used by the match intro. */
    R.playCinematic = function (points, duration, onDone) {
      R.cinematic = { points, duration, t: 0, onDone };
    };
    R.updateCinematic = function (dt) {
      const c = R.cinematic;
      if (!c) return false;
      c.t += dt;
      const k = U.clamp01(c.t / c.duration);
      const n = c.points.length - 1;
      const seg = Math.min(n - 1, Math.floor(k * n));
      const localT = U.smoothstep(k * n - seg);
      const a = c.points[seg], b = c.points[seg + 1];
      camera.position.lerpVectors(a.position, b.position, localT);
      _v.lerpVectors(a.lookAt, b.lookAt, localT);
      camera.lookAt(_v);
      const fov = U.lerp(a.fov || 60, b.fov || 60, localT);
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      if (k >= 1) { R.cinematic = null; R._initialised = false; if (c.onDone) c.onDone(); return false; }
      return true;
    };

    return R;
  };

  /* ================================================================== *
   * Player controller — turns raw input into the shared command struct.
   * ================================================================== */
  HC.PlayerController = function PlayerController(actor, rig) {
    const cmd = HC.blankCommands();
    const P = {
      actor, rig, cmd,
      aimToggleState: false,
      crouchToggleState: false,
      enabled: true
    };

    P.setActor = function (a) { P.actor = a; };

    P.update = function (dt) {
      const a = P.actor;
      // Reset edge triggers each frame.
      cmd.jumpPressed = false; cmd.dodgePressed = false; cmd.reloadPressed = false;
      cmd.swapPressed = false; cmd.ability1 = false; cmd.ability2 = false;
      cmd.ultimate = false; cmd.meleePressed = false; cmd.emotePressed = false;

      if (!P.enabled || !a) {
        cmd.moveX = cmd.moveY = 0; cmd.lookYaw = cmd.lookPitch = 0;
        cmd.fire = false; cmd.aim = false; cmd.sprint = false; cmd.crouch = false;
        return cmd;
      }

      const I = HC.Input;
      const move = I.moveAxis();
      cmd.moveX = move.x;
      cmd.moveY = move.y;

      // Sensitivity scales down while aiming / scoped so precision holds.
      let sens = 1;
      if (a.weapon) {
        if (a.weapon.scoped) sens = CFG.input.scopeSensitivityScale;
        else if (a.weapon.aim > 0.2) sens = U.lerp(1, CFG.input.aimSensitivityScale, a.weapon.aim);
      }
      const look = I.lookDelta(dt, sens);
      cmd.lookYaw = look.dx;
      cmd.lookPitch = look.dy;

      cmd.jump = I.isDown('jump') || I.padDown(0);
      cmd.jumpPressed = I.wasPressed('jump') || (I.padDown(0) && !P._padJump);
      P._padJump = I.padDown(0);

      cmd.sprint = CFG.input.holdToSprint
        ? (I.isDown('sprint') || I.gamepad.buttons[10])
        : togglePressed('sprint', 'sprintToggleState');

      if (CFG.input.holdToCrouch) cmd.crouch = I.isDown('crouch') || I.padDown(1);
      else {
        if (I.wasPressed('crouch')) P.crouchToggleState = !P.crouchToggleState;
        cmd.crouch = P.crouchToggleState;
      }

      cmd.dodgePressed = I.wasPressed('dodge') || (I.padDown(1) && !P._padDodge);
      P._padDodge = I.padDown(1);

      cmd.fire = I.isDown('fire') || I.gamepad.rt > 0.35;

      if (CFG.input.holdToAim) cmd.aim = I.isDown('aim') || I.gamepad.lt > 0.35;
      else {
        if (I.wasPressed('aim')) P.aimToggleState = !P.aimToggleState;
        if (a.sprinting) P.aimToggleState = false;
        cmd.aim = P.aimToggleState;
      }

      cmd.holdBreath = cmd.aim && (I.isDown('crouch') || I.gamepad.buttons[10]);
      cmd.reloadPressed = I.wasPressed('reload') || (I.padDown(2) && !P._padReload);
      P._padReload = I.padDown(2);
      cmd.swapPressed = I.wasPressed('swapWeapon') || I.mouse.wheel !== 0 || (I.padDown(3) && !P._padSwap);
      P._padSwap = I.padDown(3);

      cmd.ability1 = I.wasPressed('ability1') || (I.padDown(4) && !P._padA1);
      P._padA1 = I.padDown(4);
      cmd.ability2 = I.wasPressed('ability2') || (I.padDown(5) && !P._padA2);
      P._padA2 = I.padDown(5);
      cmd.ultimate = I.wasPressed('ultimate') || (I.gamepad.buttons[9] && !P._padUlt);
      P._padUlt = !!I.gamepad.buttons[9];

      cmd.emotePressed = I.wasPressed('emote');
      if (I.wasPressed('swapShoulder')) rig.toggleShoulder();

      return cmd;

      function togglePressed(action, field) {
        if (I.wasPressed(action)) P[field] = !P[field];
        return !!P[field];
      }
    };

    return P;
  };

})(window.HC, window.THREE);
