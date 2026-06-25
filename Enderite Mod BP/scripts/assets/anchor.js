import { world, system } from "@minecraft/server";


function onPlayerInteractAnchor(event) {
    const { player, block } = event;
    const item = player.getComponent("inventory").container.getItem(player.selectedSlotIndex);
    const theEnd = player.dimension.id === 'minecraft:the_end';
    const survival = player.getGameMode() == "survival"

    if (block.typeId == 'ed:anchor_end_spawn') {
        const levelSpawn = block.permutation.getState('ed:filling_level');
        if (item && item.typeId == 'minecraft:ender_pearl' && levelSpawn < 4 && !player.isSneaking) {
            if (survival) {
                player.runCommand(`clear @s minecraft:ender_pearl -1 1`);
            }
            block.setPermutation(block.permutation.withState('ed:filling_level', levelSpawn + 1));
            if (player.hasTag(`setSpawn`)) {
                for (let i = 0; i <= levelSpawn + 1; i++) {
                    player.addTag(`spawn_${i}`);
                }
            }
        } else if (theEnd) {
            const existingSpawn = world.getDynamicProperty(`spawnPosition${block.location.x}${block.location.y}${block.location.z}`);
            if (existingSpawn) return;
            const dynamicPropertyIds = world.getDynamicPropertyIds();
            for (const prop of dynamicPropertyIds) {
                if (prop.startsWith('spawnPosition')) {
                    world.setDynamicProperty(prop, false);
                }
            }
            deleteSpawn(player);
            system.runTimeout(() => {
                if (!player.hasTag(`setSpawn`)) {
                    for (let i = 0; i <= levelSpawn; i++) {
                        player.addTag(`spawn_${i}`);
                    }
                    player.addTag(`setSpawn`);
                    world.sendMessage({ translate: 'tile.respawn_anchor.respawnSet' });

                    const entity = player.dimension.spawnEntity('ed:dummyend', block.location);
                    world.setDynamicProperty(`spawnPosition${block.location.x}${block.location.y}${block.location.z}`, true);
                    entity.addTag(`player${player.id}`);

                    player.runCommand(`tickingarea add circle ${block.location.x} ${block.location.y} ${block.location.z} 1 spawn${player.id} true`);
                }
            }, 5);
        } else if (levelSpawn > 0) {
            player.dimension.spawnEntity('ed:anchor_explode', block.location);
        }
    }
}
world.beforeEvents.worldInitialize.subscribe(initEvent => {
    const registry = initEvent.blockComponentRegistry;
    if (registry) {
        registry.registerCustomComponent('ed:anchor_interact', {
            onPlayerInteract: onPlayerInteractAnchor
        });
    }
});

world.afterEvents.playerBreakBlock.subscribe(event => {
    const { player, brokenBlockPermutation, block } = event;
    const existingSpawn = world.getDynamicProperty(`spawnPosition${block.location.x}${block.location.y}${block.location.z}`);
    if (existingSpawn && brokenBlockPermutation.type.id === 'ed:anchor_end_spawn') {
        deleteSpawn(player);
    }
});

function deleteSpawn(player) {
    player.runCommand(`event entity @e[type=ed:dummyend,tag=player${player.id}] despawn`);
    player.runCommand(`tickingarea remove spawn${player.id}`);
    player.removeTag(`setSpawn`);
    for (let i = 0; i <= 4; i++) {
        player.removeTag(`spawn_${i}`);
    }
}

world.afterEvents.playerSpawn.subscribe(data => {
    const player = data.player;
    if (player.hasTag('die') && player.hasTag(`setSpawn`)) {
        player.removeTag('die');
        for (let i = 4; i >= 0; i--) {
            if (player.hasTag(`spawn_${i}`)) {
                player.removeTag(`spawn_${i}`);
                if (i === 0) {
                    player.removeTag(`setSpawn`);
                } else {
                    const endDimension = world.getDimension('minecraft:the_end');
                    const dummyend = endDimension.getEntities({
                        tags: [`player${player.id}`]
                    });

                    if (dummyend.length > 0) {
                        dummyend.forEach(entity => {
                            const block = entity.dimension.getBlock(entity.location);
                            if (block.typeId == 'ed:anchor_end_spawn') {
                                player.runCommand(`teleport @s @e[type=ed:dummyend,tag=player${player.id}]`);
                                const currentLevel = block.permutation.getState('ed:filling_level');
                                block.setPermutation(block.permutation.withState('ed:filling_level', currentLevel - 1));
                            } else {
                                deleteSpawn(player);
                            }
                        });
                    }
                }
                break;
            }
        }
    }
});

world.afterEvents.entityDie.subscribe(data => {
    const deadEntity = data.deadEntity;
    if (deadEntity.typeId == 'minecraft:player') {
        deadEntity.addTag('die');
    }
});

