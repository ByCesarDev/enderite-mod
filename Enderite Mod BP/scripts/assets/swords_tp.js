import { world, system, ItemStack } from '@minecraft/server';

// Helper to get a block safely without throwing chunk errors
function getBlockSafe(dimension, x, y, z) {
    try {
        return dimension.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
    } catch (e) {
        return undefined;
    }
}

// Helper to determine if a block is solid
function isBlockSolid(block) {
    if (!block || !block.isValid) return false;
    
    try {
        if (typeof block.isSolid === 'boolean') {
            return block.isSolid;
        }
    } catch (e) {}

    if (block.isAir) return false;

    try {
        if (block.isLiquid) return false;
    } catch (e) {}

    const typeId = block.typeId;
    if (!typeId) return false;

    const PASSABLE_IDS = [
        "minecraft:air",
        "minecraft:water",
        "minecraft:lava",
        "minecraft:tallgrass",
        "minecraft:grass",
        "minecraft:double_plant",
        "minecraft:yellow_flower",
        "minecraft:red_flower",
        "minecraft:reeds",
        "minecraft:sugar_cane",
        "minecraft:sapling",
        "minecraft:vine",
        "minecraft:ladder",
        "minecraft:snow_layer",
        "minecraft:fire",
        "minecraft:tripwire",
        "minecraft:torch",
        "minecraft:soul_torch",
        "minecraft:redstone_torch",
        "minecraft:unlit_redstone_torch",
        "minecraft:lever",
        "minecraft:stone_button",
        "minecraft:wooden_button",
        "minecraft:spruce_button",
        "minecraft:birch_button",
        "minecraft:jungle_button",
        "minecraft:acacia_button",
        "minecraft:dark_oak_button",
        "minecraft:crimson_button",
        "minecraft:warped_button",
        "minecraft:polished_blackstone_button",
        "minecraft:wheat",
        "minecraft:carrots",
        "minecraft:potatoes",
        "minecraft:beetroot",
        "minecraft:sweet_berry_bush",
        "minecraft:cave_vines",
        "minecraft:cave_vines_body_with_berries",
        "minecraft:cave_vines_head_with_berries",
        "minecraft:glow_lichen",
        "minecraft:hanging_roots",
        "minecraft:pointed_dripstone",
        "minecraft:small_dripleaf",
        "minecraft:big_dripleaf",
        "minecraft:big_dripleaf_stem",
        "minecraft:spore_blossom",
        "minecraft:azalea",
        "minecraft:flowering_azalea",
        "minecraft:pink_petals",
        "minecraft:nether_sprouts",
        "minecraft:crimson_roots",
        "minecraft:warped_roots",
        "minecraft:seagrass",
        "minecraft:kelp",
        "minecraft:sea_pickle",
        "minecraft:carpet",
        "minecraft:light_block",
        "minecraft:structure_void",
        "minecraft:barrier"
    ];

    if (PASSABLE_IDS.includes(typeId)) return false;

    if (typeId.endsWith("_button") || 
        typeId.endsWith("_torch") || 
        typeId.endsWith("_sapling") || 
        typeId.endsWith("_flower") || 
        typeId.endsWith("_carpet") || 
        typeId.includes("rail") || 
        typeId.endsWith("_pressure_plate") ||
        typeId.includes("gate") ||
        typeId.includes("sign") ||
        typeId.includes("banner") ||
        typeId.endsWith("_fan") ||
        typeId.includes("coral")) {
        return false;
    }

    return true;
}

// Perform sword teleportation safely and play effects
function teleportPlayerWithSword(player, charge) {
    const view = player.getViewDirection();
    const dimension = player.dimension;

    let safeLocation = {
        x: player.location.x,
        y: player.location.y,
        z: player.location.z
    };

    // Calculate length of the view vector to normalize
    const length = Math.sqrt(view.x * view.x + view.y * view.y + view.z * view.z);
    if (length <= 0) return;

    const dirX = view.x / length;
    const dirY = view.y / length;
    const dirZ = view.z / length;

    const originLocation = {
        x: player.location.x,
        y: player.location.y,
        z: player.location.z
    };

    // Step 3D along the view direction up to the charge distance
    for (let i = 1; i <= charge; i++) {
        const tx = player.location.x + dirX * i;
        const ty = player.location.y + dirY * i;
        const tz = player.location.z + dirZ * i;

        const blockFeet = getBlockSafe(dimension, tx, ty, tz);
        const blockHead = getBlockSafe(dimension, tx, ty + 1, tz);

        // Ensure both feet and head are open spaces to prevent suffocation inside blocks
        const feetPassable = blockFeet && !isBlockSolid(blockFeet);
        const headPassable = blockHead && !isBlockSolid(blockHead);

        if (feetPassable && headPassable) {
            safeLocation = { x: tx, y: ty, z: tz };
        } else {
            // Hit a wall/ceiling/ground, stop tracing
            break;
        }
    }

    // Check if we actually moved
    const didMove = Math.abs(safeLocation.x - player.location.x) > 0.1 || 
                    Math.abs(safeLocation.y - player.location.y) > 0.1 || 
                    Math.abs(safeLocation.z - player.location.z) > 0.1;
    
    if (!didMove) return;

    try {
        // Teleport player to safeLocation
        player.teleport(safeLocation, { checkForBlocks: false });

        // Play teleport sound
        dimension.playSound("mob.shulker.teleport", originLocation);
        dimension.playSound("mob.shulker.teleport", player.location);

        // 1. Spawn particles at origin (where player was)
        player.runCommandAsync(`particle minecraft:portal_reverse_particle ${originLocation.x} ${originLocation.y + 1} ${originLocation.z}`);
        player.runCommandAsync(`particle minecraft:dragon_breath_trail ${originLocation.x} ${originLocation.y + 1} ${originLocation.z}`);

        // 2. Spawn a highly dense, towering purple column at destination (where player arrived)
        for (let h = 0.1; h <= 2.2; h += 0.4) {
            const offsets = [
                { dx: 0, dz: 0 },
                { dx: 0.35, dz: 0.35 },
                { dx: -0.35, dz: 0.35 },
                { dx: 0.35, dz: -0.35 },
                { dx: -0.35, dz: -0.35 }
            ];
            for (const offset of offsets) {
                const px = player.location.x + offset.dx;
                const py = player.location.y + h;
                const pz = player.location.z + offset.dz;
                
                player.runCommandAsync(`particle minecraft:cherry_leaves_particle ${px} ${py} ${pz}`);
                player.runCommandAsync(`particle minecraft:portal_reverse_particle ${px} ${py} ${pz}`);
            }
        }
        // Center core mist
        player.runCommandAsync(`particle minecraft:dragon_breath_trail ${player.location.x} ${player.location.y + 0.5} ${player.location.z}`);
        player.runCommandAsync(`particle minecraft:dragon_breath_trail ${player.location.x} ${player.location.y + 1.5} ${player.location.z}`);

    } catch (error) {
        console.warn("Failed to teleport player with sword: " + error);
    }
}

world.beforeEvents.worldInitialize.subscribe(initEvent => {
    const itemRegistry = initEvent.itemComponentRegistry;
    if (itemRegistry) {
        // Register custom components for the different swords directly calling the Script API logic
        itemRegistry.registerCustomComponent('ed:sword16', {
            onUse: useEvent => {
                const { source: player } = useEvent;
                if (player.isSneaking) {
                    teleportPlayerWithSword(player, 16);
                }
            }
        });
        
        itemRegistry.registerCustomComponent('ed:sword32', {
            onUse: useEvent => {
                const { source: player } = useEvent;
                if (player.isSneaking) {
                    teleportPlayerWithSword(player, 32);
                }
            }
        });
        
        itemRegistry.registerCustomComponent('ed:sword48', {
            onUse: useEvent => {
                const { source: player } = useEvent;
                if (player.isSneaking) {
                    teleportPlayerWithSword(player, 48);
                }
            }
        });
        
        itemRegistry.registerCustomComponent('ed:sword64', {
            onUse: useEvent => {
                const { source: player } = useEvent;
                if (player.isSneaking) {
                    teleportPlayerWithSword(player, 64);
                }
            }
        });
    }
});