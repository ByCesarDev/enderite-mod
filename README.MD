<div align="center">

# 🟣 ENDERITE MOD
### *The Ultimate End-Game Tech Tier for Minecraft Bedrock Edition*

[![Minecraft Bedrock](https://img.shields.io/badge/Minecraft-Bedrock%201.21%2B-55FF55?style=for-the-badge&logo=minecraft&logoColor=white)](https://minecraft.net)
[![Version](https://img.shields.io/badge/Version-v1.1.0-9933FF?style=for-the-badge)](https://github.com/ByCesarDev/Enderite-Mod/releases)
[![Script API](https://img.shields.io/badge/Script%20API-v2.8.0-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/)
[![License: MIT](https://img.shields.io/badge/License-MIT-F1C40F?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com/invite/z5wshN7Xgm)

---

<p align="center">
  <b>Enderite Mod</b> elevates your Minecraft Bedrock survival experience by introducing a tier superior to Netherite.<br>
  Engineered natively using Bedrock's <code>Behavior Pack</code> and <code>Resource Pack</code> frameworks with zero compromise on performance.
</p>

[✨ Key Features](#-key-features--mechanics) • [🏗️ Architecture](#%EF%B8%8F-project-structure--architecture) • [💻 Dev Setup](#-local-development-setup) • [📜 Terms](#-terms-of-use--licensing)

---

</div>

<br>

## ✨ Key Features & Mechanics

### 📦 Enderite Shulker Box System
* **Custom 3D Geometry & UI**: Features exclusive 3D models, smooth opening/closing animations, custom sound effects, and a dedicated chest interface.
* **100% Item State Preservation**: Breaking and relocating your Shulker Box preserves:
  * 🗡️ Item durability and damage data (`ItemDurabilityComponent`).
  * ✨ All enchantments (`ItemEnchantableComponent`).
  * 🏷️ Custom anvil names displayed directly in tooltips.
  * 📦 Dynamic container properties for nested items.

---

### 🌌 Void Floating Engine & Fire Protection
* **Anti-Loss Gravitational Engine**: Items dropped in the void ($y < 0$) or lava smoothly levitate upwards back to safety.
* **Zero Server Lag**: Powered entirely by the light-weight Script API engine, eliminating heavy function tick loops.
* **Native Fire Immunity**: Full fire and lava resistance for all Enderite tools, weapons, armor, and void items.

---

### ⚔️ Advanced Teleportation & Pearl Charging
* **Enderite Sword Teleportation**: Consume Ender Pearls via `Sneak + Right-Click` to store up to 64 charges for directional vector teleportation.
* **Enderite Shield Recharge**: Replenish shield teleportation charges at the Crafting Table using Ender Pearls across 4 distinct power levels (16, 32, 48, 64).

---

### 🛡️ Hybrid Enderite Elytra Chestplate
* **Armor + Flight Synergy**: Combines heavy Enderite Chestplate defense values with native Elytra gliding mechanics into a single attachable item.

---

### 💥 Explosion-Triggered Mining
* **Cracked Enderite Ore**: Enderite Ore possesses supreme blast resistance. Detonate explosives (TNT, Ender Crystals, Beds) to convert raw ore into Cracked Enderite before mining with Netherite/Enderite pickaxes.

<br>

---

## 🏗️ Project Structure & Architecture

The repository enforces a strict modular boundary between logical execution (**Behavior Pack**) and visual rendering (**Resource Pack**):

```
Enderite Mod/
├── 📁 Enderite Mod BP/             # Behavior Pack (Logic, Scripts, Recipes, Entities)
│   ├── 📁 animation_controllers/  # State controllers (Teleportation, Charging logic)
│   ├── 📁 blocks/                 # Custom block definitions (Enderite Ore, Shulker Box)
│   ├── 📁 entities/               # Entity handlers (Enderite Shulker Box entity)
│   ├── 📁 feature_rules/          # Overworld & End generation rules
│   ├── 📁 features/               # Ore vein generation features
│   ├── 📁 functions/              # Utility commands and legacy fallback functions
│   ├── 📁 items/                  # Item components (Tools, Armor, Weapons, Elytra)
│   ├── 📁 loot_tables/            # Drop tables for ores, mobs, and chests
│   ├── 📁 recipes/                # Crafting, Blast Furnace & Charging recipes
│   ├── 📁 scripts/                # GameTest / Script API engine (JS/TS modules)
│   │   └── 📁 components/         # Modular script components (Void Floating, Armor Lore)
│   ├── 📁 structures/             # Pre-built NBT structure files
│   ├── 📁 texts/                  # Localization strings (EN, ES, etc.)
│   └── 📄 manifest.json           # BP UUID, versioning & dependencies (@minecraft/server 2.8.0)
│
├── 📁 Enderite Mod RP/             # Resource Pack (Models, Textures, Sound Registers)
│   ├── 📁 animation_controllers/  # Client-side state transitions
│   ├── 📁 animations/             # Entity & item animation keyframes
│   ├── 📁 attachables/            # 3D models for equipped gear (Armor, Elytra, Shield)
│   ├── 📁 entity/                 # Client render definitions
│   ├── 📁 models/                 # Bedrock 3D geometry JSONs
│   ├── 📁 render_controllers/     # Material and texture binding rules
│   ├── 📁 textures/               # Item sprites, block textures, and UI assets
│   ├── 📁 texts/                  # Client-side translation strings
│   ├── 📄 blocks.json             # Block texture & sound registry
│   ├── 📄 sounds.json             # Custom sound definitions
│   └── 📄 manifest.json           # RP UUID and client manifest metadata
│
└── 📄 Enderite Mod.code-workspace # VS Code unified multi-root workspace
```

<br>

---

## 💻 Local Development Setup

To develop and test live changes in Minecraft Bedrock without manual file copying:

### ⚙️ Prerequisites
* Windows 10/11 with **Minecraft Bedrock Edition** installed.
* [Visual Studio Code](https://code.visualstudio.com/) (recommended with Bedrock development extensions).
* **PowerShell** executed as **Administrator** (required to initialize symbolic links).

---

### 🔄 Symlink Workflow Architecture

This environment maps folders directly inside `com.mojang` to your local repository via **OS Symbolic Links**:

```
Minecraft engine loads packs from com.mojang:
                  │
                  ▼
com.mojang\development_behavior_packs\Enderite Mod BP  ──(Symlink)──► Local Repo\Enderite Mod BP
com.mojang\development_resource_packs\Enderite Mod RP  ──(Symlink)──► Local Repo\Enderite Mod RP
                                                                            ▲
                                                                  You edit here in VS Code!
```

> **Benefit**: Every save in VS Code updates Minecraft instantly. No export/import needed!

---

### 🚀 Setup Instructions

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ByCesarDev/Enderite-Mod.git
   ```

2. **Open PowerShell as Administrator** and create symlinks:
   ```powershell
   # Set the path to your cloned repository folder
   $repo = "C:\Users\TuUsuario\Desktop\Proyectos\Personales\Minecraft\AddOns\Enderite Mod"

   # Auto-detect com.mojang folder for Minecraft Bedrock (UWP)
   $comMojang = "$env:LOCALAPPDATA\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang"

   # Create Behavior Pack Symlink
   New-Item -ItemType SymbolicLink `
     -Path "$comMojang\development_behavior_packs\Enderite Mod BP" `
     -Value "$repo\Enderite Mod BP"

   # Create Resource Pack Symlink
   New-Item -ItemType SymbolicLink `
     -Path "$comMojang\development_resource_packs\Enderite Mod RP" `
     -Value "$repo\Enderite Mod RP"
   ```

3. Open `Enderite Mod.code-workspace` in VS Code and start coding!

<br>

---

## 🛑 Terms of Use & Licensing

* **Source Code**: Released under the [MIT License](https://opensource.org/licenses/MIT). You are free to inspect, learn from, and utilize code snippets for non-commercial educational purposes.
* **AddOn Distribution**: Re-uploading, modifying, or distributing this AddOn on third-party websites or using monetized link shorteners is strictly prohibited. Please link directly to our official distribution pages:
  * 🟢 [CurseForge Bedrock Page](https://www.curseforge.com/minecraft-bedrock/addons/enderite-mod)
  * 🟦 [MCPEDL Page](https://mcpedl.com/enderite-mod/)

---

<div align="center">

💬 **Need help or want to report a bug?**  
Join our community on [Discord](https://discord.com/invite/z5wshN7Xgm) or open an issue on the [GitHub Repository](https://github.com/ByCesarDev/Enderite-Mod/issues).

---

<b>Crafted with ❤️ by ByCesarDev & The Enderite Mod Team</b>

</div>