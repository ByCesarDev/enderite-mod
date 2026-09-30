import { world, system, ItemStack, EnchantmentTypes } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { getVoidFloatingLevel, setVoidFloatingLevel } from "../core/void_floating.js";
import {
    getLanguage,
    formatEnchantmentsForDisplay,
    getItemDisplayName,
    COMBINED_CRAFTING_STRINGS
} from "../core/localization.js";

export const ENDERITE_CHESTPLATE_ID = "ed:enderite_chestplate";
export const COMBINED_RESULT_ID = "elytra:chesplate";

export const GLIDER_ITEM_IDS = new Set([
    "minecraft:elytra",
    "ed:elytra",
    "elytra:enderite",
    "elytra:enderite_broken"
]);

const ENCHANTMENT_MAX_LEVELS = {
    "protection": 4,
    "fire_protection": 4,
    "blast_protection": 4,
    "projectile_protection": 4,
    "thorns": 3,
    "unbreaking": 3,
    "mending": 1,
    "binding": 1,
    "curse_of_binding": 1,
    "vanishing": 1,
    "curse_of_vanishing": 1,
    "void_floating": 3,
    "ed:void_floating": 3
};

const ROMAN_NUMERALS = ["", "I", "II", "III", "IV", "V"];

/**
 * Checks whether an ItemStack is an Enderite Chestplate.
 * @param {ItemStack} itemStack
 * @returns {boolean}
 */
export function isEnderiteChestplate(itemStack) {
    if (!itemStack) return false;
    return itemStack.typeId === ENDERITE_CHESTPLATE_ID;
}

/**
 * Checks whether an ItemStack is an acceptable glider equivalent for Java GLIDER component.
 * Excludes active flight proxies (minecraft:elytra with ed:elytra_variant).
 * @param {ItemStack} itemStack
 * @returns {boolean}
 */
export function isGliderItem(itemStack) {
    if (!itemStack) return false;

    // Exclude active flight proxies
    if (itemStack.typeId === "minecraft:elytra") {
        try {
            if (itemStack.getDynamicProperty("ed:elytra_variant")) {
                return false;
            }
        } catch {}
    }

    return GLIDER_ITEM_IDS.has(itemStack.typeId);
}

/**
 * Returns the maximum legitimate level for an enchantment.
 * @param {string} enchantId
 * @returns {number}
 */
export function getMaxEnchantmentLevel(enchantId) {
    const normalized = enchantId.toLowerCase().replace(/^minecraft:/, "");
    return ENCHANTMENT_MAX_LEVELS[normalized] || 5;
}

/**
 * Extracts a normalized list of enchantments from an item.
 * @param {ItemStack} itemStack
 * @returns {Array<{ id: string, level: number }>}
 */
export function getItemEnchantments(itemStack) {
    if (!itemStack) return [];

    const result = [];
    const enchantable = itemStack.getComponent("enchantable");
    if (enchantable) {
        const enchants = enchantable.getEnchantments();
        if (enchants && enchants.length > 0) {
            for (const e of enchants) {
                const id = typeof e.type === "string" ? e.type : (e.type?.id || String(e.type));
                result.push({
                    id: id.toLowerCase().replace(/^minecraft:/, ""),
                    level: e.level
                });
            }
        }
    }

    // Also check ed:elytra_stored_enchants if present
    try {
        const storedJson = itemStack.getDynamicProperty("ed:elytra_stored_enchants");
        if (storedJson && typeof storedJson === "string") {
            const parsed = JSON.parse(storedJson);
            if (Array.isArray(parsed)) {
                for (const p of parsed) {
                    if (p && p.id && typeof p.level === "number") {
                        const id = p.id.toLowerCase().replace(/^minecraft:/, "");
                        if (!result.some(r => r.id === id)) {
                            result.push({ id, level: p.level });
                        }
                    }
                }
            }
        }
    } catch {}

    return result;
}

/**
 * Merges enchantments according to strict Java EnderiteElytraSpecialRecipe rules:
 * - Different enchantments: preserved together.
 * - Same enchantment, same level: level + 1, capped at max level.
 * - Same enchantment, different levels: highest level preserved.
 * @param {Array<{ id: string, level: number }>} chestEnchants
 * @param {Array<{ id: string, level: number }>} gliderEnchants
 * @returns {Map<string, number>}
 */
export function mergeEnchantmentMaps(chestEnchants, gliderEnchants) {
    const merged = new Map();

    for (const e of chestEnchants) {
        merged.set(e.id, e.level);
    }

    for (const e of gliderEnchants) {
        if (merged.has(e.id)) {
            const l1 = merged.get(e.id);
            const l2 = e.level;
            const maxLvl = getMaxEnchantmentLevel(e.id);
            const finalLvl = (l1 === l2) ? Math.min(l1 + 1, maxLvl) : Math.max(l1, l2);
            merged.set(e.id, finalLvl);
        } else {
            merged.set(e.id, e.level);
        }
    }

    return merged;
}

/**
 * Crafts a new Combined Enderite Elytra from an Enderite Chestplate and Glider item.
 * Strictly implements Java special crafting semantics:
 * - Damage: 0 (completely repaired / new)
 * - Custom name: NOT inherited
 * - Merged enchantments (different kept, same level upgraded, different levels keep max)
 * - Trim inherited (chestplate first, glider second)
 * @param {ItemStack} chestplateStack
 * @param {ItemStack} gliderStack
 * @returns {ItemStack | null}
 */
export function craftCombinedElytra(chestplateStack, gliderStack) {
    if (!isEnderiteChestplate(chestplateStack) || !isGliderItem(gliderStack)) {
        return null;
    }

    const result = new ItemStack(COMBINED_RESULT_ID, 1);

    // Damage: 0 (completely new)
    const dur = result.getComponent("durability");
    if (dur) dur.damage = 0;

    // Custom name: NOT inherited (new item identity)
    result.nameTag = undefined;

    // Merge standard enchantments
    const chestEnchants = getItemEnchantments(chestplateStack);
    const gliderEnchants = getItemEnchantments(gliderStack);
    const merged = mergeEnchantmentMaps(chestEnchants, gliderEnchants);

    // Apply enchantments to result
    const resultEnch = result.getComponent("enchantable");
    if (resultEnch) {
        for (const [id, level] of merged.entries()) {
            try {
                const enchType = EnchantmentTypes.get(id);
                if (enchType) {
                    resultEnch.addEnchantment({ type: enchType, level });
                }
            } catch (err) {
                // If native engine rejects, dynamic property guarantees retention
            }
        }
    }

    // Persist all merged enchantments in dynamic property for 100% lossless conversion
    const storedList = Array.from(merged.entries()).map(([id, level]) => ({ id, level }));
    result.setDynamicProperty("ed:elytra_stored_enchants", JSON.stringify(storedList));

    // Void Floating custom enchantment
    const vf1 = getVoidFloatingLevel(chestplateStack);
    const vf2 = getVoidFloatingLevel(gliderStack);
    let vfFinal = 0;
    if (vf1 > 0 && vf2 > 0) {
        vfFinal = (vf1 === vf2) ? Math.min(vf1 + 1, 3) : Math.max(vf1, vf2);
    } else {
        vfFinal = Math.max(vf1, vf2);
    }
    if (vfFinal > 0) {
        setVoidFloatingLevel(result, vfFinal);
    }

    // Trim inheritance: chestplate first, glider second
    try {
        const chestTrim = chestplateStack.getDynamicProperty("minecraft:trim");
        const gliderTrim = gliderStack.getDynamicProperty("minecraft:trim");
        const selectedTrim = chestTrim || gliderTrim;
        if (selectedTrim) {
            result.setDynamicProperty("minecraft:trim", selectedTrim);
        }
    } catch {}

    return result;
}

/**
 * Executes atomic crafting transaction replacing the items in the player's container.
 * @param {import("@minecraft/server").Player} player
 * @param {number} chestSlot
 * @param {number} gliderSlot
 * @returns {boolean}
 */
export function executeCombinedCrafting(player, chestSlot, gliderSlot) {
    if (!player?.isValid) return false;

    const lang = getLanguage(player);
    const strings = COMBINED_CRAFTING_STRINGS[lang] || COMBINED_CRAFTING_STRINGS.en;

    const inv = player.getComponent("inventory");
    const container = inv?.container;
    if (!container) return false;

    if (chestSlot === gliderSlot) return false;

    const chestItem = container.getItem(chestSlot);
    const gliderItem = container.getItem(gliderSlot);

    // Strict revalidation before touching inventory
    if (!isEnderiteChestplate(chestItem) || !isGliderItem(gliderItem)) {
        player.onScreenDisplay?.setActionBar?.(strings.itemsMoved);
        try { player.playSound("note.bass", { pitch: 0.7 }); } catch {}
        return false;
    }

    let combinedResult;
    try {
        combinedResult = craftCombinedElytra(chestItem, gliderItem);
    } catch (err) {
        player.onScreenDisplay?.setActionBar?.(`${strings.craftError}${err?.message || err}`);
        try { player.playSound("note.bass", { pitch: 0.7 }); } catch {}
        return false;
    }

    if (!combinedResult) {
        player.onScreenDisplay?.setActionBar?.(strings.craftFailed);
        try { player.playSound("note.bass", { pitch: 0.7 }); } catch {}
        return false;
    }

    // Atomic execution:
    // 1. Consume glider
    if (gliderItem.amount > 1) {
        gliderItem.amount -= 1;
        container.setItem(gliderSlot, gliderItem);
    } else {
        container.setItem(gliderSlot, undefined);
    }

    // 2. Replace chestplate with combined result
    container.setItem(chestSlot, combinedResult);

    try {
        player.playSound("random.anvil_use", { pitch: 1.0, volume: 1.0 });
    } catch {}

    player.onScreenDisplay?.setActionBar?.(strings.craftSuccess);
    return true;
}

/**
 * Displays the confirmation preview modal dialog.
 * @param {import("@minecraft/server").Player} player
 * @param {number} chestSlot
 * @param {number} gliderSlot
 */
function showConfirmationPreview(player, chestSlot, gliderSlot) {
    if (!player?.isValid) return;

    const lang = getLanguage(player);
    const strings = COMBINED_CRAFTING_STRINGS[lang] || COMBINED_CRAFTING_STRINGS.en;

    const inv = player.getComponent("inventory");
    const container = inv?.container;
    if (!container) return;

    const chestItem = container.getItem(chestSlot);
    const gliderItem = container.getItem(gliderSlot);

    if (!isEnderiteChestplate(chestItem) || !isGliderItem(gliderItem)) {
        player.onScreenDisplay?.setActionBar?.(strings.itemInvalid);
        return;
    }

    const chestEnchants = getItemEnchantments(chestItem);
    const gliderEnchants = getItemEnchantments(gliderItem);
    const chestVF = getVoidFloatingLevel(chestItem);
    const gliderVF = getVoidFloatingLevel(gliderItem);

    const merged = mergeEnchantmentMaps(chestEnchants, gliderEnchants);
    const mergedList = Array.from(merged.entries()).map(([id, level]) => ({ id, level }));

    let resultVF = 0;
    if (chestVF > 0 && gliderVF > 0) {
        resultVF = (chestVF === gliderVF) ? Math.min(chestVF + 1, 3) : Math.max(chestVF, gliderVF);
    } else {
        resultVF = Math.max(chestVF, gliderVF);
    }

    const chestName = getItemDisplayName(chestItem, lang);
    const gliderName = getItemDisplayName(gliderItem, lang);

    let body = strings.confirmQuestion;
    body += `§61. ${chestName}§r\n`;
    body += `${formatEnchantmentsForDisplay(chestEnchants, chestVF, lang)}\n\n`;
    body += `§62. ${gliderName}§r\n`;
    body += `${formatEnchantmentsForDisplay(gliderEnchants, gliderVF, lang)}\n\n`;
    body += strings.resultHeader;
    body += strings.statsLine;
    body += `${formatEnchantmentsForDisplay(mergedList, resultVF, lang)}\n\n`;
    body += strings.noteLine;

    const form = new ActionFormData();
    form.title(strings.formTitle);
    form.body(body);
    form.button(strings.btnConfirm, "textures/items/enderite_elytra");
    form.button(strings.btnCancel);

    form.show(player).then((res) => {
        if (res.canceled || res.selection !== 0) {
            // Player cancelled: do nothing, leave ingredients untouched
            return;
        }

        executeCombinedCrafting(player, chestSlot, gliderSlot);
    }).catch(() => {});
}

/**
 * Opens the interactive Combined Crafting interface when interacting with a Crafting Table while sneaking.
 * @param {import("@minecraft/server").Player} player
 */
export function openCombinedCraftingUi(player) {
    if (!player?.isValid) return;

    const lang = getLanguage(player);
    const strings = COMBINED_CRAFTING_STRINGS[lang] || COMBINED_CRAFTING_STRINGS.en;

    const inv = player.getComponent("inventory");
    const container = inv?.container;
    if (!container) return;

    const chestCandidates = [];
    const gliderCandidates = [];

    for (let slot = 0; slot < container.size; slot++) {
        const item = container.getItem(slot);
        if (!item) continue;

        if (isEnderiteChestplate(item)) {
            chestCandidates.push({ slot, item });
        } else if (isGliderItem(item)) {
            gliderCandidates.push({ slot, item });
        }
    }

    if (chestCandidates.length === 0 || gliderCandidates.length === 0) {
        player.onScreenDisplay?.setActionBar?.(strings.needIngredients);
        try { player.playSound("note.bass", { pitch: 0.7 }); } catch {}
        return;
    }

    // If exact 1:1 match, jump straight to confirmation preview
    if (chestCandidates.length === 1 && gliderCandidates.length === 1) {
        showConfirmationPreview(player, chestCandidates[0].slot, gliderCandidates[0].slot);
        return;
    }

    // If multiple chestplates, prompt selection first
    if (chestCandidates.length > 1) {
        const form = new ActionFormData();
        form.title(strings.selectChestTitle);
        form.body(strings.selectChestBody);

        for (const cand of chestCandidates) {
            const enchs = getItemEnchantments(cand.item);
            const enchCount = enchs.length;
            const name = getItemDisplayName(cand.item, lang);
            form.button(`${name} (${enchCount} ${strings.enchSuffix})`, "textures/items/enderite_chestplate");
        }

        form.show(player).then((res) => {
            if (res.canceled || res.selection === undefined) return;
            const chosenChest = chestCandidates[res.selection];
            if (!chosenChest) return;

            // Next step: glider selection
            promptGliderSelection(player, chosenChest.slot, gliderCandidates);
        }).catch(() => {});
        return;
    }

    // Only 1 chestplate, but multiple gliders
    promptGliderSelection(player, chestCandidates[0].slot, gliderCandidates);
}

/**
 * Prompts selection of a glider item when multiple are available.
 * @param {import("@minecraft/server").Player} player
 * @param {number} chestSlot
 * @param {Array<{ slot: number, item: ItemStack }>} gliderCandidates
 */
function promptGliderSelection(player, chestSlot, gliderCandidates) {
    if (gliderCandidates.length === 1) {
        showConfirmationPreview(player, chestSlot, gliderCandidates[0].slot);
        return;
    }

    const lang = getLanguage(player);
    const strings = COMBINED_CRAFTING_STRINGS[lang] || COMBINED_CRAFTING_STRINGS.en;

    const form = new ActionFormData();
    form.title(strings.selectGliderTitle);
    form.body(strings.selectGliderBody);

    for (const cand of gliderCandidates) {
        const enchs = getItemEnchantments(cand.item);
        const name = getItemDisplayName(cand.item, lang);
        form.button(`${name} (${enchs.length} ${strings.enchSuffix})`, "textures/items/elytra");
    }

    form.show(player).then((res) => {
        if (res.canceled || res.selection === undefined) return;
        const chosenGlider = gliderCandidates[res.selection];
        if (!chosenGlider) return;

        showConfirmationPreview(player, chestSlot, chosenGlider.slot);
    }).catch(() => {});
}

// Interaction handling: Sneak + Interact on Crafting Table
const lastCraftInteractTime = new Map();
const CRAFT_COOLDOWN_MS = 500;

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    try {
        const { player, block } = event;
        if (!block || block.typeId !== "minecraft:crafting_table") return;
        if (!player || !player.isSneaking) return;

        const inv = player.getComponent("inventory");
        const container = inv?.container;
        if (!container) return;

        let hasChest = false;
        let hasGlider = false;
        for (let i = 0; i < container.size; i++) {
            const item = container.getItem(i);
            if (!item) continue;
            if (isEnderiteChestplate(item)) hasChest = true;
            if (isGliderItem(item)) hasGlider = true;
            if (hasChest && hasGlider) break;
        }

        if (!hasChest || !hasGlider) {
            // Player does not have both ingredients, preserve normal crafting table usage
            return;
        }

        // Cancel crafting table UI to open Combined Crafting interface
        event.cancel = true;

        const now = Date.now();
        const last = lastCraftInteractTime.get(player.id) || 0;
        if (now - last < CRAFT_COOLDOWN_MS) return;
        lastCraftInteractTime.set(player.id, now);

        system.run(() => {
            openCombinedCraftingUi(player);
        });
    } catch (e) {
        console.error(`[Enderite] Error in combined crafting interaction: ${e}`);
    }
});

world.afterEvents.playerLeave.subscribe((event) => {
    lastCraftInteractTime.delete(event.playerId);
});
