import { system, world, EntityEquippableComponent, EquipmentSlot } from "@minecraft/server";

const BOW_TYPES = new Set(["ed:enderite_bow", "ed:enderite_cross_bow"]);

// Activar la animación de tensado de arco al comenzar a usarlo
world.afterEvents.itemUse.subscribe((event) => {
    try {
        const player = event.source;
        const item = event.itemStack;
        if (!item || !player) return;

        if (item.typeId === "ed:enderite_bow") {
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
    } catch (e) {}
});

// Consumo de durabilidad al disparar (itemStopUse), preservando encantamientos, lore y nombres
world.afterEvents.itemStopUse.subscribe((event) => {
    try {
        const player = event.source;
        const item = event.itemStack;
        const useDuration = event.useDuration ?? 0;

        if (!item || !player || !BOW_TYPES.has(item.typeId)) return;

        // Si fue una cancelación inmediata (sin tensado efectivo), no descontar durabilidad
        if (item.typeId === "ed:enderite_bow" && useDuration < 6) {
            return;
        }

        // Modo creativo no consume durabilidad
        let isCreative = false;
        try {
            const gm = player.getGameMode();
            isCreative = String(gm).toLowerCase() === "creative";
        } catch (e) {}
        if (isCreative) return;

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
                    return;
                }

                if (durability.damage + 1 >= durability.maxDurability) {
                    player.dimension.playSound("random.break", player.location);
                    equippable.setEquipment(slot, undefined);
                } else {
                    durability.damage += 1;
                    equippable.setEquipment(slot, currentItem);
                }
            } catch (e) {}
        });
    } catch (e) {}
});
