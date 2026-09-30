Con la **worldgen actual**, las estrategias para Enderite quedarían bastante distintas a las de Netherita porque aquí el mineral **no puede minarse directamente** y además **nunca genera expuesto al aire**.

La estrategia más segura y eficiente sería usar **TNT dentro de islas gruesas del End**, no camas ni End Crystals.

Para **Large**, tu mejor capa es alrededor de **Y=20** porque genera entre `Y=8..32` con distribución triangular. Ahí es donde más te conviene abrir túneles horizontales. Para **Small**, como ahora genera uniforme entre `Y=8..96`, la mejor zona práctica suele ser donde haya mucho volumen de End Stone; si quieres buscar **Large + Small al mismo tiempo**, yo me quedaría aproximadamente entre **Y=18 y Y=28**.

La ruta segura sería algo así:

```text
1. Busca una isla gruesa del End.
2. Baja hasta ~Y20–24.
3. Haz un túnel horizontal de 2 bloques de alto.
4. Coloca TNT cada cierta distancia.
5. Retrocede detrás de una esquina o pared.
6. Detona.
7. La explosión:
   - elimina End Stone alrededor
   - revela Enderite
   - convierte Enderite normal → Cracked Enderite
8. Mina el Cracked con Netherite o Enderite Pickaxe.
```

Eso encaja especialmente bien con tu mecánica, porque la TNT no solo sirve para **encontrarlo**, sino que hace exactamente el paso obligatorio de progresión:

```text
Enderite Ore
   ↓ explosión
Cracked Enderite Ore
   ↓ pico
Cracked Enderite
```

Yo evitaría **camas** como método principal. Funcionan porque explotan en The End y tu script acepta cualquier fuente de explosión, pero son bastante más peligrosas: la explosión es más fuerte y tienes menos control sobre la posición. Lo mismo con Respawn Anchors y, peor todavía, End Crystals.

Así que pondría las estrategias en este orden:

| Método                                  |   Seguridad |                    Utilidad |
| ---------------------------------------- | ----------: | --------------------------: |
| **Túnel + TNT en Y20–24**        |     🟢 Alta |            🟢 Large + Small |
| Minería manual en Y20–24 + TNT puntual | 🟢 Muy alta |                  🟢 Precisa |
| Túneles en Y50–70                      |     🟢 Alta |     🟡 Principalmente Small |
| Beds                                     |    🟡 Media | 🟢 Rápidas pero peligrosas |
| Respawn Anchor                           |     🔴 Baja |      🟡 Caro/poco práctico |
| End Crystal                              | 🔴 Muy baja |                 🔴 Excesivo |

Hay otra estrategia buena si solo quieres **Small**: recorrer islas grandes y hacer túneles alrededor de **Y50–70**. Como Small ahora puede salir hasta Y96, esas alturas atraviesan muchísimo más End Stone que Y20, así que puedes encontrar bastantes Small. Pero ahí renuncias prácticamente a Large porque Large termina en Y32.

Por eso yo consideraría dos estilos claros para tu mod:

```text
"Deep End Mining"
Y18–28
→ Large + Small
→ TNT recomendada

"Island Mining"
Y50–70
→ principalmente Small
→ más terreno sólido y minería convencional
```

Y de los dos, **Y20–24 + TNT** sería el equivalente más cercano a la clásica minería de Netherita en Bedrock.
