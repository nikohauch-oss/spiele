/* =========================================================================
 * HYPERCELL — 19_actor.js
 * The combatant. Owns movement, the model + animator, health, weapons and
 * abilities, and exposes the single command interface that both the player
 * controller and the bot brain drive.
 *
 * Movement is where the game lives (brief §15/§16): acceleration curves,
 * turn assist, coyote time, jump buffering, sprint gating, dodges, slides,
 * step-up, weight-scaled bob and lean. Every one of those is here.
 * ========================================================================= */
(function (HC, THREE) {
  'use strict';

  const U = HC.Util;
  const CFG = HC.CFG;

  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  const UPV = new THREE.Vector3(0, 1, 0);

  function blankCommands() {
    return {
      moveX: 0, moveY: 0, lookYaw: 0, lookPitch: 0,
      jump: false, jumpPressed: false, sprint: false, crouch: false,
      dodgePressed: false, fire: false, aim: false, reloadPressed: false,
      swapPressed: false, ability1: false, ability2: false, ultimate: false,
      meleePressed: false, holdBreath: false, emotePressed: false
    };
  }
  HC.blankCommands = blankCommands;

  HC.Actor = function Actor(opts) {
    const charDef = HC.Characters.get(opts.characterId || 'rex');
    const skinId = opts.skinId || HC.defaultSkinFor(charDef.id);

    const A = {
      id: U.uid('actor'),
      name: opts.name || charDef.name,
      characterId: charDef.id,
      charDef,
      skinId,
      team: opts.team || 'A',
      isPlayer: !!opts.isPlayer,
      isBot: !opts.isPlayer,
      ctx: opts.ctx,

      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      yaw: 0, pitch: 0,
      moveInput: { x: 0, y: 0 },
      planarSpeed: 0,
      grounded: true, wasGrounded: true,
      airTime: 0, coyote: 0, jumpBuffer: 0, airJumpsUsed: 0,
      crouchBlend: 0, wantCrouch: false,
      sprinting: false, sprintCharge: 0,
      sliding: false, slideTimer: 0, slideCooldown: 0,
      dodging: false, dodgeTimer: 0, dodgeCooldown: 0, dodgeDir: { x: 0, z: 0 },
      staggerTimer: 0, rootTimer: 0,
      hovering: false, hoverFactor: 0,
      inputLocked: false, controlImmune: false, invulnerable: false,
      cloaked: false, cloakStrength: 0, cloakBlend: 0,
      visionModes: new Set(),
      markedUntil: 0, markedBy: null, markedThroughWalls: false,
      alive: true, deathTime: 0, respawnTimer: 0,
      lastDamageDirection: new THREE.Vector3(),
      score: { kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, objective: 0, streak: 0, bestStreak: 0 },
      carryingObjective: null,
      commands: blankCommands(),
      movementMods: new Map(),
      cameraKick: 0, cameraKickReason: null,
      events: HC.Events('actor'),
      collisionState: { grounded: true, groundSurface: 'concrete', hitWall: false, impactSpeed: 0 },
      lastFootSurface: 'concrete',
      _flash: 0,
      _time: 0
    };

    /* ---- model / animator --------------------------------------------- */
    A.model = HC.CharacterModel.build({
      characterId: charDef.id, skinId, team: A.team, bodyHeight: CFG.body.height
    });
    A.model.root.position.copy(A.position);
    A.animator = HC.Animator(A.model, charDef);

    A.capsuleRadius = CFG.body.radius * U.lerp(0.92, 1.22, U.clamp01((charDef.build.bulk - 0.8) / 0.9));
    A.capsuleHeight = CFG.body.height * charDef.build.heightScale;
    A.crouchHeight = CFG.body.crouchHeight * charDef.build.heightScale;
    A.model.root.scale.setScalar(1);

    /* ---- health -------------------------------------------------------- */
    A.health = HC.HealthComponent(A, charDef);

    /* ---- weapons ------------------------------------------------------- */
    A.weaponSlots = [];
    A.weaponIndex = 0;
    A.weapon = HC.WeaponComponent(A, opts.combatCtx);

    function buildWeaponModel(weaponId) {
      const skinDef = HC.Skins.tryGet(A.skinId) || {};
      const model = HC.WeaponModel.build({
        weaponId,
        palette: Object.assign({}, charDef.palette, skinDef.palette || {}),
        skinMaterials: skinDef.materials || {},
        glowColor: A.model.vfxColors.muzzle
      });
      return model;
    }

    A.setupWeapons = function () {
      A.weaponSlots.forEach(s => { if (s.model) { s.model.root.parent && s.model.root.parent.remove(s.model.root); s.model.dispose(); } });
      A.weaponSlots.length = 0;
      const ids = [charDef.weapon];
      if (charDef.secondary) ids.push(charDef.secondary);
      ids.forEach(id => {
        const wdef = HC.Weapons.get(id);
        const model = buildWeaponModel(id);
        A.weaponSlots.push({ id, def: wdef, model, magazine: null, reserve: null });
      });
      // Akimbo weapons get a mirrored second model in the off hand.
      const primary = A.weaponSlots[0];
      if (primary.def.akimbo) {
        primary.offModel = buildWeaponModel(primary.id);
        primary.offModel.root.scale.x = -1;
      }
      A.weaponIndex = 0;
      attachWeapon(0, true);
    };

    function attachWeapon(index, immediate) {
      const slot = A.weaponSlots[index];
      if (!slot) return;
      A.weaponSlots.forEach((s, i) => {
        if (s.model.root.parent) s.model.root.parent.remove(s.model.root);
        if (s.offModel && s.offModel.root.parent) s.offModel.root.parent.remove(s.offModel.root);
      });
      const socket = A.model.bones.weaponSocket;
      socket.add(slot.model.root);
      slot.model.root.position.set(0, 0, 0);
      slot.model.root.rotation.set(Math.PI * 0.5, 0, 0);
      if (slot.offModel) {
        A.model.bones.offhandSocket.add(slot.offModel.root);
        slot.offModel.root.position.set(0, 0, 0);
        slot.offModel.root.rotation.set(Math.PI * 0.5, 0, 0);
      }
      A.weapon.equip(slot.id, { model: slot.model });
      A.weapon.tracerColor = A.model.vfxColors.tracer;
      A.animator.setWeaponShape(!!slot.def.akimbo, !!slot.def.melee);
      if (!immediate) A.weapon.beginSwap();
      A.events.emit('weaponChanged', slot);
    }

    A.swapWeapon = function () {
      if (A.weaponSlots.length < 2) return false;
      // Preserve each slot's ammo across swaps.
      const cur = A.weaponSlots[A.weaponIndex];
      cur.magazine = A.weapon.magazine; cur.reserve = A.weapon.reserve;
      A.weaponIndex = (A.weaponIndex + 1) % A.weaponSlots.length;
      attachWeapon(A.weaponIndex, false);
      const next = A.weaponSlots[A.weaponIndex];
      if (next.magazine !== null) { A.weapon.magazine = next.magazine; A.weapon.reserve = next.reserve; }
      A.animator.playAction('swap', A.weapon.swapTimer);
      HC.Audio.play('weapon_swap', { position: A.position });
      return true;
    };

    /* ---- abilities ----------------------------------------------------- */
    A.abilities = HC.AbilitySystem(A, opts.abilityCtx || opts.combatCtx);
    A.abilities.setup(charDef);

    /* ---- geometry helpers ---------------------------------------------- */
    A.currentHeight = function () { return U.lerp(A.capsuleHeight, A.crouchHeight, A.crouchBlend); };
    A.eyePosition = function (out) {
      out.copy(A.position);
      out.y += A.currentHeight() - CFG.body.eyeOffset;
      return out;
    };
    A.centerPosition = function (out) {
      out.copy(A.position);
      out.y += A.currentHeight() * 0.55;
      return out;
    };
    A.headPosition = function (out) {
      out.copy(A.position);
      out.y += A.currentHeight() * (CFG.combat.headshotHeightFrac + 0.06);
      return out;
    };
    A.aimDirection = function (out) {
      const cp = Math.cos(A.pitch);
      out.set(Math.sin(A.yaw) * cp, -Math.sin(A.pitch), Math.cos(A.yaw) * cp);
      return out.normalize();
    };
    A.forward = function (out) { return out.set(Math.sin(A.yaw), 0, Math.cos(A.yaw)).normalize(); };
    A.vfxColor = function (kind) { return A.model.vfxColors[kind] || A.model.vfxColors.ability; };

    /* ---- state mutators used by abilities ------------------------------ */
    A.applyImpulse = function (x, y, z, replaceHorizontal) {
      if (replaceHorizontal) { A.velocity.x = x; A.velocity.z = z; }
      else { A.velocity.x += x; A.velocity.z += z; }
      if (y) A.velocity.y = Math.max(A.velocity.y, 0) + y;
    };
    A.setVerticalVelocity = function (v) { A.velocity.y = v; A.grounded = false; A.coyote = 0; };
    A.teleportTo = function (pos) {
      A.position.copy(pos);
      A.model.root.position.copy(pos);
      A.velocity.multiplyScalar(0.2);
      A.events.emit('teleported', pos);
    };
    A.faceTowards = function (pos) {
      _v.copy(pos).sub(A.position);
      A.yaw = Math.atan2(_v.x, _v.z);
    };
    A.setInvulnerable = function (v) { A.invulnerable = v; A.health.invulnerable = v; };
    A.setControlImmune = function (v) { A.controlImmune = v; if (v) { A.staggerTimer = 0; A.rootTimer = 0; } };
    A.setInputLocked = function (v) { A.inputLocked = v; };
    A.setHovering = function (v, factor) { A.hovering = v; A.hoverFactor = factor === undefined ? 0.5 : factor; };
    A.setVision = function (mode, on) { if (on) A.visionModes.add(mode); else A.visionModes.delete(mode); };
    A.addStagger = function (t) { if (!A.controlImmune) A.staggerTimer = Math.max(A.staggerTimer, t); };
    A.addRoot = function (t) { if (!A.controlImmune) A.rootTimer = Math.max(A.rootTimer, t); };
    A.setCameraKick = function (amount, reason) {
      A.cameraKick = Math.max(A.cameraKick, amount);
      A.cameraKickReason = reason;
    };

    A.setCloaked = function (v) {
      A.cloaked = v;
      if (v) A.cloakStrength = 0.9;
      A.events.emit('cloak', v);
    };
    A.setCloakStrength = function (s) { A.cloakStrength = U.clamp01(s); };

    A.addMovementModifier = function (id, mods, duration) {
      A.movementMods.set(id, Object.assign({ speedMul: 1, accelMul: 1, control: 1, airControl: 1, timer: duration || Infinity }, mods));
    };
    A.removeMovementModifier = function (id) { A.movementMods.delete(id); };
    A.movementMultiplier = function (field) {
      let f = 1;
      for (const m of A.movementMods.values()) f *= (m[field] === undefined ? 1 : m[field]);
      return f;
    };

    A.addWeaponModifier = function (id, mods) {
      A._weaponMods = A._weaponMods || new Map();
      A._weaponMods.set(id, mods);
      recomputeWeaponMods();
    };
    A.removeWeaponModifier = function (id) {
      if (!A._weaponMods) return;
      A._weaponMods.delete(id);
      recomputeWeaponMods();
    };
    function recomputeWeaponMods() {
      const m = A.weapon.mods;
      m.fireRate = 1; m.damage = 1; m.reload = 1; m.spread = 1; m.swap = 1;
      if (!A._weaponMods) return;
      for (const mod of A._weaponMods.values()) {
        if (mod.fireRate) m.fireRate *= mod.fireRate;
        if (mod.damage) m.damage *= mod.damage;
        if (mod.reload) m.reload *= mod.reload;
        if (mod.spread) m.spread *= mod.spread;
        if (mod.swap) m.swap *= mod.swap;
      }
    }

    A.onUltimateUsed = function () { A.events.emit('ultimateUsed'); };

    /* ---- spawn / death ------------------------------------------------- */
    A.spawn = function (spawnPoint) {
      A.position.copy(spawnPoint.position);
      A.yaw = spawnPoint.yaw || 0;
      A.pitch = 0;
      A.velocity.set(0, 0, 0);
      A.alive = true;
      A.grounded = true;
      A.airTime = 0; A.airJumpsUsed = 0;
      A.crouchBlend = 0; A.sliding = false; A.dodging = false;
      A.staggerTimer = 0; A.rootTimer = 0;
      A.sprinting = false; A.sprintCharge = 0;
      A.cloaked = false; A.cloakBlend = 0; A.cloakStrength = 0;
      A.carryingObjective = null;
      A.markedUntil = 0;
      A.movementMods.clear();
      if (A._weaponMods) A._weaponMods.clear();
      recomputeWeaponMods();
      A.health.reset();
      A.abilities.reset();
      A.animator.reset();
      A.animator.setPoseOverride(null);
      A.weapon.refillAmmo();
      A.weaponSlots.forEach(s => { s.magazine = null; s.reserve = null; });
      if (A.weaponIndex !== 0) { A.weaponIndex = 0; attachWeapon(0, true); }
      A.model.root.position.copy(A.position);
      A.model.root.rotation.set(0, A.yaw, 0);
      A.model.root.visible = true;
      A.model.setOpacity(1);
      A.setInvulnerable(false);
      A.setInputLocked(false);
      A.setControlImmune(false);
      A.animator.playAction('spawn', 0.55);
      HC.Audio.play('respawn', { position: A.position, pitch: charDef.voice.pitch, important: A.isPlayer });
      HC.VFX.burst(A.position, A.model.teamColor, 30, 7, { upBias: 0.9, spread: 0.6, life: 0.7 });
      A.events.emit('spawned');
    };

    A.die = function (info) {
      if (!A.alive) return;
      A.alive = false;
      A.health.alive = false;
      A.deathTime = A._time;
      A.respawnTimer = CFG.combat.respawnTime;
      A.score.deaths++;
      A.score.streak = 0;
      A.velocity.set(0, 0, 0);
      A.abilities.cancelAll();
      A.weapon.setTrigger(false);
      A.setCloaked(false);
      A.movementMods.clear();
      const dir = info && info.direction ? info.direction : _v.set(0, 0, 1);
      A.animator.startDeath(-dir.x, -dir.z);
      HC.Audio.play('death', { position: A.position, pitch: charDef.voice.pitch, important: A.isPlayer });
      HC.VFX.burst(A.centerPosition(_v2), A.model.teamColor, 26, 6, { spread: 0.5, life: 0.7 });
      A.events.emit('died', info);
    };

    /* ---- damage feedback ----------------------------------------------- */
    A.health.events.on('damaged', (e) => {
      A._flash = 1;
      const dir = e.info.direction || _v.set(0, 0, 1);
      A.lastDamageDirection.copy(dir);
      // Convert the incoming direction into the actor's local frame for the flinch.
      const cos = Math.cos(-A.yaw), sin = Math.sin(-A.yaw);
      const lx = dir.x * cos - dir.z * sin;
      const lz = dir.x * sin + dir.z * cos;
      const power = U.clamp01(e.result.applied / 60);
      A.animator.addHitReaction(-lx, -lz, 0.35 + power * 0.65);
      if (e.info.knockback && !A.controlImmune) {
        A.velocity.x += dir.x * e.info.knockback;
        A.velocity.z += dir.z * e.info.knockback;
        if (e.info.knockback > 6) A.velocity.y = Math.max(A.velocity.y, e.info.knockback * 0.28);
      }
      if (A.cloaked) A.setCloakStrength(0.30);
      A.events.emit('damaged', e);
    });
    A.health.events.on('died', (e) => A.die(e.info));
    A.health.events.on('shieldBreak', () => {
      HC.Audio.play('shield_break', { position: A.position, important: A.isPlayer });
      HC.VFX.burst(A.centerPosition(_v), HC.PALETTE.shield, 18, 5, { spread: 0.5 });
    });

    /* ==================================================================== *
     * MOVEMENT
     * ==================================================================== */
    function updateMovement(dt, cmd) {
      const speedScale = charDef.speedScale || 1;
      const weight = charDef.gait.weight || 1;
      const modSpeed = A.movementMultiplier('speedMul');
      const modAccel = A.movementMultiplier('accelMul');

      /* --- crouch --- */
      const wantCrouch = cmd.crouch && A.grounded && !A.sliding;
      const canStand = !A.ctx.world.capsuleBlocked(A.position.x, A.position.y + 0.05, A.position.z,
        A.capsuleRadius, A.capsuleHeight);
      A.wantCrouch = wantCrouch || (A.crouchBlend > 0.02 && !canStand);
      A.crouchBlend = U.damp(A.crouchBlend, A.wantCrouch ? 1 : 0, CFG.body.crouchLerpRate, dt);

      /* --- desired direction in world space --- */
      const f = A.forward(_v);
      const r = _v2.set(f.z, 0, -f.x);
      let wishX = f.x * cmd.moveY + r.x * cmd.moveX;
      let wishZ = f.z * cmd.moveY + r.z * cmd.moveX;
      const wishLen = Math.hypot(wishX, wishZ);
      if (wishLen > 0.0001) { wishX /= wishLen; wishZ /= wishLen; }
      A.moveInput.x = cmd.moveX; A.moveInput.y = cmd.moveY;

      /* --- sprint gating --- */
      const forwardDot = wishLen > 0.05 ? (wishX * f.x + wishZ * f.z) : 0;
      const wantSprint = cmd.sprint && A.grounded && !A.wantCrouch &&
        wishLen > 0.4 && forwardDot > CFG.move.sprintForwardDot &&
        !A.weapon.wantAim && !A.weapon.reloading;
      if (wantSprint) A.sprintCharge = Math.min(1, A.sprintCharge + dt / CFG.move.sprintChargeTime);
      else A.sprintCharge = Math.max(0, A.sprintCharge - dt / (CFG.move.sprintChargeTime * 0.6));
      A.sprinting = A.sprintCharge > 0.55 && wantSprint;
      if (A.sprinting) A.weapon.setAim(false);

      /* --- slide --- */
      if (A.slideCooldown > 0) A.slideCooldown -= dt;
      if (!A.sliding && cmd.crouch && A.sprinting && A.planarSpeed > CFG.move.slideMinSpeed && A.slideCooldown <= 0) {
        A.sliding = true;
        A.slideTimer = CFG.move.slideDuration;
        A.slideCooldown = CFG.move.slideCooldown;
        HC.Audio.play('slide', { position: A.position });
        HC.VFX.dust(A.position, 8, 0.6);
        A.events.emit('slide');
      }
      if (A.sliding) {
        A.slideTimer -= dt;
        const friction = Math.exp(-CFG.move.slideFriction * dt);
        A.velocity.x *= friction; A.velocity.z *= friction;
        if (A.slideTimer <= 0 || !A.grounded || A.planarSpeed < 2.4) A.sliding = false;
      }

      /* --- dodge --- */
      if (A.dodgeCooldown > 0) A.dodgeCooldown -= dt;
      if (A.dodging) {
        A.dodgeTimer -= dt;
        if (A.dodgeTimer <= 0) {
          A.dodging = false;
          A.health.removeReduction('dodge');
        } else if (A.dodgeTimer < CFG.move.dodgeDuration - CFG.move.dodgeIFrames) {
          A.health.removeReduction('dodge');
        }
      }
      if (cmd.dodgePressed && !A.dodging && A.dodgeCooldown <= 0 && !A.inputLocked && A.rootTimer <= 0) {
        let dx = wishX, dz = wishZ;
        if (wishLen < 0.05) { dx = -f.x; dz = -f.z; }
        A.dodging = true;
        A.dodgeTimer = CFG.move.dodgeDuration;
        A.dodgeCooldown = CFG.move.dodgeCooldown;
        A.dodgeDir.x = dx; A.dodgeDir.z = dz;
        A.velocity.x = dx * CFG.move.dodgeSpeed * modSpeed;
        A.velocity.z = dz * CFG.move.dodgeSpeed * modSpeed;
        if (A.grounded) A.velocity.y = CFG.move.dodgeUpKick;
        A.health.addReduction('dodge', 1 - CFG.move.dodgeDamageReduction);
        A.animator.playAction('dodge_roll', CFG.move.dodgeDuration + 0.06, { x: cmd.moveX, z: cmd.moveY });
        A.weapon.cancelReload();
        HC.Audio.play('dodge', { position: A.position, pitch: charDef.voice.pitch });
        HC.VFX.dust(A.position, 6, 0.5);
        A.setCameraKick(0.12, 'dodge');
        A.events.emit('dodge');
      }

      /* --- target speed --- */
      let target = CFG.move.runSpeed;
      if (A.sprinting) target = CFG.move.sprintSpeed;
      else if (A.wantCrouch) target = CFG.move.crouchSpeed;
      else if (A.weapon.aim > 0.2) target = U.lerp(CFG.move.runSpeed, CFG.move.runSpeed * CFG.move.aimMul, A.weapon.aim);
      if (cmd.moveY < -0.1) target *= CFG.move.backpedalMul;
      else if (Math.abs(cmd.moveX) > 0.6 && Math.abs(cmd.moveY) < 0.4) target *= CFG.move.strafeMul;
      target *= speedScale * modSpeed * wishLen;
      if (A.weapon.def && A.weapon.def.moveSpeedWhileFiring && A.weapon.firing) {
        target *= A.weapon.def.moveSpeedWhileFiring;
      }
      if (A.staggerTimer > 0) target *= 0.35;
      if (A.rootTimer > 0) target = 0;

      /* --- acceleration --- */
      if (!A.dodging && !A.sliding) {
        const curX = A.velocity.x, curZ = A.velocity.z;
        const desX = wishX * target, desZ = wishZ * target;
        if (A.grounded) {
          // Reversing direction gets extra acceleration ("turn assist") so
          // quick strafe swaps feel instant without making the base accel floaty.
          const dot = (curX * desX + curZ * desZ);
          const reversing = dot < 0 ? 1 : 0;
          const accel = (wishLen > 0.05 ? CFG.move.groundAccel : CFG.move.groundDecel) * modAccel
            + reversing * CFG.move.turnAssist;
          const w = A.movementMultiplier('control') / Math.max(0.6, weight * 0.55 + 0.45);
          A.velocity.x = U.approach(curX, desX, accel * w * dt);
          A.velocity.z = U.approach(curZ, desZ, accel * w * dt);
        } else {
          const airCtl = CFG.move.airControl * A.movementMultiplier('airControl');
          const accel = CFG.move.airAccel * airCtl * modAccel;
          A.velocity.x = U.approach(curX, desX, accel * dt);
          A.velocity.z = U.approach(curZ, desZ, accel * dt);
          const drag = Math.exp(-CFG.move.airDrag * dt);
          if (wishLen < 0.05) { A.velocity.x *= drag; A.velocity.z *= drag; }
        }
      }

      /* --- jump --- */
      if (A.coyote > 0) A.coyote -= dt;
      if (A.jumpBuffer > 0) A.jumpBuffer -= dt;
      if (cmd.jumpPressed) A.jumpBuffer = CFG.move.jumpBuffer;
      const canJump = (A.grounded || A.coyote > 0) && A.rootTimer <= 0 && !A.inputLocked;
      if (A.jumpBuffer > 0 && canJump) {
        A.jumpBuffer = 0;
        A.coyote = 0;
        A.sliding = false;
        A.velocity.y = CFG.move.jumpVelocity * U.lerp(1.0, 0.86, U.clamp01((weight - 1) / 1.4));
        A.grounded = false;
        A.airJumpsUsed = 0;
        HC.Audio.play('jump', { position: A.position, weight, pitch: charDef.voice.pitch });
        A.events.emit('jump');
      }
      if (!cmd.jump && A.velocity.y > 0 && !A.grounded) {
        A.velocity.y *= Math.pow(CFG.move.jumpCutMultiplier, dt * 22);
      }

      /* --- gravity --- */
      if (!A.grounded) {
        const g = CFG.sim.gravity * (A.hovering ? A.hoverFactor * 0.12 : 1);
        A.velocity.y -= g * dt;
        if (A.hovering) A.velocity.y = Math.max(A.velocity.y, -1.2);
        A.velocity.y = Math.max(A.velocity.y, -CFG.sim.terminalVelocity);
      }

      /* --- integrate --- */
      A.wasGrounded = A.grounded;
      const st = A.collisionState;
      st.grounded = A.grounded;
      st.impactSpeed = 0;
      A.ctx.world.moveCapsule(A.position, A.velocity, A.capsuleRadius, A.currentHeight(), dt, st);
      A.grounded = st.grounded;

      if (A.grounded) {
        A.coyote = CFG.move.coyoteTime;
        A.airTime = 0;
        A.lastFootSurface = st.groundSurface || 'concrete';
        if (!A.wasGrounded) onLanded(st.impactSpeed);
      } else {
        A.airTime += dt;
      }

      A.planarSpeed = Math.hypot(A.velocity.x, A.velocity.z);
      if (A.staggerTimer > 0) A.staggerTimer -= dt;
      if (A.rootTimer > 0) A.rootTimer -= dt;

      // Movement modifiers expire on their own timers.
      for (const [id, m] of A.movementMods) {
        if (m.timer !== Infinity) { m.timer -= dt; if (m.timer <= 0) A.movementMods.delete(id); }
      }
    }

    function onLanded(impactSpeed) {
      A.airJumpsUsed = 0;
      A.abilities.onLand();
      const speed = impactSpeed || 0;
      const weight = charDef.gait.weight || 1;
      if (speed > CFG.move.landHardThreshold) {
        A.animator.addLandDip(1.1);
        A.setCameraKick(0.45, 'hardLand');
        A.staggerTimer = Math.max(A.staggerTimer, CFG.move.landHardStun);
        HC.Audio.play('land_hard', { position: A.position, weight, important: A.isPlayer });
        HC.VFX.dust(A.position, 14, 1.0);
        if (speed > CFG.move.fallDamageThreshold) {
          const dmg = (speed - CFG.move.fallDamageThreshold) * CFG.move.fallDamagePerUnit;
          A.health.applyDamage({ amount: dmg, type: 'physical', attacker: null, source: 'fall' });
        }
      } else if (speed > CFG.move.landSoftThreshold) {
        A.animator.addLandDip(0.5);
        A.setCameraKick(0.16, 'land');
        HC.Audio.play('land_soft', { position: A.position, weight });
        HC.VFX.dust(A.position, 6, 0.6);
      }
      A.events.emit('landed', speed);
    }

    /* ==================================================================== *
     * MAIN UPDATE
     * ==================================================================== */
    A.update = function (dt, cmd) {
      A._time += dt;
      A.commands = cmd;

      if (!A.alive) {
        A.respawnTimer -= dt;
        A.animator.input.dead = true;
        A.animator.update(dt);
        A.model.root.position.copy(A.position);
        applyRootTilt();
        return;
      }

      /* look */
      if (!A.inputLocked) {
        A.yaw -= cmd.lookYaw;
        A.pitch = U.clamp(A.pitch + cmd.lookPitch, CFG.camera.pitchMin, CFG.camera.pitchMax);
      }
      A.yaw = ((A.yaw + Math.PI) % U.TAU + U.TAU) % U.TAU - Math.PI;

      /* movement */
      const effective = A.inputLocked ? blankCommands() : cmd;
      updateMovement(dt, effective);

      /* health */
      A.health.update(dt);

      /* weapons */
      A.weapon.setTrigger(!A.inputLocked && effective.fire && !A.sprinting && A.rootTimer <= 0);
      A.weapon.setAim(!A.inputLocked && effective.aim);
      A.weapon.holdingBreath = !!effective.holdBreath;
      if (effective.reloadPressed) A.weapon.startReload();
      if (effective.swapPressed) A.swapWeapon();
      if (effective.emotePressed) A.playEmote();

      A.weapon.update(dt, {
        eye: A.eyePosition(_v3),
        aimDir: A.aimDirection(_v2),
        moving: A.planarSpeed > 0.6,
        speedFrac: U.clamp01(A.planarSpeed / (CFG.move.runSpeed * (charDef.speedScale || 1))),
        grounded: A.grounded,
        crouching: A.crouchBlend > 0.5,
        sprinting: A.sprinting,
        sliding: A.sliding
      });

      /* abilities */
      if (!A.inputLocked) {
        if (effective.ability1) A.abilities.activate('ability1');
        if (effective.ability2) A.abilities.activate('ability2');
        if (effective.ultimate) A.abilities.activate('ultimate');
      }
      A.abilities.update(dt);

      /* cloak visuals */
      const cloakTarget = A.cloaked ? A.cloakStrength : 0;
      A.cloakBlend = U.damp(A.cloakBlend, cloakTarget, 7.0, dt);
      if (A.cloakBlend > 0.01) {
        A.model.setOpacity(1 - A.cloakBlend * 0.94);
        A.weaponSlots.forEach(s => s.model.setOpacity(1 - A.cloakBlend * 0.94));
      } else if (A._lastCloak > 0.01) {
        A.model.setOpacity(1);
        A.weaponSlots.forEach(s => s.model.setOpacity(1));
      }
      A._lastCloak = A.cloakBlend;

      /* damage flash */
      if (A._flash > 0) {
        A._flash = Math.max(0, A._flash - dt * 6.5);
        A.model.setFlash(A._flash * 0.55, 0xff5566);
      }

      /* animation inputs */
      const an = A.animator.input;
      const cos = Math.cos(-A.yaw), sin = Math.sin(-A.yaw);
      an.speed = A.planarSpeed;
      an.localVelX = A.velocity.x * cos - A.velocity.z * sin;
      an.localVelZ = A.velocity.x * sin + A.velocity.z * cos;
      an.grounded = A.grounded;
      an.crouch = A.crouchBlend;
      an.aiming = A.weapon.aim;
      an.sprinting = A.sprinting;
      an.sliding = A.sliding;
      an.airTime = A.airTime;
      an.verticalVel = A.velocity.y;
      an.lookPitch = A.pitch;
      an.turnRate = U.clamp(-cmd.lookYaw / Math.max(dt, 0.001) * 0.02, -3, 3);
      an.dead = false;
      A.animator.update(dt);

      /* footsteps */
      const steps = A.animator.consumeFootsteps();
      for (let i = 0; i < steps.length; i++) {
        HC.Audio.play('footstep', {
          position: A.position, material: surfaceToAudio(A.lastFootSurface),
          weight: charDef.gait.weight, pitch: 0.94 + Math.random() * 0.12,
          volume: A.sprinting ? 1.15 : (A.crouchBlend > 0.5 ? 0.35 : 0.8)
        });
        if (A.sprinting) HC.VFX.dust(A.position, 2, 0.3);
      }

      /* transforms */
      A.model.root.position.copy(A.position);
      A.model.root.rotation.y = A.yaw;
      applyRootTilt();

      /* Weapon aiming. Rather than guessing a fixed offset in the hand's
       * frame, solve it: take the world aim direction, express it in the
       * socket's local space, and rotate the weapon's +Z onto it. The muzzle
       * then provably points at the crosshair — which is also where the
       * tracer originates, so the two can never disagree. */
      aimHeldWeapon();

      /* marked state decays */
      if (A.markedUntil > 0 && A._time > A.markedUntil) { A.markedUntil = 0; A.markedBy = null; }

      A.cameraKick = Math.max(0, A.cameraKick - dt * 4);
    };

    const _aimM = new THREE.Matrix4();
    const _aimLocal = new THREE.Vector3();
    const FORWARD_Z = new THREE.Vector3(0, 0, 1);
    const MELEE_REST = new THREE.Euler(Math.PI * 0.5, 0, 0);

    function orientToAim(model, bone) {
      bone.updateWorldMatrix(true, false);
      _aimM.copy(bone.matrixWorld).invert();
      _aimLocal.copy(A.aimDirection(_v3)).transformDirection(_aimM);
      if (_aimLocal.lengthSq() < 1e-8) return;
      _aimLocal.normalize();
      model.root.quaternion.setFromUnitVectors(FORWARD_Z, _aimLocal);
    }

    function aimHeldWeapon() {
      const slot = A.weaponSlots[A.weaponIndex];
      if (!slot || !slot.model) return;

      if (slot.def.melee) {
        // Blades follow the hand — pointing them at the crosshair looks wrong.
        slot.model.root.rotation.copy(MELEE_REST);
        return;
      }

      orientToAim(slot.model, A.model.bones.weaponSocket);
      // Sprinting drops the muzzle into a low-ready carry.
      if (A.sprinting || A.sliding) slot.model.root.rotateX(0.62);
      if (slot.offModel) orientToAim(slot.offModel, A.model.bones.offhandSocket);
    }

    function applyRootTilt() {
      const rt = A.animator.current.rootTilt;
      A.model.root.rotation.set(rt[0], A.yaw + rt[1], rt[2]);
    }

    function surfaceToAudio(s) {
      switch (s) {
        case 'metal': return 'metal';
        case 'grate': return 'grate';
        case 'grass': return 'grass';
        case 'glass': return 'glass';
        default: return 'concrete';
      }
    }

    /* ---- misc ---------------------------------------------------------- */
    A.isVisibleTo = function (viewerTeam, now) {
      if (!A.alive) return false;
      if (A.team === viewerTeam) return true;
      if (A.markedUntil > now) return true;
      return A.cloakBlend < 0.6;
    };

    A.setPoseOverride = function (pose) { A.animator.setPoseOverride(pose); };

    /** Character-expression emote. Cancelled by anything that matters. */
    const EMOTES = ['wave', 'flex', 'taunt', 'point'];
    A.playEmote = function (kind) {
      if (!A.alive || !A.grounded || A.planarSpeed > 1.2 || A.weapon.firing) return false;
      const personality = charDef.personality || {};
      const chosen = kind || (personality.tauntPose ? 'taunt' : U.pick(Math.random, EMOTES));
      A.animator.playAction('emote', 1.5, { kind: chosen });
      HC.Audio.play('ui_click', { position: A.position, pitch: charDef.voice.pitch, volume: 0.5 });
      A.events.emit('emote', chosen);
      return true;
    };

    A.dispose = function () {
      A.weaponSlots.forEach(s => {
        if (s.model.root.parent) s.model.root.parent.remove(s.model.root);
        s.model.dispose();
        if (s.offModel) s.offModel.dispose();
      });
      if (A.model.root.parent) A.model.root.parent.remove(A.model.root);
      A.model.dispose();
      A.events.clear();
    };

    A.setupWeapons();
    return A;
  };

})(window.HC, window.THREE);
