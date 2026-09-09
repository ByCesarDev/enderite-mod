import {
    world,
    system,
    EquipmentSlot,
    EntityComponentTypes,
    EntityDamageCause
} from "@minecraft/server";

// ── Constants ──────────────────────────────────────────────────────────

const ARMOR_SLOTS = [
    EquipmentSlot.Head,
    EquipmentSlot.Chest,
    EquipmentSlot.Legs,
    EquipmentSlot.Feet,
];

const CUSTOM_ARMOR_TAG = "ed:custom_armor";
const TOUGHNESS_PREFIX = "ed:toughness-";
const KNOCKBACK_PREFIX = "ed:knockback-";
const MAX_KNOCKBACK_VALUE = 10;

/**
 * Damage causes that bypass armor entirely (same list as Java).
 * The script should never modify damage for these causes.
 */
const IGNORED_CAUSES = new Set([
    EntityDamageCause.void,
    EntityDamageCause.suicide,
    EntityDamageCause.starve,
    EntityDamageCause.magic,
    EntityDamageCause.drowning,
    EntityDamageCause.fall,
    EntityDamageCause.flyIntoWall,
    EntityDamageCause.fireTick,
    EntityDamageCause.suffocation,
    EntityDamageCause.wither,
    EntityDamageCause.freezing,
    EntityDamageCause.stalactite
]);

// ── Utility ────────────────────────────────────────────────────────────

/**
 * Reads a numeric value from an item's tags with a given prefix.
 * Example: tag "ed:toughness-4" with prefix "ed:toughness-" returns 4.
 * @param {import("@minecraft/server").ItemStack} item
 * @param {string} prefix
 * @returns {number}
 */
function getNumberFromTag(item, prefix) {
    for (const tag of item.getTags()) {
        if (!tag.startsWith(prefix)) continue;
        const value = Number(tag.slice(prefix.length));
        if (Number.isFinite(value) && value >= 0) {
            return value;
        }
    }
    return 0;
}

// ── Pure Armor Math (Java & Bedrock formulas are algebraically identical) ──

/**
 * Calculates the damage after armor reduction using the standard Java/Bedrock formula.
 *
 * Java:    effectiveArmor = min(20, max(armor/5, armor - damage/(2 + toughness/4)))
 * Bedrock: effectiveArmor = min(20, max(armor/5, armor - 4*damage/(toughness+8)))
 * These are algebraically identical: 2 + toughness/4 = (8 + toughness)/4.
 *
 * Important: `armor` is NOT capped to 20 before entering the formula.
 * Full Enderite has 24 armor; the cap of 20 applies to effectiveArmor, not the attribute.
 *
 * @param {number} rawDamage - Incoming damage before armor reduction
 * @param {number} armor - Total armor points (e.g. 24 for full Enderite)
 * @param {number} toughness - Total armor toughness
 * @returns {number} Damage after armor reduction
 */
function calculateArmorDamage(rawDamage, armor, toughness) {
    const effectiveArmor = Math.min(
        20,
        Math.max(
            armor / 5,
            armor - 4 * rawDamage / (toughness + 8)
        )
    );
    return rawDamage * (1 - effectiveArmor / 25);
}

/**
 * Reads the total Enderite toughness from equipped armor pieces.
 * Only counts pieces tagged with `ed:custom_armor` and reads `ed:toughness-N`.
 *
 * Bedrock's native `totalToughness` does not include custom armor toughness
 * (there is no `minecraft:wearable.toughness` field), so this is the gap
 * that our script fills.
 *
 * @param {import("@minecraft/server").EntityEquippableComponent} equippable
 * @returns {number} Extra toughness from Enderite pieces (e.g. 16 for full set)
 */
function getEnderiteToughness(equippable) {
    let total = 0;
    for (const slot of ARMOR_SLOTS) {
        const item = equippable.getEquipment(slot);
        if (!item || !item.hasTag(CUSTOM_ARMOR_TAG)) continue;
        total += getNumberFromTag(item, TOUGHNESS_PREFIX);
    }
    return total;
}

/**
 * Binary search solver: finds an input damage value X such that
 * calculateArmorDamage(X, armor, nativeToughness) ≈ targetDamage.
 *
 * This lets us "pre-distort" the damage so that after Bedrock's native
 * armor pipeline processes it (using only the toughness it knows about),
 * the player receives exactly the damage Java would have calculated
 * with the full toughness (native + Enderite).
 *
 * ~30 iterations, deterministic, precision < 0.001.
 *
 * @param {number} targetDamage - The exact damage we want the player to receive
 * @param {number} armor - Total armor points visible to the engine
 * @param {number} nativeToughness - Toughness the engine already knows about
 * @returns {number} The adjusted input to feed to event.damage
 */
function solveNativeDamageInput(targetDamage, armor, nativeToughness) {
    if (targetDamage <= 0) return 0;

    let lo = 0;
    let hi = targetDamage * 10;

    for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        const result = calculateArmorDamage(mid, armor, nativeToughness);
        if (Math.abs(result - targetDamage) < 0.0005) return mid;
        if (result < targetDamage) lo = mid;
        else hi = mid;
    }
    return (lo + hi) / 2;
}

// ── Toughness Compensation ─────────────────────────────────────────────
//
// Strategy:
//   Bedrock natively handles: armor points + vanilla toughness + enchantments.
//   We ONLY intervene when the entity has Enderite armor pieces, because
//   minecraft:wearable has no toughness field for custom items.
//
//   For each hit on an entity wearing Enderite:
//   1. Read the total armor and native toughness from the engine.
//   2. Add the Enderite toughness (from ed:toughness-N tags).
//   3. Calculate what Java would produce with the full toughness.
//   4. Use binary search to find what input would make Bedrock's native
//      pipeline (with only native toughness) produce that same result.
//   5. Set event.damage to that adjusted input. No double mitigation.

world.beforeEvents.entityHurt.subscribe((event) => {
    const entity = event.hurtEntity;
    if (!entity?.isValid || event.damage <= 0) return;

    const cause = event.damageSource.cause;
    if (IGNORED_CAUSES.has(cause)) return;

    const equippable = entity.getComponent(EntityComponentTypes.Equippable);
    if (!equippable) return;

    const enderiteToughness = getEnderiteToughness(equippable);

    // No Enderite pieces equipped → Bedrock handles everything natively, no intervention
    if (enderiteToughness <= 0) return;

    const rawDamage = event.damage;
    const armor = equippable.totalArmor;
    const nativeToughness = equippable.totalToughness;
    const desiredToughness = nativeToughness + enderiteToughness;

    // What Java would produce with the complete toughness
    const targetDamage = calculateArmorDamage(rawDamage, armor, desiredToughness);

    // What input to give Bedrock so its native pipeline produces targetDamage
    const adjustedInput = solveNativeDamageInput(targetDamage, armor, nativeToughness);

    event.damage = Math.max(0, adjustedInput);
});

// ── Knockback Resistance ───────────────────────────────────────────────
// Java: 0.1 per Enderite piece, 0.4 for full set.
// Bedrock has no native knockback_resistance for custom wearable items.
// This will be improved in P6-B to only reduce knockback delta, not total velocity.

function getKnockbackResistance(entity) {
    const equippable = entity.getComponent(EntityComponentTypes.Equippable);
    if (!equippable) return 0;

    let total = 0;
    let customPieces = 0;

    for (const slot of ARMOR_SLOTS) {
        const item = equippable.getEquipment(slot);
        if (!item || !item.hasTag(CUSTOM_ARMOR_TAG)) continue;

        customPieces++;
        total += getNumberFromTag(item, KNOCKBACK_PREFIX);
    }

    if (customPieces === 0) return 0;
    return Math.min(total / MAX_KNOCKBACK_VALUE, 1);
}

world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource }) => {
    if (!hurtEntity?.isValid) return;
    if (IGNORED_CAUSES.has(damageSource.cause)) return;

    const resistance = getKnockbackResistance(hurtEntity);
    if (resistance <= 0) return;

    system.run(() => {
        if (!hurtEntity.isValid) return;

        const velocity = hurtEntity.getVelocity();
        const horizontalSpeed = Math.hypot(velocity.x, velocity.z);

        if (horizontalSpeed <= 0.001) return;

        hurtEntity.applyImpulse({
            x: -velocity.x * resistance,
            y: 0,
            z: -velocity.z * resistance,
        });
    });
});
