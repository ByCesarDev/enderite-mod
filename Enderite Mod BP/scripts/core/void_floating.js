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
 * Tracked floating item entities and their current damped vertical velocity.
 * @type {Map<string, { entity: import("@minecraft/server").Entity, yVelocity: number }>}
 */
export const trackedFloatingEntities = new Map();

/**
 * Registers an item entity into the floating physics engine if eligible.
 * @param {import("@minecraft/server").Entity} entity
 */
export function registerFloatingItemEntity(entity) {
    if (!entity?.isValid || entity.typeId !== "minecraft:item") return;
    if (trackedFloatingEntities.has(entity.id)) return;

    try {
        const itemComp = entity.getComponent("item");
        const itemStack = itemComp?.itemStack;
        if (!isEnderiteItem(itemStack)) return;

        // Java parity: Enderite drops are naturally fire/lava immune
        try {
            entity.triggerEvent("become_fire_immune");
        } catch {}

        let initialVy = 0;
        try {
            initialVy = entity.getVelocity()?.y ?? 0;
        } catch {}

        trackedFloatingEntities.set(entity.id, {
            entity,
            yVelocity: initialVy
        });
    } catch {}
}

// 1. Reactive listener on item spawn
world.afterEvents.entitySpawn.subscribe((event) => {
    try {
        registerFloatingItemEntity(event.entity);
    } catch {}
});

// 2. Physics Engine: Java parity for EnderiteDropMixin
// Instead of an unnatural +0.06 Y teleport upwards, vertical velocity is damped by 0.96 each tick
// and gravity acceleration is neutralized, allowing the item to smoothly hover in place.
system.runInterval(() => {
    if (trackedFloatingEntities.size === 0) return;

    for (const [id, state] of trackedFloatingEntities) {
        const entity = state.entity;
        if (!entity?.isValid) {
            trackedFloatingEntities.delete(id);
            continue;
        }

        try {
            // Damping equivalent to: this.setDeltaMovement(this.getDeltaMovement().multiply(1.0D, 0.96D, 1.0D))
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
