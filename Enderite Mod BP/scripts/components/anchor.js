import {
    GameMode,
    system,
    world,
} from "@minecraft/server";

const ANCHOR_ID = "ed:anchor_end_spawn";
const CHARGE_ITEM_ID = "minecraft:ender_pearl";
const FILLING_STATE = "ed:filling_level";

const OVERWORLD_ID = "minecraft:overworld";
const END_DIMENSION_ID = "minecraft:the_end";

const MAX_CHARGES = 4;

/*
 * Datos del ancla vinculada.
 */
const PROP_ANCHOR_X = "ed:end_anchor_x";
const PROP_ANCHOR_Y = "ed:end_anchor_y";
const PROP_ANCHOR_Z = "ed:end_anchor_z";
const PROP_ANCHOR_ACTIVE = "ed:end_anchor_active";

/*
 * Spawn anterior del jugador.
 */
const PROP_OLD_SPAWN_EXISTS = "ed:old_spawn_exists";
const PROP_OLD_SPAWN_X = "ed:old_spawn_x";
const PROP_OLD_SPAWN_Y = "ed:old_spawn_y";
const PROP_OLD_SPAWN_Z = "ed:old_spawn_z";
const PROP_OLD_SPAWN_DIMENSION = "ed:old_spawn_dimension";

/*
 * Indica que el jugador está saliendo por el portal del End.
 */
const PROP_EXITING_END = "ed:exiting_end";

/*
 * Evita consumir varias cargas por un mismo respawn.
 */
const playersProcessingRespawn = new Set();

/**
 * Consume una perla del End.
 */
function consumeSelectedItem(player) {
    if (player.getGameMode() === GameMode.creative) {
        return;
    }

    const inventory =
        player.getComponent("minecraft:inventory");

    const container = inventory?.container;

    if (!container) {
        return;
    }

    const slot = player.selectedSlotIndex;
    const item = container.getItem(slot);

    if (!item || item.typeId !== CHARGE_ITEM_ID) {
        return;
    }

    if (item.amount <= 1) {
        container.setItem(slot);
        return;
    }

    item.amount -= 1;
    container.setItem(slot, item);
}

/**
 * Guarda las coordenadas del ancla.
 */
function setPlayerAnchor(player, block) {
    player.setDynamicProperty(
        PROP_ANCHOR_X,
        block.location.x
    );

    player.setDynamicProperty(
        PROP_ANCHOR_Y,
        block.location.y
    );

    player.setDynamicProperty(
        PROP_ANCHOR_Z,
        block.location.z
    );

    player.setDynamicProperty(
        PROP_ANCHOR_ACTIVE,
        true
    );
}

/**
 * Devuelve las coordenadas del ancla guardada.
 */
function getPlayerAnchorLocation(player) {
    const active =
        player.getDynamicProperty(PROP_ANCHOR_ACTIVE);

    if (active !== true) {
        return undefined;
    }

    const x = player.getDynamicProperty(PROP_ANCHOR_X);
    const y = player.getDynamicProperty(PROP_ANCHOR_Y);
    const z = player.getDynamicProperty(PROP_ANCHOR_Z);

    if (
        typeof x !== "number" ||
        typeof y !== "number" ||
        typeof z !== "number"
    ) {
        return undefined;
    }

    return {
        x: Math.floor(x),
        y: Math.floor(y),
        z: Math.floor(z),
    };
}

/**
 * Elimina los datos del ancla.
 */
function clearPlayerAnchorData(player) {
    player.setDynamicProperty(PROP_ANCHOR_X, undefined);
    player.setDynamicProperty(PROP_ANCHOR_Y, undefined);
    player.setDynamicProperty(PROP_ANCHOR_Z, undefined);

    player.setDynamicProperty(
        PROP_ANCHOR_ACTIVE,
        undefined
    );

    player.setDynamicProperty(
        PROP_EXITING_END,
        undefined
    );
}

/**
 * Comprueba si el jugador ya está vinculado
 * exactamente a este bloque.
 */
function isLinkedToAnchor(player, block) {
    const anchorLocation =
        getPlayerAnchorLocation(player);

    if (!anchorLocation) {
        return false;
    }

    return (
        anchorLocation.x === block.location.x &&
        anchorLocation.y === block.location.y &&
        anchorLocation.z === block.location.z
    );
}

/**
 * Guarda el spawn que tenía el jugador antes de
 * vincularse por primera vez al ancla.
 */
function savePreviousSpawnPoint(player) {
    const oldSpawn = player.getSpawnPoint();

    if (!oldSpawn) {
        player.setDynamicProperty(
            PROP_OLD_SPAWN_EXISTS,
            false
        );

        return;
    }

    player.setDynamicProperty(
        PROP_OLD_SPAWN_EXISTS,
        true
    );

    player.setDynamicProperty(
        PROP_OLD_SPAWN_X,
        oldSpawn.x
    );

    player.setDynamicProperty(
        PROP_OLD_SPAWN_Y,
        oldSpawn.y
    );

    player.setDynamicProperty(
        PROP_OLD_SPAWN_Z,
        oldSpawn.z
    );

    player.setDynamicProperty(
        PROP_OLD_SPAWN_DIMENSION,
        oldSpawn.dimension.id
    );
}

/**
 * Restaura el spawn anterior del jugador.
 *
 * Si no tenía cama o spawn personalizado,
 * limpia su spawn y usa el spawn mundial.
 */
function restorePreviousSpawnPoint(player) {
    const oldSpawnExists =
        player.getDynamicProperty(
            PROP_OLD_SPAWN_EXISTS
        );

    if (oldSpawnExists !== true) {
        player.setSpawnPoint();
        return;
    }

    const x =
        player.getDynamicProperty(PROP_OLD_SPAWN_X);

    const y =
        player.getDynamicProperty(PROP_OLD_SPAWN_Y);

    const z =
        player.getDynamicProperty(PROP_OLD_SPAWN_Z);

    const dimensionId =
        player.getDynamicProperty(
            PROP_OLD_SPAWN_DIMENSION
        );

    if (
        typeof x !== "number" ||
        typeof y !== "number" ||
        typeof z !== "number" ||
        typeof dimensionId !== "string"
    ) {
        player.setSpawnPoint();
        return;
    }

    try {
        player.setSpawnPoint({
            dimension: world.getDimension(dimensionId),
            x,
            y,
            z,
        });
    } catch (error) {
        console.warn(
            `[End Anchor] No se pudo restaurar el spawn de ${player.name}: ${error}`
        );

        player.setSpawnPoint();
    }
}

/**
 * Elimina la copia del spawn anterior.
 */
function clearPreviousSpawnData(player) {
    player.setDynamicProperty(
        PROP_OLD_SPAWN_EXISTS,
        undefined
    );

    player.setDynamicProperty(
        PROP_OLD_SPAWN_X,
        undefined
    );

    player.setDynamicProperty(
        PROP_OLD_SPAWN_Y,
        undefined
    );

    player.setDynamicProperty(
        PROP_OLD_SPAWN_Z,
        undefined
    );

    player.setDynamicProperty(
        PROP_OLD_SPAWN_DIMENSION,
        undefined
    );
}

/**
 * Coloca el spawn vanilla directamente
 * encima del ancla del End.
 */
function setSpawnPointToAnchor(player) {
    const anchorLocation =
        getPlayerAnchorLocation(player);

    if (!anchorLocation) {
        return;
    }

    try {
        player.setSpawnPoint({
            dimension: world.getDimension(
                END_DIMENSION_ID
            ),
            x: anchorLocation.x + 0.5,
            y: anchorLocation.y + 1,
            z: anchorLocation.z + 0.5,
        });
    } catch (error) {
        console.warn(
            `[End Anchor] No se pudo activar el spawn del End para ${player.name}: ${error}`
        );
    }
}

/**
 * Desvincula completamente al jugador.
 */
function deactivatePlayerAnchor(player) {
    restorePreviousSpawnPoint(player);
    clearPlayerAnchorData(player);
    clearPreviousSpawnData(player);
}

/**
 * Carga el ancla.
 */
function chargeAnchor(player, block, currentLevel) {
    if (
        typeof currentLevel !== "number" ||
        currentLevel >= MAX_CHARGES
    ) {
        return;
    }

    consumeSelectedItem(player);

    block.setPermutation(
        block.permutation.withState(
            FILLING_STATE,
            currentLevel + 1
        )
    );

    try {
        block.dimension.playSound(
            "respawn_anchor.charge",
            block.center()
        );
    } catch {
        // Sonido opcional.
    }
}

/**
 * Vincula el jugador al ancla.
 */
function activateAnchor(player, block, currentLevel) {
    if (
        typeof currentLevel !== "number" ||
        currentLevel <= 0
    ) {
        return;
    }

    if (isLinkedToAnchor(player, block)) {
        setSpawnPointToAnchor(player);
        return;
    }

    const alreadyHadAnchor =
        player.getDynamicProperty(
            PROP_ANCHOR_ACTIVE
        ) === true;

    /*
     * Solo conserva el spawn original la primera vez.
     * Si cambia de ancla, no sobrescribe la cama original
     * con la posición de la otra ancla.
     */
    if (!alreadyHadAnchor) {
        savePreviousSpawnPoint(player);
    }

    setPlayerAnchor(player, block);
    setSpawnPointToAnchor(player);

    player.sendMessage({
        translate: "tile.respawn_anchor.respawnSet",
    });

    try {
        block.dimension.playSound(
            "respawn_anchor.set_spawn",
            block.center()
        );
    } catch {
        // Sonido opcional.
    }
}

/**
 * Explota fuera del End.
 */
function explodeAnchor(block) {
    try {
        block.dimension.createExplosion(
            block.center(),
            5,
            {
                causesFire: true,
                breaksBlocks: true,
            }
        );
    } catch (error) {
        console.warn(
            `[End Anchor] Error creando la explosión: ${error}`
        );
    }
}

/**
 * Interacción principal.
 */
function onPlayerInteractAnchor(event) {
    const { player, block } = event;

    if (block.typeId !== ANCHOR_ID) {
        return;
    }

    const currentLevel =
        block.permutation.getState(FILLING_STATE);

    if (typeof currentLevel !== "number") {
        return;
    }

    const inventory =
        player.getComponent("minecraft:inventory");

    const heldItem =
        inventory?.container?.getItem(
            player.selectedSlotIndex
        );

    /*
     * Cargar con una perla.
     */
    if (
        heldItem?.typeId === CHARGE_ITEM_ID &&
        currentLevel < MAX_CHARGES &&
        !player.isSneaking
    ) {
        chargeAnchor(
            player,
            block,
            currentLevel
        );

        return;
    }

    /*
     * En el End vincula el spawn.
     */
    if (
        block.dimension.id === END_DIMENSION_ID
    ) {
        activateAnchor(
            player,
            block,
            currentLevel
        );

        return;
    }

    /*
     * Fuera del End explota.
     */
    if (currentLevel > 0) {
        explodeAnchor(block);
    }
}

/**
 * Registro del componente custom.
 */
system.beforeEvents.startup.subscribe((event) => {
    event.blockComponentRegistry
        .registerCustomComponent(
            "ed:anchor_interact",
            {
                onPlayerInteract:
                    onPlayerInteractAnchor,
            }
        );
});

/**
 * Comprueba si el jugador está tocando
 * un bloque de portal del End.
 */
function isTouchingEndPortal(player) {
    const x = Math.floor(player.location.x);
    const y = Math.floor(player.location.y);
    const z = Math.floor(player.location.z);

    /*
     * Revisamos pies, cuerpo y debajo de los pies.
     */
    const positions = [
        { x, y, z },
        { x, y: y + 1, z },
        { x, y: y - 1, z },
    ];

    for (const position of positions) {
        try {
            const block =
                player.dimension.getBlock(position);

            if (
                block?.typeId ===
                "minecraft:end_portal"
            ) {
                return true;
            }
        } catch {
            // Chunk no disponible.
        }
    }

    return false;
}

/**
 * Antes de que el portal de salida procese al jugador,
 * restaura temporalmente su spawn anterior.
 *
 * El portal Vanilla usará ese spawn para enviarlo
 * fuera del End.
 */
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        if (
            player.dimension.id !==
            END_DIMENSION_ID
        ) {
            continue;
        }

        if (
            player.getDynamicProperty(
                PROP_ANCHOR_ACTIVE
            ) !== true
        ) {
            continue;
        }

        if (
            player.getDynamicProperty(
                PROP_EXITING_END
            ) === true
        ) {
            continue;
        }

        if (!isTouchingEndPortal(player)) {
            continue;
        }

        player.setDynamicProperty(
            PROP_EXITING_END,
            true
        );

        /*
         * El portal ahora verá el spawn anterior.
         */
        restorePreviousSpawnPoint(player);
    }
}, 1);

/**
 * Cuando sale correctamente del End,
 * vuelve a establecer el ancla como spawn.
 *
 * En ese momento el portal ya terminó de usar
 * el spawn anterior.
 */
world.afterEvents.playerDimensionChange.subscribe(
    (event) => {
        const {
            player,
            fromDimension,
            toDimension,
        } = event;

        if (
            fromDimension.id !== END_DIMENSION_ID ||
            toDimension.id === END_DIMENSION_ID
        ) {
            return;
        }

        if (
            player.getDynamicProperty(
                PROP_EXITING_END
            ) !== true
        ) {
            return;
        }

        player.setDynamicProperty(
            PROP_EXITING_END,
            undefined
        );

        /*
         * Espera a que termine completamente
         * la transición del portal.
         */
        system.runTimeout(() => {
            if (
                player.getDynamicProperty(
                    PROP_ANCHOR_ACTIVE
                ) !== true
            ) {
                return;
            }

            setSpawnPointToAnchor(player);
        }, 20);
    }
);

/**
 * Consume una carga cuando el jugador reaparece
 * directamente en el End.
 */
world.afterEvents.playerSpawn.subscribe((event) => {
    if (event.initialSpawn) {
        return;
    }

    const player = event.player;

    if (
        player.dimension.id !== END_DIMENSION_ID
    ) {
        return;
    }

    const anchorLocation =
        getPlayerAnchorLocation(player);

    if (!anchorLocation) {
        return;
    }

    /*
     * Evita consumir doble si el evento se dispara
     * varias veces durante la misma secuencia.
     */
    if (playersProcessingRespawn.has(player.id)) {
        return;
    }

    playersProcessingRespawn.add(player.id);

    system.runTimeout(() => {
        try {
            let anchor;

            try {
                anchor =
                    player.dimension.getBlock(
                        anchorLocation
                    );
            } catch {
                /*
                 * No eliminamos el vínculo por un simple
                 * fallo temporal de carga.
                 */
                return;
            }

            if (
                !anchor ||
                anchor.typeId !== ANCHOR_ID
            ) {
                deactivatePlayerAnchor(player);
                return;
            }

            const currentLevel =
                anchor.permutation.getState(
                    FILLING_STATE
                );

            if (
                typeof currentLevel !== "number" ||
                currentLevel <= 0
            ) {
                deactivatePlayerAnchor(player);
                return;
            }

            const newLevel =
                currentLevel - 1;

            anchor.setPermutation(
                anchor.permutation.withState(
                    FILLING_STATE,
                    newLevel
                )
            );

            try {
                anchor.dimension.playSound(
                    "respawn_anchor.deplete",
                    anchor.center()
                );
            } catch {
                // Sonido opcional.
            }

            /*
             * Al acabarse las cargas, restaura
             * permanentemente el spawn anterior.
             */
            if (newLevel <= 0) {
                deactivatePlayerAnchor(player);
            }
        } finally {
            system.runTimeout(() => {
                playersProcessingRespawn.delete(
                    player.id
                );
            }, 20);
        }
    }, 1);
});

/**
 * Si se rompe el ancla, restaura el spawn
 * de los jugadores online vinculados.
 */
world.afterEvents.playerBreakBlock.subscribe(
    (event) => {
        if (
            event.brokenBlockPermutation.type.id !==
            ANCHOR_ID
        ) {
            return;
        }

        const brokenLocation =
            event.block.location;

        for (
            const player of world.getAllPlayers()
        ) {
            const anchorLocation =
                getPlayerAnchorLocation(player);

            if (!anchorLocation) {
                continue;
            }

            const sameAnchor =
                anchorLocation.x ===
                    brokenLocation.x &&
                anchorLocation.y ===
                    brokenLocation.y &&
                anchorLocation.z ===
                    brokenLocation.z;

            if (sameAnchor) {
                deactivatePlayerAnchor(player);
            }
        }
    }
);