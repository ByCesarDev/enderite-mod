import { system, world, EntityEquippableComponent, EquipmentSlot, ItemStack } from "@minecraft/server";

const BOW_DEBUG = true;

function debug(message) {
    if (BOW_DEBUG) {
        console.warn(`[Enderite Bow] ${message}`);
    }
}

const BOW_TYPES = new Set(["ed:enderite_bow", "ed:enderite_cross_bow"]);
const VIRTUAL_ARROW_LORE = "§5Infinity Arrow§r";

// Rastrear el estado activo de tensado del arco por jugador (fuente de verdad independiente de eventos)
export const playerDrawState = new Map(); // playerId -> { startTick, weaponTypeId, powerLevel, infinityLevel, shooterName }

// Rastrear el último disparo con ballesta para agrupar Multishot y deducir durabilidad una sola vez por gatillazo
const crossbowFireMap = new Map(); // playerId -> fireTick

export const projectileShotMap = new Map(); // projectileId -> ShotData

// Rastreo de proyectiles críticos activos en vuelo para emisión de partículas
const activeCritProjectiles = new Map(); // projectileId -> Entity

// Rastreo de flechas clavadas en bloques para recolección vanilla segura
const stuckPickableArrows = new Map(); // projectileId -> { projectile, dimension, stickTick }

// Loop de partículas críticas (1 tick): emite minecraft:basic_crit_particle durante el vuelo
system.runInterval(() => {
    try {
        for (const [id, proj] of activeCritProjectiles.entries()) {
            if (!isEntityValid(proj)) {
                activeCritProjectiles.delete(id);
                continue;
            }

            let speedSq = 1;
            try {
                const vel = proj.getVelocity();
                speedSq = vel.x * vel.x + vel.y * vel.y + vel.z * vel.z;
            } catch (e) {}

            if (speedSq < 0.05 || proj.isOnGround) {
                activeCritProjectiles.delete(id);
                continue;
            }

            try {
                proj.dimension.spawnParticle("minecraft:basic_crit_particle", proj.location);
            } catch (e) {
                activeCritProjectiles.delete(id);
            }
        }
    } catch (e) {}
}, 1);

const isEntityValid = (e) => Boolean(e && (typeof e.isValid === 'function' ? e.isValid() : e.isValid));

/**
 * Helper para leer encantamientos de Power e Infinity del arco sostenido en mano principal u offhand.
 */
function getPlayerHeldBowEnchantments(player, item) {
    try {
        const equippable = player.getComponent(EntityEquippableComponent.componentId);
        const mainhand = equippable?.getEquipment(EquipmentSlot.Mainhand);
        const offhand = equippable?.getEquipment(EquipmentSlot.Offhand);
        const heldItem = (mainhand?.typeId === item?.typeId) ? mainhand : ((offhand?.typeId === item?.typeId) ? offhand : item);
        const enchantable = heldItem?.getComponent("enchantable");
        const powerLevel = enchantable?.getEnchantment?.("power")?.level ?? 0;
        const infinityLevel = enchantable?.getEnchantment?.("infinity")?.level ?? 0;
        return { powerLevel, infinityLevel };
    } catch (e) {
        return { powerLevel: 0, infinityLevel: 0 };
    }
}

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
 * Curva cuadrática exacta de Enderite Bow Java v1.9.1:
 * float f = (float) useTicks / EnderiteMod.CONFIG.tools.enderiteBowChargeTime; // default 30 ticks
 * f = (f * f + f * 2.0F) / 3.0F;
 */
export function getEnderiteBowPowerRaw(ticks) {
    let f = ticks / 30.0;
    return (f * f + f * 2.0) / 3.0;
}

export function getEnderiteBowPower(ticks) {
    const f = getEnderiteBowPowerRaw(ticks);
    return Math.min(Math.max(f, 0.0), 1.0);
}

/**
 * Resuelve el disparo actual de forma determinista y a prueba de condiciones de carrera (point-blank).
 * Si el impacto ocurre antes de que entitySpawn termine de registrar el proyectil,
 * se resuelve directamente desde el draw activo del tirador sin usar fallbacks antiguos contaminados.
 */
export function resolveCurrentShot(attacker, projectileId) {
    // 1. Proyectil ya registrado en projectileShotMap
    let shot = consumeProjectileShotData(projectileId) ?? getProjectileShotData(projectileId);
    if (shot) return shot;

    // 2. Disparo a quemarropa: el atacante está tensando activamente el arco en este instante
    if (attacker && playerDrawState.has(attacker.id)) {
        const draw = playerDrawState.get(attacker.id);
        playerDrawState.delete(attacker.id);
        const elapsedTicks = Math.max(1, system.currentTick - draw.startTick);
        const rawPower = getEnderiteBowPowerRaw(elapsedTicks);
        const chargeRatio = Math.min(Math.max(rawPower, 0.1), 1.0);
        const isCritical = chargeRatio >= 1.0;
        shot = {
            projectileId: projectileId ?? "point_blank",
            shooterId: attacker.id,
            shooterName: attacker.name,
            weaponTypeId: "ed:enderite_bow",
            chargeRatio,
            isCritical,
            powerLevel: draw.powerLevel,
            infinityLevel: draw.infinityLevel,
            fireTick: system.currentTick
        };
        applyWeaponDurabilityDamage(attacker, "ed:enderite_bow");
        debug(`Resolved point-blank shot directly from active draw for ${attacker.name}: ticks=${elapsedTicks}, ratio=${chargeRatio.toFixed(2)}, isCrit=${isCritical}`);
        return shot;
    }

    // 3. Atacante disparando Ballesta
    if (attacker) {
        const eq = attacker.getComponent(EntityEquippableComponent.componentId);
        const mainhand = eq?.getEquipment(EquipmentSlot.Mainhand);
        const offhand = eq?.getEquipment(EquipmentSlot.Offhand);
        const isCrossbow = (mainhand?.typeId === "ed:enderite_cross_bow") || (offhand?.typeId === "ed:enderite_cross_bow");
        if (isCrossbow) {
            shot = {
                projectileId: projectileId ?? "point_blank",
                shooterId: attacker.id,
                shooterName: attacker.name,
                weaponTypeId: "ed:enderite_cross_bow",
                chargeRatio: 1.0,
                isCritical: false,
                powerLevel: 0,
                infinityLevel: 0,
                fireTick: system.currentTick
            };
            return shot;
        }
    }

    // 4. Fallback conservador (NUNCA crítico, NUNCA datos antiguos)
    return {
        projectileId: projectileId ?? "fallback",
        shooterId: attacker?.id ?? "unknown",
        shooterName: attacker?.name ?? "unknown",
        weaponTypeId: "ed:enderite_bow",
        chargeRatio: 0.5,
        isCritical: false,
        powerLevel: 0,
        infinityLevel: 0,
        fireTick: system.currentTick
    };
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
        if (!item || !player || item.typeId !== "ed:enderite_bow") return;

        const { powerLevel, infinityLevel } = getPlayerHeldBowEnchantments(player, item);
        playerDrawState.set(player.id, {
            startTick: system.currentTick,
            weaponTypeId: "ed:enderite_bow",
            powerLevel,
            infinityLevel,
            shooterName: player.name
        });
        debug(`Player ${player.name} started drawing ${item.typeId} at tick ${system.currentTick} (power=${powerLevel}, infinity=${infinityLevel}).`);
    } catch (e) {}
});

world.afterEvents.itemUse.subscribe((event) => {
    try {
        const player = event.source;
        const item = event.itemStack;
        if (!item || !player || item.typeId !== "ed:enderite_bow") return;

        if (!playerDrawState.has(player.id)) {
            const { powerLevel, infinityLevel } = getPlayerHeldBowEnchantments(player, item);
            playerDrawState.set(player.id, {
                startTick: system.currentTick,
                weaponTypeId: "ed:enderite_bow",
                powerLevel,
                infinityLevel,
                shooterName: player.name
            });
            debug(`Player ${player.name} drawing ${item.typeId} at tick ${system.currentTick}.`);
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
        if (!item || !player || item.typeId !== "ed:enderite_bow") return;

        const draw = playerDrawState.get(player.id);
        if (draw) {
            const elapsedTicks = Math.max(1, system.currentTick - draw.startTick);
            debug(`Player ${player.name} released ${item.typeId} (charge: ${elapsedTicks} ticks).`);
            playerDrawState.delete(player.id);
        }
    } catch (e) {
        debug(`Error in itemStopUse: ${e}`);
    }
});

// 3. Confirmación de disparo al aparecer la flecha en el mundo (entitySpawn)
world.afterEvents.entitySpawn.subscribe((event) => {
    try {
        const entity = event.entity;
        if (!entity || entity.typeId !== "ed:arrow_enderite") return;
        if (!isEntityValid(entity)) return;

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
            const dimension = entity.dimension;
            let closestDistSq = 25.0;

            for (const [playerId] of playerDrawState.entries()) {
                try {
                    const p = world.getAllPlayers().find(pl => pl.id === playerId);
                    if (isEntityValid(p) && p.dimension.id === dimension.id) {
                        const dx = p.location.x - entityLoc.x;
                        const dy = p.location.y - entityLoc.y;
                        const dz = p.location.z - entityLoc.z;
                        const distSq = dx * dx + dy * dy + dz * dz;
                        if (distSq < closestDistSq) {
                            closestDistSq = distSq;
                            shooter = p;
                        }
                    }
                } catch (e) {}
            }

            if (!shooter) {
                try {
                    for (const p of world.getAllPlayers()) {
                        if (isEntityValid(p) && p.dimension.id === dimension.id) {
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
                } catch (e) {}
            }
        }

        if (!shooter) {
            debug(`Spawned ed:arrow_enderite (id: ${entity.id}) without detectable shooter; using conservative default.`);
            projectileShotMap.set(entity.id, {
                projectileId: entity.id,
                shooterId: "unknown",
                shooterName: "unknown",
                weaponTypeId: "ed:enderite_bow",
                chargeRatio: 0.5,
                isCritical: false,
                powerLevel: 0,
                infinityLevel: 0,
                fireTick: system.currentTick
            });
            return;
        }

        let isShooterCreative = false;
        try {
            isShooterCreative = String(shooter.getGameMode()).toLowerCase() === "creative";
        } catch (e) {}

        if (isShooterCreative) {
            entity.addTag("creative_arrow");
            entity.addTag("no_pickup");
        }

        // 2. Determinar ShotData directamente desde el draw activo de Arco o desde Ballesta
        let shotData;
        const draw = playerDrawState.get(shooter.id);

        if (draw) {
            playerDrawState.delete(shooter.id);
            const elapsedTicks = Math.max(1, system.currentTick - draw.startTick);
            const rawPower = getEnderiteBowPowerRaw(elapsedTicks);

            // Umbral Java exacto: if (f < 0.1F) -> cancelar disparo y descartar proyectil
            if (rawPower < 0.1) {
                debug(`Shot cancelled: rawPower ${rawPower.toFixed(2)} < 0.1 (${elapsedTicks} ticks); removing projectile.`);
                try { entity.remove(); } catch (e) {}
                return;
            }

            const chargeRatio = Math.min(rawPower, 1.0);
            const isCritical = chargeRatio >= 1.0;

            shotData = {
                projectileId: entity.id,
                shooterId: shooter.id,
                shooterName: shooter.name,
                weaponTypeId: "ed:enderite_bow",
                chargeRatio,
                isCritical,
                powerLevel: draw.powerLevel,
                infinityLevel: draw.infinityLevel,
                fireTick: system.currentTick
            };

            debug(`Confirmed Bow shot for ${shooter.name} (projId: ${entity.id}): ticks=${elapsedTicks}, charge=${chargeRatio.toFixed(2)}, crit=${isCritical}, power=${draw.powerLevel}, infinity=${draw.infinityLevel}`);

            // Descontar durabilidad del arco únicamente ahora que la flecha fue disparada
            applyWeaponDurabilityDamage(shooter, "ed:enderite_bow");

            // Si el arco tenía Infinity, aislarlo estrictamente a este proyectil y reembolsar la munición
            if (shotData.infinityLevel > 0) {
                entity.addTag("infinity_arrow");
                entity.addTag("no_pickup");
                debug(`Tagged projectile ${entity.id} as 'infinity_arrow' (no pickup) strictly for ${shooter.name}.`);

                if (!isShooterCreative) {
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
            // No había draw de arco: verificar si el tirador disparó con Ballesta
            const eq = shooter.getComponent(EntityEquippableComponent.componentId);
            const mainhand = eq?.getEquipment(EquipmentSlot.Mainhand);
            const offhand = eq?.getEquipment(EquipmentSlot.Offhand);
            const isCrossbow = (mainhand?.typeId === "ed:enderite_cross_bow") || (offhand?.typeId === "ed:enderite_cross_bow");

            if (isCrossbow) {
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

                // Agrupar Multishot: solo cobrar durabilidad una vez por gatillazo/ráfaga
                const lastFireTick = crossbowFireMap.get(shooter.id) ?? -999;
                if (system.currentTick - lastFireTick > 1) {
                    crossbowFireMap.set(shooter.id, system.currentTick);
                    applyWeaponDurabilityDamage(shooter, "ed:enderite_cross_bow");
                    debug(`Confirmed Crossbow trigger pull for ${shooter.name} (durability applied).`);
                }
            } else {
                // Fallback conservador si no se detectó el arma (NUNCA crítico)
                shotData = {
                    projectileId: entity.id,
                    shooterId: shooter.id,
                    shooterName: shooter.name,
                    weaponTypeId: "ed:enderite_bow",
                    chargeRatio: 0.5,
                    isCritical: false,
                    powerLevel: 0,
                    infinityLevel: 0,
                    fireTick: system.currentTick
                };
            }
        }

        // Si el disparo es crítico (tensado al 100%), registrar para rastro de partículas
        if (shotData.isCritical) {
            entity.addTag("critical_shot");
            activeCritProjectiles.set(entity.id, entity);
            debug(`Registered active critical particle trail for projId: ${entity.id}`);
        }

        // 3. Vincular los datos de disparo directamente al ID del proyectil
        projectileShotMap.set(entity.id, shotData);
    } catch (e) {
        debug(`Error in entitySpawn: ${e}`);
    }
});

// 4. Impacto en bloque: detener partículas, proteger Infinity/Creativo y registrar para recolección vanilla
world.afterEvents.projectileHitBlock.subscribe((event) => {
    try {
        const proj = event.projectile;
        if (proj?.typeId === "ed:arrow_enderite") {
            activeCritProjectiles.delete(proj.id);
            projectileShotMap.delete(proj.id);

            if (stuckPickableArrows.has(proj.id)) {
                return; // Idempotente: evitar re-procesamiento si el motor notifica varias veces el impacto
            }

            const cannotPickup = proj.hasTag("no_pickup") || 
                                 proj.hasTag("infinity_arrow") || 
                                 proj.hasTag("creative_arrow");

            if (cannotPickup) {
                debug(`Projectile ${proj.id} stuck in block with 'no_pickup' tag. Will naturally despawn without player pickup.`);
                system.runTimeout(() => {
                    try {
                        if (isEntityValid(proj)) proj.remove();
                    } catch (e) {}
                }, 1200);
                return;
            }

            stuckPickableArrows.set(proj.id, {
                projectile: proj,
                dimension: event.dimension,
                stickTick: system.currentTick
            });
            debug(`Registered pickable arrow ${proj.id} in block.`);
        }
    } catch (e) {}
});

// 5. Loop de recolección vanilla (cada 4 ticks / 0.2s):
// Respeta inventario lleno, jugadores en creativo, multijugador exacto y recolección única
system.runInterval(() => {
    try {
        const currentTick = system.currentTick;
        for (const [id, data] of stuckPickableArrows.entries()) {
            const proj = data.projectile;
            if (!isEntityValid(proj)) {
                stuckPickableArrows.delete(id);
                continue;
            }

            // Despawn natural tras 60 segundos (1200 ticks) si no es recogida
            if (currentTick - data.stickTick > 1200) {
                try { proj.remove(); } catch (e) {}
                stuckPickableArrows.delete(id);
                continue;
            }

            let nearbyPlayers = [];
            try {
                nearbyPlayers = data.dimension.getPlayers({ location: proj.location, maxDistance: 1.5 });
            } catch (e) {}

            if (!nearbyPlayers || nearbyPlayers.length === 0) continue;

            for (const player of nearbyPlayers) {
                // En vanilla, los jugadores en modo creativo no recogen flechas del suelo
                let isCreative = false;
                try {
                    isCreative = String(player.getGameMode()).toLowerCase() === "creative";
                } catch (e) {}
                if (isCreative) continue;

                const inv = player.getComponent("inventory")?.container;
                if (!inv) continue;

                // Verificar si el jugador tiene espacio en su inventario
                let hasSpace = inv.emptySlotsCount > 0;
                if (!hasSpace) {
                    for (let s = 0; s < inv.size; s++) {
                        const it = inv.getItem(s);
                        if (it?.typeId === "ed:enderite_arrow" && it.amount < (it.maxAmount ?? 64)) {
                            const lore = it.getLore();
                            if (!lore || !lore.includes(VIRTUAL_ARROW_LORE)) {
                                hasSpace = true;
                                break;
                            }
                        }
                    }
                }

                // Si el inventario está completamente lleno, la flecha permanece clavada en el suelo
                if (!hasSpace) continue;

                // Otorgar 1 flecha de Enderita directamente a este jugador específico
                inv.addItem(new ItemStack("ed:enderite_arrow", 1));
                try {
                    data.dimension.playSound("random.pop", player.location);
                } catch (e) {}
                try {
                    proj.remove();
                } catch (e) {}

                stuckPickableArrows.delete(id);
                debug(`Arrow ${id} safely picked up by ${player.name}.`);
                break; // Un único jugador recoge la flecha
            }
        }
    } catch (e) {
        debug(`Error in arrow pickup loop: ${e}`);
    }
}, 4);

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
        for (const [playerId, draw] of playerDrawState.entries()) {
            if (currentTick - draw.startTick > 1200) {
                playerDrawState.delete(playerId);
            }
        }
        for (const [playerId, fireTick] of crossbowFireMap.entries()) {
            if (currentTick - fireTick > 100) {
                crossbowFireMap.delete(playerId);
            }
        }
    } catch (e) {}
}, 200);
