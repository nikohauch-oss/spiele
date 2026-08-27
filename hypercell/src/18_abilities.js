/* =========================================================================
 * HYPERCELL — 18_abilities.js
 * Modular ability framework plus the full 24-ability roster (two actives
 * and one ultimate per hero). Each ability is a data record with optional
 * lifecycle hooks; the framework owns cooldowns, charges, cast time,
 * duration, animation, audio and UI state.
 * ========================================================================= */
(function (HC, THREE) {
  'use strict';

  const U = HC.Util;
  const CFG = HC.CFG;
  const Mats = HC.Mats;

  const Abilities = HC.Abilities = HC.Registry('Abilities', function (id) {
    return {
      id: id || 'missing', name: 'Unknown', description: 'Missing ability definition.',
      icon: 'M4 4 H20 V20 H4 Z', cooldown: 6, charges: 1, duration: 0, castTime: 0,
      missing: true, onActivate() { return false; }
    };
  });
  const def = Abilities.define.bind(Abilities);

  /* ------------------------------------------------------------------ *
   * Shared helpers used by many abilities
   * ------------------------------------------------------------------ */
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

  function forwardFlat(actor, out) {
    out.set(Math.sin(actor.yaw), 0, Math.cos(actor.yaw));
    return out.normalize();
  }

  function enemiesInRadius(ctx, actor, center, radius, includeSelf) {
    const out = [];
    for (let i = 0; i < ctx.actors.length; i++) {
      const a = ctx.actors[i];
      if (!a.health.alive) continue;
      if (a === actor && !includeSelf) continue;
      if (a !== actor && a.team === actor.team && !CFG.combat.friendlyFire) continue;
      if (a.position.distanceTo(center) <= radius + CFG.body.radius) out.push(a);
    }
    return out;
  }

  function alliesInRadius(ctx, actor, center, radius) {
    const out = [];
    for (let i = 0; i < ctx.actors.length; i++) {
      const a = ctx.actors[i];
      if (!a.health.alive) continue;
      if (a.team !== actor.team) continue;
      if (a.position.distanceTo(center) <= radius) out.push(a);
    }
    return out;
  }

  /** Finds the furthest unobstructed point along a direction. */
  function safeTeleportPoint(ctx, actor, dir, maxDist, out) {
    const eye = _v3.copy(actor.position); eye.y += CFG.body.height * 0.5;
    const hit = ctx.world.raycast(eye, dir, maxDist, null, 'movement');
    let dist = hit ? Math.max(0, hit.distance - CFG.body.radius * 1.6) : maxDist;
    // Walk backwards until the capsule fits, so we never land inside geometry.
    for (let d = dist; d > 0.4; d -= 0.4) {
      out.copy(actor.position).addScaledVector(dir, d);
      out.y = actor.position.y;
      const g = ctx.world.groundHeight(out.x, out.y + CFG.body.stepHeight + 0.3, out.z, 6);
      if (g.y > -Infinity) out.y = g.y;
      if (!ctx.world.capsuleBlocked(out.x, out.y + 0.05, out.z, CFG.body.radius, CFG.body.height)) return true;
    }
    out.copy(actor.position);
    return false;
  }

  /* ------------------------------------------------------------------ *
   * Deployable base — anything an ability leaves in the world.
   * ------------------------------------------------------------------ */
  function Deployable(opts) {
    const D = Object.assign({
      root: null, owner: null, team: null, life: 10, alive: true,
      update() {}, onExpire() {}, onDestroy() {},
      health: 0, maxHealth: 0, radius: 0.6, targetable: false
    }, opts);
    D.kill = function () {
      if (!D.alive) return;
      D.alive = false;
      D.onDestroy();
    };
    D.tick = function (dt, ctx) {
      if (!D.alive) return;
      D.life -= dt;
      if (D.life <= 0) { D.alive = false; D.onExpire(); return; }
      D.update(dt, ctx);
    };
    return D;
  }
  HC.Deployable = Deployable;

  /* ================================================================== *
   * REX
   * ================================================================== */
  def('combat_dash', {
    name: 'Combat Dash', short: 'DASH', slot: 1,
    description: 'Burst forward. Refunds a fraction of the cooldown on an elimination.',
    icon: 'M3 12 H14 M10 7 L15 12 L10 17 M17 6 V18 M20 8 V16',
    cooldown: 5.0, charges: 2, duration: 0.30, castTime: 0,
    animation: null, sound: 'ability_dash',
    onActivate(A, actor, ctx) {
      const dir = _v.set(actor.moveInput.x, 0, actor.moveInput.y);
      if (dir.lengthSq() < 0.05) forwardFlat(actor, dir);
      else {
        // Dash follows the input direction, rotated into world space.
        const f = forwardFlat(actor, _v2);
        const r = _v3.set(f.z, 0, -f.x);
        dir.set(f.x * actor.moveInput.y + r.x * actor.moveInput.x, 0,
                f.z * actor.moveInput.y + r.z * actor.moveInput.x).normalize();
      }
      actor.applyImpulse(dir.x * 19.5, 1.4, dir.z * 19.5, true);
      actor.addMovementModifier('combat_dash', { speedMul: 1.0, control: 0.35 }, 0.30);
      actor.animator.playAction('dodge_roll', 0.30, { x: actor.moveInput.x, z: Math.max(0.4, actor.moveInput.y) });
      A.data.trail = HC.VFX.attachTrail(actor.model.root, {
        rate: 110, color0: 0xffffff, color1: actor.vfxColor('ability'),
        size0: 0.30, size1: 0.02, life: 0.32, spread: 0.30, drag: 3.2, offsetY: 0.9
      });
      HC.VFX.burst(actor.position, actor.vfxColor('ability'), 22, 7, { upBias: 0.7, spread: 0.4 });
      actor.setCameraKick(0.20, 'dash');
      return true;
    },
    onEnd(A, actor) { if (A.data.trail) A.data.trail.stop(); },
    onKillCredit(A) { A.cooldown = Math.max(0, A.cooldown - 1.6); }
  });

  def('overcharge', {
    name: 'Overcharge', short: 'O-CHG', slot: 2,
    description: 'Overclocks the Pulse Rifle: +38% fire rate, +18% damage, 45% faster reloads.',
    icon: 'M13 2 L4 14 H11 L10 22 L20 9 H13 Z',
    cooldown: 12.0, charges: 1, duration: 6.0, castTime: 0,
    sound: 'ability_charge', animation: 'cast_self',
    onActivate(A, actor) {
      actor.addWeaponModifier('overcharge', { fireRate: 1.38, damage: 1.18, reload: 0.55, spread: 0.86 });
      actor.model.setEmissiveBoost(1.5);
      A.data.trail = HC.VFX.attachTrail(actor.model.bones.chest, {
        rate: 26, color0: 0xffffff, color1: actor.vfxColor('ability'),
        size0: 0.14, size1: 0.01, life: 0.5, spread: 0.45, drag: 1.6, gravity: -0.6
      });
      HC.Audio.play('ability_charge', { position: actor.position, dur: 0.7 });
      return true;
    },
    onUpdate(A, actor, ctx, dt) {
      if (Math.random() < dt * 12) {
        HC.VFX.burst(actor.eyePosition(_v), actor.vfxColor('ability'), 2, 2.5,
          { spread: 0.5, life: 0.35, size: 0.09, light: false });
      }
    },
    onEnd(A, actor) {
      actor.removeWeaponModifier('overcharge');
      actor.model.setEmissiveBoost(0);
      if (A.data.trail) A.data.trail.stop();
    }
  });

  def('shock_rocket', {
    name: 'Shock Rocket', short: 'ROCKET', slot: 'ultimate',
    description: 'Fires a heavy shock warhead. Massive area damage and knockback on impact.',
    icon: 'M12 2 C15 6 16 10 16 13 L16 18 L12 22 L8 18 L8 13 C8 10 9 6 12 2 Z M6 15 L4 20 M18 15 L20 20',
    cooldown: 0, charges: 1, duration: 0, castTime: 0.34,
    ultimate: true, sound: 'ult_cast', animation: 'cast_forward',
    onActivate(A, actor, ctx) {
      const eye = actor.eyePosition(_v);
      const dir = actor.aimDirection(_v2);
      ctx.spawnProjectile({
        owner: actor,
        weapon: { id: 'shock_rocket', damage: 165, damageType: 'shock' },
        origin: eye.clone().addScaledVector(dir, 0.9),
        direction: dir.clone(), speed: 44,
        config: {
          speed: 44, gravity: 0, radius: 0.42, bounce: 0, bounces: 0, life: 4.5,
          fuse: 0, detonateOnEnemy: true,
          splash: { radius: 8.5, innerRadius: 2.2, minFrac: 0.42, knockback: 22, selfKnockback: 0 },
          color: 0x67e8ff, trailColor: 0x2ea8ff, model: 'plasma'
        }
      });
      actor.setCameraKick(0.55, 'ultimate');
      actor.applyImpulse(-dir.x * 3.2, 0, -dir.z * 3.2, false);
      HC.VFX.burst(eye, 0x67e8ff, 30, 9, { spread: 0.4, life: 0.5 });
      return true;
    }
  });

  /* ================================================================== *
   * MAYA
   * ================================================================== */
  def('air_jump', {
    name: 'Air Jump', short: 'AIR', slot: 1,
    description: 'A second jump, in mid-air, in any direction. Refreshes on landing.',
    icon: 'M12 21 L5 13 H9 V9 H15 V13 H19 Z M6 4 H18',
    cooldown: 3.2, charges: 1, duration: 0, castTime: 0,
    sound: 'jump',
    canActivate(actor) { return !actor.grounded; },
    onActivate(A, actor) {
      const dir = _v.set(actor.moveInput.x, 0, actor.moveInput.y);
      let px = 0, pz = 0;
      if (dir.lengthSq() > 0.05) {
        const f = forwardFlat(actor, _v2);
        const r = _v3.set(f.z, 0, -f.x);
        px = (f.x * actor.moveInput.y + r.x * actor.moveInput.x) * 6.4;
        pz = (f.z * actor.moveInput.y + r.z * actor.moveInput.x) * 6.4;
      }
      actor.setVerticalVelocity(CFG.move.jumpVelocity * 0.96);
      actor.applyImpulse(px, 0, pz, false);
      HC.VFX.burst(actor.position, actor.vfxColor('ability'), 20, 6, { upBias: -0.4, spread: 0.35, life: 0.45 });
      HC.VFX.dust(actor.position, 4, 0.5, 0xc0d8ff);
      return true;
    }
  });

  def('hologram', {
    name: 'Hologram', short: 'HOLO', slot: 2,
    description: 'Deploys a running decoy that draws fire and detonates in a flash when destroyed.',
    icon: 'M8 3 H16 V21 H8 Z M4 7 V17 M20 7 V17',
    cooldown: 13.0, charges: 1, duration: 6.5, castTime: 0.18,
    animation: 'cast_forward', sound: 'ability_deploy',
    onActivate(A, actor, ctx) {
      const model = HC.CharacterModel.build({
        characterId: actor.characterId, skinId: actor.skinId,
        team: actor.team, bodyHeight: CFG.body.height
      });
      model.setOpacity(0.55);
      model.setEmissiveBoost(1.4);
      model.root.position.copy(actor.position);
      model.root.rotation.y = actor.yaw;
      ctx.scene.add(model.root);

      const animator = HC.Animator(model, HC.Characters.get(actor.characterId));
      animator.setWeaponShape(true, false);
      const dir = forwardFlat(actor, new THREE.Vector3());
      const speed = 7.2;

      const dep = Deployable({
        owner: actor, team: actor.team, life: 6.5, targetable: true,
        health: 90, maxHealth: 90, radius: CFG.body.radius, kind: 'hologram',
        hitFeetOffset: 0, hitHeight: CFG.body.height,
        position: model.root.position, model,
        update(dt, c) {
          // Runs forward, steering around walls so it stays believable.
          const probe = _v.copy(model.root.position); probe.y += 0.9;
          const hit = c.world.raycast(probe, dir, 2.4, null, 'movement');
          if (hit) {
            dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() > 0.5 ? 1 : -1) * 1.1);
            dir.y = 0; dir.normalize();
          }
          const next = _v2.copy(model.root.position).addScaledVector(dir, speed * dt);
          const g = c.world.groundHeight(next.x, next.y + CFG.body.stepHeight + 0.4, next.z, 3.5);
          if (g.y > -Infinity) next.y = g.y;
          if (!c.world.capsuleBlocked(next.x, next.y + 0.05, next.z, CFG.body.radius, CFG.body.height)) {
            model.root.position.copy(next);
          }
          model.root.rotation.y = Math.atan2(dir.x, dir.z);
          animator.input.speed = speed;
          animator.input.grounded = true;
          animator.input.moveIntensity = 1;
          animator.update(dt);
          model.setOpacity(0.42 + Math.sin(performance.now() * 0.008) * 0.12);
        },
        onExpire() { cleanup(false); },
        onDestroy() { cleanup(true); }
      });

      function cleanup(destroyed) {
        HC.VFX.burst(model.root.position, actor.vfxColor('ability'), destroyed ? 34 : 16, 8,
          { spread: 0.6, upBias: 0.6, life: 0.5 });
        HC.Audio.play(destroyed ? 'ability_shield_break' : 'ability_cloak',
          { position: model.root.position });
        ctx.scene.remove(model.root);
        model.dispose();
      }

      ctx.spawnDeployable(dep);
      A.data.deployable = dep;
      HC.VFX.burst(actor.position, actor.vfxColor('ability'), 18, 5, { spread: 0.5 });
      return true;
    }
  });

  def('hyper_mode', {
    name: 'Hyper Mode', short: 'HYPER', slot: 'ultimate',
    description: 'Overdrive: +45% movement, +30% fire rate, instant reloads, infinite air jumps.',
    icon: 'M4 18 L10 6 L12 13 L16 5 L20 18 M2 21 H22',
    cooldown: 0, charges: 1, duration: 8.0, castTime: 0.25,
    ultimate: true, sound: 'ult_cast', animation: 'cast_self',
    onActivate(A, actor) {
      actor.addMovementModifier('hyper_mode', { speedMul: 1.45, accelMul: 1.5, airControl: 1.4 }, 8.0);
      actor.addWeaponModifier('hyper_mode', { fireRate: 1.30, reload: 0.35, spread: 0.80, swap: 0.4 });
      actor.abilities.setInfiniteCharges('air_jump', true);
      actor.model.setEmissiveBoost(2.2);
      A.data.trail = HC.VFX.attachTrail(actor.model.bones.hips, {
        rate: 90, color0: 0xffffff, color1: actor.vfxColor('ultimate'),
        size0: 0.26, size1: 0.02, life: 0.42, spread: 0.35, drag: 2.4, offsetY: 0.4
      });
      actor.setCameraKick(0.42, 'ultimate');
      HC.VFX.burst(actor.position, actor.vfxColor('ultimate'), 44, 11, { spread: 0.6, upBias: 0.5, life: 0.7 });
      return true;
    },
    onEnd(A, actor) {
      actor.removeMovementModifier('hyper_mode');
      actor.removeWeaponModifier('hyper_mode');
      actor.abilities.setInfiniteCharges('air_jump', false);
      actor.model.setEmissiveBoost(0);
      if (A.data.trail) A.data.trail.stop();
    }
  });

  /* ================================================================== *
   * BRUTUS
   * ================================================================== */
  def('energy_shield', {
    name: 'Energy Shield', short: 'SHIELD', slot: 1,
    description: 'Raises a forward barrier that absorbs 500 damage. Move at half speed behind it.',
    icon: 'M12 2 L21 6 V12 C21 17 12 22 12 22 C12 22 3 17 3 12 V6 Z',
    cooldown: 14.0, charges: 1, duration: 5.5, castTime: 0.2,
    animation: 'cast_forward', sound: 'ability_shield_up',
    onActivate(A, actor, ctx) {
      const color = actor.vfxColor('ability');
      const mesh = HC.VFX.makeBarrier(4.6, 2.9, color);
      ctx.scene.add(mesh);
      const box = ctx.world.addBox({ x: -1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 }, 'energy',
        { blocksMovement: false, blocksProjectiles: true, blocksSight: false, owner: actor.id, team: actor.team });
      // Shots that stop on this box damage the shield rather than vanishing.

      const dep = Deployable({
        owner: actor, team: actor.team, life: 5.5, kind: 'shield',
        health: 500, maxHealth: 500, position: mesh.position,
        update(dt) {
          const f = forwardFlat(actor, _v);
          mesh.position.copy(actor.position).addScaledVector(f, 1.7);
          mesh.position.y += 1.45;
          mesh.rotation.y = actor.yaw;
          mesh.material.opacity = mesh.userData.baseOpacity * (0.6 + 0.4 * (dep.health / dep.maxHealth));
          // Keep the collision volume attached to the visual (re-indexed).
          const w = 2.3, h = 1.45, d = 0.28;
          ctx.world.moveBox(box,
            mesh.position.x - w, mesh.position.y - h, mesh.position.z - d,
            mesh.position.x + w, mesh.position.y + h, mesh.position.z + d);
        },
        onExpire() { cleanup(); },
        onDestroy() {
          HC.Audio.play('ability_shield_break', { position: mesh.position, important: true });
          HC.VFX.burst(mesh.position, color, 30, 7, { spread: 1.2, life: 0.5 });
          cleanup();
        }
      });
      function cleanup() {
        actor.removeMovementModifier('energy_shield');
        ctx.world.removeShape(box);
        ctx.scene.remove(mesh);
        HC.VFX.disposeObject(mesh);
      }
      box.deployable = dep;
      actor.addMovementModifier('energy_shield', { speedMul: 0.5 }, 5.5);
      ctx.spawnDeployable(dep);
      A.data.deployable = dep;
      return true;
    },
    onEnd(A, actor) { if (A.data.deployable && A.data.deployable.alive) A.data.deployable.kill(); }
  });

  def('ground_slam', {
    name: 'Ground Slam', short: 'SLAM', slot: 2,
    description: 'Slams the deck. Area damage, heavy knockback, and a stagger on anyone caught close.',
    icon: 'M12 3 V13 M7 9 L12 14 L17 9 M4 19 H20 M6 21 L4 17 M18 21 L20 17',
    cooldown: 9.0, charges: 1, duration: 0, castTime: 0.42,
    animation: 'cast_ground', sound: 'ability_slam', damageType: 'explosive',
    onActivate(A, actor, ctx) {
      const p = _v.copy(actor.position);
      const radius = 7.4;
      ctx.explode({
        center: p.clone(), radius, innerRadius: 1.6, damage: 78, minFraction: 0.40,
        type: 'explosive', attacker: actor, knockback: 17, selfKnockback: 0,
        abilityId: 'ground_slam', upBias: 0.55
      });
      HC.VFX.explosion(p, radius, actor.vfxColor('ability'), {
        groundY: p.y, coreColor: 0xffe3a0, smokeColor: 0x8a7f6a, sparkScale: 1.4
      });
      HC.VFX.dust(p, 26, radius * 0.55, 0xa89880);
      HC.Audio.play('ability_slam', { position: p, scale: 1.2, important: true, reverb: 0.4 });
      ctx.shake(p, 1.25, 0.55);
      enemiesInRadius(ctx, actor, p, radius).forEach(e => e.addStagger(0.55));
      actor.setCameraKick(0.6, 'slam');
      return true;
    },
    canActivate(actor) { return actor.grounded; }
  });

  def('juggernaut', {
    name: 'Juggernaut', short: 'JUGG', slot: 'ultimate',
    description: 'Locks the plating: +300 armour, 45% damage reduction, immune to stagger and knockback.',
    icon: 'M12 2 L20 5 V12 C20 17 12 22 12 22 C12 22 4 17 4 12 V5 Z M9 12 L11 14 L15 9',
    cooldown: 0, charges: 1, duration: 9.0, castTime: 0.4,
    ultimate: true, sound: 'ult_cast', animation: 'cast_self',
    onActivate(A, actor) {
      actor.health.armor += 300;
      actor.health.maxArmor += 300;
      actor.health.addReduction('juggernaut', 0.55);
      actor.setControlImmune(true);
      actor.addMovementModifier('juggernaut', { speedMul: 1.12 }, 9.0);
      actor.model.setEmissiveBoost(1.8);
      actor.setCameraKick(0.5, 'ultimate');
      A.data.trail = HC.VFX.attachTrail(actor.model.bones.chest, {
        rate: 34, color0: 0xffffff, color1: actor.vfxColor('ultimate'),
        size0: 0.24, size1: 0.02, life: 0.55, spread: 0.7, drag: 1.4, gravity: -0.4
      });
      HC.VFX.burst(actor.position, actor.vfxColor('ultimate'), 42, 8, { spread: 0.9, upBias: 0.6, life: 0.8 });
      return true;
    },
    onEnd(A, actor) {
      actor.health.maxArmor = Math.max(0, actor.health.maxArmor - 300);
      actor.health.armor = Math.min(actor.health.armor, actor.health.maxArmor);
      actor.health.removeReduction('juggernaut');
      actor.setControlImmune(false);
      actor.removeMovementModifier('juggernaut');
      actor.model.setEmissiveBoost(0);
      if (A.data.trail) A.data.trail.stop();
    }
  });

  /* ================================================================== *
   * NYX
   * ================================================================== */
  def('blink', {
    name: 'Blink', short: 'BLINK', slot: 1,
    description: 'Short-range teleport along your aim. Two charges.',
    icon: 'M4 12 H9 M15 12 H20 M12 4 L8 12 L12 12 L10 20 L16 11 L12 11 Z',
    cooldown: 6.5, charges: 2, duration: 0, castTime: 0,
    sound: 'ability_teleport',
    onActivate(A, actor, ctx) {
      const dir = _v.set(Math.sin(actor.yaw), 0, Math.cos(actor.yaw));
      const target = new THREE.Vector3();
      const from = actor.position.clone();
      safeTeleportPoint(ctx, actor, dir, 9.5, target);
      if (target.distanceTo(from) < 0.6) return false;
      actor.teleportTo(target);
      const color = actor.vfxColor('ability');
      HC.VFX.burst(from, color, 26, 8, { spread: 0.5, life: 0.42 });
      HC.VFX.burst(target, color, 26, 8, { spread: 0.5, life: 0.42 });
      // Streak marking the path taken.
      _v2.copy(from); _v2.y += 1.0;
      _v3.copy(target); _v3.y += 1.0;
      HC.VFX.beam(_v2, _v3, color, 0.7, 0.20);
      actor.setCameraKick(0.16, 'blink');
      return true;
    }
  });

  def('cloak', {
    name: 'Cloak', short: 'CLOAK', slot: 2,
    description: 'Refracts light for 4s. Firing or taking damage breaks it; moving slowly keeps it strongest.',
    icon: 'M2 12 C6 6 18 6 22 12 C18 18 6 18 2 12 Z M9 12 A3 3 0 1 0 15 12 A3 3 0 1 0 9 12',
    cooldown: 11.0, charges: 1, duration: 4.0, castTime: 0.15,
    sound: 'ability_cloak',
    onActivate(A, actor, ctx) {
      actor.setCloaked(true);
      actor.addMovementModifier('cloak', { speedMul: 1.12 }, 4.0);
      A.data.breakHandler = actor.health.events.on('damaged', () => { A.requestEnd(); });
      A.data.fireHandler = actor.weapon.events.on('fired', () => { A.requestEnd(); });
      HC.VFX.burst(actor.position, actor.vfxColor('ability'), 20, 5, { spread: 0.6, life: 0.5 });
      return true;
    },
    onUpdate(A, actor) {
      // Deeper cloak when moving slowly — rewards patience.
      const speedFrac = U.clamp01(actor.planarSpeed / (CFG.move.runSpeed));
      actor.setCloakStrength(U.lerp(0.94, 0.55, speedFrac));
    },
    onEnd(A, actor) {
      actor.setCloaked(false);
      actor.removeMovementModifier('cloak');
      if (A.data.breakHandler) A.data.breakHandler();
      if (A.data.fireHandler) A.data.fireHandler();
      HC.Audio.play('ability_uncloak', { position: actor.position });
      HC.VFX.burst(actor.position, actor.vfxColor('ability'), 14, 5, { spread: 0.5, life: 0.35 });
    }
  });

  def('shadow_strike', {
    name: 'Shadow Strike', short: 'STRIKE', slot: 'ultimate',
    description: 'Marks every enemy in front of you, then blinks between them landing a lethal blade on each.',
    icon: 'M12 2 L14 9 L21 11 L14 13 L12 20 L10 13 L3 11 L10 9 Z M18 3 L21 6 M3 18 L6 21',
    cooldown: 0, charges: 1, duration: 2.6, castTime: 0.3,
    ultimate: true, sound: 'ult_cast', animation: 'cast_self',
    onActivate(A, actor, ctx) {
      const dir = forwardFlat(actor, _v);
      const targets = [];
      for (let i = 0; i < ctx.actors.length; i++) {
        const e = ctx.actors[i];
        if (!e.health.alive || e.team === actor.team || e === actor) continue;
        const to = _v2.copy(e.position).sub(actor.position);
        const dist = to.length();
        if (dist > 22) continue;
        to.y = 0; to.normalize();
        if (to.dot(dir) < 0.10) continue;
        if (!ctx.world.lineOfSight(actor.eyePosition(_v3), e.centerPosition(new THREE.Vector3()))) continue;
        targets.push({ actor: e, dist });
      }
      if (!targets.length) return false;
      targets.sort((a, b) => a.dist - b.dist);
      A.data.queue = targets.map(t => t.actor);
      A.data.timer = 0;
      A.data.step = 0;
      actor.setInvulnerable(true);
      actor.setCloaked(true);
      actor.setCloakStrength(0.92);
      actor.setControlImmune(true);
      actor.setInputLocked(true);
      actor.setCameraKick(0.5, 'ultimate');
      HC.VFX.burst(actor.position, actor.vfxColor('ultimate'), 40, 9, { spread: 0.8, life: 0.6 });
      return true;
    },
    onUpdate(A, actor, ctx, dt) {
      A.data.timer -= dt;
      if (A.data.timer > 0) return;
      const queue = A.data.queue;
      if (A.data.step >= queue.length) { A.requestEnd(); return; }
      const target = queue[A.data.step++];
      A.data.timer = 0.34;
      if (!target || !target.health.alive) return;

      // Appear behind the target, strike, move on.
      const behind = _v.copy(actor.position).sub(target.position);
      behind.y = 0;
      if (behind.lengthSq() < 0.01) behind.set(0, 0, 1);
      behind.normalize().multiplyScalar(1.5);
      const dest = _v2.copy(target.position).add(behind);
      const g = ctx.world.groundHeight(dest.x, dest.y + 2, dest.z, 6);
      if (g.y > -Infinity) dest.y = g.y;
      if (!ctx.world.capsuleBlocked(dest.x, dest.y + 0.05, dest.z, CFG.body.radius, CFG.body.height)) {
        actor.teleportTo(dest);
        actor.faceTowards(target.position);
      }
      const color = actor.vfxColor('ultimate');
      HC.VFX.burst(actor.position, color, 22, 8, { spread: 0.4, life: 0.35 });
      _v3.copy(target.centerPosition(new THREE.Vector3()));
      HC.VFX.beam(actor.eyePosition(new THREE.Vector3()), _v3, color, 0.5, 0.16);
      actor.animator.playAction('melee_swing', 0.3, { side: A.data.step % 2 ? 1 : -1 });
      HC.Audio.play('fire_blade', { position: actor.position, pitch: 1.15, important: true });
      ctx.damage({
        target, amount: 135, type: 'melee', attacker: actor, critical: true,
        point: _v3.clone(), direction: _v.copy(target.position).sub(actor.position).normalize(),
        source: 'ability', abilityId: 'shadow_strike', knockback: 5
      });
    },
    onEnd(A, actor) {
      actor.setInvulnerable(false);
      actor.setCloaked(false);
      actor.setControlImmune(false);
      actor.setInputLocked(false);
      HC.VFX.burst(actor.position, actor.vfxColor('ultimate'), 26, 7, { spread: 0.6, life: 0.5 });
    }
  });

  /* ================================================================== *
   * JAX
   * ================================================================== */
  def('sticky_charge', {
    name: 'Sticky Charge', short: 'STICKY', slot: 1,
    description: 'Throws an adhesive charge that arms on contact and detonates after 1.4s.',
    icon: 'M12 3 A6 6 0 1 1 12 15 A6 6 0 0 1 12 3 M12 15 V21 M9 21 H15',
    cooldown: 7.5, charges: 2, duration: 0, castTime: 0.2,
    animation: 'cast_forward', sound: 'ability_deploy',
    onActivate(A, actor, ctx) {
      const eye = actor.eyePosition(_v);
      const dir = actor.aimDirection(_v2);
      ctx.spawnProjectile({
        owner: actor,
        weapon: { id: 'sticky_charge', damage: 92, damageType: 'explosive' },
        origin: eye.clone().addScaledVector(dir, 0.6),
        direction: dir.clone(), speed: 26,
        config: {
          speed: 26, gravity: 14, radius: 0.18, bounce: 0, bounces: 0, life: 6,
          fuse: -1, impactFuse: 1.4, detonateOnEnemy: false, sticky: true,
          splash: { radius: 5.2, innerRadius: 1.2, minFrac: 0.34, knockback: 13, selfKnockback: 15 },
          color: 0xff7a1a, trailColor: 0xffa02e, model: 'grenade'
        }
      });
      return true;
    }
  });

  def('blast_jump', {
    name: 'Blast Jump', short: 'BLAST', slot: 2,
    description: 'Detonates a charge beneath you. Big vertical launch, minor self-damage.',
    icon: 'M12 2 L12 10 M8 6 L12 2 L16 6 M4 20 C6 14 18 14 20 20 Z',
    cooldown: 8.0, charges: 1, duration: 0, castTime: 0,
    sound: 'explosion_small',
    onActivate(A, actor, ctx) {
      const p = _v.copy(actor.position);
      actor.setVerticalVelocity(15.2);
      const f = forwardFlat(actor, _v2);
      actor.applyImpulse(f.x * actor.moveInput.y * 7.5, 0, f.z * actor.moveInput.y * 7.5, false);
      ctx.explode({
        center: p.clone(), radius: 4.8, innerRadius: 1.0, damage: 55, minFraction: 0.3,
        type: 'explosive', attacker: actor, knockback: 12, selfKnockback: 0,
        abilityId: 'blast_jump', excludeSelf: true
      });
      // Self-damage is real but small — the trade-off is the point.
      actor.health.applyDamage({ amount: 16, type: 'explosive', attacker: actor, source: 'ability' });
      HC.VFX.explosion(p, 4.6, 0xff7a1a, { groundY: p.y, coreColor: 0xfff0c0 });
      HC.VFX.dust(p, 16, 1.6, 0xa89880);
      HC.Audio.play('explosion_small', { position: p, scale: 0.9, important: true });
      actor.setCameraKick(0.45, 'blast');
      return true;
    }
  });

  def('mega_bomb', {
    name: 'Mega Bomb', short: 'MEGA', slot: 'ultimate',
    description: 'Lobs an oversized bomb with a 3s fuse and a 14m blast. Everyone hears it coming.',
    icon: 'M12 22 A8 8 0 1 1 12 6 A8 8 0 0 1 12 22 M12 6 V2 M12 2 L17 1 M15 4 L19 2',
    cooldown: 0, charges: 1, duration: 0, castTime: 0.42,
    ultimate: true, sound: 'ult_cast', animation: 'cast_overhead',
    onActivate(A, actor, ctx) {
      const eye = actor.eyePosition(_v);
      const dir = actor.aimDirection(_v2);
      dir.y += 0.22; dir.normalize();
      ctx.spawnProjectile({
        owner: actor,
        weapon: { id: 'mega_bomb', damage: 320, damageType: 'explosive' },
        origin: eye.clone().addScaledVector(dir, 1.0),
        direction: dir.clone(), speed: 24,
        config: {
          speed: 24, gravity: 15, radius: 0.5, bounce: 0.30, bounces: 4, life: 5.0,
          fuse: 3.0, detonateOnEnemy: false,
          splash: { radius: 14.0, innerRadius: 4.0, minFrac: 0.30, knockback: 30, selfKnockback: 26 },
          color: 0xff5a14, trailColor: 0xffa02e, model: 'grenade', scale: 2.4
        }
      });
      actor.setCameraKick(0.4, 'ultimate');
      return true;
    }
  });

  /* ================================================================== *
   * NOVA
   * ================================================================== */
  def('hover', {
    name: 'Hover', short: 'HOVER', slot: 1,
    description: 'Suspends you in the air for 3s with full weapon control and slow drift.',
    icon: 'M12 4 L12 12 M8 8 L12 4 L16 8 M4 16 C8 13 16 13 20 16 M4 20 C8 17 16 17 20 20',
    cooldown: 10.0, charges: 1, duration: 3.0, castTime: 0,
    sound: 'ability_hover',
    onActivate(A, actor) {
      actor.setHovering(true, 0.55);
      actor.addMovementModifier('hover', { speedMul: 0.72, airControl: 2.6 }, 3.0);
      A.data.trail = HC.VFX.attachTrail(actor.model.bones.hips, {
        rate: 40, color0: 0xffffff, color1: actor.vfxColor('ability'),
        size0: 0.16, size1: 0.02, life: 0.5, spread: 0.4, drag: 2.0, gravity: 2.4, offsetY: -0.2
      });
      HC.VFX.burst(actor.position, actor.vfxColor('ability'), 18, 5, { upBias: -0.8, spread: 0.4 });
      return true;
    },
    onEnd(A, actor) {
      actor.setHovering(false);
      actor.removeMovementModifier('hover');
      if (A.data.trail) A.data.trail.stop();
    }
  });

  def('plasma_orb', {
    name: 'Plasma Orb', short: 'ORB', slot: 2,
    description: 'A slow orb that pulses area damage as it drifts, then bursts.',
    icon: 'M12 3 A9 9 0 1 1 11.9 3 M12 8 A4 4 0 1 0 12.1 8',
    cooldown: 11.0, charges: 1, duration: 0, castTime: 0.22,
    animation: 'cast_forward', sound: 'fire_plasma',
    onActivate(A, actor, ctx) {
      const eye = actor.eyePosition(_v);
      const dir = actor.aimDirection(_v2);
      const orb = HC.WeaponModel.buildProjectile('plasma', actor.vfxColor('ability'));
      orb.scale.setScalar(2.0);
      orb.position.copy(eye).addScaledVector(dir, 1.0);
      ctx.scene.add(orb);
      const vel = dir.clone().multiplyScalar(12);
      let pulseTimer = 0;
      const color = actor.vfxColor('ability');

      const dep = Deployable({
        owner: actor, team: actor.team, life: 4.2, kind: 'orb', position: orb.position,
        update(dt, c) {
          const step = _v3.copy(vel).multiplyScalar(dt);
          const d = step.length();
          if (d > 0.001) {
            const hit = c.world.raycast(orb.position, _v3.multiplyScalar(1 / d), d + 0.4, null, 'projectiles');
            if (hit) { dep.life = 0; return; }
            orb.position.addScaledVector(vel, dt);
          }
          orb.rotation.y += dt * 3.4;
          orb.scale.setScalar(2.0 + Math.sin(performance.now() * 0.006) * 0.25);
          pulseTimer -= dt;
          if (pulseTimer <= 0) {
            pulseTimer = 0.42;
            c.explode({
              center: orb.position.clone(), radius: 3.6, innerRadius: 0.8, damage: 26,
              minFraction: 0.5, type: 'energy', attacker: actor, knockback: 1.6,
              selfKnockback: 0, abilityId: 'plasma_orb', excludeSelf: true, silent: true
            });
            HC.VFX.burst(orb.position, color, 10, 4, { spread: 0.8, life: 0.35, light: false });
          }
          if (Math.random() < dt * 30) {
            HC.VFX.sparks.spawn({
              x: orb.position.x, y: orb.position.y, z: orb.position.z,
              vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2,
              life: 0.4, size0: 0.12, size1: 0.01, color0: 0xffffff, color1: color, alpha: 1, drag: 3
            });
          }
        },
        onExpire() { burst(); }, onDestroy() { burst(); }
      });
      function burst() {
        ctx.explode({
          center: orb.position.clone(), radius: 6.0, innerRadius: 1.4, damage: 72,
          minFraction: 0.36, type: 'energy', attacker: actor, knockback: 8,
          selfKnockback: 0, abilityId: 'plasma_orb', excludeSelf: true
        });
        HC.VFX.explosion(orb.position, 6.0, color, { coreColor: 0xd8fff4 });
        HC.Audio.play('explosion_small', { position: orb.position, scale: 0.8 });
        ctx.scene.remove(orb);
        HC.WeaponModel.disposeObject(orb);
      }
      ctx.spawnDeployable(dep);
      return true;
    }
  });

  def('supernova', {
    name: 'Supernova', short: 'NOVA', slot: 'ultimate',
    description: 'Charges for 1.4s, then releases an expanding energy detonation. Grants a shield while charging.',
    icon: 'M12 2 V8 M12 16 V22 M2 12 H8 M16 12 H22 M5 5 L9 9 M15 15 L19 19 M19 5 L15 9 M9 15 L5 19 M12 10 A2 2 0 1 0 12.1 10',
    cooldown: 0, charges: 1, duration: 1.4, castTime: 0.2,
    ultimate: true, sound: 'ability_charge', animation: 'cast_self',
    onActivate(A, actor, ctx) {
      actor.health.grantOvershield(150);
      actor.addMovementModifier('supernova', { speedMul: 0.55 }, 1.4);
      actor.model.setEmissiveBoost(3.0);
      A.data.trail = HC.VFX.attachTrail(actor.model.bones.chest, {
        rate: 120, color0: 0xffffff, color1: actor.vfxColor('ultimate'),
        size0: 0.34, size1: 0.02, life: 0.45, spread: 1.4, drag: 1.0, gravity: -1.4
      });
      HC.Audio.play('ability_charge', { position: actor.position, dur: 1.4, important: true });
      actor.setCameraKick(0.3, 'ultimate');
      return true;
    },
    onEnd(A, actor, ctx) {
      actor.removeMovementModifier('supernova');
      actor.model.setEmissiveBoost(0);
      actor.health.clearOvershield();
      if (A.data.trail) A.data.trail.stop();
      const p = actor.centerPosition(_v).clone();
      const color = actor.vfxColor('ultimate');
      ctx.explode({
        center: p, radius: 13.0, innerRadius: 3.0, damage: 240, minFraction: 0.35,
        type: 'energy', attacker: actor, knockback: 21, selfKnockback: 0,
        abilityId: 'supernova', excludeSelf: true
      });
      HC.VFX.explosion(p, 13.0, color, { coreColor: 0xffffff, smokeColor: 0x4a6a88, sparkScale: 1.8, groundY: actor.position.y });
      HC.Audio.play('explosion_ultimate', { position: p, scale: 1.3, important: true, reverb: 0.5 });
      ctx.shake(p, 1.6, 0.9);
    }
  });

  /* ================================================================== *
   * KODA
   * ================================================================== */
  def('hunter_trap', {
    name: 'Hunter Trap', short: 'TRAP', slot: 1,
    description: 'Places a snare. The first enemy to cross it is rooted for 1.8s and marked.',
    icon: 'M4 12 H20 M6 12 L4 8 M10 12 L9 7 M14 12 L15 7 M18 12 L20 8 M4 12 L6 18 M20 12 L18 18',
    cooldown: 12.0, charges: 2, duration: 0, castTime: 0.28,
    animation: 'cast_ground', sound: 'ability_deploy',
    onActivate(A, actor, ctx) {
      const f = forwardFlat(actor, _v);
      const pos = actor.position.clone().addScaledVector(f, 2.0);
      const g = ctx.world.groundHeight(pos.x, pos.y + 1.5, pos.z, 5);
      if (g.y === -Infinity) return false;
      pos.y = g.y + 0.05;

      const color = actor.vfxColor('ability');
      const group = new THREE.Group();
      const ringGeo = new THREE.RingGeometry(0.9, 1.25, 24);
      const ringMat = Mats.additive(color, 0.55);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      group.add(ring);
      const spikeGeo = new THREE.ConeGeometry(0.09, 0.42, 5);
      const spikeMat = Mats.make({ unique: true, kind: 'metal', color: 0x8a8f98, roughness: 0.4, metalness: 0.9 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * U.TAU;
        const s = new THREE.Mesh(spikeGeo, spikeMat);
        s.position.set(Math.cos(a) * 1.0, 0.2, Math.sin(a) * 1.0);
        s.rotation.z = Math.cos(a) * 0.5; s.rotation.x = -Math.sin(a) * 0.5;
        group.add(s);
      }
      group.position.copy(pos);
      group.userData = { geometries: [ringGeo, spikeGeo], materials: [spikeMat] };
      ctx.scene.add(group);

      let armed = 0.4;
      const dep = Deployable({
        owner: actor, team: actor.team, life: 30, kind: 'trap', targetable: true,
        health: 45, maxHealth: 45, position: group.position, radius: 1.25,
        hitFeetOffset: 0, hitHeight: 0.5,
        update(dt, c) {
          armed -= dt;
          ring.material.opacity = armed > 0 ? 0.25 : 0.35 + Math.sin(performance.now() * 0.005) * 0.18;
          group.rotation.y += dt * 0.6;
          if (armed > 0) return;
          const caught = enemiesInRadius(c, actor, group.position, 1.5);
          if (caught.length) {
            caught.forEach(e => {
              e.addRoot(1.8);
              c.mark(e, 5.0, actor.team);
              c.damage({
                target: e, amount: 42, type: 'physical', attacker: actor, critical: false,
                point: e.position.clone(), direction: _v2.set(0, 1, 0), source: 'ability',
                abilityId: 'hunter_trap', knockback: 0
              });
            });
            HC.VFX.burst(group.position, color, 24, 6, { upBias: 0.9, spread: 0.6 });
            HC.Audio.play('ability_deploy', { position: group.position, pitch: 0.8, important: true });
            dep.life = 0;
          }
        },
        onExpire() { cleanup(); }, onDestroy() { cleanup(); }
      });
      function cleanup() {
        ctx.scene.remove(group);
        HC.VFX.disposeObject(group);
      }
      ctx.spawnDeployable(dep);
      return true;
    }
  });

  def('scout_drone', {
    name: 'Scout Drone', short: 'DRONE', slot: 2,
    description: 'Launches a drone that circles forward and marks every enemy it sees for your team.',
    icon: 'M12 8 A4 4 0 1 1 12 16 A4 4 0 0 1 12 8 M4 6 L8 10 M20 6 L16 10 M4 18 L8 14 M20 18 L16 14',
    cooldown: 15.0, charges: 1, duration: 8.0, castTime: 0.2,
    animation: 'cast_forward', sound: 'ability_deploy',
    onActivate(A, actor, ctx) {
      const color = actor.vfxColor('ability');
      const group = new THREE.Group();
      const bodyGeo = new THREE.IcosahedronGeometry(0.28, 0);
      const bodyMat = Mats.make({ unique: true, kind: 'metal', color: 0x9aa4b0, roughness: 0.35, metalness: 0.9 });
      group.add(new THREE.Mesh(bodyGeo, bodyMat));
      const eyeGeo = new THREE.SphereGeometry(0.12, 10, 8);
      const eyeMat = Mats.make({ unique: true, kind: 'energy', color, emissive: color, emissiveIntensity: 3, rim: false });
      const eye = new THREE.Mesh(eyeGeo, eyeMat); eye.position.z = 0.24; group.add(eye);
      const ringGeo = new THREE.TorusGeometry(0.42, 0.04, 6, 18);
      const ring = new THREE.Mesh(ringGeo, Mats.additive(color, 0.7));
      ring.rotation.x = Math.PI / 2; group.add(ring);
      group.userData = { geometries: [bodyGeo, eyeGeo, ringGeo], materials: [bodyMat, eyeMat] };

      group.position.copy(actor.eyePosition(_v)).addScaledVector(forwardFlat(actor, _v2), 1.2);
      group.position.y += 1.0;
      ctx.scene.add(group);

      const dir = forwardFlat(actor, new THREE.Vector3());
      let t = 0, scanTimer = 0;
      const dep = Deployable({
        owner: actor, team: actor.team, life: 8.0, kind: 'drone', targetable: true,
        health: 70, maxHealth: 70, position: group.position, radius: 0.4,
        update(dt, c) {
          t += dt;
          // Serpentine advance, staying above head height.
          const swerve = Math.sin(t * 1.6) * 0.5;
          const move = _v.copy(dir).applyAxisAngle(new THREE.Vector3(0, 1, 0), swerve).multiplyScalar(7.5 * dt);
          const next = _v2.copy(group.position).add(move);
          if (c.world.raycast(group.position, _v3.copy(move).normalize(), move.length() + 0.5, null, 'movement')) {
            dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), 1.4);
          } else {
            group.position.copy(next);
          }
          const g = c.world.groundHeight(group.position.x, group.position.y + 6, group.position.z, 30);
          const desiredY = (g.y > -Infinity ? g.y : 0) + 2.7;
          group.position.y = U.damp(group.position.y, desiredY, 3.0, dt);
          group.rotation.y += dt * 2.2;
          ring.rotation.z += dt * 6;

          scanTimer -= dt;
          if (scanTimer <= 0) {
            scanTimer = 0.55;
            for (let i = 0; i < c.actors.length; i++) {
              const e = c.actors[i];
              if (!e.health.alive || e.team === actor.team) continue;
              if (e.position.distanceTo(group.position) > 26) continue;
              if (!c.world.lineOfSight(group.position, e.centerPosition(_v3))) continue;
              c.mark(e, 2.5, actor.team);
            }
            HC.VFX.burst(group.position, color, 4, 2, { spread: 0.3, life: 0.3, light: false });
          }
        },
        onExpire() { cleanup(false); }, onDestroy() { cleanup(true); }
      });
      function cleanup(destroyed) {
        HC.VFX.burst(group.position, color, destroyed ? 24 : 10, 6, { spread: 0.5 });
        if (destroyed) HC.Audio.play('explosion_small', { position: group.position, scale: 0.4 });
        ctx.scene.remove(group);
        HC.VFX.disposeObject(group);
      }
      ctx.spawnDeployable(dep);
      return true;
    }
  });

  def('predator_mode', {
    name: 'Predator Mode', short: 'PRED', slot: 'ultimate',
    description: 'See every enemy through walls, move 35% faster, and tighten the Timberline\'s choke.',
    icon: 'M3 12 C7 5 17 5 21 12 C17 19 7 19 3 12 M12 9 A3 3 0 1 0 12.1 9 M2 4 L5 7 M22 4 L19 7',
    cooldown: 0, charges: 1, duration: 10.0, castTime: 0.3,
    ultimate: true, sound: 'ult_cast', animation: 'cast_self',
    onActivate(A, actor, ctx) {
      actor.addMovementModifier('predator', { speedMul: 1.35, accelMul: 1.3 }, 10.0);
      actor.addWeaponModifier('predator', { spread: 0.62, reload: 0.70, damage: 1.10 });
      actor.setVision('predator', true);
      actor.model.setEmissiveBoost(1.6);
      actor.setCameraKick(0.35, 'ultimate');
      A.data.scanTimer = 0;
      HC.VFX.burst(actor.position, actor.vfxColor('ultimate'), 34, 8, { spread: 0.8, upBias: 0.5 });
      return true;
    },
    onUpdate(A, actor, ctx, dt) {
      A.data.scanTimer -= dt;
      if (A.data.scanTimer > 0) return;
      A.data.scanTimer = 0.4;
      for (let i = 0; i < ctx.actors.length; i++) {
        const e = ctx.actors[i];
        if (!e.health.alive || e.team === actor.team) continue;
        if (e.position.distanceTo(actor.position) > 60) continue;
        ctx.mark(e, 0.6, actor.team, true);
      }
    },
    onEnd(A, actor) {
      actor.removeMovementModifier('predator');
      actor.removeWeaponModifier('predator');
      actor.setVision('predator', false);
      actor.model.setEmissiveBoost(0);
    }
  });

  /* ================================================================== *
   * ZERO
   * ================================================================== */
  def('scanner_pulse', {
    name: 'Scanner Pulse', short: 'SCAN', slot: 1,
    description: 'Emits a pulse that reveals every enemy within 26m to your team for 4s.',
    icon: 'M12 12 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M12 5 A7 7 0 0 1 19 12 M12 2 A10 10 0 0 1 22 12',
    cooldown: 11.0, charges: 1, duration: 0, castTime: 0.28,
    animation: 'cast_forward', sound: 'ability_scan',
    onActivate(A, actor, ctx) {
      const center = actor.centerPosition(_v).clone();
      const color = actor.vfxColor('ability');
      let found = 0;
      for (let i = 0; i < ctx.actors.length; i++) {
        const e = ctx.actors[i];
        if (!e.health.alive || e.team === actor.team) continue;
        if (e.position.distanceTo(center) > 26) continue;
        ctx.mark(e, 4.0, actor.team, true);
        found++;
      }
      // Expanding ring so allies can read the scan's coverage.
      const geo = new THREE.RingGeometry(0.9, 1.15, 48);
      const mat = Mats.additive(color, 0.7);
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(actor.position); ring.position.y += 0.2;
      ctx.scene.add(ring);
      let t = 0;
      ctx.spawnDeployable(Deployable({
        owner: actor, team: actor.team, life: 0.85, kind: 'fx', position: ring.position,
        update(dt) {
          t += dt;
          const k = t / 0.85;
          ring.scale.setScalar(U.lerp(1, 26, U.easeOutQuint(k)));
          mat.opacity = 0.7 * (1 - k);
        },
        onExpire() { ctx.scene.remove(ring); geo.dispose(); }
      }));
      ctx.notifyFeed && ctx.notifyFeed(actor, found + ' contact' + (found === 1 ? '' : 's') + ' marked');
      return true;
    }
  });

  def('energy_barrier', {
    name: 'Energy Barrier', short: 'WALL', slot: 2,
    description: 'Projects a free-standing wall that blocks fire from both sides for 8s.',
    icon: 'M4 6 H20 V18 H4 Z M4 10 H20 M4 14 H20 M9 6 V18 M15 6 V18',
    cooldown: 16.0, charges: 1, duration: 8.0, castTime: 0.3,
    animation: 'cast_forward', sound: 'ability_shield_up',
    onActivate(A, actor, ctx) {
      const f = forwardFlat(actor, _v);
      const pos = actor.position.clone().addScaledVector(f, 3.2);
      const g = ctx.world.groundHeight(pos.x, pos.y + 2.5, pos.z, 8);
      if (g.y === -Infinity) return false;
      pos.y = g.y;

      const color = actor.vfxColor('ability');
      const W = 6.4, H = 3.4;
      const mesh = HC.VFX.makeBarrier(W, H, color);
      mesh.position.copy(pos); mesh.position.y += H / 2;
      mesh.rotation.y = actor.yaw;
      ctx.scene.add(mesh);

      const cos = Math.abs(Math.cos(actor.yaw)), sin = Math.abs(Math.sin(actor.yaw));
      const hx = (W / 2) * cos + 0.2 * sin;
      const hz = (W / 2) * sin + 0.2 * cos;
      const box = ctx.world.addBox(
        { x: pos.x - hx, y: pos.y, z: pos.z - hz },
        { x: pos.x + hx, y: pos.y + H, z: pos.z + hz },
        'energy', { blocksMovement: true, blocksProjectiles: true, blocksSight: true, owner: actor.id, team: actor.team });

      const dep = Deployable({
        owner: actor, team: actor.team, life: 8.0, kind: 'barrier',
        health: 800, maxHealth: 800, position: mesh.position, radius: W / 2,
        update() { mesh.material.opacity = mesh.userData.baseOpacity * (0.55 + 0.45 * (dep.health / dep.maxHealth)); },
        onExpire() { cleanup(); },
        onDestroy() {
          HC.Audio.play('ability_shield_break', { position: mesh.position, important: true });
          HC.VFX.burst(mesh.position, color, 36, 9, { spread: 2.0, life: 0.6 });
          cleanup();
        }
      });
      function cleanup() {
        ctx.world.removeShape(box);
        ctx.scene.remove(mesh);
        HC.VFX.disposeObject(mesh);
      }
      box.deployable = dep;
      ctx.spawnDeployable(dep);
      A.data.deployable = dep;
      return true;
    }
  });

  def('orbital_beam', {
    name: 'Orbital Beam', short: 'ORBIT', slot: 'ultimate',
    description: 'Paints a target area, then calls down a sustained orbital lance for 3s.',
    icon: 'M12 2 V9 M9 9 H15 L18 22 H6 Z M4 5 L7 8 M20 5 L17 8',
    cooldown: 0, charges: 1, duration: 3.6, castTime: 0.45,
    ultimate: true, sound: 'ult_cast', animation: 'cast_overhead',
    onActivate(A, actor, ctx) {
      const eye = actor.eyePosition(_v);
      const dir = actor.aimDirection(_v2);
      const hit = ctx.world.raycast(eye, dir, 90, null, 'projectiles');
      const target = hit ? hit.point.clone() : eye.clone().addScaledVector(dir, 60);
      const g = ctx.world.groundHeight(target.x, target.y + 1.0, target.z, 40);
      if (g.y > -Infinity) target.y = g.y;

      const color = actor.vfxColor('ultimate');
      const markGeo = new THREE.RingGeometry(4.4, 5.2, 48);
      const markMat = Mats.additive(color, 0.8);
      const mark = new THREE.Mesh(markGeo, markMat);
      mark.rotation.x = -Math.PI / 2;
      mark.position.copy(target); mark.position.y += 0.1;
      ctx.scene.add(mark);

      A.data.target = target;
      A.data.mark = mark;
      A.data.markGeo = markGeo;
      A.data.warm = 0.9;
      A.data.tick = 0;
      A.data.beamTimer = 0;
      actor.setCameraKick(0.4, 'ultimate');
      HC.Audio.play('ability_beam', { position: target, dur: 3.6, scale: 1.2, important: true });
      ctx.notifyFeed && ctx.notifyFeed(actor, 'ORBITAL LANCE INBOUND');
      return true;
    },
    onUpdate(A, actor, ctx, dt) {
      const target = A.data.target;
      A.data.mark.rotation.z += dt * 1.6;
      if (A.data.warm > 0) {
        A.data.warm -= dt;
        A.data.mark.material.opacity = 0.4 + Math.abs(Math.sin(performance.now() * 0.012)) * 0.55;
        return;
      }
      A.data.mark.material.opacity = 0.85;

      // Visible column of light + repeating damage ticks.
      A.data.beamTimer -= dt;
      if (A.data.beamTimer <= 0) {
        A.data.beamTimer = 0.06;
        _v.copy(target); _v.y += 60;
        HC.VFX.beam(_v, target, color4(actor), 2.2, 0.11);
        HC.VFX.beam(_v, target, 0xffffff, 0.8, 0.11);
        HC.VFX.burst(target, color4(actor), 8, 9, { upBias: 1, spread: 3.4, life: 0.5, light: false });
      }
      A.data.tick -= dt;
      if (A.data.tick <= 0) {
        A.data.tick = 0.3;
        ctx.explode({
          center: target.clone(), radius: 5.4, innerRadius: 2.4, damage: 42, minFraction: 0.6,
          type: 'energy', attacker: actor, knockback: 1.5, selfKnockback: 0,
          abilityId: 'orbital_beam', excludeSelf: false, silent: true
        });
        HC.VFX.light(target, color4(actor), 8, 26, 0.3);
        ctx.shake(target, 0.5, 0.3);
      }
    },
    onEnd(A, actor, ctx) {
      if (A.data.mark) {
        ctx.scene.remove(A.data.mark);
        A.data.markGeo.dispose();
      }
      const t = A.data.target;
      if (t) {
        HC.VFX.explosion(t, 8, color4(actor), { groundY: t.y, coreColor: 0xffffff });
        HC.Audio.play('explosion_large', { position: t, scale: 1.1, important: true });
      }
    }
  });
  function color4(actor) { return actor.vfxColor('ultimate'); }

  /* ================================================================== *
   * Ability system — owns the three slots for one actor.
   * ================================================================== */
  HC.AbilitySystem = function AbilitySystem(actor, ctx) {
    const slots = {};
    const S = {
      actor, ctx, slots,
      ultCharge: 0, ultReady: false,
      events: HC.Events('abilities')
    };

    function makeSlot(defId, key) {
      const d = HC.Abilities.get(defId);
      const slot = {
        key, def: d, id: d.id,
        cooldown: 0, charges: d.charges || 1, maxCharges: d.charges || 1,
        infiniteCharges: false,
        active: false, activeTime: 0, castTime: 0, casting: false,
        data: {}, endRequested: false,
        requestEnd() { slot.endRequested = true; }
      };
      slots[key] = slot;
      return slot;
    }

    S.setup = function (charDef) {
      Object.keys(slots).forEach(k => delete slots[k]);
      makeSlot(charDef.abilities[0], 'ability1');
      makeSlot(charDef.abilities[1], 'ability2');
      makeSlot(charDef.ultimate, 'ultimate');
      S.ultCharge = 0;
      S.ultReady = false;
    };

    S.reset = function () {
      Object.keys(slots).forEach(k => {
        const s = slots[k];
        if (s.active) endSlot(s, true);
        s.cooldown = 0;
        s.charges = s.maxCharges;
        s.active = false; s.casting = false; s.activeTime = 0;
        s.data = {};
      });
    };

    S.setInfiniteCharges = function (abilityId, on) {
      Object.keys(slots).forEach(k => {
        if (slots[k].id === abilityId) slots[k].infiniteCharges = on;
      });
    };

    S.canActivate = function (key) {
      const s = slots[key];
      if (!s) return false;
      if (s.active || s.casting) return false;
      if (key === 'ultimate') return S.ultReady && actor.health.alive;
      if (!s.infiniteCharges && s.charges <= 0) return false;
      if (!actor.health.alive) return false;
      if (actor.inputLocked) return false;
      if (s.def.canActivate && !s.def.canActivate(actor, ctx)) return false;
      return true;
    };

    S.activate = function (key) {
      if (!S.canActivate(key)) {
        if (slots[key] && !slots[key].active) HC.Audio.ui('ui_error', { volume: 0.5 });
        return false;
      }
      const s = slots[key];
      if (s.def.castTime > 0) {
        s.casting = true;
        s.castTime = s.def.castTime;
        if (s.def.animation) actor.animator.playAction(s.def.animation, s.def.castTime + 0.25);
        return true;
      }
      return beginSlot(s);
    };

    function beginSlot(s) {
      const d = s.def;
      s.endRequested = false;
      s.data = {};
      const ok = d.onActivate ? d.onActivate(s, actor, ctx) !== false : true;
      if (!ok) {
        s.casting = false;
        HC.Audio.ui('ui_error', { volume: 0.5 });
        return false;
      }
      if (d.animation && d.castTime <= 0) actor.animator.playAction(d.animation, Math.max(0.35, d.duration || 0.4));
      if (d.sound) HC.Audio.play(d.sound, { position: actor.position, important: true });

      if (s.key === 'ultimate') {
        S.ultCharge = 0;
        S.ultReady = false;
        actor.onUltimateUsed();
      } else if (!s.infiniteCharges) {
        s.charges--;
        if (s.cooldown <= 0) s.cooldown = d.cooldown;
      }

      if (d.duration > 0) {
        s.active = true;
        s.activeTime = d.duration;
      } else if (d.onEnd) {
        d.onEnd(s, actor, ctx);
      }
      S.events.emit('activated', s);
      actor.health.breakSpawnProtection();
      return true;
    }

    function endSlot(s, silent) {
      if (!s.active) return;
      s.active = false;
      s.activeTime = 0;
      if (s.def.onEnd) {
        try { s.def.onEnd(s, actor, ctx); }
        catch (e) { HC.Log.error('Abilities', s.id + '.onEnd failed: ' + e.message); }
      }
      if (!silent) S.events.emit('ended', s);
    }

    S.update = function (dt) {
      // Ultimate charge trickles and builds from damage/objectives.
      if (!S.ultReady && actor.health.alive) {
        S.addUltCharge(CFG.combat.ultChargePerSecond * dt);
      }
      Object.keys(slots).forEach(k => {
        const s = slots[k];
        if (s.casting) {
          s.castTime -= dt;
          if (s.castTime <= 0) { s.casting = false; beginSlot(s); }
        }
        if (s.active) {
          s.activeTime -= dt;
          if (s.def.onUpdate) {
            try { s.def.onUpdate(s, actor, ctx, dt); }
            catch (e) { HC.Log.error('Abilities', s.id + '.onUpdate failed: ' + e.message); }
          }
          if (s.activeTime <= 0 || s.endRequested) endSlot(s);
        }
        if (k !== 'ultimate' && s.cooldown > 0) {
          s.cooldown -= dt;
          if (s.cooldown <= 0) {
            if (s.charges < s.maxCharges) {
              s.charges++;
              S.events.emit('chargeGained', s);
              if (s.charges < s.maxCharges) s.cooldown = s.def.cooldown;
              else s.cooldown = 0;
            } else s.cooldown = 0;
          }
        }
      });
    };

    S.addUltCharge = function (amount) {
      if (S.ultReady) return;
      S.ultCharge = Math.min(100, S.ultCharge + amount);
      if (S.ultCharge >= 100) {
        S.ultReady = true;
        S.events.emit('ultReady');
      }
    };

    S.onKill = function () {
      S.addUltCharge(CFG.combat.ultChargeOnKill);
      Object.keys(slots).forEach(k => {
        const s = slots[k];
        if (s.def.onKillCredit) s.def.onKillCredit(s, actor, ctx);
      });
    };

    S.onLand = function () {
      // Air Jump refreshes the instant you touch the ground.
      Object.keys(slots).forEach(k => {
        const s = slots[k];
        if (s.id === 'air_jump' && s.charges < s.maxCharges) { s.charges = s.maxCharges; s.cooldown = 0; }
      });
    };

    S.cancelAll = function () {
      Object.keys(slots).forEach(k => { if (slots[k].active) endSlot(slots[k], true); slots[k].casting = false; });
    };

    S.slotList = function () { return [slots.ability1, slots.ability2, slots.ultimate]; };

    return S;
  };

})(window.HC, window.THREE);
