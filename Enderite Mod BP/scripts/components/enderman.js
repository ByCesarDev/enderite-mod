import { world } from '@minecraft/server';

world.afterEvents.projectileHitEntity.subscribe((event) => {
    const { source: player, projectile } = event;
    const hitEntity = event.getEntityHit()?.entity;

    // Verifica si el proyectil es el específico y si golpea a un Enderman
    if (projectile.typeId === 'ed:arrow_enderite' && hitEntity?.typeId === 'minecraft:enderman') {
        const enderman = hitEntity;
        const position = enderman.location;

        enderman.applyDamage(5, { cause: "contact" });

        enderman.teleport(position, { dimension: enderman.dimension });
    }
});