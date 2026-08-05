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
const ARMOR_PREFIX = "ed:armor-";
const TOUGHNESS_PREFIX = "ed:toughness-";
const KNOCKBACK_PREFIX = "ed:knockback-";
const MAX_KNOCKBACK_VALUE = 10;

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

function readCustomArmorStats(entity) {
    const equippable = entity.getComponent(EntityComponentTypes.Equippable);

    if (!equippable) {
        return { armor: 0, toughness: 0, customPieces: 0 };
    }

    let armor = 0;
    let toughness = 0;
    let customPieces = 0;

    for (const slot of ARMOR_SLOTS) {
        const item = equippable.getEquipment(slot);
        if (!item || !item.hasTag(CUSTOM_ARMOR_TAG)) continue;

        customPieces++;
        armor += getNumberFromTag(item, ARMOR_PREFIX);
        toughness += getNumberFromTag(item, TOUGHNESS_PREFIX);
    }

    return {
        armor: Math.min(armor, 20),
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
// MODO DE DIAGNÓSTICO (TEMPORAL) PARA VERIFICAR `event.damage`
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

    const { armor, toughness, customPieces } = readCustomArmorStats(entity);

    // Sistema Flexible: Funciona aportando stats individuales incluso si se mezcla con Vanilla
    if (customPieces === 0 || armor <= 0) {
        return;
    }

    const rawDamage = event.damage;
    const finalDamage = calculateArmorDamage(rawDamage, armor, toughness);

    debug(`Daño recibido por causa: ${cause}`);
    debug(`Daño original: ${rawDamage.toFixed(2)}`);
    debug(`Atributos -> Armadura: ${armor}, Toughness: ${toughness}, Piezas Custom: ${customPieces}`);
    debug(`Daño final calculado: ${finalDamage.toFixed(2)}`);

    event.damage = Math.max(0, finalDamage);
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

        debug(`Corrección horizontal aproximada aplicada: ${resistance * 100}%`);
        
        hurtEntity.applyImpulse({
            x: -velocity.x * resistance,
            y: 0,
            z: -velocity.z * resistance,
        });
    });
});
