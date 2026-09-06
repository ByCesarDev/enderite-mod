import { world, system, EntityDamageCause } from '@minecraft/server';

const ENDERMAN_DEBUG = true;

function debug(message) {
    if (ENDERMAN_DEBUG) {
        console.warn(`[Enderite Enderman] ${message}`);
    }
}

const isEntityValid = (e) => Boolean(e && (typeof e.isValid === 'function' ? e.isValid() : e.isValid));

// 1. Diagnóstico de spawn de flecha
world.afterEvents.entitySpawn.subscribe((event) => {
    if (event.entity?.typeId === 'ed:arrow_enderite') {
        const loc = event.entity.location;
        debug(`[entitySpawn] ed:arrow_enderite spawned at (${loc.x.toFixed(1)}, ${loc.y.toFixed(1)}, ${loc.z.toFixed(1)})`);
    }
});

// 2. Diagnóstico de colisión con bloques
world.afterEvents.projectileHitBlock.subscribe((event) => {
    if (event.projectile?.typeId === 'ed:arrow_enderite') {
        const b = event.getBlockHit()?.block;
        debug(`[projectileHitBlock] ed:arrow_enderite hit block ${b?.typeId} at (${b?.location?.x}, ${b?.location?.y}, ${b?.location?.z})`);
    }
});

// 3. Diagnóstico e intercepción en projectileHitEntity
world.afterEvents.projectileHitEntity.subscribe((event) => {
    const { source: attacker, projectile } = event;
    const hitEntity = event.getEntityHit()?.entity;

    debug(`[projectileHitEntity] Projectile ${projectile?.typeId} hit entity ${hitEntity?.typeId}`);

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

        // Aplicar daño como entityAttack atribuido al atacante
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
});

// 4. Diagnóstico en beforeEvents.entityHurt
world.beforeEvents.entityHurt.subscribe((event) => {
    const { hurtEntity, damageSource, damage } = event;

    if (hurtEntity?.typeId === 'minecraft:enderman') {
        debug(`[beforeEvents.entityHurt] Enderman hurt! Cause: ${damageSource?.cause}, Projectile: ${damageSource?.damagingProjectile?.typeId}, Damager: ${damageSource?.damagingEntity?.typeId}, Damage: ${damage.toFixed(2)}`);

        if (damageSource?.damagingProjectile?.typeId === 'ed:arrow_enderite') {
            event.cancel = true;
            debug(`[beforeEvents.entityHurt] Cancelled projectile damage on Enderman to bypass evasion.`);

            const attacker = damageSource.damagingEntity;
            const projectile = damageSource.damagingProjectile;

            system.run(() => {
                try {
                    if (isEntityValid(projectile)) projectile.remove();
                } catch (e) {}

                try {
                    if (isEntityValid(hurtEntity)) {
                        hurtEntity.applyDamage(damage, {
                            cause: EntityDamageCause.entityAttack,
                            damagingEntity: attacker
                        });
                        debug(`[beforeEvents.entityHurt] Applied direct entityAttack damage (${damage.toFixed(2)}).`);
                    }
                } catch (e) {}
            });
        }
    }
});
