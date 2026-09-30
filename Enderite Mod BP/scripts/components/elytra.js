import { world, system, EquipmentSlot, ItemStack, GameMode, EntityDamageCause } from "@minecraft/server";

const MAX_LOGICAL_DURABILITY = 1024;
const BROKEN_LOGICAL_DAMAGE = 1023;

const PROP_VARIANT = "ed:elytra_variant";
const PROP_DAMAGE = "ed:elytra_damage";
const PROP_HAS_CUSTOM_NAME = "ed:has_custom_name";
const PROP_PROXY_ID = "ed:elytra_id";
const PROP_STORED_ENCHANTS = "ed:elytra_stored_enchants";

function generateElytraId() {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Visual bridge markers matching RP attachable query.get_name
const VISUAL_COMBINED = "§6";
const VISUAL_SEPARATED = "§7";
const PROP_ORIGINAL_NAMETAG = "ed:elytra_original_nametag";

// Track gliding ticks per player for deterministic flight wear (20 ticks = 1s = 1 flight roll)
const glidingTicks = new Map();
// Track totalExperience per player for Mending repair of ed:elytra_damage
const playerXp = new Map();

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

    // Copy and persist enchantments
    const fullEnchants = [];
    const customEnchantable = customItem.getComponent("enchantable");
    if (customEnchantable) {
        const enchants = customEnchantable.getEnchantments();
        if (enchants && enchants.length > 0) {
            const proxyEnchantable = proxy.getComponent("enchantable");
            for (const ench of enchants) {
                const id = typeof ench.type === "string" ? ench.type : (ench.type?.id || String(ench.type));
                fullEnchants.push({ id, level: ench.level });
                if (proxyEnchantable) {
                    try {
                        proxyEnchantable.addEnchantment(ench);
                    } catch {}
                }
            }
        }
    }

    // Also check if customItem had stored enchantments from prior crafting or conversions
    const prevStoredJson = customItem.getDynamicProperty(PROP_STORED_ENCHANTS);
    if (prevStoredJson && typeof prevStoredJson === "string") {
        try {
            const parsed = JSON.parse(prevStoredJson);
            if (Array.isArray(parsed)) {
                for (const p of parsed) {
                    if (p && p.id && typeof p.level === "number") {
                        if (!fullEnchants.some(e => e.id.toLowerCase() === p.id.toLowerCase())) {
                            fullEnchants.push({ id: p.id, level: p.level });
                        }
                    }
                }
            }
        } catch {}
    }

    if (fullEnchants.length > 0) {
        proxy.setDynamicProperty(PROP_STORED_ENCHANTS, JSON.stringify(fullEnchants));
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

    // Copy and restore enchantments
    const mergedEnchantsMap = new Map();

    const storedEnchantsJson = proxy.getDynamicProperty(PROP_STORED_ENCHANTS);
    if (storedEnchantsJson && typeof storedEnchantsJson === "string") {
        try {
            const parsed = JSON.parse(storedEnchantsJson);
            if (Array.isArray(parsed)) {
                for (const item of parsed) {
                    if (item && item.id && typeof item.level === "number") {
                        const id = item.id.toLowerCase().replace(/^minecraft:/, "");
                        mergedEnchantsMap.set(id, item.level);
                    }
                }
            }
        } catch {}
    }

    const proxyEnchantable = proxy.getComponent("enchantable");
    if (proxyEnchantable) {
        const enchants = proxyEnchantable.getEnchantments();
        if (enchants && enchants.length > 0) {
            for (const ench of enchants) {
                const id = (typeof ench.type === "string" ? ench.type : (ench.type?.id || String(ench.type)))
                    .toLowerCase().replace(/^minecraft:/, "");
                const curLvl = mergedEnchantsMap.get(id) || 0;
                mergedEnchantsMap.set(id, Math.max(curLvl, ench.level));
            }
        }
    }

    const customEnchantable = customItem.getComponent("enchantable");
    if (customEnchantable && mergedEnchantsMap.size > 0) {
        for (const [id, level] of mergedEnchantsMap.entries()) {
            try {
                customEnchantable.addEnchantment({ type: id, level });
            } catch {}
        }
    }

    if (mergedEnchantsMap.size > 0) {
        const list = Array.from(mergedEnchantsMap.entries()).map(([id, level]) => ({ id, level }));
        customItem.setDynamicProperty(PROP_STORED_ENCHANTS, JSON.stringify(list));
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

        // Mending repair on ed:elytra_damage / broken state from XP gain
        const currentXp = player.totalExperience;
        const prevXp = playerXp.get(player.id);
        playerXp.set(player.id, currentXp);

        if (prevXp !== undefined && currentXp > prevXp && chest) {
            const gainedXp = currentXp - prevXp;
            const enchantable = chest.getComponent("enchantable");
            const hasMending = Boolean(enchantable?.getEnchantment("mending"));

            if (hasMending) {
                // Subcase A: Active runtime proxy equipped
                if (chest.typeId === "minecraft:elytra" && chest.getDynamicProperty(PROP_VARIANT)) {
                    let logicalDamage = chest.getDynamicProperty(PROP_DAMAGE) ?? 0;
                    if (logicalDamage > 0) {
                        const repairAmount = Math.min(logicalDamage, gainedXp * 2);
                        const xpUsed = Math.ceil(repairAmount / 2);
                        logicalDamage -= repairAmount;
                        chest.setDynamicProperty(PROP_DAMAGE, logicalDamage);
                        equippable.setEquipment(EquipmentSlot.Chest, chest);
                        player.addExperience(-xpUsed);
                        playerXp.set(player.id, player.totalExperience);
                    }
                }
                // Subcase B: Broken elytra custom item equipped in chest slot
                else if (chest.typeId === "elytra:chesplate_broken" || chest.typeId === "elytra:enderite_broken") {
                    const durComp = chest.getComponent("durability");
                    if (durComp && durComp.damage > 0) {
                        const repairAmount = Math.min(durComp.damage, gainedXp * 2);
                        const xpUsed = Math.ceil(repairAmount / 2);
                        const newDamage = durComp.damage - repairAmount;
                        player.addExperience(-xpUsed);
                        playerXp.set(player.id, player.totalExperience);

                        if (newDamage < BROKEN_LOGICAL_DAMAGE) {
                            // Item repaired out of broken state!
                            durComp.damage = newDamage;
                            const unbroken = restoreRepairedBrokenItem(chest);
                            const proxy = createElytraProxy(unbroken, player);
                            equippable.setEquipment(EquipmentSlot.Chest, proxy);
                            playersWearingProxy.add(player.id);
                            syncProxyVisual(player, unbroken.typeId === "elytra:chesplate" ? "combined" : "separated");
                        } else {
                            durComp.damage = newDamage;
                            equippable.setEquipment(EquipmentSlot.Chest, chest);
                        }
                    }
                }
            }
        }

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

                // Reset physical proxy damage every tick to keep proxy pristine
                const dur = chest.getComponent("durability");
                if (dur && dur.damage > 0) {
                    dur.damage = 0;
                    updatedProxy = true;
                }

                // Deterministic flight durability wear (Java parity)
                const isSurvival = player.getGameMode() !== GameMode.creative && player.getGameMode() !== GameMode.spectator;
                if (player.isGliding && isSurvival) {
                    const gTicks = (glidingTicks.get(player.id) ?? 0) + 1;
                    if (gTicks >= 20) {
                        glidingTicks.set(player.id, 0);

                        const enchantable = chest.getComponent("enchantable");
                        const unbreaking = enchantable?.getEnchantment("unbreaking");
                        const level = unbreaking?.level ?? 0;

                        // Java parity: Combined is armor (#enderitemod:enderite_armor),
                        // so it uses armor Unbreaking chance: 0.6 + 0.4 / (level + 1).
                        // Separated is elytra tool, using: 1.0 / (level + 1).
                        const takeDamageChance = level > 0
                            ? (isCombined ? (0.6 + 0.4 / (level + 1)) : (1.0 / (level + 1)))
                            : 1.0;

                        if (Math.random() < takeDamageChance) {
                            logicalDamage += 1;
                            updatedProxy = true;
                        }
                    } else {
                        glidingTicks.set(player.id, gTicks);
                    }
                } else if (!player.isGliding) {
                    glidingTicks.delete(player.id);
                }

                // Check breakage independently of whether damage was flight or combat
                if (logicalDamage >= BROKEN_LOGICAL_DAMAGE) {
                    // Broken! Stops gliding, plays break sound, converts to broken custom item
                    try { player.playSound("random.break"); } catch {}
                    const brokenId = variant === "combined" ? "elytra:chesplate_broken" : "elytra:enderite_broken";
                    const brokenItem = restoreCustomElytra(chest, brokenId, BROKEN_LOGICAL_DAMAGE);
                    equippable.setEquipment(EquipmentSlot.Chest, brokenItem);
                    playersWearingProxy.delete(player.id);
                    glidingTicks.delete(player.id);
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
            glidingTicks.delete(player.id);
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
            if (!entity.isValid) return;
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
    glidingTicks.delete(event.playerId);
    playerXp.delete(event.playerId);
});

// Safeguard on spawn: ensure player nameTag is restored if not wearing proxy
world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;
    if (!player) return;
    playerXp.set(player.id, player.totalExperience);
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
                if (!ent.isValid) continue;
                const itemComp = ent.getComponent("item");
                const stack = itemComp?.itemStack;
                if (stack && stack.getDynamicProperty(PROP_PROXY_ID) === proxyId) {
                    const res = applyWearToCombinedItem(stack, wear);
                    if (res) {
                        const itemDim = ent.dimension;
                        const itemLoc = ent.location;
                        const itemVel = ent.getVelocity();
                        ent.remove();
                        const spawned = itemDim.spawnItem(res.updatedItem, itemLoc);
                        if (itemVel) {
                            try { spawned.applyImpulse(itemVel); } catch {}
                        }
                        if (res.didBreak) {
                            try { itemDim.playSound("random.break", itemLoc); } catch {}
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
                if (!ent.isValid || ent.typeId === "minecraft:player" || ent.typeId === "minecraft:item") continue;
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

/**
 * Computes the Protection Enchantment Protection Factor (EPF) for a Combined Elytra proxy.
 * Since Bedrock engine cannot natively host armor protection on minecraft:elytra,
 * this calculates the effective Java EPF (capped at 20) from ed:elytra_stored_enchants.
 * @param {ItemStack} proxyItem
 * @param {string} damageCause
 * @returns {number} EPF (0 to 20)
 */
export function getCombinedElytraProtectionEpf(proxyItem, damageCause) {
    if (!proxyItem) return 0;
    if (proxyItem.typeId !== "minecraft:elytra") return 0;
    if (proxyItem.getDynamicProperty(PROP_VARIANT) !== "combined") return 0;

    let storedEnchants = [];
    const json = proxyItem.getDynamicProperty(PROP_STORED_ENCHANTS);
    if (json && typeof json === "string") {
        try {
            storedEnchants = JSON.parse(json);
        } catch {}
    }

    if (!Array.isArray(storedEnchants) || storedEnchants.length === 0) {
        return 0;
    }

    let epf = 0;
    for (const ench of storedEnchants) {
        if (!ench || !ench.id || typeof ench.level !== "number") continue;
        const id = ench.id.toLowerCase().replace(/^minecraft:/, "");
        const level = ench.level;

        if (id === "protection") {
            epf += level * 1;
        } else if (id === "fire_protection" && isFireCause(damageCause)) {
            epf += level * 2;
        } else if (id === "blast_protection" && isBlastCause(damageCause)) {
            epf += level * 2;
        } else if (id === "projectile_protection" && isProjectileCause(damageCause)) {
            epf += level * 2;
        }
    }

    return Math.min(epf, 20);
}

function isFireCause(cause) {
    return cause === EntityDamageCause.fire ||
           cause === EntityDamageCause.fireTick ||
           cause === EntityDamageCause.lava ||
           cause === EntityDamageCause.campfire ||
           cause === EntityDamageCause.magma;
}

function isBlastCause(cause) {
    return cause === EntityDamageCause.entityExplosion ||
           cause === EntityDamageCause.blockExplosion;
}

function isProjectileCause(cause) {
    return cause === EntityDamageCause.projectile;
}

