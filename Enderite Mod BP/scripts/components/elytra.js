import { world, system, EquipmentSlot, ItemStack } from "@minecraft/server";

const MAX_LOGICAL_DURABILITY = 1024;
const BROKEN_LOGICAL_DAMAGE = 1023;

const PROP_VARIANT = "ed:elytra_variant";
const PROP_DAMAGE = "ed:elytra_damage";
const PROP_HAS_CUSTOM_NAME = "ed:has_custom_name";

// Visual bridge markers matching RP attachable query.get_name
const VISUAL_COMBINED = "§6";
const VISUAL_SEPARATED = "§7";
const PROP_ORIGINAL_NAMETAG = "ed:elytra_original_nametag";

// Translatable lore matching .lang translations (lore.ed:armor_protection, lore.ed:armor_toughness, lore.ed:knockback_resistance)
const COMBINED_ARMOR_LORE = [
    { translate: "lore.ed:armor_protection" },
    { translate: "lore.ed:armor_toughness" },
    { translate: "lore.ed:knockback_resistance" }
];

/**
 * Creates a runtime proxy ItemStack (minecraft:elytra) from a custom Enderite Elytra.
 * Preserves variant, logical damage (0..1023), enchantments, custom name, and custom properties.
 * @param {ItemStack} customItem
 * @returns {ItemStack}
 */
function createElytraProxy(customItem) {
    const isCombined = customItem.typeId === "elytra:chesplate";
    const variant = isCombined ? "combined" : "separated";
    const proxy = new ItemStack("minecraft:elytra", 1);

    const durComp = customItem.getComponent("durability");
    const currentDamage = durComp ? Math.min(durComp.damage, BROKEN_LOGICAL_DAMAGE - 1) : 0;

    proxy.setDynamicProperty(PROP_VARIANT, variant);
    proxy.setDynamicProperty(PROP_DAMAGE, currentDamage);

    // Initial physical damage of proxy is 0
    const proxyDur = proxy.getComponent("durability");
    if (proxyDur) {
        proxyDur.damage = 0;
    }

    // Copy enchantments
    const customEnchantable = customItem.getComponent("enchantable");
    if (customEnchantable) {
        const enchants = customEnchantable.getEnchantments();
        if (enchants && enchants.length > 0) {
            const proxyEnchantable = proxy.getComponent("enchantable");
            if (proxyEnchantable) {
                for (const ench of enchants) {
                    try {
                        proxyEnchantable.addEnchantment(ench);
                    } catch {}
                }
            }
        }
    }

    // Copy custom name if renamed on anvil, or set canonical display name for HUD/tooltip
    if (customItem.nameTag) {
        proxy.nameTag = customItem.nameTag;
        proxy.setDynamicProperty(PROP_HAS_CUSTOM_NAME, true);
    } else {
        proxy.nameTag = isCombined ? "Coraza con Élitros de Enderita" : "Élitros de Enderita";
        proxy.setDynamicProperty(PROP_HAS_CUSTOM_NAME, false);
    }

    // Copy additional dynamic properties
    try {
        for (const propId of customItem.getDynamicPropertyIds()) {
            if (!propId.startsWith("ed:elytra_") && propId !== PROP_HAS_CUSTOM_NAME) {
                proxy.setDynamicProperty(propId, customItem.getDynamicProperty(propId));
            }
        }
    } catch {}

    // Copy lore (armor protection, toughness, knockback, void floating, custom lines)
    try {
        const rawLore = typeof customItem.getRawLore === "function" ? customItem.getRawLore() : null;
        if (rawLore && rawLore.length > 0) {
            if (isCombined) {
                const hasProtection = rawLore.some(l => l?.translate === "lore.ed:armor_protection" || (typeof l === "string" && l.includes("+9")));
                if (!hasProtection) {
                    proxy.setLore([
                        { translate: "lore.ed:armor_protection" },
                        ...rawLore
                    ]);
                } else {
                    proxy.setLore(rawLore);
                }
            } else {
                proxy.setLore(rawLore);
            }
        } else {
            const lore = customItem.getLore();
            if (lore && lore.length > 0) {
                if (isCombined) {
                    const hasProtection = lore.some(l => typeof l === "string" && l.includes("+9"));
                    if (!hasProtection) {
                        proxy.setLore([
                            { translate: "lore.ed:armor_protection" },
                            ...lore
                        ]);
                    } else {
                        proxy.setLore(lore);
                    }
                } else {
                    proxy.setLore(lore);
                }
            } else if (isCombined) {
                proxy.setLore(COMBINED_ARMOR_LORE);
            }
        }
    } catch {
        if (isCombined) {
            try {
                proxy.setLore(COMBINED_ARMOR_LORE);
            } catch {}
        }
    }

    return proxy;
}

/**
 * Restores a custom Enderite Elytra ItemStack from a runtime proxy or broken state.
 * @param {ItemStack} proxy
 * @param {string|null} forcedTargetId
 * @param {number|null} forcedDamage
 * @returns {ItemStack|null}
 */
function restoreCustomElytra(proxy, forcedTargetId = null, forcedDamage = null) {
    const variant = proxy.getDynamicProperty(PROP_VARIANT);
    if (!variant && !forcedTargetId) return null;

    let targetId = forcedTargetId;
    let damage = forcedDamage;

    if (targetId === null) {
        let logicalDamage = proxy.getDynamicProperty(PROP_DAMAGE) ?? 0;
        const proxyDur = proxy.getComponent("durability");
        if (proxyDur && proxyDur.damage > 0) {
            logicalDamage += proxyDur.damage;
        }

        if (logicalDamage >= BROKEN_LOGICAL_DAMAGE) {
            damage = BROKEN_LOGICAL_DAMAGE;
            targetId = variant === "combined" ? "elytra:chesplate_broken" : "elytra:enderite_broken";
        } else {
            damage = Math.max(0, logicalDamage);
            targetId = variant === "combined" ? "elytra:chesplate" : "elytra:enderite";
        }
    }

    const customItem = new ItemStack(targetId, 1);

    const customDur = customItem.getComponent("durability");
    if (customDur && typeof damage === "number") {
        customDur.damage = Math.min(Math.max(0, damage), customDur.maxDurability - 1);
    }

    // Copy enchantments
    const proxyEnchantable = proxy.getComponent("enchantable");
    if (proxyEnchantable) {
        const enchants = proxyEnchantable.getEnchantments();
        if (enchants && enchants.length > 0) {
            const customEnchantable = customItem.getComponent("enchantable");
            if (customEnchantable) {
                for (const ench of enchants) {
                    try {
                        customEnchantable.addEnchantment(ench);
                    } catch {}
                }
            }
        }
    }

    // Restore custom name if original had one
    if (proxy.getDynamicProperty(PROP_HAS_CUSTOM_NAME) && proxy.nameTag) {
        customItem.nameTag = proxy.nameTag;
    }

    // Copy additional dynamic properties
    try {
        for (const propId of proxy.getDynamicPropertyIds()) {
            if (!propId.startsWith("ed:elytra_") && propId !== PROP_HAS_CUSTOM_NAME) {
                customItem.setDynamicProperty(propId, proxy.getDynamicProperty(propId));
            }
        }
    } catch {}

    // Restore lore (filter out lore.ed:armor_protection since wearable component provides it natively)
    try {
        const filterProtection = (lines) => lines.filter(l => {
            if (l?.translate === "lore.ed:armor_protection") return false;
            if (typeof l === "string" && (l.includes("+9 Armadura") || l.includes("+9 Armor"))) return false;
            return true;
        });

        const rawLore = typeof proxy.getRawLore === "function" ? proxy.getRawLore() : null;
        if (rawLore && rawLore.length > 0) {
            customItem.setLore(filterProtection(rawLore));
        } else {
            const lore = proxy.getLore();
            if (lore && lore.length > 0) {
                customItem.setLore(filterProtection(lore));
            } else if (targetId === "elytra:chesplate" || targetId === "elytra:chesplate_broken") {
                customItem.setLore([
                    { translate: "lore.ed:armor_toughness" },
                    { translate: "lore.ed:knockback_resistance" }
                ]);
            }
        }
    } catch {
        if (targetId === "elytra:chesplate" || targetId === "elytra:chesplate_broken") {
            try {
                customItem.setLore([
                    { translate: "lore.ed:armor_toughness" },
                    { translate: "lore.ed:knockback_resistance" }
                ]);
            } catch {}
        }
    }

    return customItem;
}

/**
 * Converts a repaired broken elytra back into its functional custom form.
 * @param {ItemStack} brokenItem
 * @returns {ItemStack}
 */
function restoreRepairedBrokenItem(brokenItem) {
    const unbrokenId = brokenItem.typeId.replace("_broken", "");
    const unbrokenItem = new ItemStack(unbrokenId, 1);

    const brokenDur = brokenItem.getComponent("durability");
    const unbrokenDur = unbrokenItem.getComponent("durability");
    if (brokenDur && unbrokenDur) {
        unbrokenDur.damage = brokenDur.damage;
    }

    const brokenEnchantable = brokenItem.getComponent("enchantable");
    if (brokenEnchantable) {
        const enchants = brokenEnchantable.getEnchantments();
        if (enchants && enchants.length > 0) {
            const unbrokenEnchantable = unbrokenItem.getComponent("enchantable");
            if (unbrokenEnchantable) {
                for (const ench of enchants) {
                    try {
                        unbrokenEnchantable.addEnchantment(ench);
                    } catch {}
                }
            }
        }
    }

    if (brokenItem.nameTag) {
        unbrokenItem.nameTag = brokenItem.nameTag;
    }

    try {
        for (const propId of brokenItem.getDynamicPropertyIds()) {
            unbrokenItem.setDynamicProperty(propId, brokenItem.getDynamicProperty(propId));
        }
    } catch {}

    // Copy lore
    try {
        const rawLore = typeof brokenItem.getRawLore === "function" ? brokenItem.getRawLore() : null;
        if (rawLore && rawLore.length > 0) {
            unbrokenItem.setLore(rawLore);
        } else {
            const lore = brokenItem.getLore();
            if (lore && lore.length > 0) {
                unbrokenItem.setLore(lore);
            } else if (unbrokenId === "elytra:chesplate") {
                unbrokenItem.setLore(COMBINED_ARMOR_LORE);
            }
        }
    } catch {
        if (unbrokenId === "elytra:chesplate") {
            try {
                unbrokenItem.setLore(COMBINED_ARMOR_LORE);
            } catch {}
        }
    }

    return unbrokenItem;
}

/**
 * Scans a player's inventory once on unequip transition to convert any stray proxy items.
 * @param {import("@minecraft/server").Player} player
 */
function cleanupInventoryProxies(player) {
    const inv = player.getComponent("inventory");
    if (!inv || !inv.container) return;

    for (let i = 0; i < inv.container.size; i++) {
        const item = inv.container.getItem(i);
        if (item && item.typeId === "minecraft:elytra" && item.getDynamicProperty(PROP_VARIANT)) {
            const restored = restoreCustomElytra(item);
            if (restored) {
                inv.container.setItem(i, restored);
            }
        }
    }
}

/**
 * Synchronizes player nameTag visual bridge to communicate with RP attachable
 * without modifying gameplay identity or dirtying the true player name.
 * @param {import("@minecraft/server").Player} player
 * @param {"combined"|"separated"} variant
 */
function syncProxyVisual(player, variant) {
    if (player.getDynamicProperty(PROP_ORIGINAL_NAMETAG) === undefined) {
        player.setDynamicProperty(PROP_ORIGINAL_NAMETAG, player.nameTag ?? player.name);
    }

    const targetVisual = variant === "combined" ? VISUAL_COMBINED : VISUAL_SEPARATED;
    if (player.nameTag !== targetVisual) {
        player.nameTag = targetVisual;
    }
}

/**
 * Restores original player nameTag when removing or breaking the proxy.
 * @param {import("@minecraft/server").Player} player
 */
function restoreProxyVisual(player) {
    const original = player.getDynamicProperty(PROP_ORIGINAL_NAMETAG);
    if (typeof original === "string") {
        player.nameTag = original;
    }
    player.setDynamicProperty(PROP_ORIGINAL_NAMETAG, undefined);
}

// Track which players were wearing our proxy on previous tick
const playersWearingProxy = new Set();

/**
 * Main lightweight runtime loop: Only inspects EquipmentSlot.Chest of each player every tick.
 * Eliminates 36-slot inventory looping.
 */
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        const equippable = player.getComponent("equippable");
        if (!equippable) continue;

        const chest = equippable.getEquipment(EquipmentSlot.Chest);
        const wasWearingProxy = playersWearingProxy.has(player.id);

        // CASE 1: Player equipped custom unbroken elytra -> Convert to runtime proxy
        if (chest && (chest.typeId === "elytra:enderite" || chest.typeId === "elytra:chesplate")) {
            const proxy = createElytraProxy(chest);
            equippable.setEquipment(EquipmentSlot.Chest, proxy);
            playersWearingProxy.add(player.id);
            syncProxyVisual(player, chest.typeId === "elytra:chesplate" ? "combined" : "separated");
            continue;
        }

        // CASE 2: Player is wearing runtime proxy -> Track flight wear deterministically
        if (chest && chest.typeId === "minecraft:elytra") {
            const variant = chest.getDynamicProperty(PROP_VARIANT);
            if (variant) {
                playersWearingProxy.add(player.id);
                syncProxyVisual(player, variant);

                const dur = chest.getComponent("durability");
                if (dur && dur.damage > 0) {
                    let logicalDamage = (chest.getDynamicProperty(PROP_DAMAGE) ?? 0) + dur.damage;

                    if (logicalDamage >= BROKEN_LOGICAL_DAMAGE) {
                        // Broken! Stops gliding, plays break sound, converts to broken custom item
                        try { player.playSound("random.break"); } catch {}
                        const brokenId = variant === "combined" ? "elytra:chesplate_broken" : "elytra:enderite_broken";
                        const brokenItem = restoreCustomElytra(chest, brokenId, BROKEN_LOGICAL_DAMAGE);
                        equippable.setEquipment(EquipmentSlot.Chest, brokenItem);
                        playersWearingProxy.delete(player.id);
                        restoreProxyVisual(player);
                    } else {
                        // Safe wear: 1 vanilla point consumed = 1 logical point out of 1024
                        chest.setDynamicProperty(PROP_DAMAGE, logicalDamage);
                        dur.damage = 0; // Reset physical proxy wear back to 0
                        equippable.setEquipment(EquipmentSlot.Chest, chest);
                    }
                }
                continue;
            }
        }

        // CASE 3: Not wearing proxy this tick
        if (wasWearingProxy) {
            playersWearingProxy.delete(player.id);
            restoreProxyVisual(player);
            // One-time safety cleanup of inventory slots during unequip transition
            cleanupInventoryProxies(player);
        }
    }
}, 1);

// Reactive inventory handling: Converts proxy back to custom item when placed into inventory slots,
// and converts repaired broken elytras back to functional ones.
world.afterEvents.playerInventoryItemChange.subscribe((event) => {
    const player = event.player;
    const item = event.itemStack;
    if (!player || !item) return;

    // Subcase A: Runtime proxy moved to inventory slot
    if (item.typeId === "minecraft:elytra" && item.getDynamicProperty(PROP_VARIANT)) {
        const inv = player.getComponent("inventory");
        if (inv && inv.container) {
            const restored = restoreCustomElytra(item);
            if (restored) {
                inv.container.setItem(event.slot, restored);
            }
        }
        return;
    }

    // Subcase B: Broken elytra repaired in an anvil or crafting grid
    if (item.typeId.endsWith("_broken") && item.typeId.startsWith("elytra:")) {
        const dur = item.getComponent("durability");
        if (dur && dur.damage < BROKEN_LOGICAL_DAMAGE) {
            const unbroken = restoreRepairedBrokenItem(item);
            const inv = player.getComponent("inventory");
            if (inv && inv.container) {
                inv.container.setItem(event.slot, unbroken);
            }
        }
    }
});

// Reactive drop handling: If an item entity spawns in the world with a proxy, convert to custom item
world.afterEvents.entitySpawn.subscribe((event) => {
    const entity = event.entity;
    if (!entity || entity.typeId !== "minecraft:item") return;

    system.run(() => {
        try {
            if (!entity.isValid()) return;
            const itemComp = entity.getComponent("item");
            if (!itemComp) return;

            const stack = itemComp.itemStack;
            if (stack && stack.typeId === "minecraft:elytra" && stack.getDynamicProperty(PROP_VARIANT)) {
                const restored = restoreCustomElytra(stack);
                if (restored) {
                    const dim = entity.dimension;
                    const loc = entity.location;
                    const vel = entity.getVelocity();
                    entity.remove();
                    const spawned = dim.spawnItem(restored, loc);
                    if (vel) {
                        try { spawned.applyImpulse(vel); } catch {}
                    }
                }
            }
        } catch {}
    });
});

// Clean up disconnected players
world.afterEvents.playerLeave.subscribe((event) => {
    playersWearingProxy.delete(event.playerId);
});

// Safeguard on spawn: ensure player nameTag is restored if not wearing proxy
world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;
    if (!player) return;
    const equippable = player.getComponent("equippable");
    const chest = equippable?.getEquipment(EquipmentSlot.Chest);
    const hasProxy = chest?.typeId === "minecraft:elytra" && chest.getDynamicProperty(PROP_VARIANT);
    if (!hasProxy) {
        restoreProxyVisual(player);
    }
});
