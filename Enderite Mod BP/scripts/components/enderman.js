import { world, system, EntityDamageCause } from '@minecraft/server';
import { consumeProjectileShotData, getProjectileShotData, consumePendingBowShot, lastShotData } from './bow.js';

const ENDERMAN_DEBUG = true;

function debug(message) {
    if (ENDERMAN_DEBUG) {
        console.warn(`[Enderite Enderman] ${message}`);
    }
}

const isEntityValid = (e) => Boolean(e && (typeof e.isValid === 'function' ? e.isValid() : e.isValid));

/**
 * Paridad con Enderite Java v1.9.1:
 * La flecha de Enderita (ed:arrow_enderite) impacta físicamente en el Enderman sin que este
 * la evada en el aire. En el momento de la colisión física (projectileHitEntity), se descarta
 * el proyectil y se aplica el daño dinámico según:
 * 1. Tipo de arma (Bow vs Crossbow con ratios Java 2.5 vs 3.0 baseDamage).
 * 2. Curva cuadrática exacta de 30 ticks para el Arco.
 * 3. Crítico determinístico al 100% de carga (Java parity: full charge = critical).
 * 4. Encantamiento Power exclusivo para el Arco (+25% por nivel sobre base).
 * Todo asociado directamente al ID único del proyectil impactado (projectile.id).
 */
world.afterEvents.projectileHitEntity.subscribe((event) => {
    try {
        const { source: attacker, projectile } = event;
        const hitEntity = event.getEntityHit()?.entity;

        if (projectile?.typeId === 'ed:arrow_enderite' && hitEntity?.typeId === 'minecraft:enderman') {
            debug(`[projectileHitEntity] HIT CONFIRMED on Enderman! Attacker: ${attacker?.typeId ?? attacker?.name ?? 'unknown'}, ProjId: ${projectile.id}`);

            // Descartar el proyectil de inmediato para que no caiga al suelo ni se duplique
            try {
                if (isEntityValid(projectile)) projectile.remove();
                debug(`[projectileHitEntity] Removed arrow projectile.`);
            } catch (e) {
                debug(`[projectileHitEntity] Error removing projectile: ${e}`);
            }

            // Obtener y consumir los datos de disparo asociados a este proyectil específico
            let shot = consumeProjectileShotData(projectile.id) ?? getProjectileShotData(projectile.id);

            // Fallback inmediato para disparos a quemarropa (point-blank):
            // Si el proyectil impactó antes de que entitySpawn terminara el registro,
            // consumir la intención de disparo pendiente del tirador para conservar el cálculo exacto
            if (!shot && attacker) {
                const pending = consumePendingBowShot(attacker.id);
                if (pending) {
                    shot = {
                        projectileId: projectile?.id ?? 'pending',
                        shooterId: attacker.id,
                        shooterName: attacker.name,
                        weaponTypeId: pending.weaponTypeId,
                        chargeRatio: pending.chargeRatio,
                        isCritical: pending.isCritical,
                        powerLevel: pending.powerLevel,
                        infinityLevel: pending.infinityLevel,
                        fireTick: pending.fireTick
                    };
                    debug(`[projectileHitEntity] Point-blank shot resolved from pendingBowShots for ${attacker.name}`);
                } else if (lastShotData.has(attacker.id)) {
                    shot = lastShotData.get(attacker.id);
                    debug(`[projectileHitEntity] Point-blank shot resolved from lastShotData for ${attacker.name}`);
                }
            }

            let damage;
            if (shot) {
                let base;
                if (shot.weaponTypeId === 'ed:enderite_cross_bow') {
                    // Paridad Java: Crossbow baseDamage = 3.0 vs Bow 2.5 (1.2x) y velocidad 3.65 vs 3.5.
                    // La ballesta siempre dispara a máxima potencia fija.
                    // En Bedrock, esto corresponde a un daño base constante de ~19.5 - 20.0
                    base = 19.5 + (Math.random() * 0.5);
                    debug(`[projectileHitEntity] Crossbow shot calculation: base=${base.toFixed(2)}`);
                } else {
                    // Arco de Enderita: escala con curva cuadrática de 30 ticks
                    if (shot.isCritical) {
                        // Crítico determinístico al 100% de carga (Java parity: f == 1.0F -> critical = true)
                        // Rango de crítico 19.0 - 20.0 (coincidente con arrow_enderite.json)
                        base = 19.0 + Math.random();
                        debug(`[projectileHitEntity] Bow full-charge CRITICAL hit: base=${base.toFixed(2)}`);
                    } else {
                        // Carga parcial: base 16.0 multiplicada por el ratio cuadrático (sin crítico)
                        base = 16.0 * shot.chargeRatio;
                        debug(`[projectileHitEntity] Bow partial charge hit: chargeRatio=${shot.chargeRatio.toFixed(2)}, base=${base.toFixed(2)}`);
                    }
                }

                // Encantamiento Power: aplica exclusivamente al arco (+25% por nivel sobre base: Power I = 1.5x, Power V = 2.5x)
                const isBow = shot.weaponTypeId !== 'ed:enderite_cross_bow';
                const powerMult = (isBow && shot.powerLevel > 0) ? (1.0 + 0.25 * (shot.powerLevel + 1)) : 1.0;

                damage = Math.round(base * powerMult * 10) / 10;

                debug(`[projectileHitEntity] Final dynamic damage: ${damage.toFixed(1)} (weapon=${shot.weaponTypeId}, base=${base.toFixed(1)}, powerLevel=${shot.powerLevel}, powerMult=${powerMult.toFixed(2)})`);
            } else {
                // Fallback si no se encontraron datos del proyectil
                damage = 19.5;
                debug(`[projectileHitEntity] Fallback damage used: ${damage.toFixed(1)}`);
            }

            const finalDamage = damage;

            // Aplicar daño directo atribuido al atacante
            system.run(() => {
                try {
                    if (isEntityValid(hitEntity)) {
                        hitEntity.applyDamage(finalDamage, {
                            cause: EntityDamageCause.entityAttack,
                            damagingEntity: attacker
                        });
                        debug(`[projectileHitEntity] Applied ${finalDamage.toFixed(1)} entityAttack damage to Enderman!`);
                    }
                } catch (e) {
                    debug(`[projectileHitEntity] Failed to apply damage: ${e}`);
                }
            });
        }
    } catch (err) {
        debug(`Error in projectileHitEntity: ${err}`);
    }
});