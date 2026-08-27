/* =========================================================================
 * HYPERCELL — 22_arena.js
 * The live match: scene, collision world, navigation, actors, deployables,
 * projectiles, the shared combat context, and the game-mode rules.
 *
 * The combat context is the single authority for damage, explosions,
 * marking and hit resolution — weapons and abilities only ask it to act,
 * which is what keeps the rules in one auditable place (brief §52).
 * ========================================================================= */
(function (HC, THREE) {
  'use strict';

  const U = HC.Util;
  const CFG = HC.CFG;

  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

  /* ------------------------------------------------------------------ *
   * Game modes
   * ------------------------------------------------------------------ */
  const Modes = HC.Modes = HC.Registry('Modes', null);

  Modes.define('power_core', {
    name: 'POWER CORE', short: 'CORE',
    teamBased: true, teamSize: 5, scoreLimit: 5, timeLimit: 600,
    description: 'Seize the Power Core from the plaza and carry it to your delivery pad. ' +
                 'The carrier is slower and visible to everyone — you will need your team.',
    rules: [
      'The Core respawns in the plaza 6s after a score or a reset.',
      'Carrying the Core costs you 22% movement speed and reveals you to the enemy team.',
      'Drop the Core and it stays live for 12s before returning to the plaza.',
      'First team to 5 deliveries wins. Tied at time-up goes to sudden-death overtime.'
    ]
  });

  Modes.define('team_clash', {
    name: 'TEAM CLASH', short: 'CLASH',
    teamBased: true, teamSize: 5, scoreLimit: 40, timeLimit: 480,
    description: 'Straight 5v5 elimination race. First team to 40 eliminations takes it.',
    rules: ['Every elimination is one point.', 'Respawns are on a 6s timer.', 'No objective — just fights.']
  });

  Modes.define('zone_control', {
    name: 'ZONE CONTROL', short: 'ZONE',
    teamBased: true, teamSize: 5, scoreLimit: 300, timeLimit: 600,
    description: 'Three capture zones. Hold more of them than the enemy and your score ticks up.',
    rules: ['Each held zone generates 1 point per second.',
            'A contested zone generates nothing for either side.',
            'Capturing takes 4s uncontested; more bodies capture faster.']
  });

  Modes.define('crystal_control', {
    name: 'CRYSTAL CONTROL', short: 'CRYSTAL',
    teamBased: true, teamSize: 5, scoreLimit: 30, timeLimit: 480,
    description: 'Crystals spawn across the district. Bank them by holding them at match end — ' +
                 'and drop everything you carry when you die.',
    rules: ['Crystals spawn every 4s at fixed points.',
            'You drop every carried crystal on death.',
            'Reaching 30 crystals starts a 20s countdown — survive it to win.']
  });

  Modes.define('solo_arena', {
    name: 'SOLO ARENA', short: 'SOLO',
    teamBased: false, teamSize: 1, playerCount: 8, scoreLimit: 20, timeLimit: 420,
    description: 'Free-for-all. Everyone is hostile. First to 20 eliminations wins.',
    rules: ['No teammates.', 'Spawns are spread across the whole district.']
  });

  /* ------------------------------------------------------------------ *
   * Arena
   * ------------------------------------------------------------------ */
  HC.Arena = function Arena(opts) {
    const scene = opts.scene;
    const world = HC.PhysicsWorld();
    const modeDef = HC.Modes.get(opts.mode || 'power_core');
    const mapDef = HC.Maps.get(opts.map || 'nova_district');

    const A = {
      scene, world, modeDef, mapDef,
      map: null, nav: null,
      actors: [], deployables: [], projectiles: null,
      player: null, playerBrain: null,
      teams: { A: { score: 0, name: 'VANGUARD', players: [] }, B: { score: 0, name: 'EMBER', players: [] } },
      time: 0, matchTime: 0, state: 'warmup',
      timeRemaining: modeDef.timeLimit,
      overtime: false,
      killFeed: [],
      events: HC.Events('arena'),
      objective: null,
      stats: { shotsFired: 0, shotsHit: 0, crits: 0 },
      _markScratch: [],
      _pendingHitStop: 0
    };

    /* ---- build the world ---------------------------------------------- */
    A.map = mapDef.build(scene, world, {});
    A.nav = HC.NavGraph(world, {
      bounds: A.map.bounds,
      spacing: 2.6
    }).build();

    /* ================================================================== *
     * Combat context
     * ================================================================== */
    const ctx = A.ctx = {
      world, scene, nav: A.nav,
      actors: A.actors,
      arena: A,

      /** Ray against the world and every actor. Returns the nearest hit. */
      trace(origin, dir, maxDist, ignoreActor) {
        const worldHit = world.raycast(origin, dir, maxDist, null, 'projectiles');
        const actorHit = ctx.traceActors(origin, dir, worldHit ? worldHit.distance : maxDist, ignoreActor);
        if (actorHit && (!worldHit || actorHit.distance < worldHit.distance)) return actorHit;
        return worldHit;
      },

      traceActors(origin, dir, maxDist, ignoreActor) {
        let best = null;
        for (let i = 0; i < A.actors.length; i++) {
          const t = A.actors[i];
          if (t === ignoreActor || !t.health.alive) continue;
          if (ignoreActor && t.team === ignoreActor.team && !CFG.combat.friendlyFire && modeDef.teamBased) continue;
          const h = HC.Hitbox.rayCapsule(origin, dir, maxDist, t.position, t.capsuleRadius, t.currentHeight());
          if (h && (!best || h.distance < best.distance)) {
            h.actor = t;
            h.surface = 'flesh';
            h.normal = _v.copy(dir).negate().clone();
            best = h;
          }
        }
        // Free-standing deployables (holograms, drones, traps) are bodies and
        // get a capsule. Barriers and shields are hit through their collision
        // box instead — see `shape.deployable` in 17_weapon.js.
        for (let i = 0; i < A.deployables.length; i++) {
          const d = A.deployables[i];
          if (!d.alive || !d.position || d.maxHealth <= 0 || !d.targetable) continue;
          if (ignoreActor && d.team === ignoreActor.team && modeDef.teamBased) continue;
          const r = d.radius || 0.6;
          const feetY = d.position.y + (d.hitFeetOffset === undefined ? -r : d.hitFeetOffset);
          const h = HC.Hitbox.rayCapsule(origin, dir, maxDist,
            _v2.set(d.position.x, feetY, d.position.z),
            r, d.hitHeight || r * 2.4);
          if (h && (!best || h.distance < best.distance)) {
            h.deployable = d;
            h.actor = null;
            h.surface = 'energy';
            h.normal = _v3.copy(dir).negate().clone();
            best = h;
          }
        }
        return best;
      },

      meleeSweep(o) {
        const out = [];
        const dir = _v.copy(o.direction); dir.y = 0;
        if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1);
        dir.normalize();
        const halfArc = Math.cos(o.arc * 0.5);
        for (let i = 0; i < A.actors.length; i++) {
          const t = A.actors[i];
          if (t === o.owner || !t.health.alive) continue;
          if (t.team === o.owner.team && !CFG.combat.friendlyFire && modeDef.teamBased) continue;
          const to = _v2.copy(t.position).sub(o.owner.position);
          const dist = to.length();
          if (dist > o.range + t.capsuleRadius) continue;
          to.y = 0;
          if (to.lengthSq() > 0.0001) to.normalize();
          if (to.dot(dir) < halfArc) continue;
          if (!world.lineOfSight(o.origin, t.centerPosition(_v3))) continue;
          out.push({
            actor: t, distance: dist, zone: 'body',
            point: t.centerPosition(new THREE.Vector3()),
            normal: to.clone().negate(), surface: 'flesh'
          });
        }
        return out;
      },

      /** Single authority for applying damage. */
      damage(info) {
        const target = info.target;
        if (!target) return null;

        // Deployables carry a plain numeric health; combatants carry a
        // HealthComponent. Discriminate on the type, not on truthiness —
        // a deployable at 0 HP is falsy and would take the wrong branch.
        if (typeof target.health === 'number') {
          if (!target.alive) return null;
          const before = target.health;
          target.health = Math.max(0, target.health - info.amount);
          const applied = before - target.health;
          HC.VFX.impact(info.point || target.position,
            info.direction ? info.direction.clone().negate() : _v.set(0, 1, 0), 'energy', 0.8);
          const killed = target.health <= 0;
          if (killed) target.kill();
          if (applied > 0 && info.attacker && info.attacker.isPlayer) {
            A.events.emit('hitmarker', { critical: false, shield: true, killed });
          }
          return { applied, toShield: applied, toHealth: 0, toArmor: 0, hitShield: true, killed, critical: false };
        }
        if (!target.health || typeof target.health.applyDamage !== 'function') {
          HC.Log.warn('Arena', 'damage() called on a target with no health component');
          return null;
        }

        const before = target.health.alive;
        const result = target.health.applyDamage(info);

        if (result.applied > 0 && info.attacker && info.attacker.score) {
          info.attacker.score.damage += result.applied;
          info.attacker.abilities.addUltCharge(result.applied * CFG.combat.ultChargePerDamage);
        }
        if (result.applied > 0 && info.attacker && info.attacker.isPlayer) {
          A.events.emit('hitmarker', {
            critical: result.critical, shield: result.hitShield, killed: result.killed,
            amount: result.applied, position: info.point || target.centerPosition(new THREE.Vector3())
          });
        }
        if (result.applied > 0 && target.isPlayer) {
          A.events.emit('playerDamaged', { info, result });
        }
        if (result.applied > 0 && target.brain) target.brain.onDamaged(info);

        if (result.killed && before) onActorKilled(target, info);
        return result;
      },

      /** Radial damage with line-of-sight and falloff. */
      explode(o) {
        const center = o.center;
        const results = [];
        for (let i = 0; i < A.actors.length; i++) {
          const t = A.actors[i];
          if (!t.health.alive) continue;
          const isSelf = t === o.attacker;
          if (isSelf && o.excludeSelf) continue;
          if (!isSelf && o.exclude === t) continue;
          if (!isSelf && t.team === o.attacker.team && !CFG.combat.friendlyFire && modeDef.teamBased) continue;

          const p = t.centerPosition(_v);
          const dist = p.distanceTo(center);
          if (dist > o.radius + t.capsuleRadius) continue;

          // Cover check: geometry between the blast and the target halves it.
          let coverFactor = 1;
          if (!world.lineOfSight(center, p)) {
            const feet = _v2.copy(t.position); feet.y += 0.35;
            if (!world.lineOfSight(center, feet)) continue;
            coverFactor = 0.55;
          }

          const inner = o.innerRadius || 0;
          const t01 = dist <= inner ? 0 : U.clamp01((dist - inner) / Math.max(0.001, o.radius - inner));
          const frac = U.lerp(1, o.minFraction === undefined ? 0.35 : o.minFraction, U.smoothstep(t01));
          let amount = o.damage * frac * coverFactor;
          if (isSelf) amount *= CFG.combat.selfDamageScale;

          const dir = _v3.copy(p).sub(center);
          if (dir.lengthSq() < 0.0001) dir.set(0, 1, 0);
          dir.normalize();
          if (o.upBias) { dir.y = Math.max(dir.y, o.upBias); dir.normalize(); }

          const knock = (isSelf ? (o.selfKnockback || 0) : (o.knockback || 0)) * frac;
          const r = ctx.damage({
            target: t, amount, type: o.type || 'explosive', attacker: o.attacker,
            critical: false, point: p.clone(), direction: dir.clone(),
            source: 'explosion', weaponId: o.weaponId, abilityId: o.abilityId,
            knockback: knock
          });
          if (r) results.push({ actor: t, result: r });
        }
        // Deployables in range take the hit too.
        for (let i = 0; i < A.deployables.length; i++) {
          const d = A.deployables[i];
          if (!d.alive || d.maxHealth <= 0 || !d.position) continue;
          if (d.team === o.attacker.team && modeDef.teamBased) continue;
          if (d.position.distanceTo(center) > o.radius) continue;
          d.health -= o.damage * 0.6;
          if (d.health <= 0) d.kill();
        }
        if (!o.silent) ctx.shake(center, U.clamp(o.radius / 9, 0.2, 1.3), 0.4);
        return results;
      },

      spawnProjectile(o) { return A.projectiles.spawn(o); },

      spawnDeployable(dep) { A.deployables.push(dep); return dep; },

      mark(target, duration, byTeam, throughWalls) {
        if (!target || !target.health || !target.health.alive) return;
        const until = A.time + duration;
        if (until > target.markedUntil) {
          target.markedUntil = until;
          target.markedBy = byTeam;
          target.markedThroughWalls = !!throughWalls;
        }
      },

      shake(position, amount, duration) {
        if (A.camera) A.camera.addWorldShake(position, amount, duration);
      },

      notify(event, data) { A.events.emit(event, data); },
      notifyFeed(actor, text) { A.events.emit('feed', { actor, text }); },

      getBotGoal(actor, brain) { return A.mode.getBotGoal ? A.mode.getBotGoal(actor, brain) : null; }
    };

    A.projectiles = HC.ProjectileSystem(scene, world, ctx);

    /* ================================================================== *
     * Actor management
     * ================================================================== */
    A.addActor = function (config) {
      const actor = HC.Actor({
        characterId: config.characterId,
        skinId: config.skinId,
        team: config.team,
        name: config.name,
        isPlayer: config.isPlayer,
        ctx, combatCtx: ctx, abilityCtx: ctx
      });
      scene.add(actor.model.root);
      A.actors.push(actor);
      if (modeDef.teamBased) A.teams[config.team].players.push(actor);
      if (config.isPlayer) A.player = actor;
      else {
        actor.brain = HC.BotBrain(actor, ctx, { difficulty: config.difficulty || CFG.ai.difficulty });
      }
      actor.events.on('died', (info) => { /* scoring handled in onActorKilled */ });
      return actor;
    };

    function onActorKilled(victim, info) {
      const killer = info && info.attacker && info.attacker !== victim ? info.attacker : null;
      const assists = victim.health.getAssists(killer);

      if (killer && killer.score) {
        const sameTeam = modeDef.teamBased && killer.team === victim.team;
        if (!sameTeam) {
          killer.score.kills++;
          killer.score.streak++;
          killer.score.bestStreak = Math.max(killer.score.bestStreak, killer.score.streak);
          killer.abilities.onKill();
          if (killer.isPlayer) A.events.emit('playerKill', { victim, killer, assists });
        }
      }
      assists.forEach(a => { if (a.score) a.score.assists++; });

      A.pushKillFeed({
        killer: killer ? killer.name : null,
        killerTeam: killer ? killer.team : null,
        victim: victim.name,
        victimTeam: victim.team,
        weapon: info ? (info.abilityId || info.weaponId || info.source) : 'environment',
        critical: info ? !!info.critical : false,
        assists: assists.map(a => a.name)
      });

      if (CFG.feel.hitStopEnabled && killer && killer.isPlayer) A._pendingHitStop = CFG.feel.hitStopKill;

      A.mode.onKill && A.mode.onKill(victim, killer, info);
      A.events.emit('kill', { victim, killer, info, assists });
    }

    A.pushKillFeed = function (entry) {
      entry.time = A.time;
      A.killFeed.push(entry);
      if (A.killFeed.length > 8) A.killFeed.shift();
      A.events.emit('killFeed', entry);
    };

    /* ---- spawning ------------------------------------------------------ */
    A.spawnPointFor = function (actor) {
      const list = modeDef.teamBased ? A.map.spawns[actor.team] : A.map.spawns.ffa;
      if (!list || !list.length) return { position: new THREE.Vector3(0, 1, 0), yaw: 0 };
      // Pick the spawn furthest from the nearest visible enemy.
      let best = list[0], bestScore = -Infinity;
      for (let i = 0; i < list.length; i++) {
        const sp = list[i];
        let score = Math.random() * 6;
        for (let k = 0; k < A.actors.length; k++) {
          const e = A.actors[k];
          if (e === actor || !e.health.alive) continue;
          const d = e.position.distanceTo(sp.position);
          const hostile = !modeDef.teamBased || e.team !== actor.team;
          score += hostile ? Math.min(d, 45) : -Math.min(d, 20) * 0.1;
        }
        if (score > bestScore) { bestScore = score; best = sp; }
      }
      return best;
    };

    A.respawn = function (actor) {
      const sp = A.spawnPointFor(actor);
      actor.spawn(sp);
      A.events.emit('respawn', actor);
    };

    /* ================================================================== *
     * Mode implementations
     * ================================================================== */
    function makeMode() {
      switch (modeDef.id) {
        case 'power_core': return PowerCoreMode(A, ctx);
        case 'team_clash': return TeamClashMode(A, ctx);
        case 'zone_control': return ZoneControlMode(A, ctx);
        case 'crystal_control': return CrystalMode(A, ctx);
        case 'solo_arena': return SoloArenaMode(A, ctx);
        default:
          HC.Log.warn('Arena', 'unknown mode "' + modeDef.id + '" — falling back to Team Clash');
          return TeamClashMode(A, ctx);
      }
    }
    A.mode = makeMode();

    /* ================================================================== *
     * Update
     * ================================================================== */
    let shadowCullTimer = 0;
    A.setCamera = function (rig) { A.camera = rig; };

    A.start = function () {
      A.state = 'active';
      A.matchTime = 0;
      A.timeRemaining = modeDef.timeLimit;
      A.mode.start && A.mode.start();
      A.events.emit('matchStart');
    };

    A.tick = function (dt) {
      A.time += dt;
      if (A.state === 'active') {
        A.matchTime += dt;
        A.timeRemaining = Math.max(0, A.timeRemaining - dt);
      }

      // Actors
      for (let i = 0; i < A.actors.length; i++) {
        const actor = A.actors[i];
        let cmd;
        if (actor.isPlayer) cmd = A.playerCommands || HC.blankCommands();
        else cmd = actor.brain.update(dt, A.time);
        actor.update(dt, cmd);

        if (!actor.health.alive && actor.respawnTimer <= 0 && A.state === 'active') A.respawn(actor);
      }

      // Soft body separation so players never stand inside each other.
      resolveActorOverlap(dt);

      // Shadow budget: the sun re-renders every caster each frame, so only
      // actors close enough for their shadow to read keep casting one.
      shadowCullTimer -= dt;
      if (shadowCullTimer <= 0) {
        shadowCullTimer = 0.35;
        const ref = A.camera && A.camera.camera ? A.camera.camera.position
          : (A.player ? A.player.position : null);
        if (ref) {
          for (let i = 0; i < A.actors.length; i++) {
            const a = A.actors[i];
            const near = a.position.distanceTo(ref) < 34;
            if (a._castsShadow !== near) { a._castsShadow = near; a.model.setCastShadow(near); }
          }
        }
      }

      // Deployables
      for (let i = A.deployables.length - 1; i >= 0; i--) {
        const d = A.deployables[i];
        d.tick(dt, ctx);
        if (!d.alive) A.deployables.splice(i, 1);
      }

      A.projectiles.update(dt);
      A.mode.update(dt);
      A.map.update(dt);

      if (A.state === 'active') checkEnd();
    };

    function resolveActorOverlap(dt) {
      for (let i = 0; i < A.actors.length; i++) {
        const a = A.actors[i];
        if (!a.health.alive) continue;
        for (let k = i + 1; k < A.actors.length; k++) {
          const b = A.actors[k];
          if (!b.health.alive) continue;
          const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
          const minD = a.capsuleRadius + b.capsuleRadius;
          const d2 = dx * dx + dz * dz;
          if (d2 >= minD * minD || d2 < 1e-6) continue;
          // Only separate when vertically overlapping.
          if (b.position.y > a.position.y + a.currentHeight() - 0.15) continue;
          if (a.position.y > b.position.y + b.currentHeight() - 0.15) continue;
          const d = Math.sqrt(d2);
          const push = (minD - d) * 0.5;
          const nx = dx / d, nz = dz / d;
          // Heavier characters shove lighter ones.
          const wa = a.charDef.gait.weight || 1, wb = b.charDef.gait.weight || 1;
          const total = wa + wb;
          a.position.x -= nx * push * 2 * (wb / total);
          a.position.z -= nz * push * 2 * (wb / total);
          b.position.x += nx * push * 2 * (wa / total);
          b.position.z += nz * push * 2 * (wa / total);
        }
      }
    }

    function checkEnd() {
      const res = A.mode.checkWin();
      if (!res) return;
      A.state = 'ended';
      A.result = res;
      A.events.emit('matchEnd', res);
    }

    A.consumeHitStop = function () {
      const h = A._pendingHitStop;
      A._pendingHitStop = 0;
      return h;
    };

    A.aliveEnemiesOf = function (actor) {
      let n = 0;
      for (let i = 0; i < A.actors.length; i++) {
        const e = A.actors[i];
        if (e === actor || !e.health.alive) continue;
        if (modeDef.teamBased && e.team === actor.team) continue;
        n++;
      }
      return n;
    };

    A.dispose = function () {
      A.actors.forEach(a => a.dispose());
      A.actors.length = 0;
      A.deployables.forEach(d => { if (d.alive) d.kill(); });
      A.deployables.length = 0;
      A.projectiles.dispose();
      A.mode.dispose && A.mode.dispose();
      A.map.dispose();
      world.clear();
      A.events.clear();
    };

    return A;
  };

  /* ================================================================== *
   * POWER CORE
   * ================================================================== */
  function PowerCoreMode(A, ctx) {
    const scene = A.scene;
    const coreColor = HC.PALETTE.objective;
    const coreObj = HC.WeaponModel.buildPowerCore(coreColor);
    scene.add(coreObj);

    const M = {
      id: 'power_core',
      core: {
        object: coreObj,
        position: A.map.coreSpawn.clone(),
        carrier: null,
        state: 'spawning',        // spawning | idle | carried | dropped
        respawnTimer: 3.0,
        dropTimer: 0,
        velocity: new THREE.Vector3(),
        bob: 0
      },
      lastScoreTeam: null,
      announce: null
    };

    A.objective = M.core;

    M.start = function () { M.core.state = 'spawning'; M.core.respawnTimer = 3.0; };

    function resetCore(delay) {
      if (M.core.carrier) {
        M.core.carrier.carryingObjective = null;
        M.core.carrier.removeMovementModifier('core_carry');
        M.core.carrier = null;
      }
      M.core.state = 'spawning';
      M.core.respawnTimer = delay;
      M.core.position.copy(A.map.coreSpawn);
      coreObj.visible = false;
    }

    function pickup(actor) {
      M.core.carrier = actor;
      M.core.state = 'carried';
      actor.carryingObjective = M.core;
      actor.addMovementModifier('core_carry', { speedMul: 0.78 }, Infinity);
      ctx.mark(actor, 1e9, actor.team === 'A' ? 'B' : 'A', true);
      HC.Audio.play('objective_pickup', { position: actor.position, important: true });
      A.events.emit('objective', { type: 'pickup', actor });
      A.pushKillFeed({ system: true, text: actor.name + ' HAS THE CORE', team: actor.team });
    }

    function drop(reason) {
      const carrier = M.core.carrier;
      if (!carrier) return;
      M.core.position.copy(carrier.position);
      M.core.position.y += 1.0;
      M.core.velocity.set((Math.random() - 0.5) * 2, 3.2, (Math.random() - 0.5) * 2);
      carrier.carryingObjective = null;
      carrier.removeMovementModifier('core_carry');
      carrier.markedUntil = 0;
      M.core.carrier = null;
      M.core.state = 'dropped';
      M.core.dropTimer = 12;
      coreObj.visible = true;
      HC.Audio.play('objective_drop', { position: M.core.position, important: true });
      A.events.emit('objective', { type: 'drop', reason });
      A.pushKillFeed({ system: true, text: 'CORE DROPPED', team: null });
    }

    function score(team, carrier) {
      A.teams[team].score++;
      if (carrier && carrier.score) {
        carrier.score.objective += 100;
        carrier.abilities.addUltCharge(CFG.combat.ultChargeOnObjective);
      }
      // Everyone nearby shares objective credit — this is a team mode.
      A.actors.forEach(a => {
        if (a.team === team && a !== carrier && a.health.alive &&
            a.position.distanceTo(A.map.deliveryZones[team].position) < 18) {
          a.score.objective += 35;
          a.abilities.addUltCharge(CFG.combat.ultChargeOnObjective * 0.5);
        }
      });
      HC.Audio.play('objective_score', { position: null, bus: 'ui', important: true });
      A.pushKillFeed({ system: true, text: A.teams[team].name + ' SCORED  ' + A.teams.A.score + ' — ' + A.teams.B.score, team });
      A.events.emit('objective', { type: 'score', team, carrier });
      M.lastScoreTeam = team;
      resetCore(6.0);
    }

    M.update = function (dt) {
      const core = M.core;
      core.bob += dt;

      if (core.state === 'spawning') {
        core.respawnTimer -= dt;
        if (core.respawnTimer <= 0) {
          core.state = 'idle';
          core.position.copy(A.map.coreSpawn);
          coreObj.visible = true;
          HC.VFX.burst(core.position, coreColor, 40, 8, { spread: 0.6, life: 0.8 });
          HC.Audio.play('objective_alert', { position: core.position, important: true });
          A.events.emit('objective', { type: 'spawn' });
        }
      } else if (core.state === 'idle' || core.state === 'dropped') {
        if (core.state === 'dropped') {
          core.dropTimer -= dt;
          if (core.dropTimer <= 0) { resetCore(4.0); return; }
          // Physics for the dropped core so it settles somewhere reachable.
          core.velocity.y -= CFG.sim.gravity * 0.55 * dt;
          core.position.addScaledVector(core.velocity, dt);
          const g = ctx.world.groundHeight(core.position.x, core.position.y + 0.4, core.position.z, 30);
          if (g.y > -Infinity && core.position.y <= g.y + 0.55) {
            core.position.y = g.y + 0.55;
            core.velocity.multiplyScalar(0.24);
            core.velocity.y = 0;
          }
        }
        // Pickup check
        for (let i = 0; i < A.actors.length; i++) {
          const a = A.actors[i];
          if (!a.health.alive) continue;
          if (a.position.distanceTo(core.position) < 1.9) { pickup(a); break; }
        }
      } else if (core.state === 'carried') {
        const c = core.carrier;
        if (!c || !c.health.alive) { drop('death'); return; }
        core.position.copy(c.position);
        core.position.y += c.currentHeight() + 0.55;
        // Delivery
        const zone = A.map.deliveryZones[c.team];
        if (zone && c.position.distanceTo(zone.position) < zone.radius) score(c.team, c);
      }

      // Visuals
      coreObj.position.copy(core.position);
      if (core.state === 'idle') coreObj.position.y += Math.sin(core.bob * 1.6) * 0.20;
      coreObj.rotation.y += dt * 0.8;
      const ud = coreObj.userData;
      ud.cage.rotation.x += dt * 0.9;
      ud.cage.rotation.z += dt * 0.55;
      const pulse = 0.85 + Math.sin(core.bob * 4) * 0.15;
      ud.innerMesh.scale.setScalar(pulse);
      ud.glowMesh.scale.setScalar(1 + Math.sin(core.bob * 2.2) * 0.12);
      if (core.state !== 'spawning' && Math.random() < dt * 22) {
        HC.VFX.sparks.spawn({
          x: core.position.x + (Math.random() - 0.5) * 1.2,
          y: core.position.y + (Math.random() - 0.5) * 1.2,
          z: core.position.z + (Math.random() - 0.5) * 1.2,
          vx: 0, vy: 0.4, vz: 0, life: 0.55, size0: 0.10, size1: 0.01,
          color0: 0xffffff, color1: coreColor, alpha: 0.9, drag: 2.5
        });
      }
      HC.VFX.light(core.position, coreColor, 2.4, 14, 0.06);
    };

    M.onKill = function (victim) {
      if (M.core.carrier === victim) drop('death');
    };

    M.checkWin = function () {
      if (A.teams.A.score >= A.modeDef.scoreLimit) return { winner: 'A', reason: 'score' };
      if (A.teams.B.score >= A.modeDef.scoreLimit) return { winner: 'B', reason: 'score' };
      if (A.timeRemaining <= 0) {
        if (A.teams.A.score === A.teams.B.score) {
          if (!A.overtime) { A.overtime = true; A.timeRemaining = CFG.match.overtimeDuration;
            A.events.emit('overtime'); return null; }
          return { winner: 'draw', reason: 'time' };
        }
        return { winner: A.teams.A.score > A.teams.B.score ? 'A' : 'B', reason: 'time' };
      }
      return null;
    };

    M.getBotGoal = function (actor, brain) {
      const core = M.core;
      const zone = A.map.deliveryZones[actor.team];
      if (core.carrier === actor) return { type: 'escort', position: zone.position.clone() };
      if (core.carrier && core.carrier.team === actor.team) {
        // Escort the carrier from slightly ahead.
        const p = _v.copy(zone.position).sub(core.carrier.position);
        p.y = 0;
        if (p.lengthSq() > 0.01) p.normalize();
        return { type: 'escort', position: core.carrier.position.clone().addScaledVector(p, 6) };
      }
      if (core.state === 'carried') return { type: 'attack', position: core.carrier.position.clone(), target: core.carrier };
      if (core.state === 'spawning') return { type: 'stage', position: A.map.coreSpawn.clone().add(
        _v.set((Math.random() - 0.5) * 14, 0, (Math.random() - 0.5) * 14)) };
      return { type: 'pickup', position: core.position.clone() };
    };

    M.dispose = function () { scene.remove(coreObj); HC.WeaponModel.disposeObject(coreObj); };
    return M;
  }

  /* ================================================================== *
   * TEAM CLASH
   * ================================================================== */
  function TeamClashMode(A, ctx) {
    const M = { id: 'team_clash' };
    M.update = function () {};
    M.onKill = function (victim, killer) {
      if (killer && killer.team !== victim.team) A.teams[killer.team].score++;
    };
    M.checkWin = function () {
      if (A.teams.A.score >= A.modeDef.scoreLimit) return { winner: 'A', reason: 'score' };
      if (A.teams.B.score >= A.modeDef.scoreLimit) return { winner: 'B', reason: 'score' };
      if (A.timeRemaining <= 0) {
        if (A.teams.A.score === A.teams.B.score) return { winner: 'draw', reason: 'time' };
        return { winner: A.teams.A.score > A.teams.B.score ? 'A' : 'B', reason: 'time' };
      }
      return null;
    };
    M.getBotGoal = function (actor, brain) {
      if (brain.target) return { type: 'attack', position: brain.target.position.clone(), target: brain.target };
      // Head for the fight: the centroid of living enemies.
      const c = new THREE.Vector3();
      let n = 0;
      A.actors.forEach(e => { if (e.health.alive && e.team !== actor.team) { c.add(e.position); n++; } });
      if (n) { c.multiplyScalar(1 / n); return { type: 'move', position: c }; }
      return { type: 'roam', position: A.nav.randomNear(actor.position, 26) || actor.position.clone() };
    };
    return M;
  }

  /* ================================================================== *
   * ZONE CONTROL
   * ================================================================== */
  function ZoneControlMode(A, ctx) {
    const zones = A.map.controlZones.map(z => ({
      id: z.id, name: z.name, position: z.position.clone(), radius: z.radius,
      owner: null, progress: 0, contested: false, presence: { A: 0, B: 0 },
      ring: null
    }));

    zones.forEach(z => {
      const geo = new THREE.RingGeometry(z.radius - 0.35, z.radius, 48);
      const mat = HC.Mats.additive(HC.PALETTE.neutral, 0.5);
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(z.position); ring.position.y += 0.12;
      ring.renderOrder = 8;
      A.scene.add(ring);
      z.ring = ring; z.geo = geo; z.mat = mat;
    });

    const M = { id: 'zone_control', zones };
    A.objective = { zones };

    M.update = function (dt) {
      let tickA = 0, tickB = 0;
      zones.forEach(z => {
        z.presence.A = 0; z.presence.B = 0;
        A.actors.forEach(a => {
          if (!a.health.alive) return;
          if (a.position.distanceTo(z.position) <= z.radius) z.presence[a.team]++;
        });
        const dominant = z.presence.A > z.presence.B ? 'A' : (z.presence.B > z.presence.A ? 'B' : null);
        z.contested = z.presence.A > 0 && z.presence.B > 0;
        if (dominant && !z.contested) {
          const rate = (1 + Math.min(2, z.presence[dominant] - 1) * 0.45) / 4.0;
          if (z.owner === dominant) z.progress = Math.min(1, z.progress + rate * dt);
          else {
            z.progress -= rate * dt;
            if (z.progress <= 0) {
              z.owner = dominant; z.progress = 0.02;
              HC.Audio.play('objective_alert', { position: z.position, important: true });
              A.pushKillFeed({ system: true, text: A.teams[dominant].name + ' TOOK ' + z.name, team: dominant });
            }
          }
        }
        if (z.owner && !z.contested) {
          if (z.owner === 'A') tickA++; else tickB++;
        }
        const color = z.contested ? HC.PALETTE.neutral
          : (z.owner ? HC.Mats.teamColor(z.owner) : HC.PALETTE.neutral);
        z.mat.color.set(color);
        z.mat.opacity = 0.35 + (z.contested ? Math.abs(Math.sin(A.time * 7)) * 0.4 : Math.abs(z.progress) * 0.4);
        z.ring.scale.setScalar(1 + Math.sin(A.time * 1.6 + z.position.x) * 0.02);
      });
      A.teams.A.score += tickA * dt;
      A.teams.B.score += tickB * dt;
    };

    M.checkWin = function () {
      if (A.teams.A.score >= A.modeDef.scoreLimit) return { winner: 'A', reason: 'score' };
      if (A.teams.B.score >= A.modeDef.scoreLimit) return { winner: 'B', reason: 'score' };
      if (A.timeRemaining <= 0) {
        if (Math.round(A.teams.A.score) === Math.round(A.teams.B.score)) return { winner: 'draw', reason: 'time' };
        return { winner: A.teams.A.score > A.teams.B.score ? 'A' : 'B', reason: 'time' };
      }
      return null;
    };

    M.getBotGoal = function (actor, brain) {
      // Take the most valuable zone we don't hold, otherwise defend.
      let best = null, bestScore = -Infinity;
      zones.forEach(z => {
        let s = -z.position.distanceTo(actor.position) * 0.25;
        if (z.owner !== actor.team) s += 30;
        if (z.contested) s += 25;
        if (z.owner === actor.team) s += 6;
        if (s > bestScore) { bestScore = s; best = z; }
      });
      if (!best) return null;
      const jitter = _v.set((Math.random() - 0.5) * best.radius, 0, (Math.random() - 0.5) * best.radius);
      return { type: 'zone', position: best.position.clone().add(jitter), zone: best };
    };

    M.dispose = function () {
      zones.forEach(z => { A.scene.remove(z.ring); z.geo.dispose(); });
    };
    return M;
  }

  /* ================================================================== *
   * CRYSTAL CONTROL
   * ================================================================== */
  function CrystalMode(A, ctx) {
    const crystals = [];
    const geo = new THREE.OctahedronGeometry(0.34, 0);
    const mat = HC.Mats.make({ unique: true, kind: 'energy', color: 0x9b6bff,
      emissive: 0x9b6bff, emissiveIntensity: 3.0, opacity: 0.95, rim: false });
    let spawnTimer = 1.5;
    let countdown = { active: false, team: null, timer: 0 };

    const M = { id: 'crystal_control', crystals, countdown };
    A.objective = { crystals, countdown };

    function spawnCrystal() {
      const points = A.map.crystalSpawns;
      const p = points[Math.floor(Math.random() * points.length)];
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(p);
      mesh.position.x += (Math.random() - 0.5) * 3;
      mesh.position.z += (Math.random() - 0.5) * 3;
      mesh.position.y += 0.9;
      A.scene.add(mesh);
      crystals.push({ mesh, bob: Math.random() * 10, life: 40 });
    }

    function dropCrystals(actor) {
      const n = actor.crystals | 0;
      actor.crystals = 0;
      for (let i = 0; i < Math.min(n, 8); i++) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(actor.position);
        mesh.position.y += 1.0 + Math.random();
        mesh.position.x += (Math.random() - 0.5) * 2.4;
        mesh.position.z += (Math.random() - 0.5) * 2.4;
        A.scene.add(mesh);
        crystals.push({ mesh, bob: Math.random() * 10, life: 25 });
      }
    }

    M.update = function (dt) {
      spawnTimer -= dt;
      if (spawnTimer <= 0 && crystals.length < 16) { spawnTimer = 4.0; spawnCrystal(); }

      for (let i = crystals.length - 1; i >= 0; i--) {
        const c = crystals[i];
        c.bob += dt;
        c.life -= dt;
        c.mesh.rotation.y += dt * 1.6;
        c.mesh.position.y += Math.sin(c.bob * 2) * dt * 0.25;
        if (c.life <= 0) { A.scene.remove(c.mesh); crystals.splice(i, 1); continue; }
        for (let k = 0; k < A.actors.length; k++) {
          const a = A.actors[k];
          if (!a.health.alive) continue;
          if (a.position.distanceTo(c.mesh.position) < 1.6) {
            a.crystals = (a.crystals | 0) + 1;
            a.score.objective += 10;
            A.teams[a.team].score++;
            a.abilities.addUltCharge(3);
            HC.Audio.play('objective_pickup', { position: c.mesh.position, pitch: 1.2 });
            HC.VFX.burst(c.mesh.position, 0x9b6bff, 12, 4, { spread: 0.3 });
            A.scene.remove(c.mesh); crystals.splice(i, 1);
            break;
          }
        }
      }

      if (!countdown.active) {
        ['A', 'B'].forEach(t => {
          if (A.teams[t].score >= A.modeDef.scoreLimit) {
            countdown.active = true; countdown.team = t; countdown.timer = 20;
            A.pushKillFeed({ system: true, text: A.teams[t].name + ' AT FULL CHARGE — 20s', team: t });
            HC.Audio.play('objective_alert', { bus: 'ui', important: true });
          }
        });
      } else {
        countdown.timer -= dt;
        if (A.teams[countdown.team].score < A.modeDef.scoreLimit) countdown.active = false;
      }
    };

    M.onKill = function (victim) { dropCrystals(victim); if (victim.team) A.teams[victim.team].score = Math.max(0, A.teams[victim.team].score - 2); };

    M.checkWin = function () {
      if (countdown.active && countdown.timer <= 0) return { winner: countdown.team, reason: 'countdown' };
      if (A.timeRemaining <= 0) {
        if (A.teams.A.score === A.teams.B.score) return { winner: 'draw', reason: 'time' };
        return { winner: A.teams.A.score > A.teams.B.score ? 'A' : 'B', reason: 'time' };
      }
      return null;
    };

    M.getBotGoal = function (actor, brain) {
      let best = null, bestD = Infinity;
      crystals.forEach(c => {
        const d = c.mesh.position.distanceTo(actor.position);
        if (d < bestD) { bestD = d; best = c; }
      });
      if (best) return { type: 'pickup', position: best.mesh.position.clone() };
      return { type: 'roam', position: A.nav.randomNear(actor.position, 24) || actor.position.clone() };
    };

    M.dispose = function () {
      crystals.forEach(c => A.scene.remove(c.mesh));
      crystals.length = 0;
      geo.dispose(); mat.dispose();
    };
    return M;
  }

  /* ================================================================== *
   * SOLO ARENA
   * ================================================================== */
  function SoloArenaMode(A, ctx) {
    const M = { id: 'solo_arena' };
    M.update = function () {};
    M.onKill = function (victim, killer) { /* score lives on the actor */ };
    M.checkWin = function () {
      let leader = null;
      A.actors.forEach(a => { if (!leader || a.score.kills > leader.score.kills) leader = a; });
      if (leader && leader.score.kills >= A.modeDef.scoreLimit) return { winner: leader === A.player ? 'player' : 'bot', leader, reason: 'score' };
      if (A.timeRemaining <= 0) return { winner: leader === A.player ? 'player' : 'bot', leader, reason: 'time' };
      return null;
    };
    M.getBotGoal = function (actor, brain) {
      if (brain.target) return { type: 'attack', position: brain.target.position.clone(), target: brain.target };
      let best = null, bestD = Infinity;
      A.actors.forEach(e => {
        if (e === actor || !e.health.alive) return;
        const d = e.position.distanceTo(actor.position);
        if (d < bestD) { bestD = d; best = e; }
      });
      if (best) return { type: 'hunt', position: best.position.clone() };
      return { type: 'roam', position: A.nav.randomNear(actor.position, 30) || actor.position.clone() };
    };
    return M;
  }

})(window.HC, window.THREE);
