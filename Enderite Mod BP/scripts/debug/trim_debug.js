import { world, system, ItemStack } from "@minecraft/server";

/**
 * Diagnostic tool for testing Armor Trims via LootTableManager and Script API.
 * Command: /scriptevent ed:test_trim
 */
system.afterEvents.scriptEventReceive.subscribe((event) => {
    if (event.id !== "ed:test_trim") return;

    const player = event.sourceEntity;
    if (!player || player.typeId !== "minecraft:player") {
        console.warn("[Trim Debug] Command must be executed by a player.");
        return;
    }

    player.sendMessage("§d[Trim Debug] §fIniciando pruebas de Armor Trim...");

    // 1. Check LootTableManager availability
    let lootManager;
    try {
        if (typeof world.getLootTableManager === "function") {
            lootManager = world.getLootTableManager();
        }
    } catch (e) {
        player.sendMessage(`§c[Trim Debug] Error obteniendo LootTableManager: ${e}`);
    }

    if (!lootManager) {
        player.sendMessage("§c[Trim Debug] world.getLootTableManager() no está disponible en esta versión.");
        return;
    }

    player.sendMessage("§a[Trim Debug] LootTableManager detectado con éxito.");

    // 2. Test generating Combined Elytra with Silence + Gold trim
    const pathsToTry = [
        "loot_tables/trims/silence_gold_combined.json",
        "loot_tables/trims/silence_gold_combined",
        "trims/silence_gold_combined.json",
        "trims/silence_gold_combined"
    ];

    let combinedTable = null;
    let successfulPath = null;

    for (const p of pathsToTry) {
        try {
            const table = lootManager.getLootTable(p);
            if (table) {
                combinedTable = table;
                successfulPath = p;
                break;
            }
        } catch {}
    }

    if (!combinedTable) {
        player.sendMessage("§c[Trim Debug] No se pudo encontrar la tabla de loot de Combined Elytra.");
        player.sendMessage(`§7Rutas probadas: ${pathsToTry.join(", ")}`);
    } else {
        player.sendMessage(`§a[Trim Debug] Tabla encontrada en: §e${successfulPath}`);

        try {
            const generatedItems = lootManager.generateLootFromTable(combinedTable) ?? [];
            player.sendMessage(`§a[Trim Debug] Generados: §e${generatedItems.length} §aítem(s).`);

            for (const item of generatedItems) {
                player.sendMessage(`§f- Tipo: §b${item.typeId} §7(amount: ${item.amount})`);

                // Inspect components
                try {
                    const components = item.getComponents ? item.getComponents().map(c => c.typeId) : [];
                    player.sendMessage(`  §7Componentes: §8${components.slice(0, 10).join(", ") || "ninguno"}`);
                } catch {}

                // Inspect lore
                try {
                    const lore = item.getLore() ?? [];
                    if (lore.length > 0) {
                        player.sendMessage(`  §7Lore: §r${lore.join(" | ")}`);
                    } else {
                        player.sendMessage("  §7Lore: §8(vacío)");
                    }
                } catch {}

                // Deliver to player
                try {
                    const inv = player.getComponent("inventory");
                    const leftover = inv?.container?.addItem(item);
                    if (leftover) {
                        player.dimension.spawnItem(leftover, player.location);
                    }
                    player.sendMessage("  §a-> Entregado al inventario (o soltado a tus pies).");
                } catch (e) {
                    player.sendMessage(`  §cError entregando ítem: ${e}`);
                }
            }
        } catch (e) {
            player.sendMessage(`§c[Trim Debug] Error generando loot: ${e}`);
        }
    }

    // 3. Test generating Enderite Chestplate with Silence + Gold trim
    const chestPaths = [
        "loot_tables/trims/silence_gold_chestplate.json",
        "loot_tables/trims/silence_gold_chestplate",
        "trims/silence_gold_chestplate.json",
        "trims/silence_gold_chestplate"
    ];

    let chestTable = null;
    for (const p of chestPaths) {
        try {
            const table = lootManager.getLootTable(p);
            if (table) {
                chestTable = table;
                break;
            }
        } catch {}
    }

    if (chestTable) {
        try {
            const chestItems = lootManager.generateLootFromTable(chestTable) ?? [];
            for (const item of chestItems) {
                const inv = player.getComponent("inventory");
                const leftover = inv?.container?.addItem(item);
                if (leftover) {
                    player.dimension.spawnItem(leftover, player.location);
                }
                player.sendMessage(`§a[Trim Debug] Pechera con trim Silence+Gold generada y entregada (${item.typeId}).`);
            }
        } catch (e) {
            player.sendMessage(`§c[Trim Debug] Error con pechera: ${e}`);
        }
    }

    // 4. Comparison Test: Check if script can differentiate trimmed vs plain items
    try {
        const plainChest = new ItemStack("ed:enderite_chestplate", 1);
        player.sendMessage("§d[Trim Debug] Comparando pechera plain vs pecheras en inventario...");

        const inv = player.getComponent("inventory");
        const container = inv?.container;
        if (container) {
            for (let slot = 0; slot < container.size; slot++) {
                const item = container.getItem(slot);
                if (!item || item.typeId !== "ed:enderite_chestplate") continue;

                const stackable = plainChest.isStackableWith ? plainChest.isStackableWith(item) : "N/A";
                player.sendMessage(`§7Ranura ${slot}: stackable=${stackable}, nameTag=${item.nameTag || "(none)"}`);
            }
        }
    } catch (e) {
        player.sendMessage(`§c[Trim Debug] Error en test de comparación: ${e}`);
    }

    player.sendMessage("§d[Trim Debug] §aPrueba finalizada. Equipa las piezas recibidas para verificar el render visual.");
});
