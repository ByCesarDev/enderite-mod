import { world, system, EntityDamageCause } from '@minecraft/server';

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
        // Cancelar el evento antes de que el Enderman ejecute su lógica nativa de evasión
        event.cancel = true;

        const attacker = damageSource.damagingEntity;
        const projectile = damageSource.damagingProjectile;

        system.run(() => {
            // Descartar el proyectil tal como Java descarta la flecha
            try {
                if (projectile && (typeof projectile.isValid === 'function' ? projectile.isValid() : projectile.isValid)) {
                    projectile.remove();
                }
            } catch (e) {}

            // Aplicar el daño real del proyectil atribuido al jugador atacante
            try {
                if (hurtEntity && (typeof hurtEntity.isValid === 'function' ? hurtEntity.isValid() : hurtEntity.isValid)) {
                    hurtEntity.applyDamage(damage, {
                        cause: EntityDamageCause.entityAttack,
                        damagingEntity: attacker
                    });
                }
            } catch (e) {}
        });
    }
});