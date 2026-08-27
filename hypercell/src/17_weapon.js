/* =========================================================================
 * HYPERCELL — 17_weapon.js
 * Weapon runtime: ammo, fire modes, spin-up, bloom, recoil patterns,
 * hitscan and projectile dispatch, melee arcs, reloads (magazine and
 * shell-fed), ADS/scope handling and shell ejection.
 *
 * The component is entirely data-driven from 02_weapons_data.js. Adding a
 * weapon means adding a definition, not adding code.
 * ========================================================================= */
(function (HC, THREE) {
  'use strict';

  const U = HC.Util;
  const CFG = HC.CFG;
  const WM = HC.WeaponMath;

  const _dir = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _tmp = new THREE.Vector3();

  /**
   * @param owner  actor
   * @param ctx    combat context: { world, trace(origin,dir,dist,ignore),
   *               spawnProjectile(def), meleeSweep(...), notify(event, data) }
   */
  HC.WeaponComponent = function WeaponComponent(owner, ctx) {
    const W = {
      owner, ctx,
      def: null, id: null,
      magazine: 0, reserve: 0,
      firing: false, wantFire: false,
      fireTimer: 0, sinceLastShot: 99,
      reloading: false, reloadTimer: 0, reloadStage: 'none',
      shellsQueued: 0,
      swapping: false, swapTimer: 0,
      spin: 0,                       // 0..1 minigun spin-up
      bloom: 0,                      // accumulated spread
      recoilPitch: 0, recoilYaw: 0,  // consumed by the camera each tick
      recoilPatternIndex: 0,
      aim: 0,                        // 0..1 ADS blend
      wantAim: false,
      scoped: false, scopeTimer: 0,
      breath: 1,                     // hold-breath stamina for the DMR
      holdingBreath: false,
      shotsThisTrigger: 0,
      triggerHeld: false,
      lastFireTime: -99,
      model: null, muzzle: null,
      stats: { shotsFired: 0, shotsHit: 0, crits: 0, damage: 0 },
      /* Multipliers written by abilities (Overcharge, Hyper Mode, ...). */
      mods: { fireRate: 1, damage: 1, reload: 1, spread: 1, swap: 1 },
      events: HC.Events('weapon')
    };

    /* ---- equip --------------------------------------------------------- */
    W.equip = function (weaponId, opts) {
      const def = HC.Weapons.get(weaponId);
      W.def = def;
      W.id = def.id;
      W.magazine = isFinite(def.magazine) ? def.magazine : Infinity;
      W.reserve = isFinite(def.magazine) ? def.magazine * (def.reserveMagazines || 0) : Infinity;
      W.reloading = false; W.reloadTimer = 0; W.reloadStage = 'none';
      W.bloom = 0; W.spin = 0; W.fireTimer = 0;
      W.recoilPatternIndex = 0; W.shotsThisTrigger = 0;
      W.breath = 1;
      W.model = (opts && opts.model) || null;
      W.muzzle = W.model ? W.model.sockets.muzzle : null;
      W.events.emit('equipped', def);
      return def;
    };

    W.refillAmmo = function () {
      if (!W.def) return;
      W.magazine = isFinite(W.def.magazine) ? W.def.magazine : Infinity;
      W.reserve = isFinite(W.def.magazine) ? W.def.magazine * (W.def.reserveMagazines || 0) : Infinity;
      W.reloading = false; W.reloadStage = 'none'; W.shellsQueued = 0;
    };

    /* ---- queries ------------------------------------------------------- */
    W.shotInterval = function () { return WM.shotInterval(W.def) / Math.max(0.05, W.mods.fireRate); };
    W.isEmpty = function () { return W.magazine <= 0; };
    W.canReload = function () {
      return W.def && isFinite(W.def.magazine) && W.magazine < W.def.magazine &&
             W.reserve > 0 && !W.reloading && !W.swapping;
    };
    W.ammoText = function () {
      if (!W.def) return '—';
      if (!isFinite(W.def.magazine)) return '∞';
      return W.magazine + ' / ' + (isFinite(W.reserve) ? W.reserve : '∞');
    };

    /** Current cone half-angle in radians. */
    W.currentSpread = function (state) {
      const s = W.def.spread;
      let deg = (s.base + W.bloom) * W.mods.spread;
      if (state.moving) deg += s.moving * U.clamp01(state.speedFrac);
      if (!state.grounded) deg += s.air;
      if (state.crouching) deg += s.crouch;
      deg += s.aim * W.aim;
      if (s.spinUpBonus) deg += s.spinUpBonus * W.spin;
      if (W.scoped && W.def.scope) deg *= 0.10;
      return Math.max(0, Math.min(deg, s.max)) * U.DEG;
    };

    /* ---- input --------------------------------------------------------- */
    W.setTrigger = function (down) {
      if (down && !W.triggerHeld) W.shotsThisTrigger = 0;
      W.triggerHeld = down;
      W.wantFire = down;
    };
    W.setAim = function (down) { W.wantAim = down; };

    W.startReload = function () {
      if (!W.canReload()) return false;
      W.reloading = true;
      if (W.def.reloadType === 'shell') {
        W.reloadStage = 'start';
        W.reloadTimer = (W.def.reloadFirstShell || 0.5) * W.mods.reload;
      } else {
        W.reloadStage = 'body';
        W.reloadTimer = W.def.reloadTime * W.mods.reload;
      }
      W.events.emit('reloadStart', W.def);
      return true;
    };

    W.cancelReload = function () {
      if (!W.reloading) return;
      W.reloading = false;
      W.reloadStage = 'none';
      W.events.emit('reloadCancel');
    };

    W.beginSwap = function (duration) {
      W.swapping = true;
      W.swapTimer = (duration === undefined ? (W.def ? W.def.handling.swap : 0.4) : duration) * W.mods.swap;
      W.cancelReload();
      W.events.emit('swapStart', W.swapTimer);
    };

    /* ---- update -------------------------------------------------------- */
    W.update = function (dt, state) {
      if (!W.def) return;
      W.sinceLastShot += dt;

      // ADS blend — the single most important weapon-feel value.
      const adsRate = 1 / Math.max(0.04, W.def.handling.ads * W.mods.swap);
      const wantAim = W.wantAim && !state.sprinting && !state.sliding && !W.swapping;
      W.aim = U.approach(W.aim, wantAim ? 1 : 0, adsRate * dt);

      if (W.def.scope) {
        const wasScoped = W.scoped;
        W.scoped = W.aim > 0.92;
        if (W.scoped !== wasScoped) W.events.emit('scope', W.scoped);
        if (W.holdingBreath && W.scoped) {
          W.breath = Math.max(0, W.breath - dt / W.def.scope.breathDuration);
          if (W.breath <= 0) W.holdingBreath = false;
        } else {
          W.breath = Math.min(1, W.breath + dt / W.def.scope.breathRecover);
        }
      }

      if (W.swapping) {
        W.swapTimer -= dt;
        if (W.swapTimer <= 0) { W.swapping = false; W.events.emit('swapEnd'); }
        return;
      }

      // Spin-up weapons build and bleed off rotation speed.
      if (W.def.spinUpTime) {
        const spinning = W.wantFire && W.magazine > 0 && !W.reloading;
        const rate = spinning ? dt / W.def.spinUpTime : -dt / W.def.spinDownTime;
        const before = W.spin;
        W.spin = U.clamp01(W.spin + rate);
        if (before < 0.02 && W.spin >= 0.02) W.events.emit('spinUp');
        if (W.model && W.model.animated && W.model.animated.barrelHub) {
          W.model.animated.barrelHub.rotation.z += W.spin * 34 * dt;
        }
      }

      // Bloom recovery
      W.bloom = Math.max(0, W.bloom - W.def.spread.recoverRate * dt);
      if (W.sinceLastShot > 0.35) W.recoilPatternIndex = 0;

      // Recoil returns to centre
      const rec = W.def.recoil.recovery;
      W.recoilPitch = U.damp(W.recoilPitch, 0, rec, dt);
      W.recoilYaw = U.damp(W.recoilYaw, 0, rec, dt);

      /* --- reload state machine --- */
      if (W.reloading) {
        W.reloadTimer -= dt;
        if (W.def.reloadType === 'shell') {
          if (W.reloadTimer <= 0) {
            if (W.reloadStage === 'start' || W.reloadStage === 'shell') {
              if (W.magazine < W.def.magazine && W.reserve > 0) {
                W.magazine++; W.reserve--;
                W.events.emit('shellLoaded', W.magazine);
                if (W.magazine >= W.def.magazine || W.reserve <= 0 ||
                    (W.wantFire && W.magazine > 0)) {
                  W.reloadStage = 'end';
                  W.reloadTimer = (W.def.reloadEndTime || 0.3) * W.mods.reload;
                } else {
                  W.reloadStage = 'shell';
                  W.reloadTimer = W.def.reloadTime * W.mods.reload;
                }
              } else {
                W.reloadStage = 'end';
                W.reloadTimer = (W.def.reloadEndTime || 0.3) * W.mods.reload;
              }
            } else {
              W.reloading = false;
              W.reloadStage = 'none';
              W.events.emit('reloadEnd');
            }
          }
        } else if (W.reloadTimer <= 0) {
          const need = W.def.magazine - W.magazine;
          const take = Math.min(need, W.reserve);
          W.magazine += take;
          W.reserve -= take;
          W.reloading = false;
          W.reloadStage = 'none';
          W.events.emit('reloadEnd');
        }
      }

      /* --- firing --- */
      if (W.fireTimer > 0) W.fireTimer -= dt;

      const canFire = !W.reloading && !W.swapping && !state.sprinting &&
                      W.fireTimer <= 0 && (!W.def.spinUpTime || W.spin > 0.55);
      const wantsShot = W.def.fireMode === 'auto'
        ? W.wantFire
        : (W.wantFire && W.shotsThisTrigger === 0);

      if (wantsShot && canFire) {
        if (W.magazine > 0) {
          fire(state);
        } else if (W.shotsThisTrigger === 0 || W.def.fireMode === 'auto') {
          W.fireTimer = 0.28;
          W.shotsThisTrigger++;
          W.events.emit('dryFire');
          if (W.canReload()) W.startReload();
        }
      }
      W.firing = W.wantFire && W.magazine > 0 && !W.reloading;
    };

    /* ---- fire ---------------------------------------------------------- */
    function fire(state) {
      const def = W.def;
      W.magazine--;
      W.shotsThisTrigger++;
      W.fireTimer = W.shotInterval();
      W.sinceLastShot = 0;
      W.lastFireTime = performance.now() / 1000;
      W.stats.shotsFired++;

      const spread = W.currentSpread(state);
      const origin = state.eye;
      const aimDir = state.aimDir;

      // Build an orthonormal basis around the aim direction for the cone.
      _dir.copy(aimDir).normalize();
      _right.set(_dir.z, 0, -_dir.x);
      if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
      _right.normalize();
      _up.crossVectors(_right, _dir).normalize();

      const muzzlePos = _tmp;
      if (W.muzzle) W.muzzle.getWorldPosition(muzzlePos);
      else muzzlePos.copy(origin).addScaledVector(_dir, 0.6);

      const results = [];
      const pellets = def.pellets || 1;
      for (let p = 0; p < pellets; p++) {
        const shotDir = new THREE.Vector3().copy(_dir);
        if (spread > 0) {
          // Uniform disc sampling gives an even pattern, not a centre-heavy blob.
          const a = Math.random() * U.TAU;
          const r = Math.sqrt(Math.random()) * Math.tan(spread);
          shotDir.addScaledVector(_right, Math.cos(a) * r);
          shotDir.addScaledVector(_up, Math.sin(a) * r);
          shotDir.normalize();
        }
        if (def.projectile) {
          ctx.spawnProjectile({
            owner, weapon: def, origin: muzzlePos.clone(), direction: shotDir,
            speed: def.projectile.speed, config: def.projectile
          });
        } else if (def.melee) {
          // handled below as a single sweep
        } else {
          const hit = ctx.trace(origin, shotDir, def.range.max, owner);
          results.push({ dir: shotDir, hit });
          const endPoint = hit ? hit.point : _tmp.clone().copy(origin).addScaledVector(shotDir, def.range.max);
          if (def.vfx.tracer) {
            HC.VFX.tracer(muzzlePos, endPoint, W.tracerColor || def.vfx.tracer,
              def.vfx.tracerWidth || 0.03, 240);
          }
          if (hit) applyHit(hit, shotDir, origin);
        }
      }

      if (def.melee) {
        const sweep = ctx.meleeSweep({
          owner, weapon: def, origin, direction: _dir,
          range: def.meleeRange, arc: def.meleeArc
        });
        sweep.forEach(h => applyHit(h, _dir, origin, true));
        W.events.emit('melee', sweep);
      }

      /* --- recoil --- */
      const R = def.recoil;
      const first = W.recoilPatternIndex === 0 ? (R.firstShotMul || 1) : 1;
      let vert = R.vertical * first;
      let horiz = 0;
      switch (R.pattern) {
        case 'vertical_drift': {
          // Classic learnable pattern: climbs, then drifts to one side.
          const i = W.recoilPatternIndex;
          vert *= U.lerp(1.0, 0.55, U.clamp01(i / 14));
          horiz = R.horizontal * Math.sin(i * 0.72) * U.clamp01(i / 5);
          break;
        }
        case 'random':
          horiz = R.horizontal * U.gauss(Math.random);
          break;
        case 'vibration':
          vert *= 0.6 + Math.random() * 0.8;
          horiz = R.horizontal * (Math.random() - 0.5) * 2;
          break;
        case 'single_kick':
        default:
          horiz = R.horizontal * (Math.random() - 0.5) * 2;
          break;
      }
      const aimDamp = U.lerp(1, 0.74, W.aim);
      W.recoilPitch += vert * aimDamp * U.DEG * 10;
      W.recoilYaw += horiz * aimDamp * U.DEG * 10;
      W.recoilPatternIndex++;

      W.bloom = Math.min(def.spread.max, W.bloom + def.spread.bloomPerShot);

      W.events.emit('fired', {
        muzzle: muzzlePos.clone(), direction: _dir.clone(), results,
        kick: R.kick * aimDamp, visualKick: R.visualKick,
        weapon: def, magazine: W.magazine
      });
    }

    /** Damage application shared by hitscan, pellets and melee. */
    function applyHit(hit, dir, origin, isMelee) {
      const def = W.def;
      const shapeOwner = hit.shape && hit.shape.deployable;
      if (hit.deployable || (shapeOwner && shapeOwner.alive)) {
        const target = hit.deployable || shapeOwner;
        ctx.damage({
          target, amount: def.damage * (isMelee ? 1 : WM.falloff(def, hit.distance)) * W.mods.damage,
          type: def.damageType, attacker: owner, critical: false,
          point: hit.point, direction: dir, source: 'weapon', weaponId: def.id
        });
        HC.VFX.impact(hit.point, hit.normal || dir.clone().negate(), 'shield', 1.0);
        W.stats.shotsHit++;
        return;
      }
      if (!hit.actor) {
        HC.VFX.impact(hit.point, hit.normal, hit.surface || 'concrete', isMelee ? 1.4 : 1.0);
        HC.Audio.play(surfaceSound(hit.surface), { position: hit.point, scale: 1 });
        return;
      }
      const dist = hit.distance;
      const falloff = isMelee ? 1 : WM.falloff(def, dist);
      const zone = hit.zone || 'body';
      const critical = zone === 'head';
      let amount = def.damage * falloff * W.mods.damage;
      if (critical) amount *= def.critMultiplier;
      else if (zone === 'limb') amount *= CFG.combat.limbDamageScale;

      const result = ctx.damage({
        target: hit.actor, amount, type: def.damageType, attacker: owner,
        critical, point: hit.point, direction: dir, source: isMelee ? 'melee' : 'weapon',
        weaponId: def.id, knockback: isMelee ? 4 : 0.6
      });

      if (result && result.applied > 0) {
        W.stats.shotsHit++;
        W.stats.damage += result.applied;
        if (critical) W.stats.crits++;
      }
      HC.VFX.impact(hit.point, hit.normal || dir.clone().negate(),
        result && result.hitShield ? 'shield' : 'flesh', critical ? 1.5 : 1.0);
    }

    function surfaceSound(surface) {
      switch (surface) {
        case 'metal': case 'grate': return 'impact_metal';
        case 'glass': return 'impact_glass';
        case 'wood': return 'impact_wood';
        case 'energy': return 'impact_energy';
        case 'grass': return 'impact_wood';
        default: return 'impact_concrete';
      }
    }

    /** Consumed by the camera each tick, then zeroed here. */
    W.consumeRecoil = function () {
      const p = W.recoilPitch, y = W.recoilYaw;
      W.recoilPitch = 0; W.recoilYaw = 0;
      return { pitch: p, yaw: y };
    };

    /** Sway offset while scoped and breathing. */
    W.scopeSway = function (time) {
      if (!W.scoped || !W.def.scope) return { x: 0, y: 0 };
      const steady = W.holdingBreath ? 0.08 : 1;
      const amp = 0.0022 * steady * U.lerp(1.6, 0.5, W.breath);
      return {
        x: Math.sin(time * 1.15) * amp + Math.sin(time * 0.43) * amp * 0.6,
        y: Math.cos(time * 0.87) * amp + Math.sin(time * 1.9) * amp * 0.35
      };
    };

    return W;
  };

  /* ------------------------------------------------------------------ *
   * Projectile simulation (grenades, plasma bolts, rockets).
   * Owned by the arena; weapons only request spawns.
   * ------------------------------------------------------------------ */
  HC.ProjectileSystem = function ProjectileSystem(scene, world, ctx) {
    const live = [];
    const pool = [];
    const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _d = new THREE.Vector3();

    const PS = {
      get count() { return live.length; },

      spawn(o) {
        const cfg = o.config;
        let p = pool.pop();
        if (!p) {
          p = { mesh: null, trail: null };
        }
        if (!p.mesh || p.modelKind !== cfg.model) {
          if (p.mesh) { scene.remove(p.mesh); HC.WeaponModel.disposeObject(p.mesh); }
          p.mesh = HC.WeaponModel.buildProjectile(cfg.model, cfg.color);
          p.modelKind = cfg.model;
        }
        p.position = (p.position || new THREE.Vector3()).copy(o.origin);
        p.velocity = (p.velocity || new THREE.Vector3()).copy(o.direction).multiplyScalar(o.speed);
        p.owner = o.owner;
        p.weapon = o.weapon;
        p.config = cfg;
        p.life = cfg.life;
        p.fuse = cfg.fuse > 0 ? cfg.fuse : -1;
        p.bouncesLeft = cfg.bounces;
        p.stuckTo = null;
        p.alive = true;
        p.spin = new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        p.mesh.position.copy(p.position);
        p.mesh.visible = true;
        scene.add(p.mesh);
        p.trail = HC.VFX.attachTrail(p.mesh, {
          rate: 46, color0: 0xffffff, color1: cfg.trailColor || cfg.color,
          size0: 0.13, size1: 0.01, life: 0.28, spread: 0.05, drag: 4, gravity: 0
        });
        live.push(p);
        return p;
      },

      update(dt) {
        for (let i = live.length - 1; i >= 0; i--) {
          const p = live[i];
          const cfg = p.config;
          p.life -= dt;
          if (p.fuse > 0) {
            p.fuse -= dt;
            if (p.fuse <= 0) { detonate(p, p.position, _n.set(0, 1, 0)); recycle(i); continue; }
          }
          if (p.life <= 0) { detonate(p, p.position, _n.set(0, 1, 0)); recycle(i); continue; }

          if (p.stuckTo) {
            if (p.stuckTo.health && p.stuckTo.health.alive) {
              p.stuckTo.centerPosition(p.position);
              p.mesh.position.copy(p.position);
              continue;
            }
            p.stuckTo = null;
          }
          if (cfg.gravity) p.velocity.y -= cfg.gravity * dt;

          const step = _d.copy(p.velocity).multiplyScalar(dt);
          const dist = step.length();
          if (dist > 0.0001) {
            _d.multiplyScalar(1 / dist);
            // Actors first — a grenade should stick to a body, not the wall behind it.
            const actorHit = (cfg.detonateOnEnemy || cfg.impactFuse > 0)
              ? ctx.traceActors(p.position, _d, dist + cfg.radius, p.owner)
              : null;
            const worldHit = world.raycast(p.position, _d, dist + cfg.radius, null, 'projectiles');

            if (actorHit && (!worldHit || actorHit.distance <= worldHit.distance)) {
              _p.copy(p.position).addScaledVector(_d, actorHit.distance);
              if (cfg.impactFuse > 0 && p.fuse < 0) {
                // Stick to the body: the fuse becomes the target's problem.
                p.stuckTo = actorHit.actor;
                p.position.copy(_p);
                p.velocity.set(0, 0, 0);
                p.fuse = cfg.impactFuse;
                HC.Audio.play('ability_deploy', { position: _p, pitch: 1.4, important: true });
                continue;
              }
              detonate(p, _p, _n.copy(_d).negate(), actorHit.actor);
              recycle(i); continue;
            }
            if (worldHit && worldHit.distance <= dist + cfg.radius) {
              _p.copy(p.position).addScaledVector(_d, Math.max(0, worldHit.distance - cfg.radius * 0.5));
              // Sticky charges adhere to the surface and start their fuse.
              if (cfg.impactFuse > 0 && p.fuse < 0) {
                p.position.copy(_p);
                p.velocity.set(0, 0, 0);
                p.spin.set(0, 0, 0);
                p.fuse = cfg.impactFuse;
                p.mesh.position.copy(p.position);
                HC.Audio.play('ability_deploy', { position: _p, pitch: 1.25, volume: 0.7 });
                HC.VFX.burst(_p, cfg.color, 8, 3, { spread: 0.2, life: 0.3, light: false });
                continue;
              }
              if (cfg.bounce > 0 && p.bouncesLeft > 0) {
                p.bouncesLeft--;
                p.position.copy(_p);
                const n = worldHit.normal;
                const dot = p.velocity.dot(n);
                p.velocity.addScaledVector(n, -2 * dot).multiplyScalar(cfg.bounce);
                HC.Audio.play('impact_metal', { position: _p, scale: 0.5, volume: 0.5 });
                HC.VFX.impact(_p, n, worldHit.surface, 0.35);
                if (p.velocity.lengthSq() < 1.2) { p.velocity.set(0, 0, 0); if (p.fuse < 0) p.fuse = 0.9; }
                continue;
              }
              detonate(p, _p, worldHit.normal);
              recycle(i); continue;
            }
            p.position.addScaledVector(_d, dist);
          }
          p.mesh.position.copy(p.position);
          p.mesh.rotation.x += p.spin.x * dt;
          p.mesh.rotation.y += p.spin.y * dt;
          p.mesh.rotation.z += p.spin.z * dt;
        }
      },

      clear() { for (let i = live.length - 1; i >= 0; i--) recycle(i); },

      dispose() {
        PS.clear();
        pool.forEach(p => { if (p.mesh) { scene.remove(p.mesh); HC.WeaponModel.disposeObject(p.mesh); } });
        pool.length = 0;
      }
    };

    function recycle(index) {
      const p = live[index];
      live.splice(index, 1);
      if (p.trail) p.trail.stop();
      p.mesh.visible = false;
      scene.remove(p.mesh);
      pool.push(p);
    }

    function detonate(p, position, normal, directHit) {
      const cfg = p.config;
      const splash = cfg.splash;
      HC.VFX.explosion(position, splash ? splash.radius : 2, cfg.color, {
        groundY: position.y - 0.2, coreColor: 0xffffff
      });
      HC.Audio.play(splash && splash.radius > 3.5 ? 'explosion_large' : 'explosion_small',
        { position, scale: splash ? splash.radius / 5 : 0.5, important: true, reverb: 0.35 });

      if (directHit) {
        ctx.damage({
          target: directHit, amount: p.weapon.damage, type: p.weapon.damageType,
          attacker: p.owner, critical: false, point: position,
          direction: _d.copy(p.velocity).normalize(), source: 'projectile',
          weaponId: p.weapon.id, knockback: splash ? splash.knockback * 0.4 : 0
        });
      }
      if (splash) {
        ctx.explode({
          center: position, radius: splash.radius, innerRadius: splash.innerRadius,
          damage: p.weapon.damage, minFraction: splash.minFrac, type: p.weapon.damageType,
          attacker: p.owner, knockback: splash.knockback, selfKnockback: splash.selfKnockback,
          weaponId: p.weapon.id, exclude: directHit
        });
      }
      ctx.notify && ctx.notify('explosion', { position, radius: splash ? splash.radius : 2 });
    }

    return PS;
  };

})(window.HC, window.THREE);
