import { world, system, EntityEquippableComponent, EquipmentSlot } from "@minecraft/server";

export const SWORD_CAPACITIES = {
    "ed:enderite_sword": 0,
    "ed:enderite_sword_tp": 16,
    "ed:enderite_sword_tp_l2": 32,
    "ed:enderite_sword_tp_l3": 48,
    "ed:enderite_sword_tp_l4": 64
};

export const SHIELD_CAPACITIES = {
    "enderite:shield": 0,
    "enderite:shield_tp": 16,
    "enderite:shield_tp_lv2": 32,
    "enderite:shield_tp_lv3": 48,
    "enderite:shield_tp_lv4": 64
};

export const TELEPORT_DISTANCE = 30;
export const SWORD_COOLDOWN_TICKS = 30; // 1.5 segundos
export const TELEPORT_CHARGE_PROPERTY = "ed:teleport_charge";

// Rastreo de cooldown de espada por jugador (30 ticks)
export const swordCooldownMap = new Map(); // playerId -> lastTeleportTick

const HAZARDOUS_BLOCKS = new Set([
    "minecraft:lava",
    "minecraft:flowing_lava",
    "minecraft:fire",
    "minecraft:soul_fire",
    "minecraft:campfire",
    "minecraft:soul_campfire",
    "minecraft:magma_block",
    "minecraft:cactus",
    "minecraft:sweet_berry_bush",
    "minecraft:wither_rose"
]);

const PASSABLE_FOLIAGE_IDS = new Set([
    "minecraft:air",
    "minecraft:tallgrass",
    "minecraft:grass",
    "minecraft:short_grass",
    "minecraft:double_plant",
    "minecraft:yellow_flower",
    "minecraft:red_flower",
    "minecraft:reeds",
    "minecraft:sugar_cane",
    "minecraft:sapling",
    "minecraft:vine",
    "minecraft:ladder",
    "minecraft:snow_layer",
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
    "minecraft:structure_void"
]);

export function isEntityValid(e) {
    return Boolean(e && (typeof e.isValid === 'function' ? e.isValid() : e.isValid));
}

export function getTeleportCapacity(itemOrTypeId) {
    if (!itemOrTypeId) return 0;
    const typeId = typeof itemOrTypeId === 'string' ? itemOrTypeId : itemOrTypeId.typeId;
    return SWORD_CAPACITIES[typeId] ?? SHIELD_CAPACITIES[typeId] ?? 0;
}

export function getTeleportCharge(itemStack) {
    if (!itemStack) return 0;
    const capacity = getTeleportCapacity(itemStack);
    if (capacity <= 0) return 0;

    try {
        const prop = itemStack.getDynamicProperty(TELEPORT_CHARGE_PROPERTY);
        if (typeof prop === 'number') {
            return Math.min(Math.max(0, Math.floor(prop)), capacity);
        }
    } catch (e) {}

    // Migración para items existentes: inicializar a su capacidad máxima
    return capacity;
}

export function setTeleportCharge(itemStack, charge) {
    if (!itemStack) return;
    const capacity = getTeleportCapacity(itemStack);
    const clamped = Math.min(Math.max(0, Math.floor(charge)), capacity);
    try {
        itemStack.setDynamicProperty(TELEPORT_CHARGE_PROPERTY, clamped);
    } catch (e) {}
}

export function updateSwordLore(itemStack, currentCharge, capacity) {
    if (!itemStack) return;
    try {
        const existingLore = itemStack.getLore() ?? [];
        const cleanedLore = existingLore.filter(line => {
            if (typeof line !== 'string') return true;
            const trimmed = line.trim();
            if (trimmed === "") return false;
            if (trimmed.startsWith("§3Charge:") || trimmed.startsWith("§7Charge:") || trimmed.startsWith("Charge:")) return false;
            if (trimmed.startsWith("§7Teleport Distance:") || trimmed.startsWith("Teleport Distance:")) return false;
            if (trimmed.startsWith("§7Sneak + Use to teleport") || trimmed.startsWith("Sneak + Use to teleport")) return false;
            if (trimmed.startsWith("§7Upgrade in Enderite Crafting Tools")) return false;
            if (trimmed.startsWith("§7ender pearls to load teleportation uses.")) return false;
            if (trimmed.startsWith("§7Teleport with sneaking")) return false;
            return true;
        });

        const managedLines = [
            " ",
            `§3Charge: ${currentCharge} / ${capacity}`,
            `§7Teleport Distance: ${TELEPORT_DISTANCE}`,
            "§7Sneak + Use to teleport"
        ];

        itemStack.setLore([...cleanedLore, ...managedLines]);
    } catch (e) {}
}

export function getBlockSafe(dimension, x, y, z) {
    try {
        return dimension.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
    } catch (e) {
        return undefined;
    }
}

export function isPassableDecorationOrAir(block) {
    if (!block || !block.isValid) return false;
    if (block.isAir) return true;
    const typeId = block.typeId;
    if (!typeId) return false;
    if (PASSABLE_FOLIAGE_IDS.has(typeId)) return true;
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
        return true;
    }
    return false;
}

export function isSpaceFree(block) {
    if (!block || !block.isValid) return false;
    if (block.isAir) return true;

    // Barrera NUNCA es transitable
    if (block.typeId === "minecraft:barrier") return false;

    // Los líquidos (agua, lava) no son un destino seguro para situar pies o cabeza
    try {
        if (block.isLiquid) return false;
    } catch (e) {}
    if (block.typeId === "minecraft:water" || block.typeId === "minecraft:flowing_water" ||
        block.typeId === "minecraft:lava" || block.typeId === "minecraft:flowing_lava") {
        return false;
    }

    // Bloques peligrosos/dañinos
    if (HAZARDOUS_BLOCKS.has(block.typeId)) return false;

    // Si es un bloque sólido según el motor, no hay espacio libre
    try {
        if (typeof block.isSolid === 'boolean' && block.isSolid) {
            return false;
        }
    } catch (e) {}

    return isPassableDecorationOrAir(block);
}

export function isSafeFloor(block) {
    if (!block || !block.isValid) return false;
    if (block.isAir) return false;

    // Los líquidos no son suelo seguro
    try {
        if (block.isLiquid) return false;
    } catch (e) {}
    if (block.typeId === "minecraft:water" || block.typeId === "minecraft:flowing_water" ||
        block.typeId === "minecraft:lava" || block.typeId === "minecraft:flowing_lava") {
        return false;
    }

    // Suelos peligrosos
    if (HAZARDOUS_BLOCKS.has(block.typeId)) return false;

    // Follaje o decoraciones no son suelo sólido
    if (isPassableDecorationOrAir(block)) return false;

    // Debe ser sólido
    try {
        if (typeof block.isSolid === 'boolean') {
            return block.isSolid;
        }
    } catch (e) {}

    return true;
}

export function isSafeStandingPosition(dimension, x, y, z) {
    const by = Math.floor(y);
    const bx = Math.floor(x);
    const bz = Math.floor(z);

    // Límite techo del Nether: cabeza nunca por encima de 127 para evitar salir sobre la bedrock
    if (dimension.id === "minecraft:nether" && by + 1 > 127) {
        return false;
    }

    // Fuera de límites de mundo
    if (by < -64 || by > 319) return false;

    // Bloque debajo -> suelo seguro y sólido
    const floor = getBlockSafe(dimension, bx, by - 1, bz);
    if (!isSafeFloor(floor)) return false;

    // Pies -> espacio libre
    const feet = getBlockSafe(dimension, bx, by, bz);
    if (!isSpaceFree(feet)) return false;

    // Cabeza -> espacio libre
    const head = getBlockSafe(dimension, bx, by + 1, bz);
    if (!isSpaceFree(head)) return false;

    return true;
}

export function findSafeTeleportTarget(dimension, player, start, direction, maxDistance = TELEPORT_DISTANCE) {
    if (!dimension || !player || !start || !direction) return undefined;

    const len = Math.hypot(direction.x, direction.y, direction.z);
    if (len <= 0) return undefined;
    const dirX = direction.x / len;
    const dirY = direction.y / len;
    const dirZ = direction.z / len;

    // 1. Trazar raycast hacia adelante para hallar el primer obstáculo sólido o barrera
    let maxReach = maxDistance;
    for (let step = 1; step <= maxDistance; step += 0.5) {
        const cx = start.x + dirX * step;
        const cy = start.y + dirY * step;
        const cz = start.z + dirZ * step;

        const block = getBlockSafe(dimension, cx, cy, cz);
        if (block) {
            if (block.typeId === "minecraft:barrier") {
                maxReach = Math.max(1, step - 0.5);
                break;
            }
            try {
                if (typeof block.isSolid === 'boolean' && block.isSolid) {
                    maxReach = Math.max(1, step - 0.5);
                    break;
                }
            } catch (e) {}
        }
    }

    // 2. Retroceder a lo largo del rayo desde maxReach buscando la posición segura más lejana
    const startDist = Math.floor(maxReach);
    for (let dist = startDist; dist >= 2; dist--) {
        const rayX = start.x + dirX * dist;
        const rayY = start.y + dirY * dist;
        const rayZ = start.z + dirZ * dist;

        const blockX = Math.floor(rayX) + 0.5;
        const blockZ = Math.floor(rayZ) + 0.5;
        const centerRayY = Math.floor(rayY);

        // Probar offsets verticales para apoyar los pies en suelo seguro
        for (const offsetY of [0, -1, 1, -2, -3]) {
            const candidateY = centerRayY + offsetY;

            if (isSafeStandingPosition(dimension, blockX, candidateY, blockZ)) {
                // Verificar que no sea la misma posición actual del jugador
                const dx = blockX - player.location.x;
                const dy = candidateY - player.location.y;
                const dz = blockZ - player.location.z;
                if (dx * dx + dy * dy + dz * dz >= 2.0) {
                    return { x: blockX, y: candidateY, z: blockZ };
                }
            }
        }
    }

    return undefined;
}

export function useEnderiteSwordTeleport(player, itemStack) {
    if (!isEntityValid(player)) return false;

    // 1. Verificar si es una espada teleportable válida
    const capacity = SWORD_CAPACITIES[itemStack?.typeId] ?? 0;
    if (capacity <= 0) return false;

    // 2. Exigir Sneaking
    if (!player.isSneaking) return false;

    // 3. Verificar cooldown de 30 ticks (1.5s)
    const lastTick = swordCooldownMap.get(player.id) ?? -999;
    if (system.currentTick - lastTick < SWORD_COOLDOWN_TICKS) {
        return false;
    }

    // 4. Verificar modo de juego y cargas
    let isCreative = false;
    try {
        isCreative = String(player.getGameMode()).toLowerCase() === "creative";
    } catch (e) {}

    const currentCharge = getTeleportCharge(itemStack);
    if (!isCreative && currentCharge <= 0) {
        return false; // Sin cargas disponibles
    }

    // 5. Calcular destino seguro (hasta 30 bloques)
    const start = player.getHeadLocation ? player.getHeadLocation() : {
        x: player.location.x,
        y: player.location.y + 1.62,
        z: player.location.z
    };
    const dir = player.getViewDirection();
    const target = findSafeTeleportTarget(player.dimension, player, start, dir, TELEPORT_DISTANCE);

    if (!target) {
        // Fallo: sin sitio seguro -> NO consume carga, NO aplica cooldown
        return false;
    }

    const origin = {
        x: player.location.x,
        y: player.location.y,
        z: player.location.z
    };

    // 6. Ejecutar teleportación
    try {
        player.teleport(target, { checkForBlocks: false });
    } catch (e) {
        return false; // Si falla el teleport, salir limpiamente
    }

    // 7. Éxito confirmado: aplicar efectos
    // Cooldown de 30 ticks
    swordCooldownMap.set(player.id, system.currentTick);

    // Sonidos vanilla de teletransporte de Enderman
    try {
        player.dimension.playSound("mob.enderman.portal", origin);
        player.dimension.playSound("mob.enderman.portal", target);
    } catch (e) {}

    // Partículas discretas de portal en origen y destino
    try {
        for (let i = 0; i < 6; i++) {
            const ox = (Math.random() - 0.5) * 0.6;
            const oy = Math.random() * 1.8;
            const oz = (Math.random() - 0.5) * 0.6;
            player.dimension.spawnParticle("minecraft:portal_reverse_particle", {
                x: origin.x + ox,
                y: origin.y + oy,
                z: origin.z + oz
            });
            player.dimension.spawnParticle("minecraft:portal_reverse_particle", {
                x: target.x + ox,
                y: target.y + oy,
                z: target.z + oz
            });
        }
    } catch (e) {}

    // En Survival: consumir 1 carga y actualizar lore en mano
    if (!isCreative) {
        const newCharge = Math.max(0, currentCharge - 1);
        setTeleportCharge(itemStack, newCharge);
        updateSwordLore(itemStack, newCharge, capacity);

        try {
            const equippable = player.getComponent(EntityEquippableComponent.componentId);
            if (equippable) {
                const main = equippable.getEquipment(EquipmentSlot.Mainhand);
                if (main && main.typeId === itemStack.typeId) {
                    equippable.setEquipment(EquipmentSlot.Mainhand, itemStack);
                } else {
                    const off = equippable.getEquipment(EquipmentSlot.Offhand);
                    if (off && off.typeId === itemStack.typeId) {
                        equippable.setEquipment(EquipmentSlot.Offhand, itemStack);
                    }
                }
            }
        } catch (e) {}
    }

    return true;
}

// Bucle de preview discreto al agacharse con la espada en mano
system.runInterval(() => {
    try {
        for (const player of world.getAllPlayers()) {
            if (!isEntityValid(player) || !player.isSneaking) continue;

            const equippable = player.getComponent(EntityEquippableComponent.componentId);
            const mainhand = equippable?.getEquipment(EquipmentSlot.Mainhand);
            if (!mainhand) continue;

            const capacity = SWORD_CAPACITIES[mainhand.typeId] ?? 0;
            if (capacity <= 0) continue;

            let isCreative = false;
            try { isCreative = String(player.getGameMode()).toLowerCase() === "creative"; } catch (e) {}

            const charge = getTeleportCharge(mainhand);
            if (!isCreative && charge <= 0) continue;

            const start = player.getHeadLocation ? player.getHeadLocation() : {
                x: player.location.x,
                y: player.location.y + 1.62,
                z: player.location.z
            };
            const dir = player.getViewDirection();
            const target = findSafeTeleportTarget(player.dimension, player, start, dir, TELEPORT_DISTANCE);

            if (target) {
                player.dimension.spawnParticle("minecraft:portal_reverse_particle", {
                    x: target.x,
                    y: target.y + 0.1,
                    z: target.z
                });
            }
        }
    } catch (e) {}
}, 4);
