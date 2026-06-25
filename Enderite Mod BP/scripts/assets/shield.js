import { world, system, EquipmentSlot, ItemStack } from '@minecraft/server';

const CUSTOM_SHIELDS = [
    'enderite:shield',
    'enderite:shield_tp',
    'enderite:shield_tp_lv2',
    'enderite:shield_tp_lv3',
    'enderite:shield_tp_lv4'
];

const shieldNames = {
    'enderite:shield': "Enderite Shield\n§3Charge: 0\n§7Upgrade in Enderite Crafting Tools with\nender pearls to load teleportation uses.\nTeleport attackers with sneaking + right click!",
    'enderite:shield_tp': "Enderite Shield\n§3Charge: 16\n§7Upgrade in Enderite Crafting Tools with\nender pearls to load teleportation uses.\nTeleport attackers with sneaking + right click!",
    'enderite:shield_tp_lv2': "Enderite Shield\n§3Charge: 32\n§7Upgrade in Enderite Crafting Tools with\nender pearls to load teleportation uses.\nTeleport attackers with sneaking + right click!",
    'enderite:shield_tp_lv3': "Enderite Shield\n§3Charge: 48\n§7Upgrade in Enderite Crafting Tools with\nender pearls to load teleportation uses.\nTeleport attackers with sneaking + right click!",
    'enderite:shield_tp_lv4': "Enderite Shield\n§3Charge: 64\n§7Upgrade in Enderite Crafting Tools with\nender pearls to load teleportation uses.\nTeleport attackers with sneaking + right click!"
};

const shieldDurability = {
    'enderite:shield': 9.5,
    'enderite:shield_tp': 9.5,
    'enderite:shield_tp_lv2': 9.5,
    'enderite:shield_tp_lv3': 9.5,
    'enderite:shield_tp_lv4': 9.5
};

const shieldCharges = {
    'enderite:shield': 0,
    'enderite:shield_tp': 16,
    'enderite:shield_tp_lv2': 32,
    'enderite:shield_tp_lv3': 48,
    'enderite:shield_tp_lv4': 64
};

// Helper to find the attacker targeting the player or closest hostile entity
function findAttacker(player) {
    const dimension = player.dimension;
    const location = player.location;

    // Look for entities within 12 blocks
    const targetEntities = dimension.getEntities({
        location: location,
        maxDistance: 12
    });

    let bestAttacker = null;
    let closestDistance = Infinity;

    for (const entity of targetEntities) {
        if (entity.id === player.id) continue;
        
        try {
            if (entity.target?.id === player.id) {
                const dist = Math.sqrt(
                    Math.pow(entity.location.x - location.x, 2) + 
                    Math.pow(entity.location.z - location.z, 2)
                );
                if (dist < closestDistance) {
                    closestDistance = dist;
                    bestAttacker = entity;
                }
            }
        } catch (e) {}
    }

    if (bestAttacker) return bestAttacker;

    // If no entity has the player as target, find the nearest living mob or player within 6 blocks
    for (const entity of targetEntities) {
        if (entity.id === player.id) continue;
        if (!entity.getComponent("health")) continue;

        const dist = Math.sqrt(
            Math.pow(entity.location.x - location.x, 2) + 
            Math.pow(entity.location.z - location.z, 2)
        );
        if (dist < 6 && dist < closestDistance) {
            closestDistance = dist;
            bestAttacker = entity;
        }
    }

    return bestAttacker;
}

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

// Teleport the attacker backward based on the shield's charge, checking for collisions and safe landing
function teleportAttacker(player, activeShield) {
    const charge = shieldCharges[activeShield] || 0;
    if (charge <= 0) return;

    const attacker = findAttacker(player);
    if (!attacker) return;

    let dirX = 0;
    let dirZ = 0;
    const dx = attacker.location.x - player.location.x;
    const dz = attacker.location.z - player.location.z;
    const distanceToAttacker = Math.sqrt(dx * dx + dz * dz);
    
    if (distanceToAttacker > 0) {
        dirX = dx / distanceToAttacker;
        dirZ = dz / distanceToAttacker;
    } else {
        const view = player.getViewDirection();
        const horizontalLength = Math.sqrt(view.x * view.x + view.z * view.z);
        dirX = horizontalLength > 0 ? view.x / horizontalLength : 1;
        dirZ = horizontalLength > 0 ? view.z / horizontalLength : 0;
    }

    const dimension = player.dimension;
    let safeLocation = {
        x: attacker.location.x,
        y: attacker.location.y,
        z: attacker.location.z
    };

    let prevBY = Math.floor(attacker.location.y);

    const FLYING_MOBS = [
        "minecraft:phantom",
        "minecraft:ghast",
        "minecraft:vex",
        "minecraft:allay",
        "minecraft:bat",
        "minecraft:bee",
        "minecraft:wither",
        "minecraft:ender_dragon"
    ];
    const isFlying = FLYING_MOBS.includes(attacker.typeId);

    // Step along the backward trajectory, checking each block coordinate
    for (let i = 1; i <= charge; i++) {
        const tx = attacker.location.x + dirX * i;
        const tz = attacker.location.z + dirZ * i;
        const bx = Math.floor(tx);
        const bz = Math.floor(tz);

        let foundSafeHeight = false;
        let bestY = prevBY;

        // Search vertical offsets near previous height to find ground or safe airspace
        const dySearch = [0, 1, -1, 2, -2, -3, -4, 3];

        for (const dy of dySearch) {
            const checkY = prevBY + dy;
            
            const blockBelow = getBlockSafe(dimension, bx, checkY - 1, bz);
            const blockFeet = getBlockSafe(dimension, bx, checkY, bz);
            const blockHead = getBlockSafe(dimension, bx, checkY + 1, bz);

            const feetPassable = blockFeet && !isBlockSolid(blockFeet);
            const headPassable = blockHead && !isBlockSolid(blockHead);

            if (feetPassable && headPassable) {
                // If it's a flying mob, they can float. Otherwise, we require a solid floor block below.
                const floorValid = isFlying || (blockBelow && isBlockSolid(blockBelow));
                
                if (floorValid) {
                    bestY = checkY;
                    foundSafeHeight = true;
                    break;
                }
            }
        }

        if (foundSafeHeight) {
            // Found a safe position, update the candidate target location
            safeLocation = {
                x: tx,
                y: bestY,
                z: tz
            };
            prevBY = bestY;
        } else {
            // Hit a wall or cliff, stop pathing further
            break;
        }
    }

    // Check if we actually moved from the starting position
    const didMove = Math.abs(safeLocation.x - attacker.location.x) > 0.1 || Math.abs(safeLocation.z - attacker.location.z) > 0.1;
    if (!didMove) return;

    const originLocation = {
        x: attacker.location.x,
        y: attacker.location.y,
        z: attacker.location.z
    };

    try {
        // Teleport the attacker to the furthest safe location found
        attacker.teleport(safeLocation, { checkForBlocks: false });
        
        // Play ender sound effects
        player.dimension.playSound("mob.endermen.portal", player.location);
        player.dimension.playSound("mob.endermen.portal", attacker.location);
        
        // 1. Spawn particles on the player (shield block effect)
        player.runCommandAsync(`particle minecraft:portal_reverse_particle ${player.location.x} ${player.location.y + 1} ${player.location.z}`);
        
        // 2. Spawn vanish particles at origin location (where attacker was)
        player.runCommandAsync(`particle minecraft:dragon_breath_trail ${originLocation.x} ${originLocation.y + 1} ${originLocation.z}`);
        player.runCommandAsync(`particle minecraft:portal_reverse_particle ${originLocation.x} ${originLocation.y + 1} ${originLocation.z}`);
        
        // 3. Spawn a highly dense, towering purple column at destination (where attacker arrived)
        // This generates a beautifully distributed cylinder of petals, sparks, and mist
        for (let h = 0.1; h <= 2.2; h += 0.4) {
            const offsets = [
                { dx: 0, dz: 0 },
                { dx: 0.35, dz: 0.35 },
                { dx: -0.35, dz: 0.35 },
                { dx: 0.35, dz: -0.35 },
                { dx: -0.35, dz: -0.35 }
            ];
            for (const offset of offsets) {
                const px = attacker.location.x + offset.dx;
                const py = attacker.location.y + h;
                const pz = attacker.location.z + offset.dz;
                
                player.runCommandAsync(`particle minecraft:cherry_leaves_particle ${px} ${py} ${pz}`);
                player.runCommandAsync(`particle minecraft:portal_reverse_particle ${px} ${py} ${pz}`);
            }
        }
        // Center core mist for extra density
        player.runCommandAsync(`particle minecraft:dragon_breath_trail ${attacker.location.x} ${attacker.location.y + 0.5} ${attacker.location.z}`);
        player.runCommandAsync(`particle minecraft:dragon_breath_trail ${attacker.location.x} ${attacker.location.y + 1.5} ${attacker.location.z}`);
        
    } catch (error) {
        console.warn("Failed to teleport attacker: " + error);
    }
}

let tickCount = 0;
system.runInterval(() => {
    tickCount++;
    let players = world.getAllPlayers();
    players.forEach(player => {
        const equippable = player?.getComponent('equippable');
        if (!equippable) return;

        const offhandItem = equippable.getEquipment(EquipmentSlot.Offhand);
        const mainhandItem = equippable.getEquipment(EquipmentSlot.Mainhand);
        const inventory = player.getComponent("inventory");

        let shieldSlot;
        
        const hasEnderiteShield = 
            CUSTOM_SHIELDS.includes(mainhandItem?.typeId) ||
            CUSTOM_SHIELDS.includes(offhandItem?.typeId) ||
            CUSTOM_SHIELDS.includes(mainhandItem?.getDynamicProperty("shield:variant")) ||
            CUSTOM_SHIELDS.includes(offhandItem?.getDynamicProperty("shield:variant"));

        if (hasEnderiteShield) {
            player.addTag('multimc:enderite_shield');
        } else {
            player.removeTag("multimc:enderite_shield");
        }

        const offhandVariant = offhandItem?.getDynamicProperty("shield:variant") || offhandItem?.typeId;
        const mainhandVariant = mainhandItem?.getDynamicProperty("shield:variant") || mainhandItem?.typeId;

        if (CUSTOM_SHIELDS.includes(offhandVariant)) {
            shieldSlot = EquipmentSlot.Offhand;
        } else if (CUSTOM_SHIELDS.includes(mainhandVariant)) {
            shieldSlot = EquipmentSlot.Mainhand;
        }

        if (shieldSlot !== undefined) {
            let currentItem = equippable.getEquipment(shieldSlot);
            let initialDamage = currentItem?.getComponent("durability")?.damage;

            system.runTimeout(() => {
                let newItem = equippable?.getEquipment(shieldSlot);
                const variant = newItem?.getDynamicProperty("shield:variant") || newItem?.typeId;
                if (newItem?.getComponent('durability')?.damage > initialDamage && player?.isSneaking) {
                    // Teleport the attacker immediately when the block registers
                    teleportAttacker(player, variant);

                    let randomValue = Math.random() * 10;
                    let maxDurability = shieldDurability[variant] ?? 9.5;
                    if (randomValue <= maxDurability) {
                        let clonedItem = newItem.clone();
                        if (shieldSlot !== EquipmentSlot.Mainhand) {
                            equippable.setEquipment(shieldSlot, clonedItem);
                        } else if (newItem.getDynamicProperty('unique:id') === newItem.getDynamicProperty("unique:id")) {
                            equippable.setEquipment(shieldSlot, clonedItem);
                        }
                    }
                }
            }, 1);
        }

        // Run inventory restoration only once every 10 ticks (2 times per second) to prevent lag
        if (tickCount % 10 === 0 && inventory?.container) {
            for (let i = 0; i <= 35; i++) {
                const item = inventory.container.getItem(i);
                if (!item) continue;

                const variant = item.getDynamicProperty("shield:variant");
                if (CUSTOM_SHIELDS.includes(variant)) {
                    // Check if it's currently held in mainhand or offhand
                    const isHeld = (mainhandItem && item.getDynamicProperty("unique:id") === mainhandItem.getDynamicProperty("unique:id")) ||
                                   (offhandItem && item.getDynamicProperty("unique:id") === offhandItem.getDynamicProperty("unique:id"));
                    
                    // We only restore it if the player is not sneaking, OR if it's sitting in the inventory (not held)
                    const shouldRestore = !player.isSneaking || !isHeld;
                    if (!shouldRestore) continue;

                    let newItem = new ItemStack(variant);
                    let enchantments = item.getComponent("enchantable").getEnchantments();

                    if (newItem.getComponent("durability").maxDurability < item.getComponent("durability").damage) {
                        inventory.container.setItem(i, new ItemStack("minecraft:air"));
                        player.playSound("random.break", player.location);
                        continue;
                    }

                    newItem.getComponent("durability").damage = item.getComponent('durability').damage;
                    newItem.getComponent("enchantable").addEnchantments(enchantments);

                    inventory.container.setItem(i, newItem);
                }
            }
        }

        if (CUSTOM_SHIELDS.includes(offhandItem?.typeId) && player.isSneaking) {
            let shieldColorCode = "§f§3"; // Color específico para Enderite
            player.nameTag = shieldColorCode;

            player.setDynamicProperty("score:score_op", 11);

            let newShield = new ItemStack('minecraft:shield');
            newShield.setDynamicProperty("shield:variant", offhandItem.typeId);
            newShield.nameTag = shieldNames[offhandItem.typeId] || "§r§dEnderite Shield";
            newShield.getComponent("durability").damage = offhandItem.getComponent("durability").damage;
            let enchantments = offhandItem.getComponent("enchantable").getEnchantments();
            newShield.getComponent("enchantable").addEnchantments(enchantments);
            equippable.setEquipment(EquipmentSlot.Offhand, newShield);
        }

        if (offhandItem?.typeId === 'minecraft:shield' && !player.isSneaking && CUSTOM_SHIELDS.includes(offhandVariant)) {
            let newShield = new ItemStack(offhandVariant);
            if (newShield.getComponent("durability").maxDurability < offhandItem.getComponent("durability").damage) {
                equippable.setEquipment(EquipmentSlot.Offhand, new ItemStack('minecraft:air'));
                player.playSound('random.break', player.location);
            }
            newShield.getComponent("durability").damage = offhandItem.getComponent("durability").damage;
            let enchantments = offhandItem.getComponent("enchantable").getEnchantments();
            newShield.getComponent("enchantable").addEnchantments(enchantments);
            equippable.setEquipment(EquipmentSlot.Offhand, newShield);
        }

        if (CUSTOM_SHIELDS.includes(mainhandItem?.typeId) && player.isSneaking && !offhandItem?.typeId?.includes("shield")) {
            let shieldColorCode = "§f§3"; // Color específico para Enderite
            player.nameTag = shieldColorCode;

            player.setDynamicProperty("score:score_op", 11);

            let newShield = new ItemStack('minecraft:shield');
            newShield.setDynamicProperty("shield:variant", mainhandItem.typeId);
            newShield.nameTag = shieldNames[mainhandItem.typeId] || "§r§dEnderite Shield";
            newShield.getComponent("durability").damage = mainhandItem.getComponent("durability").damage;
            let enchantments = mainhandItem.getComponent("enchantable").getEnchantments();
            newShield.getComponent("enchantable").addEnchantments(enchantments);
            equippable.setEquipment(EquipmentSlot.Mainhand, newShield);
        }
    });
});
