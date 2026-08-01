# Changelog

All notable changes to the **Enderite Mod** Minecraft Bedrock AddOn will be documented in this file.

---

## [v1.1.0] - 2026-08-01

### 🚀 Added
- **Enderite Shulker Box Integration**:
  - Custom block (`ed:enderite_shulker_box`) and entity (`ed:default_shulker`) implementation.
  - Complete 3D geometry models, custom animations, render controllers, sound definitions, and custom chest UI (`chest_screen.json`).
- **Complete Item State Preservation**:
  - **Durability & Damage**: Preserves item damage/durability (`ItemDurabilityComponent.damage`) for tools, armor, weapons, and shields stored inside Enderite Shulker Boxes.
  - **Enchantments**: Full serialization and deserialization of all item enchantments (`ItemEnchantableComponent`) when breaking and placing Enderite Shulker Boxes.
  - **Custom Item Names (NameTag)**: Preserves custom anvil-renamed items and displays custom names directly in the Shulker Box item Lore tooltip.
  - **Nested Containers**: Preserves nested dynamic properties (`container_data`) for stored container items.

### 🛠️ Fixed & Improved
- **Script API 2.8.0 Upgrade**:
  - Updated `@minecraft/server` and `@minecraft/server-ui` dependencies in `manifest.json` to version `2.8.0`.
- **Event & Method Deprecations**:
  - Migrated custom block and item component registrations from deprecated `world.beforeEvents.worldInitialize` to `system.beforeEvents.startup`.
  - Replaced deprecated `player.getViewDirection()` calls with `player.getViewVector()` for accurate 3D vector calculations.
  - Replaced deprecated `player.runCommandAsync(...)` calls with `player.runCommand(...)` across `swords_tp.js`, `shield.js`, and `bow.js`.
- **Translatable Void Armor Lore (`void_armor.js`)**:
  - Automatically assigns `{ translate: "enchantment.enderitemod.void_floating" }` lore to all Void armor pieces (`ed:diamond_*`, `ed:netherite_*`, `ed:iron_*`, `ed:gold_*`) via Script API, adapting cleanly to any client language.
- **Pure Script API Void Floating Engine (`void_floating.js`)**:
  - Replaced legacy `.mcfunction` 64-command tick loop with a lightweight Script API engine.
  - Provides smooth upward levitation (`+0.06` Y/tick) and native fire immunity for all Enderite and Void items with 0 server lag.
- **Complete Crafting & Smithing Recipes**:
  - Added missing Smithing Table recipes for **Enderite Shulker Box** (`ed:enderite_shulker_box`) and **Enderite Crossbow** (`ed:enderite_cross_bow`).
  - Added Ender Pearl charging recipes for **Enderite Shield** levels 16, 32, 48, and 64 (`enderite:shield_tp_level_*`).
- **Mining Speed Balancing**:
  - Adjusted `minecraft:destructible_by_mining` speed values for `cracked_enderite`, `enderite_block`, and `enderite_shulker_box` for Netherite and Enderite tier pickaxes.
- **Refactored Modular Architecture**:
  - Organized script components under `scripts/components/` with dedicated asset modules.
