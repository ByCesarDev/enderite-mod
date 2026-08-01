# Enderite Mod — Minecraft Bedrock Edition AddOn

[![Minecraft Bedrock](https://img.shields.io/badge/Minecraft-Bedrock%20Edition-green?logo=minecraft)](https://minecraft.net)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Discord](https://img.shields.io/badge/Discord-Join%20Server-7289da?logo=discord)](https://discord.com/invite/z5wshN7Xgm)

Repositorio oficial de desarrollo del AddOn **Enderite Mod** para Minecraft Bedrock Edition. Este proyecto implementa un tier tecnológico superior al Netherite (Enderite) utilizando el framework nativo de Bedrock (`development_behavior_packs` y `development_resource_packs`).

## 🛠️ Project Structure & Architecture

El proyecto está estructurado dividiendo limpiamente las mecánicas lógicas de los componentes visuales:

```
Enderite Mod/
├── Enderite Mod BP/            # Behavior Pack (Lógica, Recetas, Componentes de Ítems)
│   ├── animation_controllers/  # Controladores de estado (ej. Teletransporte/Carga de espada)
│   ├── blocks/                 # Definición de bloques personalizados (Enderite Ore, Shulker Box)
│   ├── entities/               # Entidades personalizadas (ej. Enderite Shulker Box entity)
│   ├── feature_rules/          # Reglas de generación de características en el mundo
│   ├── features/               # Características de generación (venas de mineral, estructuras)
│   ├── functions/              # Funciones mcfunction para lógica de comandos
│   ├── items/                  # JSONs de definición de ítems (Enderite Tools, Armor, Bow)
│   ├── loot_tables/            # Tablas de botín para bloques, entidades y cofres
│   ├── recipes/                # Recetas de crafteo y horno de fusión (Blast Furnace)
│   ├── scripts/                # Scripts de GameTest/Scripting API (TypeScript/JS)
│   ├── structures/             # Estructuras NBT exportadas
│   ├── texts/                  # Traducciones y cadenas de texto localizadas
│   ├── trading/                # Tablas de comercio de aldeanos
│   ├── worldgen/               # Configuración de generación del mundo
│   └── manifest.json           # Identificadores únicos (UUID) y dependencias del pack
│
├── Enderite Mod RP/            # Resource Pack (Texturas, Modelos, Renderizado)
│   ├── animation_controllers/  # Controladores de animación del lado cliente
│   ├── animations/             # Definiciones de animaciones de entidades/ítems
│   ├── attachables/            # Modelos 3D de ítems equipados (Armaduras, Elytra, Escudo)
│   ├── entity/                 # Definiciones de renderizado de entidades (cliente)
│   ├── models/                 # Geometrías 3D (formato bedrock geo)
│   ├── render_controllers/     # Controladores de renderizado y materiales
│   ├── textures/               # Sprites, texturas de bloques (Enderite Ore) y UI
│   ├── texts/                  # Traducciones del lado de recursos
│   ├── blocks.json             # Registro de sonidos y texturas de bloques
│   ├── sounds.json             # Registro de efectos de sonido personalizados
│   └── manifest.json           # Identificadores únicos (UUID) del pack de recursos
│
└── Enderite Mod.code-workspace # Entorno de trabajo unificado para VS Code
```

---

## 🔬 Core Mechanics Implemented

* **Void Floating Engine:** Simulación de gravedad cero y flotación para entidades de ítems caídos en el vacío ($y < 0$), con persistencia tras la muerte del jugador.
* **Explosion-Triggered Mining:** Bloque de mineral (`Enderite Ore`) con alta resistencia que requiere un estado de "agrietado" detonado por explosivos (TNT/Camas) antes de permitir el minado con herramientas de Netherite.
* **Enderite Shulker Box System:** Implementación completa del bloque e interfaz de Shulker Box de Enderite (`ed:enderite_shulker_box`), con compatibilidad de tolvas y renderizado 3D.
* **Full Item State Preservation:** Persistencia total de durabilidad/daño, encantamientos (`enchantable`), nombres personalizados de yunque (`nameTag`) y lore dinámico al romper y volver a colocar cajas de Shulker.
* **Item State Custom Charging:** Mecánica interactiva en la Espada de Enderite que consume Ender Pearls al usar `Sneak + Right-click`, acumulando cargas en memoria (Max: 64) para ejecutar teletransportaciones vectoriales.
* **Dynamic Attachables:** Integración híbrida en el pecho (`Enderite Elytra Chestplate`) que combina propiedades de armadura pesada y propiedades de planeo dinámico nativo.

---

## 💻 Local Development Setup (Workflow)

Para desarrollar, testear o colaborar en este repositorio sin romper las rutas internas de Minecraft Bedrock:

### Requisitos previos

* Windows 10/11 con Minecraft Bedrock instalado.
* [Visual Studio Code](https://code.visualstudio.com/).
* PowerShell ejecutado **como Administrador** (necesario para crear symlinks).

### ¿Cómo funciona el entorno en espejo?

Este repositorio utiliza **Enlaces Simbólicos (Symlinks)** — punteros a nivel del sistema operativo que hacen que una carpeta en `com.mojang` **sea físicamente la misma** que la carpeta del repo, sin duplicar archivos.

```
Minecraft carga los packs desde com.mojang\...
        │
        ▼
com.mojang\development_behavior_packs\Enderite Mod BP  ──(symlink)──► Desktop\...\Enderite Mod BP
com.mojang\development_resource_packs\Enderite Mod RP  ──(symlink)──► Desktop\...\Enderite Mod RP
                                                                               ▲
                                                              Tú editas aquí en VS Code
```

**Ventaja:** editas un archivo en VS Code → guardas → Minecraft ya tiene el cambio. Sin copiar, sin sincronizar.

### Instalación

1. Clona este repositorio en tu carpeta local de proyectos:

```bash
git clone https://github.com/ByCesarDev/Enderite-Mod.git
```

2. Ejecuta **PowerShell como Administrador** y crea los symlinks, ajustando la ruta del repo a donde lo clonaste:

```powershell
# Reemplaza <RUTA_DEL_REPO> con la ruta donde clonaste el repositorio
# Ejemplo: C:\Users\TuUsuario\Desktop\Proyectos\Minecraft\Enderite Mod
$repo = "<RUTA_DEL_REPO>"

# Detectar la carpeta com.mojang automáticamente según la instalación
# Opción A — Minecraft Bedrock estándar (Microsoft Store / UWP)
$comMojang = "$env:LOCALAPPDATA\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang"

# Opción B — Minecraft Bedrock Preview / instalación alternativa
# $comMojang = "$env:APPDATA\Minecraft Bedrock\Users\Shared\games\com.mojang"

# Crear symlink del Behavior Pack
New-Item -ItemType SymbolicLink `
  -Path "$comMojang\development_behavior_packs\Enderite Mod BP" `
  -Value "$repo\Enderite Mod BP"

# Crear symlink del Resource Pack
New-Item -ItemType SymbolicLink `
  -Path "$comMojang\development_resource_packs\Enderite Mod RP" `
  -Value "$repo\Enderite Mod RP"
```

> **Nota:** Si ves un error de acceso denegado, asegúrate de abrir PowerShell como Administrador.  
> Si ya existe la carpeta en `com.mojang`, bórrala antes de ejecutar el comando.

3. Abre el archivo `Enderite Mod.code-workspace` en VS Code para empezar a programar.

---

## 🛑 Terms of Use & Licensing

* **Código Fuente:** Distribuido bajo la licencia [MIT](https://opensource.org/licenses/MIT). Siéntete libre de inspeccionar los JSONs para aprender cómo se estructuran los componentes.
* **Derechos del AddOn:** Queda estrictamente prohibida la modificación, clonación o redistribución de este AddOn completo en otras tiendas/páginas web mediante acortadores o enlaces directos. Por favor, comparte siempre los enlaces oficiales de distribución:
  * [CurseForge Bedrock](https://www.curseforge.com/minecraft-bedrock/addons/enderite-mod)
  * [MCPEDL](https://mcpedl.com/enderite-mod/)

---

💬 **Soporte y Feedback:** Si encuentras algún bug en los esquemas JSON o en las animaciones, abre un *Issue* en este repositorio o repórtalo en el [Servidor de Discord](https://discord.com/invite/z5wshN7Xgm).