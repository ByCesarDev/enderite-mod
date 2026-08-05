import {
    world,
    system,
    EquipmentSlot,
    EntityComponentTypes,
    EntityDamageCause
} from "@minecraft/server";

const ARMOR_DEBUG = true;

function debug(message) {
    if (ARMOR_DEBUG) {
        console.warn(`[Enderite Armor] ${message}`);
    }
}

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

// Mapa para deducir la armadura total y poder revertir la fórmula del motor
const VANILLA_ARMOR_MAP = {
    "minecraft:leather_helmet": 1,
    "minecraft:leather_chestplate": 3,
    "minecraft:leather_leggings": 2,
    "minecraft:leather_boots": 1,
    "minecraft:chainmail_helmet": 2,
    "minecraft:chainmail_chestplate": 5,
    "minecraft:chainmail_leggings": 4,
    "minecraft:chainmail_boots": 1,
    "minecraft:iron_helmet": 2,
    "minecraft:iron_chestplate": 6,
    "minecraft:iron_leggings": 5,
    "minecraft:iron_boots": 2,
    "minecraft:golden_helmet": 2,
    "minecraft:golden_chestplate": 5,
    "minecraft:golden_leggings": 3,
    "minecraft:golden_boots": 1,
    "minecraft:diamond_helmet": 3,
    "minecraft:diamond_chestplate": 8,
    "minecraft:diamond_leggings": 6,
    "minecraft:diamond_boots": 3,
    "minecraft:netherite_helmet": 3,
    "minecraft:netherite_chestplate": 8,
    "minecraft:netherite_leggings": 6,
    "minecraft:netherite_boots": 3,
    "minecraft:turtle_helmet": 2,
    
    // Enderita custom (ahora con protection base para que salga en el HUD)
    "ed:enderite_helmet": 4,
    "ed:enderite_chestplate": 9,
    "ed:enderite_leggings": 7,
    "ed:enderite_boots": 4,
    "ed:enderite_elytra_chesplate": 9,
    "ed:enderite_elytra_chesplate_broken": 9
};

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

function readArmorStats(entity) {
    const equippable = entity.getComponent(EntityComponentTypes.Equippable);

    if (!equippable) {
        return { totalArmor: 0, nativeArmor: 0, toughness: 0, customPieces: 0 };
    }

    let totalArmor = 0;
    let nativeArmor = 0;
    let toughness = 0;
    let customPieces = 0;

    for (const slot of ARMOR_SLOTS) {
        const item = equippable.getEquipment(slot);
        if (!item) continue;
        
        const mappedArmor = (VANILLA_ARMOR_MAP[item.typeId] || 0);

        // En Bedrock 1.21.30, las armaduras custom con 'wearable' llenan la barra visual (HUD)
        // pero NO aplican reducción de daño nativo. Solo las 'minecraft:' lo hacen.
        if (item.typeId.startsWith("minecraft:")) {
            nativeArmor += mappedArmor;
        }
        totalArmor += mappedArmor;

        if (item.hasTag(CUSTOM_ARMOR_TAG)) {
            customPieces++;
            toughness += getNumberFromTag(item, TOUGHNESS_PREFIX);
        }
    }

    return {
        totalArmor: Math.min(totalArmor, 20),
        nativeArmor: Math.min(nativeArmor, 20),
        toughness: Math.max(toughness, 0),
        customPieces,
    };
}

function calculateArmorDamage(rawDamage, armor, toughness) {
    const effectiveArmor = Math.min(
        20,
        Math.max(
            armor / 5,
            armor - rawDamage / (2 + toughness / 4)
        )
    );
    return rawDamage * (1 - effectiveArmor / 25);
}

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

// --------------------------------------------------------------------
// MODO DE DIAGNÓSTICO
// --------------------------------------------------------------------
world.beforeEvents.entityHurt.subscribe((event) => {
    if (!ARMOR_DEBUG) return;
    const health = event.hurtEntity.getComponent(EntityComponentTypes.Health);
    debug(`[BEFORE] damage=${event.damage.toFixed(2)}, health=${health?.currentValue?.toFixed(2)}`);
});

world.afterEvents.entityHurt.subscribe((event) => {
    if (!ARMOR_DEBUG) return;
    const health = event.hurtEntity.getComponent(EntityComponentTypes.Health);
    debug(`[AFTER] damage=${event.damage.toFixed(2)}, health=${health?.currentValue?.toFixed(2)}`);
});
// --------------------------------------------------------------------

world.beforeEvents.entityHurt.subscribe((event) => {
    const entity = event.hurtEntity;

    if (!entity?.isValid || event.damage <= 0) {
        return;
    }

    const cause = event.damageSource.cause;
    if (IGNORED_CAUSES.has(cause)) {
        return;
    }

    const { totalArmor, nativeArmor, toughness, customPieces } = readArmorStats(entity);

    // Sistema Flexible: si no hay al menos una pieza custom, el motor vanilla trabaja solo
    if (customPieces === 0 || totalArmor <= 0) {
        return;
    }

    const rawDamage = event.damage;
    
    // Daño objetivo que queremos que el jugador reciba (matemática de Java)
    const targetDamage = calculateArmorDamage(rawDamage, totalArmor, toughness);

    // Bedrock Vanilla solo reduce el daño de las armaduras 'minecraft:'.
    const engineReduction = Math.min(nativeArmor * 0.04, 0.80);
    const engineMultiplier = 1 - engineReduction;
    
    // Inflamos el daño SOLO basándonos en la armadura nativa que usen.
    const inflatedDamage = targetDamage / engineMultiplier;

    debug(`Causa: ${cause} | Daño Base: ${rawDamage.toFixed(2)}`);
    debug(`Stats -> Armadura Total: ${totalArmor} (Nativa: ${nativeArmor}), Toughness Custom: ${toughness}`);
    debug(`Meta Ideal: ${targetDamage.toFixed(2)} | Inflado (para Vanilla): ${inflatedDamage.toFixed(2)}`);

    event.damage = Math.max(0, inflatedDamage);
});

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
