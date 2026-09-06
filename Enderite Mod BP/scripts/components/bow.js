import { system, world, EntityEquippableComponent, EquipmentSlot, ItemStack } from "@minecraft/server";

const BOW_DEBUG = true;

function debug(message) {
    if (BOW_DEBUG) {
        console.warn(`[Enderite Bow] ${message}`);
    }
}

const BOW_TYPES = new Set(["ed:enderite_bow", "ed:enderite_cross_bow"]);
const VIRTUAL_ARROW_LORE = "§5Infinity Arrow§r";

// Rastrear el tick exacto en que el jugador comenzó a tensar el arco
const playerDrawStartMap = new Map(); // playerId -> startTick

// Intenciones de disparo de arco pendientes hasta que se confirma la aparición del proyectil en el mundo
const pendingBowShots = new Map(); // playerId -> { shooterId, shooterName, weaponTypeId, chargeRatio, isCritical, powerLevel, infinityLevel, fireTick, location, dimensionId }

// Registro del disparo por ID de proyectil (projectile.id -> ShotData)
// Desacoplado del jugador para que disparos consecutivos o a larga distancia conserven sus datos exactos
export const projectileShotMap = new Map(); // projectileId -> ShotData

// Compatibilidad retroactiva si algún script externo consulta lastShotData
export const lastShotData = new Map(); // playerId -> ShotData

/**
 * Obtiene los datos de disparo asociados a un proyectil específico.
 */
export function getProjectileShotData(projectileId) {
    if (!projectileId) return undefined;
    return projectileShotMap.get(projectileId);
}

/**
 * Obtiene y elimina los datos de disparo asociados a un proyectil (limpieza automática).
 */
export function consumeProjectileShotData(projectileId) {
    if (!projectileId) return undefined;
    const data = projectileShotMap.get(projectileId);
    projectileShotMap.delete(projectileId);
    return data;
}

/**
 * Curva exacta de Enderite Bow Java v1.9.1:
 * float f = (float) useTicks / EnderiteMod.CONFIG.tools.enderiteBowChargeTime; // default 30 ticks
 * f = (f * f + f * 2.0F) / 3.0F;
 * if (f > 1.0F) f = 1.0F;
 */
export function getEnderiteBowPower(ticks) {
    let f = ticks / 30.0;
    f = (f * f + f * 2.0) / 3.0;
    return Math.min(Math.max(f, 0.1), 1.0);
}

/**
 * Descuenta durabilidad del arma equipada respetando el encantamiento Unbreaking.
 */
function applyWeaponDurabilityDamage(player, weaponTypeId) {
    if (!player) return;
    try {
        const gm = player.getGameMode();
        if (String(gm).toLowerCase() === "creative") {
            debug(`Player ${player.name} is in creative mode; skipping durability cost.`);
            return;
        }
    } catch (e) {}

    system.run(() => {
        try {
            const eq = player.getComponent(EntityEquippableComponent.componentId);
            if (!eq) return;

            let slot = EquipmentSlot.Mainhand;
            let currentItem = eq.getEquipment(slot);
            if (!currentItem || currentItem.typeId !== weaponTypeId) {
                slot = EquipmentSlot.Offhand;
                currentItem = eq.getEquipment(slot);
                if (!currentItem || currentItem.typeId !== weaponTypeId) return;
            }

            const durability = currentItem.getComponent("durability");
            if (!durability) return;

            // Soporte para Unbreaking: probabilidad de consumir durabilidad = 1 / (unbreaking + 1)
            const ench = currentItem.getComponent("enchantable");
            const unbreaking = ench?.getEnchantment?.("unbreaking")?.level ?? 0;
            if (unbreaking > 0 && Math.random() > (1 / (unbreaking + 1))) {
                debug(`Unbreaking ${unbreaking} triggered: durability damage avoided on ${currentItem.typeId}.`);
                return;
            }

            if (durability.damage + 1 >= durability.maxDurability) {
                debug(`${currentItem.typeId} broke! (${durability.damage + 1} / ${durability.maxDurability})`);
                player.dimension.playSound("random.break", player.location);
                eq.setEquipment(slot, undefined);
            } else {
                durability.damage += 1;
                eq.setEquipment(slot, currentItem);
                debug(`Applied 1 durability damage to ${currentItem.typeId} (${durability.damage}/${durability.maxDurability}).`);
            }
        } catch (e) {
            debug(`Error updating durability in system.run: ${e}`);
        }
    });
}

// 1. Detección de inicio de tensado del arco (itemStartUse / itemUse)
world.afterEvents.itemStartUse.subscribe((event) => {
    try {
        const player = event.source;
        const item = event.itemStack;
        if (!item || !player) return;

        if (item.typeId === "ed:enderite_bow") {
            playerDrawStartMap.set(player.id, system.currentTick);
        }
    } catch (e) {}
});

world.afterEvents.itemUse.subscribe((event) => {
    try {
        const player = event.source;
        const item = event.itemStack;
        if (!item || !player) return;

        if (item.typeId === "ed:enderite_bow") {
            if (!playerDrawStartMap.has(player.id)) {
                playerDrawStartMap.set(player.id, system.currentTick);
            }
            debug(`Player ${player.name} started drawing ${item.typeId}. Triggering animation.`);
            try {
                if (typeof player.playAnimation === "function") {
                    player.playAnimation("animation.weapons.bow_and_arrow", {
                        blendOutTime: 0.001,
                        stopExpression: "!query.is_using_item"
                    });
                } else {
                    player.runCommandAsync('playanimation @s animation.weapons.bow_and_arrow root 0.001 "!query.is_using_item"');
                }
            } catch (e) {
                try {
                    player.runCommandAsync('playanimation @s animation.weapons.bow_and_arrow root 0.001 "!query.is_using_item"');
                } catch (err) {}
            }
        }
    } catch (e) {
        debug(`Error in itemUse: ${e}`);
    }
});

// 2. Liberación del arco (itemStopUse) - Exclusivo para ed:enderite_bow
world.afterEvents.itemStopUse.subscribe((event) => {
    try {
        const player = event.source;
        const item = event.itemStack;

        // Solo procesamos el arco en itemStopUse. La ballesta (charge_on_draw) se procesa al disparar (entitySpawn).
        if (!item || !player || item.typeId !== "ed:enderite_bow") return;

        // Calcular tiempo real transcurrido mediante ticks del servidor
        const startTick = playerDrawStartMap.get(player.id);
        playerDrawStartMap.delete(player.id);

        // Sin número mágico 2e9: si no tenemos registro del tick inicial, descartar limpiamente
        if (startTick === undefined) {
            debug(`No startTick recorded for ${player.name}; ignoring release.`);
            return;
        }

        const elapsedTicks = Math.max(1, system.currentTick - startTick);
        debug(`Player ${player.name} released ${item.typeId} (charge: ${elapsedTicks} ticks).`);

        // Si fue una cancelación inmediata (sin tensado efectivo < 6 ticks), no se dispara flecha
        if (elapsedTicks < 6) {
            debug(`Shot cancelled or duration too short (${elapsedTicks} < 6 ticks); no arrow fired.`);
            return;
        }

        // Leer encantamientos del arco sostenido
        const equippable = player.getComponent(EntityEquippableComponent.componentId);
        const mainhand = equippable?.getEquipment(EquipmentSlot.Mainhand);
        const heldItem = (mainhand?.typeId === item.typeId) ? mainhand : item;

        const enchantable = heldItem?.getComponent("enchantable");
        const powerLevel = enchantable?.getEnchantment?.("power")?.level ?? 0;
        const infinityLevel = enchantable?.getEnchantment?.("infinity")?.level ?? 0;

        // Curva exacta de Java (30 ticks cuadrática)
        const chargeRatio = getEnderiteBowPower(elapsedTicks);
        // Crítico determinístico al 100% de carga
        const isCritical = chargeRatio >= 1.0;

        // Registrar intención de disparo pendiente hasta que entitySpawn confirme que el proyectil apareció
        pendingBowShots.set(player.id, {
            shooterId: player.id,
            shooterName: player.name,
            weaponTypeId: "ed:enderite_bow",
            chargeRatio,
            isCritical,
            powerLevel,
            infinityLevel,
            fireTick: system.currentTick,
            location: { x: player.location.x, y: player.location.y, z: player.location.z },
            dimensionId: player.dimension.id
        });

        debug(`Registered pending bow shot for ${player.name}: charge=${chargeRatio.toFixed(2)}, crit=${isCritical}, power=${powerLevel}, infinity=${infinityLevel}`);
    } catch (e) {
        debug(`Error in itemStopUse: ${e}`);
    }
});

// 3. Confirmación de disparo al aparecer la flecha en el mundo (entitySpawn)
world.afterEvents.entitySpawn.subscribe((event) => {
    try {
        const entity = event.entity;
        if (entity?.typeId !== "ed:arrow_enderite") return;

        // 1. Identificar al tirador
        let shooter = null;
        try {
            const projComp = entity.getComponent("minecraft:projectile");
            if (projComp && projComp.owner) {
                shooter = projComp.owner;
            }
        } catch (e) {}

        // Si no está disponible en projComp.owner, buscar al jugador más cercano en la misma dimensión
        if (!shooter) {
            const entityLoc = entity.location;
            const dim = entity.dimension;
            let closestDistSq = 25.0; // radio de búsqueda: 5 bloques
            for (const p of dim.getPlayers()) {
                const dx = p.location.x - entityLoc.x;
                const dy = p.location.y - entityLoc.y;
                const dz = p.location.z - entityLoc.z;
                const distSq = dx * dx + dy * dy + dz * dz;
                if (distSq < closestDistSq) {
                    closestDistSq = distSq;
                    shooter = p;
                }
            }
        }

        if (!shooter) {
            debug(`Spawned ed:arrow_enderite (id: ${entity.id}) without detectable shooter; using default shot data.`);
            projectileShotMap.set(entity.id, {
                projectileId: entity.id,
                shooterId: "unknown",
                shooterName: "unknown",
                weaponTypeId: "ed:enderite_bow",
                chargeRatio: 1.0,
                isCritical: true,
                powerLevel: 0,
                infinityLevel: 0,
                fireTick: system.currentTick
            });
            return;
        }

        // 2. Determinar si el disparo provino de Bow pendiente o de Crossbow
        const pending = pendingBowShots.get(shooter.id);
        let shotData;

        if (pending && (system.currentTick - pending.fireTick) <= 5) {
            // Confirmación de disparo de ARCO
            pendingBowShots.delete(shooter.id);

            shotData = {
                projectileId: entity.id,
                shooterId: shooter.id,
                shooterName: shooter.name,
                weaponTypeId: "ed:enderite_bow",
                chargeRatio: pending.chargeRatio,
                isCritical: pending.isCritical,
                powerLevel: pending.powerLevel,
                infinityLevel: pending.infinityLevel,
                fireTick: system.currentTick
            };

            debug(`Confirmed Bow shot for ${shooter.name} (projId: ${entity.id}): charge=${shotData.chargeRatio.toFixed(2)}, crit=${shotData.isCritical}, power=${shotData.powerLevel}, infinity=${shotData.infinityLevel}`);

            // Descontar durabilidad del arco únicamente ahora que la flecha fue disparada
            applyWeaponDurabilityDamage(shooter, "ed:enderite_bow");

            // Si el arco tenía Infinity, aislarlo estrictamente a este proyectil y reembolsar la munición
            if (shotData.infinityLevel > 0) {
                entity.addTag("infinity_arrow");
                debug(`Tagged projectile ${entity.id} as 'infinity_arrow' strictly for ${shooter.name}.`);

                let isCreative = false;
                try {
                    const gm = shooter.getGameMode();
                    isCreative = String(gm).toLowerCase() === "creative";
                } catch (e) {}

                if (!isCreative) {
                    try {
                        const inv = shooter.getComponent("inventory")?.container;
                        if (inv) {
                            inv.addItem(new ItemStack("ed:enderite_arrow", 1));
                            debug(`Infinity safely refunded 1 ed:enderite_arrow to ${shooter.name}.`);
                        }
                    } catch (e) {
                        debug(`Error refunding arrow for Infinity: ${e}`);
                    }
                }
            }
        } else {
            // No hay intención pendiente de arco: verificar si el tirador disparó con Crossbow
            const eq = shooter.getComponent(EntityEquippableComponent.componentId);
            const mainhand = eq?.getEquipment(EquipmentSlot.Mainhand);
            const offhand = eq?.getEquipment(EquipmentSlot.Offhand);
            const isCrossbow = (mainhand?.typeId === "ed:enderite_cross_bow") || (offhand?.typeId === "ed:enderite_cross_bow");

            if (isCrossbow) {
                // Confirmación de disparo de BALLESTA
                shotData = {
                    projectileId: entity.id,
                    shooterId: shooter.id,
                    shooterName: shooter.name,
                    weaponTypeId: "ed:enderite_cross_bow",
                    chargeRatio: 1.0,
                    isCritical: false,
                    powerLevel: 0,
                    infinityLevel: 0,
                    fireTick: system.currentTick
                };

                debug(`Confirmed Crossbow shot for ${shooter.name} (projId: ${entity.id}).`);

                // Descontar durabilidad de la ballesta únicamente al disparar
                applyWeaponDurabilityDamage(shooter, "ed:enderite_cross_bow");
            } else {
                // Fallback si no se detectó el arma
                shotData = {
                    projectileId: entity.id,
                    shooterId: shooter.id,
                    shooterName: shooter.name,
                    weaponTypeId: "ed:enderite_bow",
                    chargeRatio: 1.0,
                    isCritical: true,
                    powerLevel: 0,
                    infinityLevel: 0,
                    fireTick: system.currentTick
                };
            }
        }

        // 3. Vincular los datos de disparo directamente al ID del proyectil
        projectileShotMap.set(entity.id, shotData);
        lastShotData.set(shooter.id, shotData);
    } catch (e) {
        debug(`Error in entitySpawn: ${e}`);
    }
});

// 4. Impacto en bloque: destruir flechas Infinity y limpiar estado
world.afterEvents.projectileHitBlock.subscribe((event) => {
    try {
        const proj = event.projectile;
        if (proj?.typeId === "ed:arrow_enderite") {
            if (proj.hasTag("infinity_arrow")) {
                proj.remove();
                debug(`Removed infinity arrow upon block impact (cannot be duplicated/farmed).`);
            }
            projectileShotMap.delete(proj.id);
        }
    } catch (e) {}
});

// 5. Paridad Infinity con 0 flechas en inventario:
// Si el jugador sostiene un arco con Infinity y tiene 0 flechas, se le otorga 1 flecha virtual protegida con lockMode "inventory".
// Esta flecha virtual no se puede soltar (Q), ni meter en cofres/embudos, y se retira automáticamente al desequipar el arco.
system.runInterval(() => {
    try {
        for (const player of world.getAllPlayers()) {
            const eq = player.getComponent(EntityEquippableComponent.componentId);
            const mainhand = eq?.getEquipment(EquipmentSlot.Mainhand);
            const offhand = eq?.getEquipment(EquipmentSlot.Offhand);

            let heldBow = null;
            if (mainhand?.typeId === "ed:enderite_bow") heldBow = mainhand;
            else if (offhand?.typeId === "ed:enderite_bow") heldBow = offhand;

            const ench = heldBow?.getComponent("enchantable");
            const hasInfinity = (ench?.getEnchantment?.("infinity")?.level ?? 0) > 0;

            const inv = player.getComponent("inventory")?.container;
            if (!inv) continue;

            let realArrowCount = 0;
            let virtualArrowSlot = -1;

            for (let i = 0; i < inv.size; i++) {
                const item = inv.getItem(i);
                if (item?.typeId === "ed:enderite_arrow") {
                    const lore = item.getLore();
                    if (lore && lore.includes(VIRTUAL_ARROW_LORE)) {
                        virtualArrowSlot = i;
                    } else {
                        realArrowCount += item.amount;
                    }
                }
            }

            if (hasInfinity && realArrowCount === 0) {
                if (virtualArrowSlot === -1) {
                    const vArrow = new ItemStack("ed:enderite_arrow", 1);
                    try {
                        vArrow.lockMode = "inventory";
                    } catch (e) {}
                    vArrow.setLore([VIRTUAL_ARROW_LORE]);
                    inv.addItem(vArrow);
                    debug(`Granted protected virtual arrow to ${player.name} (0 arrows + Infinity).`);
                }
            } else {
                if (virtualArrowSlot !== -1) {
                    inv.setItem(virtualArrowSlot, undefined);
                    debug(`Removed virtual arrow from ${player.name} (no longer needed).`);
                }
            }
        }
    } catch (e) {}
}, 10);

// 6. Limpieza periódica de proyectiles obsoletos (> 60 segundos) para prevenir acumulación en memoria
system.runInterval(() => {
    try {
        const currentTick = system.currentTick;
        for (const [id, data] of projectileShotMap.entries()) {
            if (currentTick - data.fireTick > 1200) {
                projectileShotMap.delete(id);
            }
        }
        for (const [playerId, pending] of pendingBowShots.entries()) {
            if (currentTick - pending.fireTick > 100) {
                pendingBowShots.delete(playerId);
            }
        }
    } catch (e) {}
}, 200);
