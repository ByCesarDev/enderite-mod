/**
 * Enderite Mod - Centralized Localization Module
 * Provides 100% localized dictionaries for UI forms, enchantments, items, and actionbar messages.
 * Supports Mexican Spanish (es_mx), European Spanish (es), and English (en/default).
 */

export const ROMAN_NUMERALS = {
    1: "I",
    2: "II",
    3: "III",
    4: "IV",
    5: "V",
    6: "VI",
    7: "VII",
    8: "VIII",
    9: "IX",
    10: "X"
};

/**
 * Determines normalized language code ('es_mx', 'es', or 'en') for a player.
 * @param {import("@minecraft/server").Player} [player]
 * @returns {"es_mx" | "es" | "en"}
 */
export function getLanguage(player = null) {
    const locale = player?.clientSystemInfo?.locale?.toLowerCase() ?? "";
    if (locale.startsWith("es_mx")) return "es_mx";
    if (locale.startsWith("es")) return "es";
    return "en";
}

/**
 * Dictionary of all Bedrock & custom enchantment display names.
 */
export const ENCHANTMENT_NAMES = {
    protection: { es: "Protección", en: "Protection" },
    fire_protection: { es: "Protección contra el fuego", en: "Fire Protection" },
    feather_falling: { es: "Caída de pluma", en: "Feather Falling" },
    blast_protection: { es: "Protección contra explosiones", en: "Blast Protection" },
    projectile_protection: { es: "Protección contra proyectiles", en: "Projectile Protection" },
    thorns: { es: "Espinas", en: "Thorns" },
    respiration: { es: "Respiración", en: "Respiration" },
    depth_strider: { es: "Agilidad acuática", en: "Depth Strider" },
    aqua_affinity: { es: "Afinidad acuática", en: "Aqua Affinity" },
    sharpness: { es: "Filo", en: "Sharpness" },
    smite: { es: "Golpeo", en: "Smite" },
    bane_of_arthropods: { es: "Pesadilla de los artrópodos", en: "Bane of Arthropods" },
    knockback: { es: "Empuje", en: "Knockback" },
    fire_aspect: { es: "Aspecto ígneo", en: "Fire Aspect" },
    looting: { es: "Botín", en: "Looting" },
    efficiency: { es: "Eficiencia", en: "Efficiency" },
    silk_touch: { es: "Toque de seda", en: "Silk Touch" },
    unbreaking: { es: "Irrompibilidad", en: "Unbreaking" },
    fortune: { es: "Fortuna", en: "Fortune" },
    power: { es: "Poder", en: "Power" },
    punch: { es: "Retroceso", en: "Punch" },
    flame: { es: "Fuego", en: "Flame" },
    infinity: { es: "Infinidad", en: "Infinity" },
    luck_of_the_sea: { es: "Suerte marina", en: "Luck of the Sea" },
    lure: { es: "Atracción", en: "Lure" },
    frost_walker: { es: "Paso helado", en: "Frost Walker" },
    mending: { es: "Reparación", en: "Mending" },
    curse_of_binding: { es: "Maldición de ligamiento", en: "Curse of Binding" },
    curse_of_vanishing: { es: "Maldición de desaparición", en: "Curse of Vanishing" },
    impaling: { es: "Empalamiento", en: "Impaling" },
    riptide: { es: "Propulsión acuática", en: "Riptide" },
    loyalty: { es: "Lealtad", en: "Loyalty" },
    channeling: { es: "Canalización", en: "Channeling" },
    multishot: { es: "Disparo múltiple", en: "Multishot" },
    piercing: { es: "Perforación", en: "Piercing" },
    quick_charge: { es: "Carga rápida", en: "Quick Charge" },
    soul_speed: { es: "Velocidad del alma", en: "Soul Speed" },
    swift_sneak: { es: "Sigilo rápido", en: "Swift Sneak" },
    wind_burst: { es: "Ráfaga de viento", en: "Wind Burst" },
    density: { es: "Densidad", en: "Density" },
    breach: { es: "Brecha", en: "Breach" },
    void_floating: { es: "Flotar en el Vacío", en: "Void Floating" }
};

/**
 * Returns translated enchantment display name.
 * @param {string} id
 * @param {number} [level=0]
 * @param {"es_mx" | "es" | "en"} [lang="en"]
 * @returns {string}
 */
export function getEnchantmentDisplayName(id, level = 0, lang = "en") {
    const cleanId = id.toLowerCase().replace(/^minecraft:/, "");
    const entry = ENCHANTMENT_NAMES[cleanId];
    let name = "";
    if (entry) {
        name = (lang === "es_mx" || lang === "es") ? entry.es : entry.en;
    } else {
        name = cleanId.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
    }

    if (level > 0) {
        const roman = ROMAN_NUMERALS[level] || String(level);
        return `${name} ${roman}`;
    }
    return name;
}

/**
 * Dictionary of item display names.
 */
export const ITEM_NAMES = {
    // Custom Enderite items
    "ed:enderite_helmet": { es: "Casco de Enderita", en: "Enderite Helmet" },
    "ed:enderite_chestplate": { es_mx: "Pechera de Enderita", es: "Coraza de Enderita", en: "Enderite Chestplate" },
    "ed:enderite_leggings": { es: "Pantalones de Enderita", en: "Enderite Leggings" },
    "ed:enderite_boots": { es: "Botas de Enderita", en: "Enderite Boots" },
    "ed:enderite_axe": { es: "Hacha de Enderita", en: "Enderite Axe" },
    "ed:enderite_pickaxe": { es: "Pico de Enderita", en: "Enderite Pickaxe" },
    "ed:enderite_hoe": { es_mx: "Azadón de Enderita", es: "Azada de Enderita", en: "Enderite Hoe" },
    "ed:enderite_shovel": { es: "Pala de Enderita", en: "Enderite Shovel" },
    "ed:enderite_sword": { es: "Espada de Enderita", en: "Enderite Sword" },
    "ed:enderite_shears": { es: "Tijeras de Enderita", en: "Enderite Shears" },
    "ed:enderite_bow": { es: "Arco de Enderita", en: "Enderite Bow" },
    "ed:enderite_cross_bow": { es: "Ballesta de Enderita", en: "Enderite Crossbow" },
    "ed:enderite_arrow": { es: "Flecha de Enderita", en: "Enderite Arrow" },
    "enderite:shield": { es: "Escudo de Enderita", en: "Enderite Shield" },
    "enderite:shield_tp": { es: "Escudo de Enderita", en: "Enderite Shield" },
    "enderite:shield_tp_lv2": { es: "Escudo de Enderita", en: "Enderite Shield" },
    "enderite:shield_tp_lv3": { es: "Escudo de Enderita", en: "Enderite Shield" },
    "enderite:shield_tp_lv4": { es: "Escudo de Enderita", en: "Enderite Shield" },
    "ed:enderite_sword_tp": { es: "Espada de Enderita", en: "Enderite Sword" },
    "ed:enderite_sword_tp_l2": { es: "Espada de Enderita", en: "Enderite Sword" },
    "ed:enderite_sword_tp_l3": { es: "Espada de Enderita", en: "Enderite Sword" },
    "ed:enderite_sword_tp_l4": { es: "Espada de Enderita", en: "Enderite Sword" },
    "elytra:chesplate": { es_mx: "Pechera con Élitros de Enderita", es: "Coraza con Élitros de Enderita", en: "Enderite Elytra Chestplate" },
    "elytra:chesplate_broken": { es_mx: "Pechera con Élitros de Enderita", es: "Coraza con Élitros de Enderita", en: "Enderite Elytra Chestplate" },
    "elytra:enderite": { es: "Élitros de Enderita", en: "Enderite Elytra" },
    "elytra:enderite_broken": { es: "Élitros de Enderita", en: "Enderite Elytra" },
    "ed:floating_void": { es: "Libro encantado", en: "Enchanted Book" },
    "ed:floating_void_2": { es: "Libro encantado", en: "Enchanted Book" },
    "ed:floating_void_3": { es: "Libro encantado", en: "Enchanted Book" },

    // Clones & Vanilla
    "ed:netherite_axe": { es_mx: "Hacha de Netherita", es: "Hacha de Inframundita", en: "Netherite Axe" },
    "minecraft:netherite_axe": { es_mx: "Hacha de Netherita", es: "Hacha de Inframundita", en: "Netherite Axe" },
    "ed:netherite_pickaxe": { es_mx: "Pico de Netherita", es: "Pico de Inframundita", en: "Netherite Pickaxe" },
    "minecraft:netherite_pickaxe": { es_mx: "Pico de Netherita", es: "Pico de Inframundita", en: "Netherite Pickaxe" },
    "ed:netherite_hoe": { es_mx: "Azadón de Netherita", es: "Azada de Inframundita", en: "Netherite Hoe" },
    "minecraft:netherite_hoe": { es_mx: "Azadón de Netherita", es: "Azada de Inframundita", en: "Netherite Hoe" },
    "ed:netherite_shovel": { es_mx: "Pala de Netherita", es: "Pala de Inframundita", en: "Netherite Shovel" },
    "minecraft:netherite_shovel": { es_mx: "Pala de Netherita", es: "Pala de Inframundita", en: "Netherite Shovel" },
    "ed:netherite_sword": { es_mx: "Espada de Netherita", es: "Espada de Inframundita", en: "Netherite Sword" },
    "minecraft:netherite_sword": { es_mx: "Espada de Netherita", es: "Espada de Inframundita", en: "Netherite Sword" },
    "ed:bow": { es: "Arco", en: "Bow" },
    "minecraft:bow": { es: "Arco", en: "Bow" },
    "ed:crossbow": { es: "Ballesta", en: "Crossbow" },
    "minecraft:crossbow": { es: "Ballesta", en: "Crossbow" },
    "ed:elytra": { es: "Élitros", en: "Elytra" },
    "minecraft:elytra": { es: "Élitros", en: "Elytra" },
    "ed:shears": { es: "Tijeras", en: "Shears" },
    "minecraft:shears": { es: "Tijeras", en: "Shears" }
};

/**
 * Returns translated item display name, honoring custom nameTag if present.
 * @param {import("@minecraft/server").ItemStack} item
 * @param {"es_mx" | "es" | "en"} [lang="en"]
 * @returns {string}
 */
export function getItemDisplayName(item, lang = "en") {
    if (!item) return "";
    if (item.nameTag) return item.nameTag;
    const entry = ITEM_NAMES[item.typeId];
    if (entry) {
        if (lang === "es_mx" && entry.es_mx) return entry.es_mx;
        if ((lang === "es_mx" || lang === "es") && entry.es) return entry.es;
        return entry.en || entry.es;
    }
    const raw = item.typeId.replace(/^[^:]+:/, "").replace(/_/g, " ");
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Formats enchantment list into readable string lines for UI forms.
 * @param {Array<{ id: string, level: number }>} enchants
 * @param {number} [voidFloatingLevel=0]
 * @param {"es_mx" | "es" | "en"} [lang="en"]
 * @returns {string}
 */
export function formatEnchantmentsForDisplay(enchants, voidFloatingLevel = 0, lang = "en") {
    const lines = [];

    for (const e of enchants) {
        const name = getEnchantmentDisplayName(e.id, 0, lang);
        const roman = ROMAN_NUMERALS[e.level] || String(e.level);
        lines.push(`  §7- §b${name} ${roman}`);
    }

    if (voidFloatingLevel > 0) {
        const vfName = getEnchantmentDisplayName("void_floating", 0, lang);
        const roman = ROMAN_NUMERALS[voidFloatingLevel] || String(voidFloatingLevel);
        lines.push(`  §7- §d${vfName} ${roman}`);
    }

    if (lines.length === 0) {
        const strings = COMBINED_CRAFTING_STRINGS[lang] || COMBINED_CRAFTING_STRINGS.en;
        return strings.noEnchants;
    }
    return lines.join("\n");
}

/**
 * Dictionary of UI strings for Combined Elytra Crafting.
 */
export const COMBINED_CRAFTING_STRINGS = {
    es_mx: {
        formTitle: "§dFabricar Pechera con Élitros",
        confirmQuestion: "§f¿Deseas fusionar estos dos objetos?\n\n",
        chestDefault: "Pechera de Enderita",
        gliderVanilla: "Élitros Vanilla",
        gliderEnderite: "Élitros de Enderita",
        resultHeader: "§2-> Resultado: Pechera con Élitros de Enderita§r\n",
        statsLine: "  §2+9 Armadura | +4 Dureza | 100% Durabilidad§r\n",
        noteLine: "§6Nota: Sin coste de niveles de experiencia. Los encantamientos del mismo nivel suben +1 nivel.",
        btnConfirm: "§2Confirmar y Fabricar",
        btnCancel: "§4Cancelar",
        selectChestTitle: "§dSeleccionar Pechera",
        selectChestBody: "Tienes varias Pecheras de Enderita. Selecciona cuál deseas combinar:",
        selectGliderTitle: "§dSeleccionar Élitros",
        selectGliderBody: "Tienes varios Élitros. Selecciona cuáles deseas combinar:",
        enchSuffix: "enc.",
        noEnchants: "  §8(Sin encantamientos)",
        needIngredients: "§c[Enderite] Necesitas 1 Pechera de Enderita y 1 Élitros para combinar.",
        itemInvalid: "§c[Enderite] Uno de los objetos ya no es válido.",
        itemsMoved: "§c[Enderite] Los objetos fueron movidos o no son válidos.",
        craftError: "§c[Enderite] Error al fabricar: ",
        craftFailed: "§c[Enderite] No se pudo fabricar la Elytra Combinada.",
        craftSuccess: "§a¡Fabricaste Pechera con Élitros de Enderita!"
    },
    es: {
        formTitle: "§dFabricar Coraza con Élitros",
        confirmQuestion: "§f¿Deseas fusionar estos dos objetos?\n\n",
        chestDefault: "Coraza de Enderita",
        gliderVanilla: "Élitros Vanilla",
        gliderEnderite: "Élitros de Enderita",
        resultHeader: "§2-> Resultado: Coraza con Élitros de Enderita§r\n",
        statsLine: "  §2+9 Armadura | +4 Dureza | 100% Durabilidad§r\n",
        noteLine: "§6Nota: Sin coste de niveles de experiencia. Los encantamientos del mismo nivel suben +1 nivel.",
        btnConfirm: "§2Confirmar y Fabricar",
        btnCancel: "§4Cancelar",
        selectChestTitle: "§dSeleccionar Coraza",
        selectChestBody: "Tienes varias Corazas de Enderita. Selecciona cuál deseas combinar:",
        selectGliderTitle: "§dSeleccionar Élitros",
        selectGliderBody: "Tienes varios Élitros. Selecciona cuáles deseas combinar:",
        enchSuffix: "enc.",
        noEnchants: "  §8(Sin encantamientos)",
        needIngredients: "§c[Enderite] Necesitas 1 Coraza de Enderita y 1 Élitros para combinar.",
        itemInvalid: "§c[Enderite] Uno de los objetos ya no es válido.",
        itemsMoved: "§c[Enderite] Los objetos fueron movidos o no son válidos.",
        craftError: "§c[Enderite] Error al fabricar: ",
        craftFailed: "§c[Enderite] No se pudo fabricar la Elytra Combinada.",
        craftSuccess: "§a¡Fabricaste Coraza con Élitros de Enderita!"
    },
    en: {
        formTitle: "§dCraft Combined Elytra",
        confirmQuestion: "§fDo you want to combine these two items?\n\n",
        chestDefault: "Enderite Chestplate",
        gliderVanilla: "Vanilla Elytra",
        gliderEnderite: "Enderite Elytra",
        resultHeader: "§2-> Result: Enderite Elytra Chestplate§r\n",
        statsLine: "  §2+9 Armor | +4 Toughness | 100% Durability§r\n",
        noteLine: "§6Note: No experience level cost. Same level enchantments increase by +1.",
        btnConfirm: "§2Confirm and Craft",
        btnCancel: "§4Cancel",
        selectChestTitle: "§dSelect Chestplate",
        selectChestBody: "You have multiple Enderite Chestplates. Select which one to combine:",
        selectGliderTitle: "§dSelect Elytra",
        selectGliderBody: "You have multiple Elytras. Select which ones to combine:",
        enchSuffix: "ench.",
        noEnchants: "  §8(No enchantments)",
        needIngredients: "§c[Enderite] You need 1 Enderite Chestplate and 1 Elytra to combine.",
        itemInvalid: "§c[Enderite] One of the items is no longer valid.",
        itemsMoved: "§c[Enderite] Items were moved or are no longer valid.",
        craftError: "§c[Enderite] Error while crafting: ",
        craftFailed: "§c[Enderite] Could not craft Combined Elytra.",
        craftSuccess: "§aCrafted Enderite Elytra Chestplate!"
    }
};

/**
 * Dictionary of UI strings for Void Floating Anvil.
 */
export const VOID_ANVIL_STRINGS = {
    es_mx: {
        formTitle: "§dFlotar en Vacío - Yunque",
        formBody: "Selecciona un objeto de tu inventario para aplicar o mejorar Flotar en Vacío:",
        noItemsBody: "§cNo se encontraron objetos compatibles con durabilidad en tu inventario.",
        btnClose: "§4Cerrar",
        noVoid: "Sin Flotar",
        levelText: "Nivel",
        applied: "§a¡Se aplicó Flotar en Vacío {level} a {item}!"
    },
    es: {
        formTitle: "§dFlotar en el Vacío - Yunque",
        formBody: "Selecciona un objeto de tu inventario para aplicar o mejorar Flotar en el Vacío:",
        noItemsBody: "§cNo se encontraron objetos compatibles con durabilidad en tu inventario.",
        btnClose: "§4Cerrar",
        noVoid: "Sin Flotar",
        levelText: "Nivel",
        applied: "§a¡Se aplicó Flotar en el Vacío {level} a {item}!"
    },
    en: {
        formTitle: "§dVoid Floating - Anvil",
        formBody: "Select an item from your inventory to apply or upgrade Void Floating:",
        noItemsBody: "§cNo compatible durability items found in your inventory.",
        btnClose: "§4Close",
        noVoid: "No Void",
        levelText: "Level",
        applied: "§aApplied Void Floating {level} to {item}!"
    }
};
