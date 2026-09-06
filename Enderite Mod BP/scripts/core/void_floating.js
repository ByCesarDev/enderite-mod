import { world, system } from "@minecraft/server";

/**
 * Exact set of Enderite items matching Java upstream #enderitemod:enderite_items.
 * These items natively have zero gravity and vertical dampening (EnderiteDropMixin.java).
 */
export const ENDERITE_ITEM_IDS = new Set([
    // Ores and Raw Materials
    "ed:enderite",
    "ed:cracked_enderite",
    "ed:enderite_ingot",
    "ed:enderite_scrap",
    "ed:enderite_block",
    "ed:enderite_upgrade_smithing_template",

    // Tools and Weapons
    "ed:enderite_pickaxe",
    "ed:enderite_axe",
    "ed:enderite_sword",
    "ed:enderite_sword_tp",
    "ed:enderite_sword_tp_l2",
    "ed:enderite_sword_tp_l3",
    "ed:enderite_sword_tp_l4",
    "ed:enderite_shovel",
    "ed:enderite_hoe",
    "ed:enderite_shears",

    // Ranged
    "ed:enderite_bow",
    "ed:enderite_crossbow",

    // Shields (custom and proxy identifiers)
    "enderite:shield",
    "enderite:shield_tp",
    "enderite:shield_tp_lv2",
    "enderite:shield_tp_lv3",
    "enderite:shield_tp_lv4",

    // Armor
    "ed:enderite_helmet",
    "ed:enderite_chestplate",
    "ed:enderite_leggings",
    "ed:enderite_boots",

    // Elytra Variants
    "elytra:enderite",
    "elytra:enderite_broken",
    "elytra:chesplate",
    "elytra:chesplate_broken",

    // Containers and Blocks
    "ed:enderite_respawn_anchor",
    "ed:enderite_shulker_box",

    // Upstream v1.9.1+ Forward Compatibility Stubs
    "ed:enderite_spear",
    "ed:enderite_horse_armor",
    "ed:enderite_nautilus_armor"
]);

export const VOID_LORE_KEYS = new Set([
    "lore.ed:void_floating_1",
    "lore.ed:void_floating_2",
    "lore.ed:void_floating_3",
    "enchantment.enderitemod.void_floating"
]);

/**
 * Validates whether an item is an authentic Enderite item.
 * @param {import("@minecraft/server").ItemStack} itemStack
 * @returns {boolean}
 */
export function isEnderiteItem(itemStack) {
    if (!itemStack) return false;
    return ENDERITE_ITEM_IDS.has(itemStack.typeId);
}

/**
 * Reads the Void Floating enchantment level (0 to 3) stored on an item.
 * @param {import("@minecraft/server").ItemStack} itemStack
 * @returns {number} 0, 1, 2, or 3
 */
export function getVoidFloatingLevel(itemStack) {
    if (!itemStack) return 0;
    try {
        if (itemStack.getDynamicProperty) {
            const prop = itemStack.getDynamicProperty("ed:void_floating_level");
            if (typeof prop === "number" && prop >= 1 && prop <= 3) {
                return Math.floor(prop);
            }
        }
    } catch {}
    return 0;
}

/**
 * Sets the Void Floating enchantment level on an item and updates its localized lore.
 * @param {import("@minecraft/server").ItemStack} itemStack
 * @param {number} level 0 to 3 (0 clears the enchantment)
 */
export function setVoidFloatingLevel(itemStack, level) {
    if (!itemStack) return;
    const clampedLevel = Math.max(0, Math.min(3, Math.floor(level || 0)));

    try {
        if (itemStack.setDynamicProperty) {
            if (clampedLevel > 0) {
                itemStack.setDynamicProperty("ed:void_floating_level", clampedLevel);
            } else {
                itemStack.setDynamicProperty("ed:void_floating_level", undefined);
            }
        }
    } catch {}

    try {
        let rawLore = [];
        try {
            rawLore = itemStack.getRawLore() ?? [];
        } catch {
            rawLore = (itemStack.getLore() ?? []).map(t => ({ text: t }));
        }

        const preserved = rawLore.filter(line => {
            if (!line) return false;
            if (line.translate && VOID_LORE_KEYS.has(line.translate)) return false;
            if (typeof line.text === 'string') {
                const trimmed = line.text.trim();
                if (trimmed.includes("Void Floating") || trimmed.includes("Flotar en vacío")) {
                    return false;
                }
            }
            return true;
        });

        if (clampedLevel > 0) {
            preserved.unshift({ translate: `lore.ed:void_floating_${clampedLevel}` });
        }

        itemStack.setLore(preserved);
    } catch {}
}

/**
 * Checks whether an item has an authentic Enderite Armor Trim.
 * Stub returning false until Enderite Trim is ported.
 * @param {import("@minecraft/server").ItemStack} itemStack
 * @returns {boolean}
 */
export function hasEnderiteTrim(itemStack) {
    return false;
}

/**
 * Calculates the exact void survival chance (0.0 to 1.0) based on Java v1.9.1 parity.
 * Enderite items always survive (1.0).
 * Other items survive with chance = (level + trimBonus) / 3.0.
 * @param {import("@minecraft/server").ItemStack} itemStack
 * @returns {number}
 */
export function getVoidSurvivalChance(itemStack) {
    if (!itemStack) return 0;
    if (isEnderiteItem(itemStack)) {
        return 1.0;
    }
    const level = getVoidFloatingLevel(itemStack);
    const trimBonus = hasEnderiteTrim(itemStack) ? 1 : 0;
    const i = level + trimBonus;
    if (i <= 0) return 0;
    return Math.min(1.0, i / 3.0);
}

/**
 * Tracked item entities and their active floating/void monitoring state.
 * @type {Map<string, {
 *   entity: import("@minecraft/server").Entity,
 *   itemStack: import("@minecraft/server").ItemStack,
 *   isEnderite: boolean,
 *   voidLevel: number,
 *   isFloating: boolean,
 *   yVelocity: number
 * }>}
 */
export const trackedFloatingEntities = new Map();

/**
 * Teleports a surviving item entity out of the void to minY + 10, sets zero velocity,
 * and enters active hovering physics matching Java EnderiteDropDamageMixin.
 * @param {import("@minecraft/server").Entity} entity
 * @param {import("@minecraft/server").ItemStack} [itemStack]
 * @returns {boolean}
 */
export function rescueVoidItem(entity, itemStack) {
    if (!entity?.isValid) return false;

    try {
        const dim = entity.dimension;
        const loc = entity.location;
        const targetY = dim.heightRange.min + 10;
        const targetLoc = { x: loc.x, y: targetY, z: loc.z };

        entity.clearVelocity();
        entity.teleport(targetLoc, { checkForBlocks: false });
        entity.clearVelocity();

        const item = itemStack ?? entity.getComponent("item")?.itemStack;
        const isEnderite = isEnderiteItem(item);
        const voidLevel = getVoidFloatingLevel(item);

        trackedFloatingEntities.set(entity.id, {
            entity,
            itemStack: item,
            isEnderite,
            voidLevel,
            isFloating: true,
            yVelocity: 0
        });

        // Discreet visual effect: portal particle and subtle chorus teleport sound
        try {
            dim.spawnParticle("minecraft:basic_portal_particle", {
                x: targetLoc.x,
                y: targetLoc.y + 0.2,
                z: targetLoc.z
            });
            dim.playSound("item.chorus_fruit.teleport", targetLoc, {
                pitch: 1.2,
                volume: 0.8
            });
        } catch {}

        return true;
    } catch {
        return false;
    }
}

/**
 * Registers an item entity into the floating/void monitoring engine if eligible.
 * @param {import("@minecraft/server").Entity} entity
 */
export function registerFloatingItemEntity(entity) {
    if (!entity?.isValid || entity.typeId !== "minecraft:item") return;
    if (trackedFloatingEntities.has(entity.id)) return;

    try {
        const itemComp = entity.getComponent("item");
        const itemStack = itemComp?.itemStack;
        if (!itemStack) return;

        const isEnderite = isEnderiteItem(itemStack);
        const voidLevel = getVoidFloatingLevel(itemStack);

        // Only track items that are Enderite items or have Void Floating enchantment
        if (!isEnderite && voidLevel <= 0) return;

        if (isEnderite) {
            // Java parity: Enderite drops are naturally fire/lava immune
            try {
                entity.triggerEvent("become_fire_immune");
            } catch {}
        }

        let initialVy = 0;
        try {
            initialVy = entity.getVelocity()?.y ?? 0;
        } catch {}

        trackedFloatingEntities.set(entity.id, {
            entity,
            itemStack,
            isEnderite,
            voidLevel,
            // Enderite items float immediately on spawn; void floating items fall with normal gravity until rescued
            isFloating: isEnderite,
            yVelocity: isEnderite ? initialVy : 0
        });
    } catch {}
}

// 1. Reactive listener on item spawn
world.afterEvents.entitySpawn.subscribe((event) => {
    try {
        registerFloatingItemEntity(event.entity);
    } catch {}
});

// 2. Physics & Void-Check Engine: Java parity for EnderiteDropMixin & EnderiteDropDamageMixin
system.runInterval(() => {
    if (trackedFloatingEntities.size === 0) return;

    for (const [id, state] of trackedFloatingEntities) {
        const entity = state.entity;
        if (!entity?.isValid) {
            trackedFloatingEntities.delete(id);
            continue;
        }

        try {
            const loc = entity.location;
            const dim = entity.dimension;
            const minY = dim.heightRange.min;

            // Check void condition: getY() < level.getMinY()
            if (loc.y < minY) {
                const item = state.itemStack ?? entity.getComponent("item")?.itemStack;
                const chance = getVoidSurvivalChance(item);
                if (chance >= 1.0 || Math.random() < chance) {
                    rescueVoidItem(entity, item);
                } else {
                    // Failed survival roll: untrack and allow void to consume it
                    trackedFloatingEntities.delete(id);
                }
                continue;
            }

            // Apply zero-gravity & vertical damping for items in active floating state
            if (state.isFloating) {
                state.yVelocity *= 0.96;
                if (Math.abs(state.yVelocity) < 0.001) {
                    state.yVelocity = 0;
                }

                const currentVel = entity.getVelocity();
                entity.clearVelocity();
                entity.applyImpulse({
                    x: currentVel.x,
                    y: state.yVelocity,
                    z: currentVel.z
                });
            }
        } catch {
            trackedFloatingEntities.delete(id);
        }
    }
}, 1);

// 3. Lightweight fallback sweeper for chunk loading / pre-existing dropped items (every 5 seconds)
system.runInterval(() => {
    try {
        const dimensions = ["overworld", "nether", "the_end"];
        for (const dimId of dimensions) {
            const dimension = world.getDimension(dimId);
            const itemEntities = dimension.getEntities({ type: "minecraft:item" });
            for (const entity of itemEntities) {
                registerFloatingItemEntity(entity);
            }
        }
    } catch {}
}, 100);
