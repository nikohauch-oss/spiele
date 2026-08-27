/* =========================================================================
 * HYPERCELL — 20_ai.js
 * Bot brain. Produces the same command struct the player controller does,
 * so bots and humans go through identical movement and combat code.
 *
 * Behaviour = perception → target selection → objective goal → steering →
 * combat (aim error, leading, burst discipline, ability usage).
 * ========================================================================= */
(function (HC, THREE) {
  'use strict';

  const U = HC.Util;
  const CFG = HC.CFG;

  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  const _aim = new THREE.Vector3();

  const BOT_NAMES = [
    'VECTOR', 'HALCYON', 'DRIFT', 'MAGPIE', 'CINDER', 'TALLY', 'OSPREY', 'RIVET',
    'SABLE', 'QUARRY', 'LUMEN', 'BRACKET', 'KESTREL', 'ANVIL', 'MIRAGE', 'SPARROW',
    'GRIT', 'PYLON', 'FLINT', 'ECHO', 'JUNIPER', 'MARROW', 'COBALT', 'HAWTHORN'
  ];
  HC.botNames = BOT_NAMES;

  HC.BotBrain = function BotBrain(actor, ctx, options) {
    options = options || {};
    const tier = CFG.ai.tiers[options.difficulty || CFG.ai.difficulty] || CFG.ai.tiers.normal;
    const rnd = U.rng((Math.random() * 1e9) | 0);

    const B = {
      actor, ctx, tier,
      target: null, targetTime: 0, lastSeenTime: -99,
      lastKnownPosition: new THREE.Vector3(),
      reactionTimer: 0, engaged: false,
      path: [], pathIndex: 0, repathTimer: 0, pathTarget: new THREE.Vector3(),
      goal: null, goalTimer: 0,
      strafeDir: rnd() > 0.5 ? 1 : -1, strafeTimer: 0,
      pathsComputed: 0,
      burstTimer: 0, burstFiring: false,
      aimYaw: 0, aimPitch: 0, aimNoiseT: rnd() * 100,
      jumpTimer: 0, dodgeTimer: 0, abilityTimer: 1 + rnd() * 2,
      stuckTimer: 0, lastPos: new THREE.Vector3(),
      commands: HC.blankCommands(),
      personalitySkill: U.clamp01(tier.aim + (rnd() - 0.5) * 0.10)
    };

    B.aimYaw = actor.yaw;

    /* ---- perception ---------------------------------------------------- */
    function updatePerception(dt, now) {
      let best = null, bestScore = -Infinity;
      const eye = actor.eyePosition(_v);

      for (let i = 0; i < ctx.actors.length; i++) {
        const e = ctx.actors[i];
        if (e === actor || !e.health.alive) continue;
        if (e.team === actor.team) continue;
        const dist = actor.position.distanceTo(e.position);
        if (dist > CFG.ai.sightRange) continue;
        // Cloaked enemies are only spotted close up (or if marked).
        if (e.cloakBlend > 0.55 && e.markedUntil < now && dist > 9) continue;

        const targetPoint = e.centerPosition(_v2);
        if (!ctx.world.lineOfSight(eye, targetPoint)) continue;

        let score = 220 - dist * 3.2;
        if (e === B.target) score += 60;                     // target stickiness
        if (e.carryingObjective) score += 140;                // objective carrier is priority
        if (e.health.fraction() < 0.4) score += 55;           // finish wounded targets
        if (dist < 12) score += 45;
        const toE = _v3.copy(e.position).sub(actor.position).normalize();
        const facing = toE.x * Math.sin(actor.yaw) + toE.z * Math.cos(actor.yaw);
        score += facing * 25;
        if (score > bestScore) { bestScore = score; best = e; }
      }

      if (best) {
        if (best !== B.target) {
          B.target = best;
          B.reactionTimer = tier.reaction * (0.7 + rnd() * 0.6);
          B.targetTime = 0;
        }
        B.lastSeenTime = now;
        B.lastKnownPosition.copy(best.position);
        B.engaged = true;
      } else if (B.target) {
        if (now - B.lastSeenTime > CFG.ai.loseTargetTime || !B.target.health.alive) {
          B.target = null;
          B.engaged = false;
        }
      }
      if (B.target) B.targetTime += dt;
      if (B.reactionTimer > 0) B.reactionTimer -= dt;
    }

    /* ---- goals --------------------------------------------------------- */
    function updateGoal(dt) {
      B.goalTimer -= dt;
      if (B.goalTimer > 0 && B.goal) return;
      B.goalTimer = 1.1 + rnd() * 0.7;
      B.goal = ctx.getBotGoal ? ctx.getBotGoal(actor, B) : null;
      if (!B.goal) B.goal = { type: 'roam', position: actor.position.clone() };
    }

    /* ---- navigation ---------------------------------------------------- */
    function desiredDestination() {
      // In a fight, hold effective range against the current target.
      if (B.target && B.reactionTimer <= 0) {
        const wdef = actor.weapon.def;
        const ideal = wdef.melee ? 2.2 : U.clamp(wdef.range.falloffStart * 0.62, 5, 26);
        const dist = actor.position.distanceTo(B.target.position);
        if (Math.abs(dist - ideal) > ideal * 0.42) {
          const dir = _v.copy(B.target.position).sub(actor.position);
          dir.y = 0;
          const len = dir.length() || 1;
          dir.multiplyScalar(1 / len);
          return _v2.copy(B.target.position).addScaledVector(dir, -ideal);
        }
        // Otherwise hold position and strafe.
        return null;
      }
      if (B.goal && B.goal.position) return B.goal.position;
      return null;
    }

    function updatePath(dt) {
      B.repathTimer -= dt;
      const dest = desiredDestination();
      if (!dest) { B.path.length = 0; return; }
      const moved = dest.distanceTo(B.pathTarget) > 2.4;
      if (B.repathTimer <= 0 || moved || !B.path.length) {
        B.repathTimer = CFG.ai.repathInterval * (0.8 + rnd() * 0.5);
        B.pathTarget.copy(dest);
        const p = ctx.nav.findPath(actor.position, dest);
        if (p && p.length) { B.path = p; B.pathIndex = 0; B.pathsComputed++; }
        else B.path.length = 0;
      }
      // Advance along the path.
      while (B.pathIndex < B.path.length) {
        const wp = B.path[B.pathIndex];
        const d = Math.hypot(wp.x - actor.position.x, wp.z - actor.position.z);
        if (d < CFG.ai.arrivalRadius && Math.abs(wp.y - actor.position.y) < 2.2) B.pathIndex++;
        else break;
      }
    }

    /** Steering direction in world space, with local avoidance. */
    function steer(out) {
      out.set(0, 0, 0);
      const dest = desiredDestination();
      if (!dest) return out;

      let targetPoint = null;
      if (B.pathIndex < B.path.length) targetPoint = B.path[B.pathIndex];
      else if (dest) targetPoint = dest;
      if (!targetPoint) return out;

      out.set(targetPoint.x - actor.position.x, 0, targetPoint.z - actor.position.z);
      const len = out.length();
      if (len < 0.001) return out.set(0, 0, 0);
      out.multiplyScalar(1 / len);

      // Separate from nearby teammates so squads don't stack in a doorway.
      for (let i = 0; i < ctx.actors.length; i++) {
        const o = ctx.actors[i];
        if (o === actor || !o.health.alive) continue;
        const dx = actor.position.x - o.position.x, dz = actor.position.z - o.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < CFG.ai.avoidRadius * CFG.ai.avoidRadius && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          out.x += (dx / d) * (1 - d / CFG.ai.avoidRadius) * 0.85;
          out.z += (dz / d) * (1 - d / CFG.ai.avoidRadius) * 0.85;
        }
      }
      out.y = 0;
      if (out.lengthSq() > 0.0001) out.normalize();
      return out;
    }

    /* ---- combat aiming -------------------------------------------------- */
    function updateAim(dt, now) {
      let desiredYaw = B.aimYaw, desiredPitch = B.aimPitch;

      if (B.target && B.reactionTimer <= 0) {
        const wdef = actor.weapon.def;
        const targetPos = _aim.copy(B.target.centerPosition(_v2));

        // Aim higher on skilled tiers — headshots are a skill expression.
        const headBias = tier.aim > 0.8 ? 0.72 : (tier.aim > 0.6 ? 0.35 : 0.0);
        targetPos.y += B.target.currentHeight() * 0.28 * headBias;

        // Lead projectiles based on the target's velocity.
        if (wdef.projectile && wdef.projectile.speed > 0) {
          const dist = actor.position.distanceTo(B.target.position);
          const t = dist / wdef.projectile.speed;
          targetPos.addScaledVector(B.target.velocity, t * tier.lead);
          if (wdef.projectile.gravity) targetPos.y += 0.5 * wdef.projectile.gravity * t * t * tier.lead;
        } else if (wdef.range && !wdef.melee) {
          // Small lead on hitscan too, so strafing targets aren't free.
          targetPos.addScaledVector(B.target.velocity, 0.035 * tier.lead);
        }

        const eye = actor.eyePosition(_v3);
        const to = _v.copy(targetPos).sub(eye);
        const flat = Math.hypot(to.x, to.z);
        desiredYaw = Math.atan2(to.x, to.z);
        desiredPitch = -Math.atan2(to.y, flat);

        // Aim error: a slow wander plus a per-tier offset. Low tiers wobble.
        B.aimNoiseT += dt;
        const err = (1 - B.personalitySkill) * 0.16;
        desiredYaw += Math.sin(B.aimNoiseT * 2.3) * err + Math.sin(B.aimNoiseT * 0.7) * err * 0.6;
        desiredPitch += Math.cos(B.aimNoiseT * 1.9) * err * 0.55;
      } else {
        // Look where we're going, or at the last known enemy position.
        const dest = B.path.length > B.pathIndex ? B.path[B.pathIndex] : (B.goal && B.goal.position);
        if (B.lastSeenTime > 0 && now - B.lastSeenTime < 3.0) {
          const to = _v.copy(B.lastKnownPosition).sub(actor.position);
          desiredYaw = Math.atan2(to.x, to.z);
          desiredPitch = 0;
        } else if (dest) {
          desiredYaw = Math.atan2(dest.x - actor.position.x, dest.z - actor.position.z);
          desiredPitch = U.lerp(desiredPitch, 0, 0.2);
        }
      }

      // Turn speed scales with skill — this is the main "reaction" feel.
      const turnRate = U.lerp(5.5, 17.0, B.personalitySkill);
      B.aimYaw = U.dampAngle(B.aimYaw, desiredYaw, turnRate, dt);
      B.aimPitch = U.damp(B.aimPitch, U.clamp(desiredPitch, CFG.camera.pitchMin, CFG.camera.pitchMax), turnRate, dt);
    }

    /* ---- firing discipline ---------------------------------------------- */
    function shouldFire(now) {
      if (!B.target || B.reactionTimer > 0) return false;
      if (!B.target.health.alive) return false;
      const wdef = actor.weapon.def;
      const dist = actor.position.distanceTo(B.target.position);
      if (dist > wdef.range.falloffEnd * 1.25 && !wdef.melee) return false;
      if (wdef.melee && dist > wdef.meleeRange * 1.15) return false;
      if (actor.weapon.reloading || actor.weapon.magazine <= 0) return false;

      // Only shoot when actually pointed at the target.
      const eye = actor.eyePosition(_v);
      const to = _v2.copy(B.target.centerPosition(_v3)).sub(eye);
      const len = to.length();
      if (len < 0.01) return false;
      to.multiplyScalar(1 / len);
      const aimDir = actor.aimDirection(_v3);
      const dot = to.dot(aimDir);
      const tolerance = U.lerp(0.965, 0.994, B.personalitySkill);
      if (dot < tolerance) return false;

      if (!ctx.world.lineOfSight(eye, B.target.centerPosition(_v2))) return false;

      // Burst discipline: hold the trigger in bursts rather than beaming.
      if (wdef.fireMode === 'auto' && wdef.rpm > 400) {
        B.burstTimer -= 1 / 120;
        if (B.burstTimer <= 0) {
          B.burstFiring = !B.burstFiring;
          const on = U.lerp(0.22, 0.85, tier.burst);
          const off = U.lerp(0.55, 0.14, tier.burst);
          B.burstTimer = B.burstFiring ? on : off;
        }
        return B.burstFiring;
      }
      return true;
    }

    /* ---- ability usage --------------------------------------------------- */
    function updateAbilities(dt, cmd) {
      B.abilityTimer -= dt;
      if (B.abilityTimer > 0) return;
      B.abilityTimer = 0.55 + rnd() * 0.7;
      if (rnd() > tier.ability) return;

      const slots = actor.abilities.slotList();
      const dist = B.target ? actor.position.distanceTo(B.target.position) : Infinity;
      const lowHealth = actor.health.fraction() < 0.42;

      // Ultimate: use it when it will actually land on someone.
      if (actor.abilities.ultReady) {
        const nearbyEnemies = countEnemiesWithin(14);
        const ultId = slots[2] && slots[2].id;
        let want = false;
        if (ultId === 'shock_rocket' || ultId === 'mega_bomb') want = B.target && dist < 34 && dist > 6;
        else if (ultId === 'supernova') want = nearbyEnemies >= 1 && dist < 10;
        else if (ultId === 'shadow_strike') want = B.target && dist < 18;
        else if (ultId === 'juggernaut') want = nearbyEnemies >= 1 || lowHealth;
        else if (ultId === 'hyper_mode' || ultId === 'predator_mode') want = nearbyEnemies >= 1 || B.target;
        else if (ultId === 'orbital_beam') want = B.target && dist > 10 && dist < 60;
        else want = !!B.target;
        if (want) { cmd.ultimate = true; return; }
      }

      for (let i = 0; i < 2; i++) {
        const s = slots[i];
        if (!s || !actor.abilities.canActivate(s.key)) continue;
        let want = false;
        switch (s.id) {
          case 'combat_dash': want = B.target && (dist > 14 || lowHealth); break;
          case 'overcharge': want = B.target && dist < 30; break;
          case 'air_jump': want = !actor.grounded && actor.velocity.y < 0 && rnd() > 0.5; break;
          case 'hologram': want = B.target && dist < 24; break;
          case 'energy_shield': want = B.target && dist < 26; break;
          case 'ground_slam': want = B.target && dist < 6.5 && actor.grounded; break;
          case 'blink': want = B.target && (dist > 12 || lowHealth); break;
          case 'cloak': want = lowHealth || (!B.target && rnd() > 0.6); break;
          case 'sticky_charge': want = B.target && dist < 22 && dist > 4; break;
          case 'blast_jump': want = B.target && dist > 16 && actor.grounded && rnd() > 0.5; break;
          case 'hover': want = B.target && dist < 26 && actor.grounded === false; break;
          case 'plasma_orb': want = B.target && dist < 26; break;
          case 'hunter_trap': want = !B.target || dist > 16; break;
          case 'scout_drone': want = !B.target || dist > 12; break;
          case 'scanner_pulse': want = !B.target || dist < 26; break;
          case 'energy_barrier': want = B.target && dist < 30 && dist > 6; break;
          default: want = !!B.target;
        }
        if (want) { cmd[s.key] = true; return; }
      }
    }

    function countEnemiesWithin(radius) {
      let n = 0;
      for (let i = 0; i < ctx.actors.length; i++) {
        const e = ctx.actors[i];
        if (e === actor || !e.health.alive || e.team === actor.team) continue;
        if (e.position.distanceTo(actor.position) < radius) n++;
      }
      return n;
    }

    /* ---- main tick ------------------------------------------------------- */
    B.update = function (dt, now) {
      const cmd = B.commands;
      // Reset per-tick edge-triggered inputs.
      cmd.jumpPressed = false; cmd.dodgePressed = false; cmd.reloadPressed = false;
      cmd.swapPressed = false; cmd.ability1 = false; cmd.ability2 = false;
      cmd.ultimate = false; cmd.meleePressed = false; cmd.emotePressed = false;

      if (!actor.health.alive) {
        cmd.moveX = cmd.moveY = 0; cmd.fire = false; cmd.aim = false;
        cmd.lookYaw = cmd.lookPitch = 0;
        return cmd;
      }

      updatePerception(dt, now);
      updateGoal(dt);
      updatePath(dt);
      updateAim(dt, now);

      /* --- convert world steering into local move input --- */
      const dir = steer(_v);
      const cos = Math.cos(-actor.yaw), sin = Math.sin(-actor.yaw);
      let mx = dir.x * cos - dir.z * sin;
      let my = dir.x * sin + dir.z * cos;

      /* --- combat strafing --- */
      B.strafeTimer -= dt;
      if (B.strafeTimer <= 0) {
        B.strafeTimer = CFG.ai.combatStrafePeriod * (0.6 + rnd() * 0.9);
        B.strafeDir = -B.strafeDir;
      }
      if (B.target && B.reactionTimer <= 0 && dir.lengthSq() < 0.01) {
        mx = B.strafeDir * tier.strafe;
        my = (rnd() - 0.5) * 0.35;
      } else if (B.target && B.reactionTimer <= 0) {
        mx += B.strafeDir * 0.45 * tier.strafe;
      }
      const mlen = Math.hypot(mx, my);
      if (mlen > 1) { mx /= mlen; my /= mlen; }
      cmd.moveX = mx; cmd.moveY = my;

      /* --- look deltas (the actor applies them like mouse input) --- */
      cmd.lookYaw = -U.shortAngle(actor.yaw, B.aimYaw);
      cmd.lookPitch = B.aimPitch - actor.pitch;

      /* --- sprint when travelling, walk when fighting --- */
      cmd.sprint = !B.target && my > 0.6 && Math.abs(mx) < 0.5 && actor.grounded;
      cmd.crouch = false;

      /* --- firing --- */
      cmd.fire = shouldFire(now);
      cmd.aim = !!B.target && B.reactionTimer <= 0 &&
        actor.position.distanceTo(B.target.position) > 9 && !actor.weapon.def.melee;
      if (actor.weapon.magazine <= 0 && !actor.weapon.reloading) cmd.reloadPressed = true;
      // Reload during downtime rather than mid-duel.
      if (!B.target && actor.weapon.canReload() && actor.weapon.magazine < actor.weapon.def.magazine * 0.55) {
        cmd.reloadPressed = true;
      }
      // Nyx: swap to the sidearm when the target is out of blade range.
      if (actor.weaponSlots.length > 1 && B.target) {
        const d = actor.position.distanceTo(B.target.position);
        const wantIndex = d < 4.5 ? 0 : 1;
        if (wantIndex !== actor.weaponIndex && !actor.weapon.swapping && rnd() > 0.4) cmd.swapPressed = true;
      }

      /* --- evasive movement --- */
      B.dodgeTimer -= dt;
      if (B.target && B.dodgeTimer <= 0 && rnd() < tier.ability * 0.5) {
        B.dodgeTimer = 2.2 + rnd() * 2.5;
        cmd.dodgePressed = true;
      }
      B.jumpTimer -= dt;
      if (B.jumpTimer <= 0) {
        B.jumpTimer = 0.6 + rnd();
        // Jump when the path climbs, or occasionally while duelling.
        const wp = B.path[B.pathIndex];
        if (wp && wp.y - actor.position.y > 0.6) cmd.jumpPressed = true;
        else if (B.target && rnd() < 0.18 * tier.strafe) cmd.jumpPressed = true;
      }

      /* --- unstick --- */
      if (actor.position.distanceTo(B.lastPos) < 0.16 && (Math.abs(mx) > 0.2 || Math.abs(my) > 0.2)) {
        B.stuckTimer += dt;
        if (B.stuckTimer > 0.85) {
          B.stuckTimer = 0;
          B.repathTimer = 0;
          cmd.jumpPressed = true;
          B.strafeDir = -B.strafeDir;
          cmd.moveX = B.strafeDir; cmd.moveY = 0.4;
        }
      } else {
        B.stuckTimer = 0;
        B.lastPos.copy(actor.position);
      }

      updateAbilities(dt, cmd);
      return cmd;
    };

    B.onDamaged = function (info) {
      // Getting shot from an unseen angle turns the bot toward the shooter.
      if (!B.target && info && info.attacker) {
        B.lastKnownPosition.copy(info.attacker.position);
        B.lastSeenTime = performance.now() / 1000;
        B.reactionTimer = tier.reaction * 1.4;
      }
    };

    return B;
  };

})(window.HC, window.THREE);
