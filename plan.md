
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
| **P8-B3** | Unbreaking de armadura durante el vuelo y Mending sobre el daño lógico           | Pendiente                                                |
| **P8-C**  | Upgrade, fabricación de Combined y combinación de encantamientos                 | Pendiente                                                |
| **P8-D**  | Estado roto, validación visual y limpieza del sistema antiguo                     | Pendiente                                                |

**Revisión en curso de P8-B2**:
- `aad9bc8`: desgastes por golpes protegibles según fórmula Java `Math.floor(Math.max(1, damage / 4))` y Unbreaking de armadura.
- `9f848eb`: diferir escrituras fuera de `beforeEvents` mediante `system.run` para evitar errores de privilegio de ejecución.
- `a59b10d`: identidad persistente del proxy (`ed:elytra_id`), eliminación del consumo de desgaste en el tick loop y procesador único.
- Ajuste actual:
  - Eliminación de fallbacks por jugador: se exige identidad confirmada antes de admitir desgaste, impidiendo cualquier contaminación entre objetos.
  - Conservación de entradas en la cola hasta su aplicación efectiva (no se eliminan antes de encontrar el ítem; retries con expiración de seguridad).
  - Búsqueda y aplicación multientorno: pechera, inventario, objetos tirados en el suelo (`minecraft:item`), contenedores cercanos de bloques/entidades y transferencias a otros jugadores.
- Estado: P8-B2 queda en revisión técnica a la espera de validación funcional en Minecraft antes de avanzar a P8-B3.

Del seguimiento recuperado, **P5 figura cerrado y congelado**. Hemos avanzado por P6 y P7 hasta P8, pero no te marcaría esos bloques como “100 % cerrados” sin recuperar sus revisiones finales. La ubicación actual sí está clara: **validar P8-B2 → P8-B3 → P8-C → P8-D → P9**.
