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

---

## [v1.1.5] - 2026-08-06

### 🚀 Complete Respawn Anchor Rewrite
- **Entirely reworked system** using player dynamic properties instead of entities and ticking areas for more reliable performance.
- **Individual player data** — Each player now has their own anchor data stored separately, eliminating conflicts in multiplayer.
- **Automatic spawn restoration** — Breaking the Enderite Respawn Anchor now automatically restores your previous spawn point.
- **Improved teleportation reliability** — More precise respawn mechanics with better error handling and prevention of duplicate spawns.

### ⚖️ Enhanced Armor System
- **New custom armor calculation system** that correctly applies +4 Armor Toughness and +1 Knockback Resistance to Enderite armor.
- **Visual stat display** — All Enderite armor pieces now show their toughness and knockback resistance values in the item lore.
- **Vanilla armor support** — System now supports custom stats for vanilla armor variants (Diamond, Iron, Gold, Netherite).
- **Better damage reduction** — Improved separation between native Bedrock armor reduction and custom armor math.

### ⚡ Teleportation Items with Dynamic Lore
- **Automatic charge display** — Teleport Swords and Shields now show their current charge amount (0, 16, 32, 48, 64) in the item lore.
- **Ability instructions** — Clear usage instructions: "Teleport with sneaking + right click!" for swords and "Teleport attackers with sneaking + right click!" for shields.
- **Real-time updates** — Lore automatically updates in inventory and equipment slots while playing.
- **Fallback text support** — System includes English fallback text if translations fail to load.

### 🎨 Improved Crossbow Animations
- **New player animation controllers** specifically for the Enderite Crossbow with smoother charge and discharge animations.
- **Better integration** with vanilla animation system for more realistic bow handling.

### 📦 Creative Catalog Organization
- **New "Enderite Shields" category** in the creative inventory with all shield variants.
- **Custom icon** for the shield category in the creative menu.

### 🎯 Other Changes
- **Ambient particle effects** around active enderite anchors
- **Debug log cleanup** and improved elytra/armor compatibility
- **General performance and stability improvements**

### 🐛 Bug Fixes & Balance Changes
- **Enderite Shulker Box Name & ID Fix**:
  - Fixed item identifier to use the correct `ed:enderite_shulker_box` ID.
- **Enderite Shulker Box 3D Render**:
  - Changed rendering when dropped to display as a 3D block on the ground instead of 2D.
- **Enderite Elytra & Elytra Chestplate Rarity**:
  - Adjusted name color/rarity to Epic (purple text), matching vanilla Elytra behavior.
- **Enderite Armor Set Balance**:
  - **Armor Toughness**: 16 points total (4 per piece: Helmet, Chestplate, Leggings, Boots).
  - **Knockback Resistance**: 4 points total (1 per piece: Helmet, Chestplate, Leggings, Boots).
- **Enderite Axe Damage Balance**:
  - Reduced base damage from 11 to 8 to align with Bedrock combat system.

### 🔧 Technical Implementation Notes
- **Vanilla Item Cloning System**:
  - Added "craft" and "recraft" recipes for Elytra, Bow, Crossbow, Shears, and Netherite tools.
  - This workaround was necessary because Bedrock Edition doesn't allow using certain vanilla items directly as base items in Smithing Table recipes.
  - Players can convert vanilla items to mod-compatible versions (craft), upgrade them at the Smithing Table, and optionally revert them back (recraft).
