import { world, system, EquipmentSlot, ItemStack } from "@minecraft/server";

const MAX_LOGICAL_DURABILITY = 1024;
const BROKEN_LOGICAL_DAMAGE = 1023;

const PROP_VARIANT = "ed:elytra_variant";
const PROP_DAMAGE = "ed:elytra_damage";
const PROP_HAS_CUSTOM_NAME = "ed:has_custom_name";
const PROP_PROXY_ID = "ed:elytra_id";

function generateElytraId() {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Visual bridge markers matching RP attachable query.get_name
const VISUAL_COMBINED = "§6";
const VISUAL_SEPARATED = "§7";
const PROP_ORIGINAL_NAMETAG = "ed:elytra_original_nametag";

const PROXY_TRANSLATIONS = {
    "es_mx": {
        nameCombined: "§r§dPechera con Élitros de Enderita",
        nameSeparated: "§r§dÉlitros de Enderita",
        armorProtection: "§9+9 Armadura"
    },
    "es": {
        nameCombined: "§r§dCoraza con Élitros de Enderita",
        nameSeparated: "§r§dÉlitros de Enderita",
        armorProtection: "§9+9 Armadura"
    },
    "default": {
        nameCombined: "§r§dEnderite Elytra Chestplate",
        nameSeparated: "§r§dEnderite Elytra",
        armorProtection: "§9+9 Armor"
    }
};

const ALL_DEFAULT_PROXY_NAMES = new Set([
    "§r§dPechera con Élitros de Enderita",
    "§r§dCoraza con Élitros de Enderita",
    "§r§dEnderite Elytra Chestplate",
    "§r§dÉlitros de Enderita",
    "§r§dEnderite Elytra",
    "Pechera con Élitros de Enderita",
    "Coraza con Élitros de Enderita",
    "Enderite Elytra Chestplate",
    "Élitros de Enderita",
    "Enderite Elytra",
    "Elytra"
]);

function getProxyTranslation(player = null) {
    const locale = player?.clientSystemInfo?.locale?.toLowerCase() ?? "";
    if (locale.startsWith("es_mx")) return PROXY_TRANSLATIONS["es_mx"];
    if (locale.startsWith("es")) return PROXY_TRANSLATIONS["es"];
    return PROXY_TRANSLATIONS["default"];
}

function getElytraProxyDisplayName(isCombined, player = null) {
    const t = getProxyTranslation(player);
    return isCombined ? t.nameCombined : t.nameSeparated;
}

function getElytraProxyProtectionLore(player = null) {
    const t = getProxyTranslation(player);
    return t.armorProtection;
}

function getCombinedArmorLore(player = null) {
    return [
        getElytraProxyProtectionLore(player),
        { translate: "lore.ed:armor_toughness" },
        { translate: "lore.ed:knockback_resistance" }
    ];
}

/**
 * Creates a runtime proxy ItemStack (minecraft:elytra) from a custom Enderite Elytra.
 * Preserves variant, logical damage (0..1023), enchantments, custom name, and custom properties.
 * @param {ItemStack} customItem
 * @param {Player|null} player
 * @returns {ItemStack}
 */
function createElytraProxy(customItem, player = null) {
    const isCombined = customItem.typeId === "elytra:chesplate";
    const variant = isCombined ? "combined" : "separated";
    const proxy = new ItemStack("minecraft:elytra", 1);

    const durComp = customItem.getComponent("durability");
    const currentDamage = durComp ? Math.min(durComp.damage, BROKEN_LOGICAL_DAMAGE - 1) : 0;

    proxy.setDynamicProperty(PROP_VARIANT, variant);
    proxy.setDynamicProperty(PROP_DAMAGE, currentDamage);
    const existingId = customItem.getDynamicProperty(PROP_PROXY_ID);
    proxy.setDynamicProperty(PROP_PROXY_ID, existingId || generateElytraId());

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
        proxy.nameTag = getElytraProxyDisplayName(isCombined, player);
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
        const protText = getElytraProxyProtectionLore(player);
        const rawLore = typeof customItem.getRawLore === "function" ? customItem.getRawLore() : null;
        if (rawLore && rawLore.length > 0) {
            if (isCombined) {
                const cleanedLore = rawLore.filter(l => l?.translate !== "lore.ed:armor_protection" && !(typeof l === "string" && (l.includes("+9") || l.includes("armor_protection"))));
                proxy.setLore([
                    protText,
                    ...cleanedLore
                ]);
            } else {
                proxy.setLore(rawLore);
            }
        } else {
            const lore = customItem.getLore();
            if (lore && lore.length > 0) {
                if (isCombined) {
                    const cleanedLore = lore.filter(l => typeof l === "string" && !l.includes("+9") && !l.includes("armor_protection"));
                    proxy.setLore([
                        protText,
                        ...cleanedLore
                    ]);
                } else {
                    proxy.setLore(lore);
                }
            } else if (isCombined) {
                proxy.setLore(getCombinedArmorLore(player));
            }
        }
    } catch {
        if (isCombined) {
            try {
                proxy.setLore(getCombinedArmorLore(player));
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

    // Restore custom name if original had one, or if player renamed it on anvil while equipped
    const hadCustomName = proxy.getDynamicProperty(PROP_HAS_CUSTOM_NAME);
    if (hadCustomName && proxy.nameTag) {
        customItem.nameTag = proxy.nameTag;
    } else if (proxy.nameTag) {
        const defaultNames = [
            "Coraza con Élitros de Enderita",
            "Pechera con Élitros de Enderita",
            "Enderite Elytra Chestplate",
            "Élitros de Enderita",
            "Enderite Elytra"
        ];
        const isDefault = defaultNames.some(name => proxy.nameTag.includes(name));
        if (!isDefault) {
            customItem.nameTag = proxy.nameTag;
        }
    }

    // Copy additional dynamic properties
    try {
        for (const propId of proxy.getDynamicPropertyIds()) {
            if (!propId.startsWith("ed:elytra_") && propId !== PROP_HAS_CUSTOM_NAME) {
                customItem.setDynamicProperty(propId, proxy.getDynamicProperty(propId));
            }
        }
    } catch {}

    const proxyId = proxy.getDynamicProperty(PROP_PROXY_ID);
    if (proxyId) {
        customItem.setDynamicProperty(PROP_PROXY_ID, proxyId);
    }

    // Restore lore (filter out lore.ed:armor_protection since wearable component provides it natively)
    try {
        const filterProtection = (lines) => lines.filter(l => {
            if (l?.translate === "lore.ed:armor_protection") return false;
            if (typeof l === "string" && (l.includes("+9") || l.includes("armor_protection"))) return false;
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

    const proxyId = brokenItem.getDynamicProperty(PROP_PROXY_ID);
    if (proxyId) {
        unbrokenItem.setDynamicProperty(PROP_PROXY_ID, proxyId);
    }

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
                unbrokenItem.setLore([
                    { translate: "lore.ed:armor_toughness" },
                    { translate: "lore.ed:knockback_resistance" }
                ]);
            }
        }
    } catch {
        if (unbrokenId === "elytra:chesplate") {
            try {
                unbrokenItem.setLore([
                    { translate: "lore.ed:armor_toughness" },
                    { translate: "lore.ed:knockback_resistance" }
                ]);
            } catch {}
        }
    }

    return unbrokenItem;
}

/**
 * Converts a functional custom elytra item into its broken counterpart.
 * Preserves enchantments, custom name, dynamic properties (including PROP_PROXY_ID), and lore.
 * @param {ItemStack} customItem
 * @param {string} brokenId
 * @param {number} damage
 * @returns {ItemStack}
 */
function breakCustomItem(customItem, brokenId = "elytra:chesplate_broken", damage = BROKEN_LOGICAL_DAMAGE) {
    const brokenItem = new ItemStack(brokenId, 1);
    const dur = brokenItem.getComponent("durability");
    if (dur) {
        dur.damage = Math.min(Math.max(0, damage), dur.maxDurability - 1);
    }

    const enchantable = customItem.getComponent("enchantable");
    if (enchantable) {
        const enchants = enchantable.getEnchantments();
        if (enchants && enchants.length > 0) {
            const brokenEnchantable = brokenItem.getComponent("enchantable");
            if (brokenEnchantable) {
                for (const ench of enchants) {
                    try {
                        brokenEnchantable.addEnchantment(ench);
                    } catch {}
                }
            }
        }
    }

    if (customItem.nameTag) {
        brokenItem.nameTag = customItem.nameTag;
    }

    try {
        for (const propId of customItem.getDynamicPropertyIds()) {
            brokenItem.setDynamicProperty(propId, customItem.getDynamicProperty(propId));
        }
    } catch {}

    const proxyId = customItem.getDynamicProperty(PROP_PROXY_ID);
    if (proxyId) {
        brokenItem.setDynamicProperty(PROP_PROXY_ID, proxyId);
    }

    try {
        const rawLore = typeof customItem.getRawLore === "function" ? customItem.getRawLore() : null;
        if (rawLore && rawLore.length > 0) {
            brokenItem.setLore(rawLore);
        } else {
            const lore = customItem.getLore();
            if (lore && lore.length > 0) {
                brokenItem.setLore(lore);
            }
        }
    } catch {}

    return brokenItem;
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
            const proxy = createElytraProxy(chest, player);
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

                // Parity self-heal: ensure proxy has localized §r§d name and armor protection lore
                const isCombined = variant === "combined";
                let updatedProxy = false;
                let proxyId = chest.getDynamicProperty(PROP_PROXY_ID);
                if (!proxyId) {
                    proxyId = generateElytraId();
                    chest.setDynamicProperty(PROP_PROXY_ID, proxyId);
                    updatedProxy = true;
                }
                const expectedName = getElytraProxyDisplayName(isCombined, player);
                const hasCustomName = chest.getDynamicProperty(PROP_HAS_CUSTOM_NAME);
                if (hasCustomName) {
                    // Original had custom name, preserve it
                } else if (!chest.nameTag || chest.nameTag === "Elytra") {
                    chest.nameTag = expectedName;
                    updatedProxy = true;
                } else if (ALL_DEFAULT_PROXY_NAMES.has(chest.nameTag)) {
                    if (chest.nameTag !== expectedName) {
                        chest.nameTag = expectedName;
                        updatedProxy = true;
                    }
                } else {
                    // Player renamed proxy in an anvil! Mark it so it is never overwritten
                    chest.setDynamicProperty(PROP_HAS_CUSTOM_NAME, true);
                    updatedProxy = true;
                }

                if (isCombined) {
                    try {
                        const curLore = chest.getLore() ?? [];
                        const hasProt = curLore.some(l => typeof l === "string" && l.includes("+9"));
                        const hasBuggedKey = curLore.some(l => typeof l === "string" && l.includes("armor_protection"));
                        if (!hasProt || hasBuggedKey) {
                            const rawLore = typeof chest.getRawLore === "function" ? chest.getRawLore() : null;
                            const existing = rawLore ?? curLore;
                            const cleaned = existing.filter(l => l?.translate !== "lore.ed:armor_protection" && !(typeof l === "string" && (l.includes("+9") || l.includes("armor_protection"))));
                            chest.setLore([getElytraProxyProtectionLore(player), ...cleaned]);
                            updatedProxy = true;
                        }
                    } catch {}
                }

                let logicalDamage = chest.getDynamicProperty(PROP_DAMAGE) ?? 0;
                const dur = chest.getComponent("durability");
                if (dur && dur.damage > 0) {
                    logicalDamage += dur.damage;
                    dur.damage = 0; // Reset physical proxy wear back to 0
                    updatedProxy = true;
                }

                // Check breakage independently of whether physical dur.damage was > 0
                if (logicalDamage >= BROKEN_LOGICAL_DAMAGE) {
                    // Broken! Stops gliding, plays break sound, converts to broken custom item
                    try { player.playSound("random.break"); } catch {}
                    const brokenId = variant === "combined" ? "elytra:chesplate_broken" : "elytra:enderite_broken";
                    const brokenItem = restoreCustomElytra(chest, brokenId, BROKEN_LOGICAL_DAMAGE);
                    equippable.setEquipment(EquipmentSlot.Chest, brokenItem);
                    playersWearingProxy.delete(player.id);
                    restoreProxyVisual(player);
                    continue;
                }

                if (updatedProxy) {
                    chest.setDynamicProperty(PROP_DAMAGE, logicalDamage);
                    equippable.setEquipment(EquipmentSlot.Chest, chest);
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

    // Ensure pending combat wear is flushed if items were temporarily in transit
    if (pendingCombatWear.size > 0) {
        scheduleCombatWearFlush();
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

// Queue of pending combat wear: Map<proxyId, { playerId: string, wear: number, attempts: number }>
const pendingCombatWear = new Map();
const MAX_WEAR_RETRIES = 100; // 5 seconds of tick retries before giving up on destroyed/despawned items
let isFlushScheduled = false;

function scheduleCombatWearFlush() {
    if (isFlushScheduled) return;
    isFlushScheduled = true;
    system.run(() => {
        isFlushScheduled = false;
        flushPendingCombatWear();
    });
}

/**
 * Applies combat wear to a matching combined elytra item (either runtime proxy or custom item).
 * Returns the modified or broken ItemStack, or null if invalid.
 * @param {ItemStack} item
 * @param {number} wear
 * @returns {{ updatedItem: ItemStack, didBreak: boolean } | null}
 */
function applyWearToCombinedItem(item, wear) {
    if (!item) return null;

    // Type A: Runtime proxy (minecraft:elytra)
    if (item.typeId === "minecraft:elytra") {
        if (item.getDynamicProperty(PROP_VARIANT) !== "combined") return null;
        let logicalDamage = (item.getDynamicProperty(PROP_DAMAGE) ?? 0) + wear;
        if (logicalDamage >= BROKEN_LOGICAL_DAMAGE) {
            const brokenItem = restoreCustomElytra(item, "elytra:chesplate_broken", BROKEN_LOGICAL_DAMAGE);
            return { updatedItem: brokenItem, didBreak: true };
        } else {
            item.setDynamicProperty(PROP_DAMAGE, logicalDamage);
            return { updatedItem: item, didBreak: false };
        }
    }

    // Type B: Custom item (elytra:chesplate)
    if (item.typeId === "elytra:chesplate") {
        const dur = item.getComponent("durability");
        if (!dur) return null;
        const newDamage = dur.damage + wear;
        if (newDamage >= BROKEN_LOGICAL_DAMAGE) {
            const brokenItem = breakCustomItem(item, "elytra:chesplate_broken", BROKEN_LOGICAL_DAMAGE);
            return { updatedItem: brokenItem, didBreak: true };
        } else {
            dur.damage = newDamage;
            return { updatedItem: item, didBreak: false };
        }
    }

    // Type C: Already broken custom item
    if (item.typeId === "elytra:chesplate_broken") {
        return { updatedItem: item, didBreak: false };
    }

    return null;
}

/**
 * Searches and applies combat wear to the matching proxyId across:
 * 1. Equipped chest slot of original player
 * 2. Inventory container of original player
 * 3. Dropped item entities in the world
 * 4. Block containers (looked at or nearby)
 * 5. Other players in the server (chest or inventory)
 * 6. Container entities (chest boat, minecart, etc.)
 *
 * Returns true if successfully located and applied.
 * @param {string} proxyId
 * @param {number} wear
 * @param {string} playerId
 * @returns {boolean}
 */
function locateAndApplyWear(proxyId, wear, playerId) {
    const originalPlayer = world.getAllPlayers().find(p => p.id === playerId);

    // 1. Check original player's chest slot
    if (originalPlayer?.isValid) {
        const eq = originalPlayer.getComponent("equippable");
        if (eq) {
            const chest = eq.getEquipment(EquipmentSlot.Chest);
            if (chest && chest.getDynamicProperty(PROP_PROXY_ID) === proxyId) {
                const res = applyWearToCombinedItem(chest, wear);
                if (res) {
                    eq.setEquipment(EquipmentSlot.Chest, res.updatedItem);
                    if (res.didBreak) {
                        try { originalPlayer.playSound("random.break"); } catch {}
                        playersWearingProxy.delete(originalPlayer.id);
                        restoreProxyVisual(originalPlayer);
                    }
                    return true;
                }
            }
        }

        // 2. Check original player's inventory
        const inv = originalPlayer.getComponent("inventory");
        if (inv?.container) {
            for (let i = 0; i < inv.container.size; i++) {
                const item = inv.container.getItem(i);
                if (item && item.getDynamicProperty(PROP_PROXY_ID) === proxyId) {
                    const res = applyWearToCombinedItem(item, wear);
                    if (res) {
                        inv.container.setItem(i, res.updatedItem);
                        if (res.didBreak) {
                            try { originalPlayer.playSound("random.break"); } catch {}
                        }
                        return true;
                    }
                }
            }
        }
    }

    // 3. Check dropped item entities in the dimension
    const referencePlayer = originalPlayer?.isValid ? originalPlayer : world.getAllPlayers()[0];
    if (referencePlayer) {
        try {
            const dim = referencePlayer.dimension;
            const itemsNearby = dim.getEntities({
                type: "minecraft:item",
                location: referencePlayer.location,
                maxDistance: 24
            });
            for (const ent of itemsNearby) {
                if (!ent.isValid()) continue;
                const itemComp = ent.getComponent("item");
                const stack = itemComp?.itemStack;
                if (stack && stack.getDynamicProperty(PROP_PROXY_ID) === proxyId) {
                    const res = applyWearToCombinedItem(stack, wear);
                    if (res) {
                        itemComp.itemStack = res.updatedItem;
                        if (res.didBreak) {
                            try { dim.playSound("random.break", ent.location); } catch {}
                        }
                        return true;
                    }
                }
            }
        } catch {}
    }

    // 4. Check block containers (first target block in view, then nearby radius 3)
    if (originalPlayer?.isValid) {
        try {
            const viewBlock = originalPlayer.getBlockFromViewDirection({ maxDistance: 6 })?.block;
            if (viewBlock) {
                const c = viewBlock.getComponent("inventory")?.container;
                if (c) {
                    for (let i = 0; i < c.size; i++) {
                        const item = c.getItem(i);
                        if (item && item.getDynamicProperty(PROP_PROXY_ID) === proxyId) {
                            const res = applyWearToCombinedItem(item, wear);
                            if (res) {
                                c.setItem(i, res.updatedItem);
                                if (res.didBreak) {
                                    try { originalPlayer.dimension.playSound("random.break", viewBlock.location); } catch {}
                                }
                                return true;
                            }
                        }
                    }
                }
            }

            const pLoc = originalPlayer.location;
            const px = Math.floor(pLoc.x);
            const py = Math.floor(pLoc.y);
            const pz = Math.floor(pLoc.z);
            const dim = originalPlayer.dimension;
            for (let x = px - 3; x <= px + 3; x++) {
                for (let y = py - 2; y <= py + 2; y++) {
                    for (let z = pz - 3; z <= pz + 3; z++) {
                        const b = dim.getBlock({ x, y, z });
                        const c = b?.getComponent("inventory")?.container;
                        if (c) {
                            for (let i = 0; i < c.size; i++) {
                                const item = c.getItem(i);
                                if (item && item.getDynamicProperty(PROP_PROXY_ID) === proxyId) {
                                    const res = applyWearToCombinedItem(item, wear);
                                    if (res) {
                                        c.setItem(i, res.updatedItem);
                                        if (res.didBreak) {
                                            try { dim.playSound("random.break", { x, y, z }); } catch {}
                                        }
                                        return true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch {}

        // Check container entities nearby (chest minecart, mule, donkey, chest boat)
        try {
            const nearbyEntities = originalPlayer.dimension.getEntities({
                location: originalPlayer.location,
                maxDistance: 8
            });
            for (const ent of nearbyEntities) {
                if (!ent.isValid() || ent.typeId === "minecraft:player" || ent.typeId === "minecraft:item") continue;
                const c = ent.getComponent("inventory")?.container;
                if (c) {
                    for (let i = 0; i < c.size; i++) {
                        const item = c.getItem(i);
                        if (item && item.getDynamicProperty(PROP_PROXY_ID) === proxyId) {
                            const res = applyWearToCombinedItem(item, wear);
                            if (res) {
                                c.setItem(i, res.updatedItem);
                                return true;
                            }
                        }
                    }
                }
            }
        } catch {}
    }

    // 5. Check all other players (if item was transferred or picked up)
    for (const otherPlayer of world.getAllPlayers()) {
        if (originalPlayer && otherPlayer.id === originalPlayer.id) continue;
        const eq = otherPlayer.getComponent("equippable");
        if (eq) {
            const chest = eq.getEquipment(EquipmentSlot.Chest);
            if (chest && chest.getDynamicProperty(PROP_PROXY_ID) === proxyId) {
                const res = applyWearToCombinedItem(chest, wear);
                if (res) {
                    eq.setEquipment(EquipmentSlot.Chest, res.updatedItem);
                    if (res.didBreak) {
                        try { otherPlayer.playSound("random.break"); } catch {}
                        playersWearingProxy.delete(otherPlayer.id);
                        restoreProxyVisual(otherPlayer);
                    }
                    return true;
                }
            }
        }
        const otherInv = otherPlayer.getComponent("inventory");
        if (otherInv?.container) {
            for (let i = 0; i < otherInv.container.size; i++) {
                const item = otherInv.container.getItem(i);
                if (item && item.getDynamicProperty(PROP_PROXY_ID) === proxyId) {
                    const res = applyWearToCombinedItem(item, wear);
                    if (res) {
                        otherInv.container.setItem(i, res.updatedItem);
                        if (res.didBreak) {
                            try { otherPlayer.playSound("random.break"); } catch {}
                        }
                        return true;
                    }
                }
            }
        }
    }

    return false;
}

function flushPendingCombatWear() {
    if (pendingCombatWear.size === 0) return;

    let hasUnapplied = false;

    for (const [proxyId, entry] of Array.from(pendingCombatWear.entries())) {
        const { playerId, wear } = entry;
        if (!wear || wear <= 0) {
            pendingCombatWear.delete(proxyId);
            continue;
        }

        const applied = locateAndApplyWear(proxyId, wear, playerId);
        if (applied) {
            pendingCombatWear.delete(proxyId);
        } else {
            entry.attempts = (entry.attempts ?? 0) + 1;
            if (entry.attempts >= MAX_WEAR_RETRIES) {
                pendingCombatWear.delete(proxyId);
            } else {
                hasUnapplied = true;
            }
        }
    }

    if (hasUnapplied && pendingCombatWear.size > 0) {
        system.runTimeout(() => scheduleCombatWearFlush(), 1);
    }
}

/**
 * Enqueues combat durability damage to the combined elytra proxy according to Java armor rules:
 * - Triggered strictly on protectable combat damage (excludes causes that bypass armor).
 * - Safe for restricted beforeEvents context (no mutations or setEquipment inside event handler).
 * - Strictly requires confirmed proxy identity (PROP_PROXY_ID); never falls back to player IDs.
 * - Single queue processor (flushPendingCombatWear) retains entries until applied across all movement locations.
 * - Wear = Math.floor(Math.max(1, rawDamage / 4))
 * - Armor Unbreaking chance: 0.6 + 0.4 / (level + 1)
 * - If wear >= 1023: breaks immediately into elytra:chesplate_broken
 * @param {import("@minecraft/server").Player} player
 * @param {number} rawDamage
 */
export function applyCombatDamageToCombinedElytra(player, rawDamage) {
    if (!player?.isValid || typeof rawDamage !== "number" || rawDamage <= 0) return;

    const equippable = player.getComponent("equippable");
    if (!equippable) return;

    const chest = equippable.getEquipment(EquipmentSlot.Chest);
    if (!chest || chest.typeId !== "minecraft:elytra") return;

    const variant = chest.getDynamicProperty(PROP_VARIANT);
    if (variant !== "combined") return;

    // Strictly require confirmed proxy identity; do not admit wear through player fallback
    const proxyId = chest.getDynamicProperty(PROP_PROXY_ID);
    if (!proxyId || typeof proxyId !== "string") return;

    // Java LivingEntity.doHurtEquipment: int durabilityDamage = (int)Math.max(1.0F, damage / 4.0F)
    let armorWear = Math.floor(Math.max(1, rawDamage / 4));

    // Java unbreaking.json for #minecraft:enchantable/armor:
    // Chance to take damage is 60% + 40% / (level + 1)
    const enchantable = chest.getComponent("enchantable");
    if (enchantable) {
        const unbreaking = enchantable.getEnchantment("unbreaking");
        if (unbreaking && unbreaking.level > 0) {
            let actualWear = 0;
            const takeDamageChance = 0.6 + 0.4 / (unbreaking.level + 1);
            for (let i = 0; i < armorWear; i++) {
                if (Math.random() < takeDamageChance) {
                    actualWear++;
                }
            }
            armorWear = actualWear;
        }
    }

    if (armorWear <= 0) return;

    const prev = pendingCombatWear.get(proxyId);
    const prevWear = prev ? prev.wear : 0;
    pendingCombatWear.set(proxyId, { playerId: player.id, wear: prevWear + armorWear, attempts: 0 });

    // Single queue processor scheduled outside restricted beforeEvents context
    scheduleCombatWearFlush();
}
