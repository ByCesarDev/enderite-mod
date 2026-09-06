import { world, system, EntityDamageCause } from '@minecraft/server';

const ENDERMAN_DEBUG = true;

function debug(message) {
    if (ENDERMAN_DEBUG) {
        console.warn(`[Enderite Enderman] ${message}`);
    }
}

/**
 * Paridad con Enderite Java:
 * En Java, el Mixin intercepta el proyectil "Enderite Arrow" en EnderMan.hurtServer()
 * y llama directamente a super.hurtServer() (LivingEntity), evitando la lógica
 * de evasión y teletransporte especial del Enderman.
 *
 * En Bedrock, interceptamos el daño antes de que el motor lo procese usando
 * world.beforeEvents.entityHurt, cancelamos el daño vanilla del proyectil (evitando la evasión)
 * y aplicamos el daño directo equivalente atribuido al atacante.
 */
world.beforeEvents.entityHurt.subscribe((event) => {
    const { hurtEntity, damageSource, damage } = event;

    if (
        hurtEntity?.typeId === 'minecraft:enderman' &&
        damageSource?.damagingProjectile?.typeId === 'ed:arrow_enderite'
    ) {
        const attacker = damageSource.damagingEntity;
        const projectile = damageSource.damagingProjectile;

        debug(`Intercepted projectile hit on Enderman! Attacker: ${attacker?.typeId ?? 'unknown'}, Damage: ${damage.toFixed(2)}`);

        // Cancelar el evento antes de que el Enderman ejecute su lógica nativa de evasión
        event.cancel = true;
        debug(`Cancelled vanilla projectile hurt event to bypass evasion routine.`);

        system.run(() => {
            // Descartar el proyectil tal como Java descarta la flecha
            try {
                if (projectile && (typeof projectile.isValid === 'function' ? projectile.isValid() : projectile.isValid)) {
                    projectile.remove();
                    debug(`Discarded ed:arrow_enderite projectile entity.`);
                }
            } catch (e) {
                debug(`Failed to remove projectile: ${e}`);
            }

            // Aplicar el daño real del proyectil atribuido al jugador atacante
            try {
                if (hurtEntity && (typeof hurtEntity.isValid === 'function' ? hurtEntity.isValid() : hurtEntity.isValid)) {
                    hurtEntity.applyDamage(damage, {
                        cause: EntityDamageCause.entityAttack,
                        damagingEntity: attacker
                    });
                    debug(`Applied direct entityAttack damage (${damage.toFixed(2)}) to Enderman attributed to ${attacker?.typeId ?? 'unknown'}.`);
                }
            } catch (e) {
                debug(`Failed to apply damage to Enderman: ${e}`);
            }
        });
    }
});