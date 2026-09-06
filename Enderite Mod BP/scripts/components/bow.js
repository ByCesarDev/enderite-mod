import { system, world, EntityEquippableComponent, EquipmentSlot } from "@minecraft/server";

const BOW_DEBUG = true;

function debug(message) {
    if (BOW_DEBUG) {
        console.warn(`[Enderite Bow] ${message}`);
    }
}

const BOW_TYPES = new Set(["ed:enderite_bow", "ed:enderite_cross_bow"]);

// Activar la animación de tensado de arco al comenzar a usarlo
world.afterEvents.itemUse.subscribe((event) => {
    try {
        const player = event.source;
        const item = event.itemStack;
        if (!item || !player) return;

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

// Consumo de durabilidad al disparar (itemStopUse), preservando encantamientos, lore y nombres
world.afterEvents.itemStopUse.subscribe((event) => {
    try {
        const player = event.source;
        const item = event.itemStack;
        const useDuration = event.useDuration ?? 0;

        if (!item || !player || !BOW_TYPES.has(item.typeId)) return;

        debug(`Player ${player.name} released ${item.typeId} (useDuration: ${useDuration} ticks).`);

        // Si fue una cancelación inmediata (sin tensado efectivo), no descontar durabilidad
        if (item.typeId === "ed:enderite_bow" && useDuration < 6) {
            debug(`Shot cancelled or duration too short (${useDuration} < 6 ticks); durability preserved.`);
            return;
        }

        // Modo creativo no consume durabilidad
        let isCreative = false;
        try {
            const gm = player.getGameMode();
            isCreative = String(gm).toLowerCase() === "creative";
        } catch (e) {}
        if (isCreative) {
            debug(`Player ${player.name} is in creative mode; skipping durability cost.`);
            return;
        }

        system.run(() => {
            try {
                const equippable = player.getComponent(EntityEquippableComponent.componentId);
                if (!equippable) return;

                let slot = EquipmentSlot.Mainhand;
                let currentItem = equippable.getEquipment(slot);
                if (!currentItem || currentItem.typeId !== item.typeId) {
                    slot = EquipmentSlot.Offhand;
                    currentItem = equippable.getEquipment(slot);
                    if (!currentItem || currentItem.typeId !== item.typeId) return;
                }

                const durability = currentItem.getComponent("durability");
                if (!durability) return;

                // Soporte nativo para Unbreaking
                const enchantable = currentItem.getComponent("enchantable");
                const unbreaking = enchantable?.getEnchantment?.("unbreaking")?.level ?? 0;
                if (unbreaking > 0 && Math.random() > (1 / (unbreaking + 1))) {
                    debug(`Unbreaking ${unbreaking} triggered: durability damage avoided on ${currentItem.typeId}.`);
                    return;
                }

                if (durability.damage + 1 >= durability.maxDurability) {
                    debug(`${currentItem.typeId} broke! (${durability.damage + 1} / ${durability.maxDurability})`);
                    player.dimension.playSound("random.break", player.location);
                    equippable.setEquipment(slot, undefined);
                } else {
                    durability.damage += 1;
                    equippable.setEquipment(slot, currentItem);
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
