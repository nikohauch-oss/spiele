/* =========================================================================
 * HYPERCELL — 16_health.js
 * Health / shield / armour with typed damage, regeneration, damage
 * reduction stacking, knockback, kill credit and assist tracking.
 *
 * This component is authoritative for a combatant's survival state. Nothing
 * else is allowed to write health directly — every change goes through
 * applyDamage/heal so feedback events always fire.
 * ========================================================================= */
(function (HC, THREE) {
  'use strict';

  const U = HC.Util;
  const CFG = HC.CFG;

  HC.HealthComponent = function HealthComponent(owner, def) {
    const H = {
      owner,
      maxHealth: def.health || 200,
      maxShield: def.shield || 0,
      maxArmor: def.armor || 0,
      health: def.health || 200,
      shield: def.shield || 0,
      armor: def.armor || 0,
      alive: true,
      invulnerable: false,
      spawnProtected: false,
      spawnProtectionTimer: 0,
      /** Multiplicative reductions from abilities: id -> factor (0..1). */
      reductions: new Map(),
      /** Flat bonus pools granted by abilities (overshield). */
      bonusShield: 0,
      lastDamageTime: -999,
      lastShieldDamageTime: -999,
      /** attackerId -> { amount, time } for assist credit. */
      recentDamagers: new Map(),
      lastAttacker: null,
      events: HC.Events('health')
    };

    H.reset = function (statsOverride) {
      if (statsOverride) {
        H.maxHealth = statsOverride.health || H.maxHealth;
        H.maxShield = statsOverride.shield === undefined ? H.maxShield : statsOverride.shield;
        H.maxArmor = statsOverride.armor === undefined ? H.maxArmor : statsOverride.armor;
      }
      H.health = H.maxHealth;
      H.shield = H.maxShield;
      H.armor = H.maxArmor;
      H.bonusShield = 0;
      H.alive = true;
      H.invulnerable = false;
      H.reductions.clear();
      H.recentDamagers.clear();
      H.lastAttacker = null;
      H.lastDamageTime = -999;
      H.lastShieldDamageTime = -999;
      H.spawnProtected = true;
      H.spawnProtectionTimer = CFG.combat.spawnProtection;
    };

    H.addReduction = function (id, factor) { H.reductions.set(id, U.clamp01(factor)); };
    H.removeReduction = function (id) { H.reductions.delete(id); };
    H.totalReduction = function () {
      let f = 1;
      for (const v of H.reductions.values()) f *= v;
      return f;
    };

    H.grantOvershield = function (amount) {
      H.bonusShield += amount;
      H.shield += amount;
      H.events.emit('overshield', amount);
    };
    H.clearOvershield = function () {
      if (H.bonusShield <= 0) return;
      H.shield = Math.max(0, H.shield - H.bonusShield);
      H.bonusShield = 0;
    };

    H.effectiveMaxShield = function () { return H.maxShield + H.bonusShield; };
    H.total = function () { return H.health + H.shield + H.armor; };
    H.totalMax = function () { return H.maxHealth + H.effectiveMaxShield() + H.maxArmor; };
    H.fraction = function () { return H.totalMax() > 0 ? H.total() / H.totalMax() : 0; };

    /**
     * Apply damage.
     * @param {object} info
     *   amount, type ('physical'|'energy'|...), attacker (actor|null),
     *   critical (bool), point (Vector3), direction (Vector3),
     *   source ('weapon'|'ability'|'explosion'|'fall'|'environment'),
     *   weaponId, abilityId, knockback (number)
     * @returns {object} result — what actually happened, for feedback.
     */
    H.applyDamage = function (info) {
      const out = {
        applied: 0, toShield: 0, toArmor: 0, toHealth: 0,
        killed: false, blocked: false, critical: !!info.critical,
        overkill: 0, hitShield: false
      };
      if (!H.alive) { out.blocked = true; return out; }
      if (H.invulnerable) { out.blocked = true; H.events.emit('blocked', info); return out; }
      if (H.spawnProtected && info.attacker && info.attacker !== owner) {
        out.blocked = true;
        H.events.emit('blocked', info);
        return out;
      }

      const table = CFG.combat.typeTable[info.type] || CFG.combat.typeTable.physical;
      let remaining = Math.max(0, info.amount) * H.totalReduction();
      if (remaining <= 0) { out.blocked = true; return out; }

      const now = performance.now() / 1000;

      // Shield first, then armour, then health — each with its own multiplier.
      if (H.shield > 0) {
        const dmg = remaining * table.shield;
        const absorbed = Math.min(H.shield, dmg);
        H.shield -= absorbed;
        out.toShield = absorbed;
        out.hitShield = true;
        remaining -= absorbed / table.shield;
        H.lastShieldDamageTime = now;
        if (H.shield <= 0.001 && absorbed > 0) {
          H.shield = 0;
          H.bonusShield = 0;
          H.events.emit('shieldBreak', info);
        }
      }
      if (remaining > 0 && H.armor > 0) {
        const dmg = remaining * table.armor;
        const absorbed = Math.min(H.armor, dmg);
        H.armor -= absorbed;
        out.toArmor = absorbed;
        remaining -= absorbed / table.armor;
      }
      if (remaining > 0) {
        const dmg = remaining * table.health;
        const absorbed = Math.min(H.health, dmg);
        H.health -= absorbed;
        out.toHealth = absorbed;
        out.overkill = Math.max(0, dmg - absorbed);
      }

      out.applied = out.toShield + out.toArmor + out.toHealth;
      if (out.applied <= 0) { out.blocked = true; return out; }

      H.lastDamageTime = now;

      if (info.attacker && info.attacker !== owner) {
        H.lastAttacker = info.attacker;
        const id = info.attacker.id;
        const rec = H.recentDamagers.get(id) || { actor: info.attacker, amount: 0, time: 0 };
        rec.amount += out.applied;
        rec.time = now;
        H.recentDamagers.set(id, rec);
      }

      H.events.emit('damaged', { info, result: out });

      if (H.health <= 0.001) {
        H.health = 0;
        H.alive = false;
        out.killed = true;
        H.events.emit('died', { info, result: out, assists: H.getAssists(info.attacker) });
      } else if (H.health / H.maxHealth < 0.28) {
        H.events.emit('lowHealth', H.health / H.maxHealth);
      }
      return out;
    };

    H.heal = function (amount, healer) {
      if (!H.alive || amount <= 0) return 0;
      const before = H.health;
      H.health = Math.min(H.maxHealth, H.health + amount);
      const done = H.health - before;
      if (done > 0) H.events.emit('healed', { amount: done, healer });
      return done;
    };

    H.restoreShield = function (amount) {
      if (!H.alive || amount <= 0) return 0;
      const before = H.shield;
      H.shield = Math.min(H.effectiveMaxShield(), H.shield + amount);
      return H.shield - before;
    };

    H.getAssists = function (killer) {
      const now = performance.now() / 1000;
      const out = [];
      for (const rec of H.recentDamagers.values()) {
        if (killer && rec.actor === killer) continue;
        if (now - rec.time > CFG.combat.assistWindow) continue;
        if (rec.amount < H.totalMax() * CFG.combat.assistDamageFrac) continue;
        out.push(rec.actor);
      }
      return out;
    };

    H.update = function (dt) {
      if (!H.alive) return;
      const now = performance.now() / 1000;

      if (H.spawnProtected) {
        H.spawnProtectionTimer -= dt;
        if (H.spawnProtectionTimer <= 0) {
          H.spawnProtected = false;
          H.events.emit('spawnProtectionEnd');
        }
      }

      if (H.maxShield > 0 && H.shield < H.effectiveMaxShield() &&
          now - H.lastDamageTime > CFG.combat.shieldRegenDelay) {
        const before = H.shield;
        H.shield = Math.min(H.effectiveMaxShield(), H.shield + CFG.combat.shieldRegenRate * dt);
        if (before <= 0 && H.shield > 0) H.events.emit('shieldRestoring');
      }
      if (H.health < H.maxHealth && now - H.lastDamageTime > CFG.combat.healthRegenDelay) {
        H.health = Math.min(H.maxHealth, H.health + CFG.combat.healthRegenRate * dt);
      }

      // Expire stale assist credit so late kills don't award ancient chip damage.
      if (H.recentDamagers.size) {
        for (const [id, rec] of H.recentDamagers) {
          if (now - rec.time > CFG.combat.assistWindow * 2) H.recentDamagers.delete(id);
        }
      }
    };

    /** Ends spawn protection the moment the player commits to an attack. */
    H.breakSpawnProtection = function () {
      if (!H.spawnProtected) return;
      H.spawnProtected = false;
      H.spawnProtectionTimer = 0;
      H.events.emit('spawnProtectionEnd');
    };

    return H;
  };

  /* ------------------------------------------------------------------ *
   * Hit resolution against a combatant capsule, with a head zone.
   * ------------------------------------------------------------------ */
  const _rel = new THREE.Vector3();
  HC.Hitbox = {
    /**
     * Ray vs vertical capsule. Returns null or
     * { distance, point, zone: 'head'|'body'|'limb' }.
     */
    rayCapsule(origin, dir, maxDist, feetPos, radius, height) {
      // Solve in the XZ plane against the infinite cylinder, then clamp Y.
      const ox = origin.x - feetPos.x, oz = origin.z - feetPos.z;
      const a = dir.x * dir.x + dir.z * dir.z;
      let tEnter = 0, tExit = maxDist;

      if (a < 1e-8) {
        // Ray is vertical: only hits if inside the cylinder radius.
        if (ox * ox + oz * oz > radius * radius) return null;
      } else {
        const b = 2 * (ox * dir.x + oz * dir.z);
        const c = ox * ox + oz * oz - radius * radius;
        const disc = b * b - 4 * a * c;
        if (disc < 0) return null;
        const sq = Math.sqrt(disc);
        tEnter = (-b - sq) / (2 * a);
        tExit = (-b + sq) / (2 * a);
        if (tExit < 0.0001) return null;
      }

      const yBottom = feetPos.y, yTop = feetPos.y + height;
      // Clip against the Y slab.
      if (Math.abs(dir.y) > 1e-8) {
        let t1 = (yBottom - origin.y) / dir.y;
        let t2 = (yTop - origin.y) / dir.y;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tEnter = Math.max(tEnter, t1);
        tExit = Math.min(tExit, t2);
      } else {
        if (origin.y < yBottom || origin.y > yTop) return null;
      }
      if (tEnter > tExit || tExit < 0.0001) return null;

      const t = Math.max(0.0001, tEnter);
      if (t > maxDist) return null;

      const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
      const frac = (py - yBottom) / Math.max(0.001, height);
      let zone = 'body';
      if (frac >= CFG.combat.headshotHeightFrac) {
        // Head zone is a narrower column — grazing the shoulder is not a headshot.
        const dx = px - feetPos.x, dz = pz - feetPos.z;
        if (dx * dx + dz * dz <= (radius * 0.72) * (radius * 0.72) * CFG.combat.headRadiusScale) zone = 'head';
      } else if (frac < 0.34) zone = 'limb';

      return { distance: t, point: new THREE.Vector3(px, py, pz), zone, fraction: frac };
    },

    /** Sphere-vs-capsule overlap for projectiles and melee arcs. */
    sphereCapsule(center, sphereRadius, feetPos, radius, height) {
      const cy = U.clamp(center.y, feetPos.y, feetPos.y + height);
      const dx = center.x - feetPos.x, dz = center.z - feetPos.z, dy = center.y - cy;
      const r = radius + sphereRadius;
      return (dx * dx + dz * dz + dy * dy) <= r * r;
    }
  };

})(window.HC, window.THREE);
