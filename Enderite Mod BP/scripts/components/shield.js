import { world, system, EquipmentSlot, ItemStack, EntityEquippableComponent } from '@minecraft/server';
import {
    SHIELD_CAPACITIES,
    getTeleportCapacity,
    getTeleportCharge,
    setTeleportCharge,
    updateTeleportLore,
    teleportShieldAttacker,
    isEntityValid
} from '../core/teleport.js';

const CUSTOM_SHIELDS = Object.keys(SHIELD_CAPACITIES);

const shieldNames = {
    'enderite:shield': "Enderite Shield",
    'enderite:shield_tp': "Enderite Shield",
    'enderite:shield_tp_lv2': "Enderite Shield",
    'enderite:shield_tp_lv3': "Enderite Shield",
    'enderite:shield_tp_lv4': "Enderite Shield"
};

/**
 * Correlación determinista de atacante real:
 * Registra la entidad que atacó o disparó al jugador recientemente.
 * playerId -> { attacker, tick }
 */
const recentShieldAttacks = new Map();

// Capturar ataques directos cuerpo a cuerpo
world.afterEvents.entityHurt.subscribe(event => {
    try {
        const { hurtEntity, damageSource } = event;
        if (!hurtEntity || hurtEntity.typeId !== "minecraft:player") return;

        const attacker = damageSource?.damagingEntity;
        if (attacker && isEntityValid(attacker) && attacker.id !== hurtEntity.id) {
            recentShieldAttacks.set(hurtEntity.id, {
                attacker,
                tick: system.currentTick
            });
        }
    } catch (e) {}
});

// Capturar impactos de proyectiles (flechas, bolas de fuego, etc.)
world.afterEvents.projectileHitEntity.subscribe(event => {
    try {
        const hitEntity = event.getEntityHit()?.entity;
        if (!hitEntity || hitEntity.typeId !== "minecraft:player") return;

        const projectile = event.projectile;
        const source = event.source;
        let attacker = source;

        if (!attacker && projectile && isEntityValid(projectile)) {
            try {
                attacker = projectile.getComponent("projectile")?.owner;
            } catch (e) {}
        }

        if (attacker && isEntityValid(attacker) && attacker.id !== hitEntity.id) {
            recentShieldAttacks.set(hitEntity.id, {
                attacker,
                tick: system.currentTick
            });
        }
    } catch (e) {}
});

let tickCount = 0;
system.runInterval(() => {
    tickCount++;
    const players = world.getAllPlayers();

    for (const player of players) {
        if (!isEntityValid(player)) continue;

        const equippable = player.getComponent(EntityEquippableComponent.componentId);
        if (!equippable) continue;

        const offhandItem = equippable.getEquipment(EquipmentSlot.Offhand);
        const mainhandItem = equippable.getEquipment(EquipmentSlot.Mainhand);
        const inventory = player.getComponent("inventory");

        let shieldSlot;

        const hasEnderiteShield =
            CUSTOM_SHIELDS.includes(mainhandItem?.typeId) ||
            CUSTOM_SHIELDS.includes(offhandItem?.typeId) ||
            CUSTOM_SHIELDS.includes(mainhandItem?.getDynamicProperty("shield:variant")) ||
            CUSTOM_SHIELDS.includes(offhandItem?.getDynamicProperty("shield:variant"));

        if (hasEnderiteShield) {
            player.addTag('multimc:enderite_shield');
        } else {
            player.removeTag("multimc:enderite_shield");
        }

        const offhandVariant = offhandItem?.getDynamicProperty("shield:variant") || offhandItem?.typeId;
        const mainhandVariant = mainhandItem?.getDynamicProperty("shield:variant") || mainhandItem?.typeId;

        if (CUSTOM_SHIELDS.includes(offhandVariant)) {
            shieldSlot = EquipmentSlot.Offhand;
        } else if (CUSTOM_SHIELDS.includes(mainhandVariant)) {
            shieldSlot = EquipmentSlot.Mainhand;
        }

        // Detección de bloqueo confirmado por consumo real de durabilidad
        if (shieldSlot !== undefined) {
            const currentItem = equippable.getEquipment(shieldSlot);
            const initialDamage = currentItem?.getComponent("durability")?.damage;

            system.runTimeout(() => {
                try {
                    const newItem = equippable?.getEquipment(shieldSlot);
                    const currentDamage = newItem?.getComponent("durability")?.damage;

                    if (typeof currentDamage === 'number' && typeof initialDamage === 'number' &&
                        currentDamage > initialDamage && player?.isSneaking) {
                        
                        // Bloqueo confirmado: obtener el atacante correlacionado
                        const recent = recentShieldAttacks.get(player.id);
                        if (recent && (system.currentTick - recent.tick <= 6) && isEntityValid(recent.attacker)) {
                            teleportShieldAttacker(player, recent.attacker, newItem, shieldSlot);
                            recentShieldAttacks.delete(player.id);
                        }
                    }
                } catch (e) {}
            }, 1);
        }

        // Restauración de items en inventario cada 10 ticks (2 veces por segundo)
        if (tickCount % 10 === 0 && inventory?.container) {
            for (let i = 0; i < inventory.container.size; i++) {
                const item = inventory.container.getItem(i);
                if (!item) continue;

                let variant;
                try {
                    variant = item.getDynamicProperty("shield:variant");
                } catch (e) {}

                if (variant && CUSTOM_SHIELDS.includes(variant)) {
                    // Si está en uso en manos mientras el jugador está agachado, dejarlo como proxy
                    const isHeld = (mainhandItem && item.getDynamicProperty("unique:id") === mainhandItem.getDynamicProperty("unique:id")) ||
                                   (offhandItem && item.getDynamicProperty("unique:id") === offhandItem.getDynamicProperty("unique:id"));
                    if (player.isSneaking && isHeld) continue;

                    const newItem = new ItemStack(variant);
                    const itemDamage = item?.getComponent("durability")?.damage ?? 0;
                    const maxDur = newItem.getComponent("durability")?.maxDurability ?? 768;

                    if (maxDur < itemDamage) {
                        inventory.container.setItem(i, new ItemStack("minecraft:air"));
                        try { player.playSound("random.break", player.location); } catch (e) {}
                        continue;
                    }

                    const newDurability = newItem.getComponent("durability");
                    if (newDurability) newDurability.damage = itemDamage;

                    const enchantments = item.getComponent("enchantable")?.getEnchantments();
                    if (enchantments) newItem.getComponent("enchantable")?.addEnchantments(enchantments);

                    // Preservar carga y lore
                    const charge = getTeleportCharge(item);
                    setTeleportCharge(newItem, charge);
                    updateTeleportLore(newItem, charge, SHIELD_CAPACITIES[variant] ?? 0);

                    inventory.container.setItem(i, newItem);
                }
            }
        }

        // Swapping Offhand a proxy minecraft:shield al agacharse
        if (CUSTOM_SHIELDS.includes(offhandItem?.typeId) && player.isSneaking) {
            player.nameTag = "§f§3";
            try { player.setDynamicProperty("score:score_op", 11); } catch (e) {}

            const newShield = new ItemStack('minecraft:shield');
            const origVariant = offhandItem.typeId;
            newShield.setDynamicProperty("shield:variant", origVariant);
            newShield.nameTag = shieldNames[origVariant] || "§r§dEnderite Shield";

            const offhandDamage = offhandItem?.getComponent("durability")?.damage ?? 0;
            const newShieldDurability = newShield.getComponent("durability");
            if (newShieldDurability) newShieldDurability.damage = offhandDamage;

            const enchantments = offhandItem?.getComponent("enchantable")?.getEnchantments();
            if (enchantments) newShield.getComponent("enchantable")?.addEnchantments(enchantments);

            // Transferir carga y lore dinámico
            const capacity = SHIELD_CAPACITIES[origVariant] ?? 0;
            const charge = getTeleportCharge(offhandItem);
            setTeleportCharge(newShield, charge);
            updateTeleportLore(newShield, charge, capacity);

            equippable.setEquipment(EquipmentSlot.Offhand, newShield);
        }

        // Restauración Offhand a enderite:shield al soltar agacharse
        if (offhandItem?.typeId === 'minecraft:shield' && !player.isSneaking && CUSTOM_SHIELDS.includes(offhandVariant)) {
            const newShield = new ItemStack(offhandVariant);
            const offhandDamage = offhandItem?.getComponent("durability")?.damage ?? 0;
            const maxDur = newShield.getComponent("durability")?.maxDurability ?? 768;

            if (maxDur < offhandDamage) {
                equippable.setEquipment(EquipmentSlot.Offhand, new ItemStack('minecraft:air'));
                try { player.playSound('random.break', player.location); } catch (e) {}
            } else {
                const newShieldDurability = newShield.getComponent("durability");
                if (newShieldDurability) newShieldDurability.damage = offhandDamage;

                const enchantments = offhandItem?.getComponent("enchantable")?.getEnchantments();
                if (enchantments) newShield.getComponent("enchantable")?.addEnchantments(enchantments);

                // Transferir carga y lore dinámico
                const capacity = SHIELD_CAPACITIES[offhandVariant] ?? 0;
                const charge = getTeleportCharge(offhandItem);
                setTeleportCharge(newShield, charge);
                updateTeleportLore(newShield, charge, capacity);

                equippable.setEquipment(EquipmentSlot.Offhand, newShield);
            }
        }

        // Swapping Mainhand a proxy minecraft:shield al agacharse (si no hay escudo en offhand)
        if (CUSTOM_SHIELDS.includes(mainhandItem?.typeId) && player.isSneaking && !offhandItem?.typeId?.includes("shield")) {
            player.nameTag = "§f§3";
            try { player.setDynamicProperty("score:score_op", 11); } catch (e) {}

            const newShield = new ItemStack('minecraft:shield');
            const origVariant = mainhandItem.typeId;
            newShield.setDynamicProperty("shield:variant", origVariant);
            newShield.nameTag = shieldNames[origVariant] || "§r§dEnderite Shield";

            const mainhandDamage = mainhandItem?.getComponent("durability")?.damage ?? 0;
            const newShieldDurability = newShield.getComponent("durability");
            if (newShieldDurability) newShieldDurability.damage = mainhandDamage;

            const enchantments = mainhandItem?.getComponent("enchantable")?.getEnchantments();
            if (enchantments) newShield.getComponent("enchantable")?.addEnchantments(enchantments);

            // Transferir carga y lore dinámico
            const capacity = SHIELD_CAPACITIES[origVariant] ?? 0;
            const charge = getTeleportCharge(mainhandItem);
            setTeleportCharge(newShield, charge);
            updateTeleportLore(newShield, charge, capacity);

            equippable.setEquipment(EquipmentSlot.Mainhand, newShield);
        }

        // Restauración Mainhand a enderite:shield al soltar agacharse
        if (mainhandItem?.typeId === 'minecraft:shield' && !player.isSneaking && CUSTOM_SHIELDS.includes(mainhandVariant)) {
            const newShield = new ItemStack(mainhandVariant);
            const mainhandDamage = mainhandItem?.getComponent("durability")?.damage ?? 0;
            const maxDur = newShield.getComponent("durability")?.maxDurability ?? 768;

            if (maxDur < mainhandDamage) {
                equippable.setEquipment(EquipmentSlot.Mainhand, new ItemStack('minecraft:air'));
                try { player.playSound('random.break', player.location); } catch (e) {}
            } else {
                const newShieldDurability = newShield.getComponent("durability");
                if (newShieldDurability) newShieldDurability.damage = mainhandDamage;

                const enchantments = mainhandItem?.getComponent("enchantable")?.getEnchantments();
                if (enchantments) newShield.getComponent("enchantable")?.addEnchantments(enchantments);

                // Transferir carga y lore dinámico
                const capacity = SHIELD_CAPACITIES[mainhandVariant] ?? 0;
                const charge = getTeleportCharge(mainhandItem);
                setTeleportCharge(newShield, charge);
                updateTeleportLore(newShield, charge, capacity);

                equippable.setEquipment(EquipmentSlot.Mainhand, newShield);
            }
        }
    }
});
