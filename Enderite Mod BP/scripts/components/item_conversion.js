import { world, system, ItemStack, EquipmentSlot } from "@minecraft/server";

/**
 * Registry of Vanilla items and their corresponding clone items used as bases in smithing recipes.
 * Bedrock smithing recipes require custom items as base, necessitating these exact 9 clones.
 */
export const VANILLA_TO_CLONE = new Map([
    ["minecraft:bow", "ed:bow"],
    ["minecraft:crossbow", "ed:crossbow"],
    ["minecraft:elytra", "ed:elytra"],
    ["minecraft:netherite_axe", "ed:netherite_axe"],
    ["minecraft:netherite_hoe", "ed:netherite_hoe"],
    ["minecraft:netherite_pickaxe", "ed:netherite_pickaxe"],
    ["minecraft:netherite_shovel", "ed:netherite_shovel"],
    ["minecraft:netherite_sword", "ed:netherite_sword"],
    ["minecraft:shears", "ed:shears"]
]);

/**
 * Reverse mapping from clone items back to vanilla items.
 */
export const CLONE_TO_VANILLA = new Map();
for (const [vanilla, clone] of VANILLA_TO_CLONE.entries()) {
    CLONE_TO_VANILLA.set(clone, vanilla);
}

/**
 * Resolves conversion target between vanilla and clone items.
 * EXCLUSION: Active flight proxies (minecraft:elytra with ed:elytra_variant)
 * belong to the flight system and are NEVER treated as vanilla elytra.
 * @param {ItemStack} itemStack
 * @returns {string | null} Target typeId or null if not convertible
 */
export function getConversionTarget(itemStack) {
    if (!itemStack) return null;

    // Critical Proxy Exclusion:
    // Any minecraft:elytra with ed:elytra_variant belongs to the flight proxy system,
    // NOT vanilla elytra. It must never be converted into ed:elytra.
    if (itemStack.typeId === "minecraft:elytra") {
        try {
            if (itemStack.getDynamicProperty("ed:elytra_variant")) {
                return null;
            }
        } catch {}
    }

    if (VANILLA_TO_CLONE.has(itemStack.typeId)) {
        return VANILLA_TO_CLONE.get(itemStack.typeId);
    }
    if (CLONE_TO_VANILLA.has(itemStack.typeId)) {
        return CLONE_TO_VANILLA.get(itemStack.typeId);
    }
    return null;
}

/**
 * Constructs a converted ItemStack copying damage, all enchantments & levels,
 * custom name, custom lore, dynamic properties, lockMode, and keepOnDeath.
 * Does not modify any inventory.
 * @param {ItemStack} sourceStack
 * @param {string} targetTypeId
 * @returns {ItemStack}
 */
export function buildConvertedItem(sourceStack, targetTypeId) {
    if (!sourceStack || !targetTypeId) return null;

    const amount = sourceStack.amount || 1;
    const targetStack = new ItemStack(targetTypeId, amount);

    // 1. Damage / Durability: copy exact damage without free repair
    const srcDur = sourceStack.getComponent("durability");
    const tgtDur = targetStack.getComponent("durability");
    if (srcDur && tgtDur) {
        tgtDur.damage = Math.min(Math.max(0, srcDur.damage), tgtDur.maxDurability - 1);
    }

    // 2. Enchantments: copy all types and exact levels
    const srcEnchComp = sourceStack.getComponent("enchantable");
    const tgtEnchComp = targetStack.getComponent("enchantable");
    if (srcEnchComp && tgtEnchComp) {
        const enchants = srcEnchComp.getEnchantments();
        if (enchants && enchants.length > 0) {
            for (const ench of enchants) {
                tgtEnchComp.addEnchantment(ench);
            }
        }
    }

    // 3. Custom NameTag
    if (sourceStack.nameTag) {
        targetStack.nameTag = sourceStack.nameTag;
    }

    // 4. Custom Lore
    try {
        const rawLore = typeof sourceStack.getRawLore === "function" ? sourceStack.getRawLore() : null;
        if (rawLore && rawLore.length > 0) {
            targetStack.setLore(rawLore);
        } else {
            const lore = sourceStack.getLore();
            if (lore && lore.length > 0) {
                targetStack.setLore(lore);
            }
        }
    } catch {}

    // 5. Dynamic Properties: preserve non-proxy properties
    try {
        const propIds = sourceStack.getDynamicPropertyIds();
        for (const propId of propIds) {
            // Exclude proxy internal flight properties
            if (!propId.startsWith("ed:elytra_") && propId !== "ed:has_custom_name") {
                targetStack.setDynamicProperty(propId, sourceStack.getDynamicProperty(propId));
            }
        }
    } catch {}

    // 6. LockMode and KeepOnDeath
    try {
        if (sourceStack.lockMode !== undefined) {
            targetStack.lockMode = sourceStack.lockMode;
        }
        if (sourceStack.keepOnDeath !== undefined) {
            targetStack.keepOnDeath = sourceStack.keepOnDeath;
        }
    } catch {}

    return targetStack;
}

/**
 * Validates that the converted item contains 100% of the original item's state.
 * If any enchantment failed to transfer, damage was altered, or name was dropped,
 * returns { valid: false, reason: string }.
 * @param {ItemStack} sourceStack
 * @param {ItemStack} targetStack
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateConvertedItem(sourceStack, targetStack) {
    if (!sourceStack || !targetStack) {
        return { valid: false, reason: "Objeto nulo o inválido" };
    }

    // 1. Damage check
    const srcDur = sourceStack.getComponent("durability");
    const tgtDur = targetStack.getComponent("durability");
    const srcDamage = srcDur ? srcDur.damage : 0;
    const tgtDamage = tgtDur ? tgtDur.damage : 0;
    if (srcDamage !== tgtDamage) {
        return {
            valid: false,
            reason: `Discrepancia en desgaste (origen: ${srcDamage}, destino: ${tgtDamage})`
        };
    }

    // 2. Custom name check
    if (sourceStack.nameTag && targetStack.nameTag !== sourceStack.nameTag) {
        return {
            valid: false,
            reason: `Discrepancia en nombre personalizado`
        };
    }

    // 3. Enchantments check
    const srcEnchComp = sourceStack.getComponent("enchantable");
    const tgtEnchComp = targetStack.getComponent("enchantable");
    const srcList = srcEnchComp ? srcEnchComp.getEnchantments() : [];
    const tgtList = tgtEnchComp ? tgtEnchComp.getEnchantments() : [];

    if (srcList.length !== tgtList.length) {
        return {
            valid: false,
            reason: `Discrepancia en cantidad de encantamientos (origen: ${srcList.length}, destino: ${tgtList.length})`
        };
    }

    for (const srcEnch of srcList) {
        const srcId = typeof srcEnch.type === "string" ? srcEnch.type : (srcEnch.type?.id || String(srcEnch.type));
        const matchedTgt = tgtList.find(tgtEnch => {
            const tgtId = typeof tgtEnch.type === "string" ? tgtEnch.type : (tgtEnch.type?.id || String(tgtEnch.type));
            return tgtId === srcId;
        });

        if (!matchedTgt) {
            return {
                valid: false,
                reason: `El encantamiento '${srcId}' no pudo transferirse al destino`
            };
        }

        if (matchedTgt.level !== srcEnch.level) {
            return {
                valid: false,
                reason: `Nivel de '${srcId}' no coincide (origen: ${srcEnch.level}, destino: ${matchedTgt.level})`
            };
        }
    }

    return { valid: true };
}

/**
 * Revalidates the held slot and safely replaces the item in-place with its converted counterpart.
 * Works even with a full inventory since it replaces in the exact same slot.
 * If validation fails, aborts immediately leaving the original item untouched.
 * @param {import("@minecraft/server").Player} player
 * @param {number} [expectedSlot]
 * @param {string} [expectedTypeId]
 * @returns {boolean} Whether conversion succeeded
 */
export function convertHeldItem(player, expectedSlot, expectedTypeId) {
    if (!player?.isValid) return false;

    const inv = player.getComponent("inventory");
    const container = inv?.container;
    if (!container) return false;

    const equippable = player.getComponent("equippable");
    const slot = typeof expectedSlot === "number" ? expectedSlot : player.selectedSlotIndex;

    let currentItem = container.getItem(slot);
    let fromChest = false;

    // 1. Check if the item is still in hand
    if (!currentItem || (expectedTypeId && currentItem.typeId !== expectedTypeId)) {
        // 2. If not in hand, check if it was auto-equipped to the chest slot (common for Elytra on right-click)
        const chestItem = equippable?.getEquipment(EquipmentSlot.Chest);
        if (chestItem && (!expectedTypeId || chestItem.typeId === expectedTypeId) && getConversionTarget(chestItem)) {
            currentItem = chestItem;
            fromChest = true;
        } else {
            return false;
        }
    }

    const targetTypeId = getConversionTarget(currentItem);
    if (!targetTypeId) return false;

    let targetItem;
    try {
        targetItem = buildConvertedItem(currentItem, targetTypeId);
    } catch (err) {
        player.onScreenDisplay?.setActionBar?.(`§c[Enderite] Error: ${err?.message || err}`);
        try { player.playSound("note.bass", { pitch: 0.7 }); } catch {}
        return false;
    }

    const validation = validateConvertedItem(currentItem, targetItem);
    if (!validation.valid) {
        player.onScreenDisplay?.setActionBar?.(`§c[Enderite] Incompatible: ${validation.reason}`);
        try { player.playSound("note.bass", { pitch: 0.7 }); } catch {}
        return false;
    }

    if (fromChest) {
        // The item was auto-equipped to chest by Bedrock's right-click equip logic.
        // What was in container.getItem(slot) is what was previously on the chest (or empty).
        const prevChestPiece = container.getItem(slot);

        // Put the previous chest piece back on the chest (or clear it if empty)
        equippable.setEquipment(EquipmentSlot.Chest, prevChestPiece || undefined);

        // Put the converted item into the player's selected hotbar slot
        container.setItem(slot, targetItem);
        try {
            equippable.setEquipment(EquipmentSlot.Mainhand, targetItem);
        } catch {}
    } else {
        // Normal in-place hotbar slot replacement
        container.setItem(slot, targetItem);
    }

    const isClone = VANILLA_TO_CLONE.has(currentItem.typeId);
    if (isClone) {
        player.onScreenDisplay?.setActionBar?.("§aObjeto preparado para herrería");
    } else {
        player.onScreenDisplay?.setActionBar?.("§aObjeto restaurado a vanilla");
    }

    try {
        player.playSound("block.smithing_table.use", { pitch: isClone ? 1.2 : 0.9, volume: 0.8 });
    } catch {}

    return true;
}

// Map to debounce interaction per player
const lastConversionTime = new Map();
const CONVERSION_COOLDOWN_MS = 400;

function handleSmithingConversion(player, block, itemStack, event) {
    if (!block || block.typeId !== "minecraft:smithing_table") return false;
    if (!player || !player.isSneaking) return false;
    if (!itemStack) return false;

    const targetTypeId = getConversionTarget(itemStack);
    if (!targetTypeId) return false;

    // Cancel event to prevent opening smithing table UI or equipping equippable items
    if (event) {
        event.cancel = true;
    }

    const now = Date.now();
    const last = lastConversionTime.get(player.id) || 0;
    if (now - last < CONVERSION_COOLDOWN_MS) {
        return true;
    }
    lastConversionTime.set(player.id, now);

    const slot = player.selectedSlotIndex;
    const currentTypeId = itemStack.typeId;

    system.run(() => {
        convertHeldItem(player, slot, currentTypeId);
    });

    return true;
}

// 1. Block interaction before event (cancels opening smithing table UI)
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    try {
        handleSmithingConversion(event.player, event.block, event.itemStack, event);
    } catch (e) {
        console.error(`[Enderite] Error handling smithing table interact: ${e}`);
    }
});

// 2. Item use before event (cancels right-click equip while targeting smithing table)
if (world.beforeEvents?.itemUse?.subscribe) {
    world.beforeEvents.itemUse.subscribe((event) => {
        try {
            const player = event.source;
            if (!player || !player.isSneaking) return;
            const itemStack = event.itemStack;
            if (!itemStack) return;

            const target = getConversionTarget(itemStack);
            if (!target) return;

            const block = player.getBlockFromViewDirection({ maxDistance: 5 })?.block;
            if (block?.typeId === "minecraft:smithing_table") {
                handleSmithingConversion(player, block, itemStack, event);
            }
        } catch (e) {
            console.error(`[Enderite] Error handling smithing table itemUse: ${e}`);
        }
    });
}

world.afterEvents.playerLeave.subscribe((event) => {
    lastConversionTime.delete(event.playerId);
});
