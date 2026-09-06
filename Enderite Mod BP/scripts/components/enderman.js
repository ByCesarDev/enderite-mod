import { world, system, EntityDamageCause } from '@minecraft/server';

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
 * el proyectil y se aplica directamente el daño (16) con causa entityAttack atribuido
 * al atacante, emulando fielmente el comportamiento de Java.
 */
world.afterEvents.projectileHitEntity.subscribe((event) => {
    try {
        const { source: attacker, projectile } = event;
        const hitEntity = event.getEntityHit()?.entity;

        if (projectile?.typeId === 'ed:arrow_enderite' && hitEntity?.typeId === 'minecraft:enderman') {
            debug(`[projectileHitEntity] HIT CONFIRMED on Enderman! Attacker: ${attacker?.typeId ?? attacker?.name ?? 'unknown'}`);

            // Daño de impacto configurado (16 de daño base en arrow_enderite.json)
            const damage = 16;

            // Descartar el proyectil de inmediato
            try {
                if (isEntityValid(projectile)) projectile.remove();
                debug(`[projectileHitEntity] Removed arrow projectile.`);
            } catch (e) {
                debug(`[projectileHitEntity] Error removing projectile: ${e}`);
            }

            // Aplicar daño directo atribuido al atacante
            system.run(() => {
                try {
                    if (isEntityValid(hitEntity)) {
                        hitEntity.applyDamage(damage, {
                            cause: EntityDamageCause.entityAttack,
                            damagingEntity: attacker
                        });
                        debug(`[projectileHitEntity] Applied ${damage} entityAttack damage to Enderman!`);
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

