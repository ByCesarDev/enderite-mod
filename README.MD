Tienes toda la razón, disculpa el despiste. Un repositorio de código en GitHub no es una tienda como CurseForge o MCPEDL; necesita un enfoque **técnico** para desarrolladores, colaboradores o para ti mismo en el futuro.

Debe incluir la arquitectura del proyecto, cómo compilarlo o probarlo, y separar el contenido del juego de los detalles técnicos.

Aquí tienes un `README.md` de nivel ingeniería, optimizado para un repositorio de un AddOn de Bedrock:

```markdown
# Enderite Mod — Minecraft Bedrock Edition AddOn

[![Minecraft Bedrock](https://img.shields.io/badge/Minecraft-Bedrock%20Edition-green?logo=minecraft)](https://minecraft.net)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Discord](https://img.shields.io/discord/544322432243224322?color=7289da&label=Discord&logo=discord)](https://discord.com/invite/z5wshN7Xgm)

Repositorio oficial de desarrollo del AddOn **Enderite Mod** para Minecraft Bedrock Edition. Este proyecto implementa un tier tecnológico superior al Netherite (Enderite) utilizando el framework nativo de Bedrock (`development_behavior_packs` y `development_resource_packs`).



## 🛠️ Project Structure & Architecture

El proyecto está estructurado dividiendo limpiamente las mecánicas lógicas de los componentes visuales:

```text
Enderite Mod/
├── Enderite Mod BP/            # Behavior Pack (Lógica, Recetas, Componentes de Ítems)
│   ├── animation_controllers/  # Controladores de estado (ej. Teletransporte/Carga de espada)
│   ├── items/                  # JSONs de definición de ítems (Enderite Tools, Armor, Bow)
│   ├── recipes/                # Recetas de crafteo y horno de fusión (Blast Furnace)
│   └── manifest.json           # Identificadores únicos (UUID) y dependencias del pack de comportamiento
│
├── Enderite Mod RP/            # Resource Pack (Texturas, Modelos, Renderizado)
│   ├── attachables/            # Modelos 3D de ítems equipados (Armaduras, Elytra, Escudo)
│   ├── items/                  # Registro visual y asignación de texturas de ítems
│   ├── textures/               # Sprites, texturas de bloques (Enderite Ore) y UI
│   └── manifest.json           # Identificadores únicos (UUID) del pack de recursos
│
└── Enderite Mod.code-workspace # Entorno de trabajo unificado para VS Code

```

---

## 🔬 Core Mechanics Implemented

* **Void Floating Engine:** Simulación de gravedad cero y flotación para entidades de ítems caídos en el vacío ($y < 0$), con persistencia tras la muerte del jugador.
* **Explosion-Triggered Mining:** Bloque de mineral (`Enderite Ore`) con alta resistencia que requiere un estado de "agrietado" detonado por explosivos (TNT/Camas) antes de permitir el minado con herramientas de Netherite.
* **Item State Custom Charging:** Mecánica interactiva en la Espada de Enderite que consume Ender Pearls al usar `Sneak + Right-click`, acumulando cargas en memoria (Max: 64) para ejecutar teletransportaciones vectoriales.
* **Dynamic Attachables:** Integración híbrida en el pecho (`Enderite Elytra Chestplate`) que combina propiedades de armadura pesada y propiedades de planeo dinámico nativo.

---

## 💻 Local Development Setup (Workflow)

Para desarrollar, testear o colaborar en este repositorio sin romper las rutas internas de Minecraft Bedrock:

### Requisitos previos

* Windows 10/11 con Minecraft Bedrock instalado.
* [Visual Studio Code](https://code.visualstudio.com/).

### Instalación del entorno en espejo

Este repositorio utiliza **Enlaces Simbólicos (Symlinks)** para mapear los archivos del workspace directamente a la carpeta `com.mojang` del juego. Esto permite editar el código en VS Code y ver los cambios reflejados en tiempo real en Minecraft al recargar el mundo.

1. Clona este repositorio en tu carpeta local de proyectos:
```bash
git clone [https://github.com/TU_USUARIO/Enderite-Mod.git](https://github.com/TU_USUARIO/Enderite-Mod.git)

```


2. Ejecuta **PowerShell como Administrador** y crea los puentes hacia el directorio del juego:
```powershell
# Mapear Behavior Pack
New-Item -ItemType SymbolicLink -Path "$env:LOCALAPPDATA\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\development_behavior_packs\Enderite Mod BP" -Value "C:\Ruta\A\Tu\Repo\Enderite Mod\Enderite Mod BP"

# Mapear Resource Pack
New-Item -ItemType SymbolicLink -Path "$env:LOCALAPPDATA\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\development_resource_packs\Enderite Mod RP" -Value "C:\Ruta\A\Tu\Repo\Enderite Mod\Enderite Mod RP"

```


3. Abre el archivo `Enderite Mod.code-workspace` en tu VS Code para empezar a programar.

---

## 🛑 Terms of Use & Licensing

* **Código Fuente:** Distribuido bajo la licencia [MIT](https://opensource.org/licenses/MIT). Siéntete libre de inspeccionar los JSONs para aprender cómo se estructuran los componentes.
* **Derechos del AddOn:** Queda estrictamente prohibida la modificación, clonación o redistribución de este AddOn completo en otras tiendas/páginas web mediante acortadores o enlaces directos. Por favor, comparte siempre los enlaces oficiales de distribución:
* [CurseForge Bedrock](https://www.curseforge.com/minecraft-bedrock/addons/enderite-mod)
* [MCPEDL](https://mcpedl.com/enderite-mod/)



---

💬 **Soporte y Feedback:** Si encuentras algún bug en los esquemas JSON o en las animaciones, abre un *Issue* en este repositorio o repórtalo en el [Servidor de Discord](https://discord.com/invite/z5wshN7Xgm).

```

### Cambios clave que lo hacen mejor para el repositorio:
1. **Badges técnicos:** Se añaden etiquetas visuales arriba que le dan estilo técnico (Versión de Bedrock, Licencia, Discord).
2. **Estructura de árbol de archivos:** Explica qué hace cada subcarpeta dentro del `BP` y del `RP` (ideal para entender el proyecto en un vistazo).
3. **Lenguaje de desarrollo:** Cambia descripciones comerciales por descripciones de ingeniería (ej. *"teletransportaciones vectoriales"*, *"acumulando cargas en memoria"*, *"esquemas JSON"*).
4. **Guía de entornos:** Explica exactamente cómo clonar el repositorio y cómo levantar los enlaces simbólicos de Windows usando variables de entorno globales (`$env:LOCALAPPDATA`), lo que hace que tu comando le sirva a cualquier programador que descargue tu proyecto.

```