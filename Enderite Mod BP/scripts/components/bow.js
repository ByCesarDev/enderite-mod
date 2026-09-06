import { system, world, EntityEquippableComponent, EquipmentSlot, ItemStack } from "@minecraft/server";

const BOW_DEBUG = true;

function debug(message) {
    if (BOW_DEBUG) {
        console.warn(`[Enderite Bow] ${message}`);
    }
}

const BOW_TYPES = new Set(["ed:enderite_bow", "ed:enderite_cross_bow"]);

// Mapa para rastrear el tick exacto en que el jugador comenzó a tensar (evita magic numbers)
const playerDrawStartMap = new Map(); // playerId -> startTick

// Registro del último disparo por jugador (para cálculo dinámico de daño en proyectiles)
export const lastShotData = new Map(); // playerId -> { weaponTypeId, chargeRatio, powerLevel, infinityLevel, fireTick }

// 1. Detección de inicio de uso (itemStartUse / itemUse)
world.afterEvents.itemStartUse.subscribe((event) => {
    try {
        const player = event.source;
        const item = event.itemStack;
        if (!item || !player) return;

        if (BOW_TYPES.has(item.typeId)) {
            playerDrawStartMap.set(player.id, system.currentTick);
        }
    } catch (e) {}
});

world.afterEvents.itemUse.subscribe((event) => {
    try {
        const player = event.source;
        const item = event.itemStack;
        if (!item || !player) return;

        if (BOW_TYPES.has(item.typeId)) {
            if (!playerDrawStartMap.has(player.id)) {
                playerDrawStartMap.set(player.id, system.currentTick);
            }
        }

        if (item.typeId === "ed:enderite_bow") {
            debug(`Player ${player.name} started drawing ${item.typeId}. Triggering animation.`);
            try {
                if (typeof player.playAnimation === "function") {
                    player.playAnimation("animation.weapons.bow_and_arrow", {
                        blendOutTime: 0.001,
                        stopExpression: "!query.is_using_item"
                    });
                } else {
                    player.runCommandAsync('playanimation @s animation.weapons.bow_and_arrow root 0.001 "!query.is_using_item"');
                }
            } catch (e) {
                try {
                    player.runCommandAsync('playanimation @s animation.weapons.bow_and_arrow root 0.001 "!query.is_using_item"');
                } catch (err) {}
            }
        }
    } catch (e) {
        debug(`Error in itemUse: ${e}`);
    }
});

// 2. Liberación del arco / disparo de proyectil (itemStopUse)
world.afterEvents.itemStopUse.subscribe((event) => {
    try {
        const player = event.source;
        const item = event.itemStack;

        if (!item || !player || !BOW_TYPES.has(item.typeId)) return;

        // Calcular tiempo real transcurrido mediante ticks del servidor
        const startTick = playerDrawStartMap.get(player.id);
        playerDrawStartMap.delete(player.id);

        let elapsedTicks;
        if (startTick !== undefined) {
            elapsedTicks = Math.max(1, system.currentTick - startTick);
        } else {
            const raw = event.useDuration ?? 0;
            elapsedTicks = (raw > 1000000000) ? (2000000000 - raw) : raw;
        }

        debug(`Player ${player.name} released ${item.typeId} (charge: ${elapsedTicks} ticks).`);

        // Si fue una cancelación inmediata (sin tensado efectivo < 6 ticks en arco), no descontar durabilidad
        if (item.typeId === "ed:enderite_bow" && elapsedTicks < 6) {
            debug(`Shot cancelled or duration too short (${elapsedTicks} < 6 ticks); durability preserved.`);
            return;
        }

        // Obtener el item actualmente equipado para leer encantamientos actualizados
        const equippable = player.getComponent(EntityEquippableComponent.componentId);
        const mainhand = equippable?.getEquipment(EquipmentSlot.Mainhand);
        const heldItem = (mainhand?.typeId === item.typeId) ? mainhand : item;

        const enchantable = heldItem?.getComponent("enchantable");
        const powerLevel = enchantable?.getEnchantment?.("power")?.level ?? 0;
        const infinityLevel = enchantable?.getEnchantment?.("infinity")?.level ?? 0;
        const isBow = item.typeId === "ed:enderite_bow";

        // Carga máxima (1.0) se alcanza a los 20 ticks (1 segundo) para el arco; la ballesta siempre dispara al 100%
        const chargeRatio = isBow ? Math.min(1.0, Math.max(0.2, elapsedTicks / 20.0)) : 1.0;

        // Registrar datos de disparo para cálculo fiel de daño en proyectiles
        lastShotData.set(player.id, {
            weaponTypeId: item.typeId,
            chargeRatio,
            powerLevel,
            infinityLevel,
            fireTick: system.currentTick
        });

        debug(`Registered shot data: weapon=${item.typeId}, chargeRatio=${chargeRatio.toFixed(2)}, powerLevel=${powerLevel}, infinity=${infinityLevel}`);

        // Modo creativo no consume durabilidad ni munición
        let isCreative = false;
        try {
            const gm = player.getGameMode();
            isCreative = String(gm).toLowerCase() === "creative";
        } catch (e) {}

        // Paridad Infinity: si el arco tiene Infinity y no está en creativo, preservar munición devolviendo 1 flecha
        if (infinityLevel > 0 && !isCreative) {
            try {
                const inv = player.getComponent("inventory")?.container;
                if (inv) {
                    inv.addItem(new ItemStack("ed:enderite_arrow", 1));
                    debug(`Infinity preserved 1 ed:enderite_arrow for ${player.name}.`);
                }
            } catch (e) {
                debug(`Error refunding arrow with Infinity: ${e}`);
            }
        }

        if (isCreative) {
            debug(`Player ${player.name} is in creative mode; skipping durability cost.`);
            return;
        }

        // Descuento de durabilidad en servidor
        system.run(() => {
            try {
                const eq = player.getComponent(EntityEquippableComponent.componentId);
                if (!eq) return;

                let slot = EquipmentSlot.Mainhand;
                let currentItem = eq.getEquipment(slot);
                if (!currentItem || currentItem.typeId !== item.typeId) {
                    slot = EquipmentSlot.Offhand;
                    currentItem = eq.getEquipment(slot);
                    if (!currentItem || currentItem.typeId !== item.typeId) return;
                }

                const durability = currentItem.getComponent("durability");
                if (!durability) return;

                // Soporte nativo para Unbreaking: 1 / (unbreaking + 1)
                const ench = currentItem.getComponent("enchantable");
                const unbreaking = ench?.getEnchantment?.("unbreaking")?.level ?? 0;
                if (unbreaking > 0 && Math.random() > (1 / (unbreaking + 1))) {
                    debug(`Unbreaking ${unbreaking} triggered: durability damage avoided on ${currentItem.typeId}.`);
                    return;
                }

                if (durability.damage + 1 >= durability.maxDurability) {
                    debug(`${currentItem.typeId} broke! (${durability.damage + 1} / ${durability.maxDurability})`);
                    player.dimension.playSound("random.break", player.location);
                    eq.setEquipment(slot, undefined);
                } else {
                    durability.damage += 1;
                    eq.setEquipment(slot, currentItem);
                    debug(`Applied 1 durability damage to ${currentItem.typeId} (${durability.damage}/${durability.maxDurability}).`);
                }
            } catch (e) {
                debug(`Error updating durability in system.run: ${e}`);
            }
        });
    } catch (e) {
        debug(`Error in itemStopUse: ${e}`);
    }
});

// 3. Soporte para flechas Infinity (no deben poder ser recogidas del suelo al fallar)
world.afterEvents.entitySpawn.subscribe((event) => {
    try {
        const entity = event.entity;
        if (entity?.typeId === "ed:arrow_enderite") {
            for (const [, shot] of lastShotData.entries()) {
                if (system.currentTick - shot.fireTick <= 2 && shot.infinityLevel > 0) {
                    entity.addTag("infinity_arrow");
                    debug(`Marked spawned arrow with tag 'infinity_arrow'.`);
                    break;
                }
            }
        }
    } catch (e) {}
});

world.afterEvents.projectileHitBlock.subscribe((event) => {
    try {
        const proj = event.projectile;
        if (proj?.typeId === "ed:arrow_enderite" && proj.hasTag("infinity_arrow")) {
            proj.remove();
            debug(`Removed infinity arrow upon block impact (cannot be duplicated/farmed).`);
        }
    } catch (e) {}
});

