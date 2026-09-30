
Sí bro.  **El plan completo tiene 15 pasos** , con el objetivo de llevar nuestro port Bedrock a **paridad con Enderite Java 1.9.1** y publicar  **v2.0.0** .

La regla que acordamos: **Java define el comportamiento, contenido y progresión; Bedrock define cómo lo implementamos.** Lo que Bedrock obligue a hacer diferente se documenta como adaptación. Lo que sí pueda reproducirse y todavía falle sigue siendo pendiente o bug.

Estas son las referencias congeladas:

| Referencia         | Versión        | Commit                                       |
| ------------------ | --------------- | -------------------------------------------- |
| Java objetivo      | **1.9.1** | `b9bc4acb8da646d650c626423b6fddce2d761289` |
| Bedrock de partida | **1.1.5** | `780483e8fde12496965382e21ff3af96ac646120` |
| Release prevista   | **2.0.0** | Al completar y validar la paridad            |

La hoja de ruta completa:

| Paso          | Bloque                           | Alcance                                                                                                            |
| ------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **P1**  | Matriz de paridad                | Comparar Java con Bedrock y clasificar cada característica como`Exact`,`Adapted`,`Missing`o`Bugged`.      |
| **P2**  | Infraestructura                  | Constantes, estado persistente de objetos, logger, utilidades de colisiones y base para GameTests.                 |
| **P3**  | Enderman, Bow y Crossbow         | Reproducir las mecánicas de proyectiles Enderite y su interacción con Endermen.                                  |
| **P4**  | Sword y Shield                   | Mecánicas de espada y escudo, incluyendo los niveles/capacidades**16/32/48/64** .                           |
| **P5**  | Void Floating y Enderite Trim    | Flotación/protección correspondiente, encantamiento simulado e interacción con el trim.                         |
| **P6**  | Armor y Toughness                | Armadura completa: protección, dureza, knockback, reparación y encantamientos; comparar resultados Bedrock/Java. |
| **P7**  | Ore, Worldgen y Explosion        | Mineral, generación en el End y comportamiento ante explosiones.                                                  |
| **P8**  | Elytra                           | Separated y Combined: vuelo, protección, durabilidad, encantamientos, fabricación y estados visuales.            |
| **P9**  | Shulker y Respawn Anchor         | Reproducir las funciones de la Shulker de Enderite y del ancla de reaparición.                                    |
| **P10** | Shears y personalización        | Tijeras, decoraciones del escudo, Upgrade Template y trims.                                                        |
| **P11** | Contenido restante de Java 1.9.x | Spear, Horse Armor, Nautilus Armor y las demás características faltantes.                                        |
| **P12** | Configuración                   | Crear una configuración equivalente a la de Java dentro de las posibilidades de Bedrock.                          |
| **P13** | GameTests                        | Suite de pruebas basada en los tests Java para comprobar las mecánicas y detectar regresiones.                    |
| **P14** | Auditoría final de paridad      | Revisar toda la matriz y resolver diferencias pendientes frente a Java 1.9.1.                                      |
| **P15** | Release                          | Congelar el código validado y preparar**v2.0.0** .                                                          |

 **Ahora mismo estamos en P8** , que dividimos así:

| Subpaso         | Alcance                                                                            | Estado confirmado                                        |
| --------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **P8-A**  | Proxy`minecraft:elytra`, estado de durabilidad y puente visual                   | Implementado; los ajustes de durabilidad continúan en B |
| **P8-B1** | Protección de Combined:**9 Armor + 4 Toughness + 0.1 KB**                   | **Aprobado** , commit`1321279`                   |
| **P8-B2** | Desgaste por golpes protegibles, Unbreaking de armadura para esos golpes y ruptura | **En revisión (aprobación parcial del código, pendiente de pruebas in-game)** |
| **P8-B3** | Unbreaking de armadura durante el vuelo y Mending sobre el daño lógico           | **En revisión (aprobación parcial del código, pendiente de pruebas in-game)** |
| **P8-C**  | Upgrade, fabricación de Combined y combinación de encantamientos                 | **Implementado (C1–C6 completos, pendiente de validación in-game)**  |
| **P8-D**  | Estado roto, validación visual y limpieza del sistema antiguo                     | Pendiente                                                |

**Seguimiento de P8-C (Conversión, Smithing y Combined Crafting)**:
- **P8-C1** (Implementado - `5e02d27`): Durabilidad y compatibilidad de encantamientos alineadas para los 9 clones (`ed:bow`, `ed:crossbow`, `ed:elytra`, `ed:netherite_axe`, `ed:netherite_hoe`, `ed:netherite_pickaxe`, `ed:netherite_shovel`, `ed:netherite_sword`, `ed:shears`).
- **P8-C2** (Implementado - `5174687`): Módulo centralizado `scripts/components/item_conversion.js` con transferencia sin pérdidas de daño, niveles de encantamiento, nombre personalizado, lore, propiedades dinámicas (excluyendo proxies internos) y flags de inventario (`lockMode`, `keepOnDeath`). Validación estricta 1:1 antes de reemplazar. Exclusión crítica de proxies de vuelo `minecraft:elytra` con `ed:elytra_variant`.
- **P8-C3** (Implementado - `5174687`): Interacción fiable agachándose (`isSneaking`) e interactuando sobre Mesa de Herrería (`minecraft:smithing_table`). Cancelación del menú nativo, debounce de 400ms, captura y revalidación de ranura/ítem, y escritura segura diferida con `system.run`.
- **P8-C4** (Implementado - `5174687`): Eliminación de las 18 recetas shapeless de ida y vuelta que destruían encantamientos y desgaste. Retención de clones y recetas de herrería para Enderite.
- **P8-C5** (Implementado - `1565ed2`): Módulo `scripts/components/combined_crafting.js` con receta especial de Java (`EnderiteElytraSpecialRecipe`): ingredientes pechera (`ed:enderite_chestplate`) + planeador equivalente (`minecraft:elytra`, `ed:elytra`, `elytra:enderite`, `elytra:enderite_broken`), daño 0, nombre no heredado, fusión estricta de encantamientos (diferentes preservados, mismo nivel +1 hasta máx, diferentes niveles conserva mayor), resolución estricta con `EnchantmentTypes.get(id)`, preservación de trims, y formulario modal (`ActionFormData`) interactivo al agacharse sobre Mesa de Trabajo (`minecraft:crafting_table`). Retirada la receta shapeless antigua para evitar pérdida de datos en mesa 3x3.
- **P8-C6** (Implementado): Persistencia completa de encantamientos de armadura en transiciones `customItem` ↔ `proxy` (`ed:elytra_stored_enchants`), resolución nativa con `EnchantmentTypes.get(id)`. Compatibilidad nativa de `elytra:chesplate` y `elytra:chesplate_broken` actualizada con slot `"armor_torso"`. Cálculo e integración de reducción de daño por Protección (`getCombinedElytraProtectionEpf`) en `armor.js` durante el vuelo o equipamiento del proxy. Corrección del renderizado visual en `attachables/elytras.json` para que `minecraft:elytra` renderice su modelo vanilla por defecto y diagnósticos activos de typeId en barra y registro.

**Revisión en curso de P8-B2 & P8-B3**:
- **P8-B2**:
  - `aad9bc8`: desgastes por golpes protegibles según fórmula Java `Math.floor(Math.max(1, damage / 4))` y Unbreaking de armadura.
  - `9f848eb`: diferir escrituras fuera de `beforeEvents` mediante `system.run` para evitar errores de privilegio de ejecución.
  - `a59b10d`: identidad persistente del proxy (`ed:elytra_id`), eliminación del consumo de desgaste en el tick loop y procesador único.
  - `82cd486`: eliminación total de fallbacks por jugador, retención de entradas en cola hasta aplicación efectiva y búsqueda multientorno (pechera, inventario, suelo, contenedores, otros jugadores).
- **P8-B3**:
  - Desgaste determinista de vuelo cada 20 ticks (1 s) de planeo (`player.isGliding`) en modo supervivencia/aventura.
  - Unbreaking de armadura en Combined durante el vuelo: `0.6 + 0.4 / (level + 1)` (paridad Java al pertenecer a `#enderitemod:enderite_armor`), mientras Separated utiliza la fórmula de herramienta/élitros `1.0 / (level + 1)`.
  - Mending sobre `ed:elytra_damage`: intercepta la ganancia de experiencia (`totalExperience`) y repara a razón de 2 puntos de durabilidad por cada 1 XP consumido, deduciendo el XP del jugador.
  - Mending sobre élitros rotos equipados: restaura la pieza fuera del estado roto (`_broken`) al recuperar durabilidad por debajo del umbral de 1023.
  - Corrección de `ent.isValid` y actualización de entidades de ítems en el suelo (spawn + impulse + remove).

Del seguimiento recuperado, **P5 figura cerrado y congelado**. Hemos avanzado por P6 y P7 hasta P8, pero no te marcaría esos bloques como “100 % cerrados” sin recuperar sus revisiones finales. La ubicación actual sí está clara: **validar P8-B → avanzar a P8-C → P8-D → P9**.
