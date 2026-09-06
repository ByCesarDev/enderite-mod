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
export const SHIELD_COOLDOWN_TICKS = 128; // 6.4 segundos (Java parity)
export const TELEPORT_CHARGE_PROPERTY = "ed:teleport_charge";

// Rastreo de cooldown por jugador
export const swordCooldownMap = new Map(); // playerId -> lastTeleportTick
export const shieldCooldownMap = new Map(); // playerId -> lastShieldTeleportTick

export const UNAFFECTED_BY_ENDERITE_SHIELD = new Set([
    "minecraft:ender_dragon",
    "minecraft:wither",
    "minecraft:elder_guardian",
    "minecraft:warden"
]);

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
    let typeId = typeof itemOrTypeId === 'string' ? itemOrTypeId : itemOrTypeId.typeId;
    if (typeId === 'minecraft:shield' && typeof itemOrTypeId === 'object' && itemOrTypeId.getDynamicProperty) {
        try {
            const variant = itemOrTypeId.getDynamicProperty("shield:variant");
            if (typeof variant === 'string') {
                typeId = variant;
            }
        } catch (e) {}
    }
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

export function updateTeleportLore(itemStack, currentCharge, capacity) {
    if (!itemStack) return;
    try {
        const managedKeys = new Set([
            "lore.ed:charge",
            "lore.ed:charge_zero",
            "lore.ed:upgrade_info",
            "lore.ed:ender_pearls",
            "lore.ed:sword_teleport",
            "lore.ed:shield_teleport"
        ]);

        let rawLore = [];
        try {
            rawLore = itemStack.getRawLore() ?? [];
        } catch (e) {
            rawLore = (itemStack.getLore() ?? []).map(t => ({ text: t }));
        }

        const preserved = rawLore.filter(line => {
            if (!line) return false;
            if (line.translate && managedKeys.has(line.translate)) return false;
            if (typeof line.text === 'string') {
                const trimmed = line.text.trim();
                if (trimmed === "" || trimmed.startsWith("§3Charge:") || trimmed.startsWith("§3Carga:") ||
                    trimmed.startsWith("§7Teleport Distance:") || trimmed.startsWith("§7Sneak + Use") ||
                    trimmed.startsWith("§7Upgrade in") || trimmed.startsWith("§7Mejora en") ||
                    trimmed.startsWith("§7ender pearls") || trimmed.startsWith("§7perlas de ender") ||
                    trimmed.startsWith("§7Teleport with") || trimmed.startsWith("§7¡Teletranspórtate") ||
                    trimmed.startsWith("§7Teleport attacker") || trimmed.startsWith("§7Shift") || trimmed.startsWith("§7¡Shift")) {
                    return false;
                }
            }
            return true;
        });

        let isShield = Boolean(itemStack.typeId && itemStack.typeId.includes("shield"));
        if (!isShield && itemStack.getDynamicProperty) {
            try {
                const variant = itemStack.getDynamicProperty("shield:variant");
                if (typeof variant === 'string' && variant.includes("shield")) {
                    isShield = true;
                }
            } catch (e) {}
        }

        const chargeEntry = capacity > 0
            ? { translate: "lore.ed:charge", with: [String(currentCharge), String(capacity)] }
            : { translate: "lore.ed:charge_zero" };

        const enderiteLore = [
            chargeEntry,
            { translate: "lore.ed:upgrade_info" },
            { translate: "lore.ed:ender_pearls" },
            { translate: isShield ? "lore.ed:shield_teleport" : "lore.ed:sword_teleport" }
        ];

        itemStack.setLore([...preserved, ...enderiteLore]);
    } catch (e) {}
}

export const updateSwordLore = updateTeleportLore;

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

    // Fuera de límites reales de la dimensión
    try {
        const heightRange = dimension.heightRange;
        if (heightRange && (by < heightRange.min || by >= heightRange.max)) {
            return false;
        }
    } catch (e) {
        if (by < -64 || by > 319) return false;
    }

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

    // Partículas discretas de portal vanilla en origen y destino
    try {
        for (let i = 0; i < 8; i++) {
            const ox = (Math.random() - 0.5) * 0.8;
            const oy = Math.random() * 1.8;
            const oz = (Math.random() - 0.5) * 0.8;
            player.dimension.spawnParticle("minecraft:basic_portal_particle", {
                x: origin.x + ox,
                y: origin.y + oy,
                z: origin.z + oz
            });
            player.dimension.spawnParticle("minecraft:basic_portal_particle", {
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
                player.dimension.spawnParticle("minecraft:basic_portal_particle", {
                    x: target.x,
                    y: target.y + 0.1,
                    z: target.z
                });
            }
        }
    } catch (e) {}
}, 4);

/**
 * Paridad Java Enderite Shield v1.9.1 (EnderiteShieldPlayerEntityMixin.java):
 * Cuando el jugador bloquea agachado un ataque con el Escudo de Enderita:
 * 1. Verifica blacklist de bosses (Ender Dragon, Wither, Elder Guardian, Warden).
 * 2. Verifica cooldown de 128 ticks (6.4 segundos).
 * 3. Exige charge > 0 (en Creative TAMBIÉN consume carga por paridad Java).
 * 4. Calcula centro a 10 bloques en la dirección de la mirada del jugador (yaw/pitch).
 * 5. Ejecuta hasta 16 intentos aleatorios de posición segura.
 * 6. Si tiene éxito: consume 1 carga, activa cooldown 128 ticks, reproduce sonido y partículas.
 * 7. Si falla: NO descuenta carga ni activa cooldown.
 */
export function teleportShieldAttacker(player, attacker, shieldItem, shieldSlot = EquipmentSlot.Offhand) {
    if (!isEntityValid(player) || !isEntityValid(attacker) || !shieldItem) return false;

    // 1. Blacklist oficial de bosses
    if (UNAFFECTED_BY_ENDERITE_SHIELD.has(attacker.typeId)) {
        return false;
    }

    // 2. Cooldown de 128 ticks (6.4 segundos)
    const lastTick = shieldCooldownMap.get(player.id) ?? -999;
    if (system.currentTick - lastTick < SHIELD_COOLDOWN_TICKS) {
        return false;
    }

    // 3. Carga > 0 (en Creative TAMBIÉN se exige y se descuenta según Java)
    const capacity = getTeleportCapacity(shieldItem);
    if (capacity <= 0) return false;

    const currentCharge = getTeleportCharge(shieldItem);
    if (currentCharge <= 0) {
        return false;
    }

    const dimension = player.dimension;
    const origin = {
        x: attacker.location.x,
        y: attacker.location.y,
        z: attacker.location.z
    };

    // 4. Vector de dirección de mirada del jugador (Java: yaw y pitch)
    const view = player.getViewDirection ? player.getViewDirection() : { x: 0, y: 0, z: 1 };
    const vLen = Math.hypot(view.x, view.y, view.z) || 1.0;
    const dX = view.x / vLen;
    const dY = view.y / vLen;
    const dZ = view.z / vLen;
    const distance = 10.0;

    // Limites de altura de la dimension
    let minY = -64, maxY = 319;
    try {
        if (dimension.heightRange) {
            minY = dimension.heightRange.min;
            maxY = dimension.heightRange.max;
        }
    } catch (e) {}

    // Desmontar si está montado
    try {
        if (attacker.hasComponent && attacker.hasComponent("minecraft:riding")) {
            attacker.triggerEvent("minecraft:stop_riding");
        }
    } catch (e) {}

    // 5. Hasta 16 intentos aleatorios de posición segura
    let teleportSuccess = false;
    for (let i = 0; i < 16; i++) {
        const rawX = origin.x + dX * distance + (Math.random() - 0.5) * 16.0;
        const rawY = origin.y + dY * distance + (Math.floor(Math.random() * 16) - 8);
        const rawZ = origin.z + dZ * distance + (Math.random() - 0.5) * 16.0;

        const targetY = Math.min(Math.max(minY + 1, Math.floor(rawY)), maxY - 2);
        const targetX = Math.floor(rawX) + 0.5;
        const targetZ = Math.floor(rawZ) + 0.5;

        // Probar offsets verticales alrededor de targetY para encontrar suelo seguro
        for (const offsetY of [0, -1, 1, -2, 2, -3]) {
            const candY = targetY + offsetY;
            if (candY < minY + 1 || candY > maxY - 2) continue;

            if (isSafeStandingPosition(dimension, targetX, candY, targetZ)) {
                try {
                    attacker.teleport({ x: targetX, y: candY, z: targetZ }, { checkForBlocks: false });
                    teleportSuccess = true;

                    // Sonido según atacante (Fox vs Chorus Fruit)
                    const isFox = attacker.typeId === "minecraft:fox";
                    const soundId = isFox ? "mob.fox.teleport" : "item.chorus_fruit.teleport";

                    try {
                        dimension.playSound(soundId, origin);
                        dimension.playSound(soundId, { x: targetX, y: candY, z: targetZ });
                    } catch (e) {
                        try { dimension.playSound("item.chorus_fruit.teleport", origin); } catch (e2) {}
                    }

                    // Partículas discretas de portal vanilla en origen y destino
                    try {
                        for (let p = 0; p < 8; p++) {
                            const ox = (Math.random() - 0.5) * 0.8;
                            const oy = Math.random() * 1.8;
                            const oz = (Math.random() - 0.5) * 0.8;
                            dimension.spawnParticle("minecraft:basic_portal_particle", {
                                x: origin.x + ox,
                                y: origin.y + oy,
                                z: origin.z + oz
                            });
                            dimension.spawnParticle("minecraft:basic_portal_particle", {
                                x: targetX + ox,
                                y: candY + oy,
                                z: targetZ + oz
                            });
                        }
                    } catch (e) {}

                    break;
                } catch (e) {
                    // Si el teleport falló para este offset, continuar probando
                }
            }
        }

        if (teleportSuccess) break;
    }

    if (!teleportSuccess) {
        return false; // Los 16 intentos fallaron -> no se consume carga ni cooldown
    }

    // 6. Éxito confirmado: aplicar cooldown y descontar 1 carga
    shieldCooldownMap.set(player.id, system.currentTick);

    const newCharge = Math.max(0, currentCharge - 1);
    setTeleportCharge(shieldItem, newCharge);
    updateTeleportLore(shieldItem, newCharge, capacity);

    try {
        const equippable = player.getComponent(EntityEquippableComponent.componentId);
        if (equippable) {
            equippable.setEquipment(shieldSlot, shieldItem);
        }
    } catch (e) {}

    return true;
}
