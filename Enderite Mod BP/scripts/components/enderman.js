import { world, system, EntityDamageCause } from '@minecraft/server';
import { lastShotData } from './bow.js';

const ENDERMAN_DEBUG = true;

function debug(message) {
    if (ENDERMAN_DEBUG) {
        console.warn(`[Enderite Enderman] ${message}`);
    }
}

const isEntityValid = (e) => Boolean(e && (typeof e.isValid === 'function' ? e.isValid() : e.isValid));

/**
 * Paridad con Enderite Java:
 * La flecha de Enderita (ed:arrow_enderite) impacta físicamente en el Enderman sin que este
 * la evada en el aire. En el momento de la colisión física (projectileHitEntity), se descarta
 * el proyectil y se aplica el daño dinámico (escalado según la carga del arco, ballesta y
 * encantamiento Power) con causa entityAttack atribuido al atacante.
 */
world.afterEvents.projectileHitEntity.subscribe((event) => {
    try {
        const { source: attacker, projectile } = event;
        const hitEntity = event.getEntityHit()?.entity;

        if (projectile?.typeId === 'ed:arrow_enderite' && hitEntity?.typeId === 'minecraft:enderman') {
            debug(`[projectileHitEntity] HIT CONFIRMED on Enderman! Attacker: ${attacker?.typeId ?? attacker?.name ?? 'unknown'}`);

            // Descartar el proyectil de inmediato para que no caiga ni se duplique
            try {
                if (isEntityValid(projectile)) projectile.remove();
                debug(`[projectileHitEntity] Removed arrow projectile.`);
            } catch (e) {
                debug(`[projectileHitEntity] Error removing projectile: ${e}`);
            }

            // Cálculo dinámico de daño según arma, nivel de tensado y encantamiento Power
            let damage = 16.0;
            const shot = attacker ? lastShotData.get(attacker.id) : null;

            if (shot && (system.currentTick - shot.fireTick) < 300) {
                // 1. Escalar por el ratio de carga del tensado (0.2 a 1.0)
                let base = 16.0 * shot.chargeRatio;

                // 2. Si fue carga completa, posibilidad de crítico (16 a 20) según arrow_enderite.json
                if (shot.chargeRatio >= 1.0) {
                    const isCrit = Math.random() < 0.5;
                    if (isCrit) {
                        base = 19.0 + Math.random(); // 19 - 20
                    }
                }

                // 3. Multiplicador de Power (+25% por nivel sobre base: Power I = 1.5x, Power V = 2.5x)
                const powerMult = shot.powerLevel > 0 ? (1.0 + 0.25 * (shot.powerLevel + 1)) : 1.0;
                damage = Math.round(base * powerMult * 10) / 10;

                debug(`[projectileHitEntity] Dynamic damage calculated: ${damage.toFixed(1)} (base=${base.toFixed(1)}, powerLevel=${shot.powerLevel}, chargeRatio=${shot.chargeRatio.toFixed(2)}, weapon=${shot.weaponTypeId})`);
            } else {
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

