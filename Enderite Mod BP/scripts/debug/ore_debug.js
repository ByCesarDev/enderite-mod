import { world, system } from "@minecraft/server";

const ORE_ID = "ed:enderite";
const VEIN_STATE = "ed:vein_type";

/**
 * Connected Component Clustering: Groups individual ore blocks into physical veins.
 * Blocks within 1 block distance along any axis (faces, edges, or corners) belong to the same vein.
 * @param {Array<{x: number, y: number, z: number, veinType: number}>} blocks
 * @returns {Array<{type: number, blocks: Array<{x: number, y: number, z: number}>, center: {x: number, y: number, z: number}}>}
 */
function groupIntoVeins(blocks) {
    const visited = new Set();
    const veins = [];

    for (let i = 0; i < blocks.length; i++) {
        if (visited.has(i)) continue;
        visited.add(i);

        const cluster = [blocks[i]];
        const queue = [blocks[i]];

        while (queue.length > 0) {
            const current = queue.shift();
            for (let j = 0; j < blocks.length; j++) {
                if (visited.has(j)) continue;
                const candidate = blocks[j];
                const dx = Math.abs(current.x - candidate.x);
                const dy = Math.abs(current.y - candidate.y);
                const dz = Math.abs(current.z - candidate.z);

                if (dx <= 1 && dy <= 1 && dz <= 1) {
                    visited.add(j);
                    cluster.push(candidate);
                    queue.push(candidate);
                }
            }
        }

        const avgX = Math.round(cluster.reduce((s, b) => s + b.x, 0) / cluster.length);
        const avgY = Math.round(cluster.reduce((s, b) => s + b.y, 0) / cluster.length);
        const avgZ = Math.round(cluster.reduce((s, b) => s + b.z, 0) / cluster.length);

        veins.push({
            type: blocks[i].veinType,
            blocks: cluster.map(b => ({ x: b.x, y: b.y, z: b.z })),
            center: { x: avgX, y: avgY, z: avgZ }
        });
    }

    return veins;
}

/**
 * Runs a generator job smoothly using system.runJob with a system.run fallback.
 * @param {Generator} generator
 */
function runAsyncJob(generator) {
    if (typeof system.runJob === "function") {
        system.runJob(generator);
    } else {
        const step = () => {
            const next = generator.next();
            if (!next.done) {
                system.run(step);
            }
        };
        system.run(step);
    }
}

/**
 * Scans an area for Enderite Ore blocks asynchronously across ticks.
 */
function* scanAreaGenerator(player, minX, maxX, minZ, maxZ, minY, maxY, onComplete) {
    const dimension = player.dimension;
    const found = { large: [], small: [], unknown: [] };
    let checkedColumns = 0;

    for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
            for (let y = minY; y <= maxY; y++) {
                try {
                    const block = dimension.getBlock({ x, y, z });
                    if (!block || block.typeId !== ORE_ID) continue;

                    let veinType = 0;
                    try {
                        veinType = block.permutation.getState(VEIN_STATE) ?? 0;
                    } catch {}

                    const entry = { x, y, z, veinType };
                    if (veinType === 2) {
                        found.large.push(entry);
                    } else if (veinType === 1) {
                        found.small.push(entry);
                    } else {
                        found.unknown.push(entry);
                    }
                } catch {}
            }

            checkedColumns++;
            // Yield every 32 columns (~7,680 block queries) to maintain smooth 60 FPS
            if (checkedColumns % 32 === 0) {
                yield;
            }
        }
    }

    onComplete(found);
}

// Subscribe to /scriptevent ed:find_ore
system.afterEvents.scriptEventReceive.subscribe((event) => {
    if (event.id !== "ed:find_ore") return;

    const player = event.sourceEntity;
    if (!player || player.typeId !== "minecraft:player") return;

    if (!player.dimension.id.includes("the_end")) {
        player.sendMessage("§c[Enderite Debug] Este comando solo funciona en la dimensión The End.");
        return;
    }

    const message = (event.message || "").trim().toLowerCase();
    const px = Math.floor(player.location.x);
    const py = Math.floor(player.location.y);
    const pz = Math.floor(player.location.z);

    // MODE 1: /scriptevent ed:find_ore chunk
    if (message === "chunk") {
        const minChunkX = Math.floor(px / 16) * 16;
        const maxChunkX = minChunkX + 15;
        const minChunkZ = Math.floor(pz / 16) * 16;
        const maxChunkZ = minChunkZ + 15;

        player.sendMessage(`§d[Enderite Debug] §fEscaneando chunk actual §7[X: ${minChunkX}..${maxChunkX}, Z: ${minChunkZ}..${maxChunkZ}] §fde Y=8 a Y=247...`);

        runAsyncJob(scanAreaGenerator(player, minChunkX, maxChunkX, minChunkZ, maxChunkZ, 8, 247, (found) => {
            const largeVeins = groupIntoVeins(found.large);
            const smallVeins = groupIntoVeins(found.small);
            const unknownVeins = groupIntoVeins(found.unknown);

            if (largeVeins.length === 0 && smallVeins.length === 0 && unknownVeins.length === 0) {
                player.sendMessage("§7[Enderite Debug] No se encontraron vetas de Enderite en este chunk.");
                return;
            }

            if (largeVeins.length > 0) {
                player.sendMessage(`§6LARGE VEINS (0..32) [Total: ${largeVeins.length}]:`);
                largeVeins.forEach((vein, idx) => {
                    player.sendMessage(`  §e#${idx + 1} §7(${vein.blocks.length} blk) centro §f${vein.center.x} ${vein.center.y} ${vein.center.z}§7:`);
                    vein.blocks.forEach(b => player.sendMessage(`    §7- §f${b.x}, ${b.y}, ${b.z}`));
                });
            }

            if (smallVeins.length > 0) {
                player.sendMessage(`§bSMALL VEINS (8..247) [Total: ${smallVeins.length}]:`);
                smallVeins.forEach((vein, idx) => {
                    player.sendMessage(`  §3#${idx + 1} §7(${vein.blocks.length} blk) centro §f${vein.center.x} ${vein.center.y} ${vein.center.z}§7:`);
                    vein.blocks.forEach(b => player.sendMessage(`    §7- §f${b.x}, ${b.y}, ${b.z}`));
                });
            }

            player.sendMessage(`§aTotal Chunk: §6Large: ${largeVeins.length} veta(s) (${found.large.length} blk) §f| §bSmall: ${smallVeins.length} veta(s) (${found.small.length} blk)`);
            try { player.playSound("random.orb", player.location, { volume: 0.8, pitch: 1.2 }); } catch {}
        }));
        return;
    }

    // MODE 2: /scriptevent ed:find_ore nearest
    if (message === "nearest") {
        const radius = 128;
        player.sendMessage(`§d[Enderite Debug] §fBuscando vetas más cercanas en radio de ${radius} bloques...`);

        runAsyncJob(scanAreaGenerator(player, px - radius, px + radius, pz - radius, pz + radius, 8, 247, (found) => {
            const largeVeins = groupIntoVeins(found.large);
            const smallVeins = groupIntoVeins(found.small);

            player.sendMessage(`§d[Enderite Debug] §fResultados más cercanos desde §e${px}, ${py}, ${pz}§f:`);

            if (largeVeins.length > 0) {
                largeVeins.sort((a, b) => {
                    const distA = Math.hypot(a.center.x - px, a.center.y - py, a.center.z - pz);
                    const distB = Math.hypot(b.center.x - px, b.center.y - py, b.center.z - pz);
                    return distA - distB;
                });
                const closest = largeVeins[0];
                const dist = Math.hypot(closest.center.x - px, closest.center.y - py, closest.center.z - pz).toFixed(1);
                player.sendMessage(`§6Nearest LARGE: §fX=${closest.center.x} Y=${closest.center.y} Z=${closest.center.z} §7(${closest.blocks.length} blk, dist: ${dist}m)`);
            } else {
                player.sendMessage(`§6Nearest LARGE: §7Ninguna encontrada en radio de ${radius}m`);
            }

            if (smallVeins.length > 0) {
                smallVeins.sort((a, b) => {
                    const distA = Math.hypot(a.center.x - px, a.center.y - py, a.center.z - pz);
                    const distB = Math.hypot(b.center.x - px, b.center.y - py, b.center.z - pz);
                    return distA - distB;
                });
                const closest = smallVeins[0];
                const dist = Math.hypot(closest.center.x - px, closest.center.y - py, closest.center.z - pz).toFixed(1);
                player.sendMessage(`§bNearest SMALL: §fX=${closest.center.x} Y=${closest.center.y} Z=${closest.center.z} §7(${closest.blocks.length} blk, dist: ${dist}m)`);
            } else {
                player.sendMessage(`§bNearest SMALL: §7Ninguna encontrada en radio de ${radius}m`);
            }

            try { player.playSound("random.orb", player.location, { volume: 0.8, pitch: 1.2 }); } catch {}
        }));
        return;
    }

    // MODE 3: /scriptevent ed:find_ore [radius] (default 64, clamped 16..128)
    const parsedRadius = Number.parseInt(message);
    const radius = Number.isFinite(parsedRadius) ? Math.max(16, Math.min(parsedRadius, 128)) : 64;

    player.sendMessage(`§d[Enderite Debug] §fBuscando Enderite en radio de §e${radius} bloques §fdesde §7${px}, ${py}, ${pz}§f...`);

    runAsyncJob(scanAreaGenerator(player, px - radius, px + radius, pz - radius, pz + radius, 8, 247, (found) => {
        const largeVeins = groupIntoVeins(found.large);
        const smallVeins = groupIntoVeins(found.small);
        const unknownVeins = groupIntoVeins(found.unknown);
        const totalVeins = largeVeins.length + smallVeins.length + unknownVeins.length;

        player.sendMessage(`§d[Enderite Debug] §aEscaneo completado (radio ${radius}m):`);

        if (largeVeins.length > 0) {
            player.sendMessage(`§6LARGE VEINS [${largeVeins.length} veta(s), ${found.large.length} blk]:`);
            largeVeins.slice(0, 5).forEach((v, i) => {
                const dist = Math.hypot(v.center.x - px, v.center.y - py, v.center.z - pz).toFixed(1);
                player.sendMessage(`  §e#${i + 1} §7(${v.blocks.length} blk) en §f${v.center.x}, ${v.center.y}, ${v.center.z} §7[${dist}m]`);
            });
            if (largeVeins.length > 5) {
                player.sendMessage(`  §7...y ${largeVeins.length - 5} veta(s) Large más.`);
            }
        }

        if (smallVeins.length > 0) {
            player.sendMessage(`§bSMALL VEINS [${smallVeins.length} veta(s), ${found.small.length} blk]:`);
            smallVeins.slice(0, 5).forEach((v, i) => {
                const dist = Math.hypot(v.center.x - px, v.center.y - py, v.center.z - pz).toFixed(1);
                player.sendMessage(`  §3#${i + 1} §7(${v.blocks.length} blk) en §f${v.center.x}, ${v.center.y}, ${v.center.z} §7[${dist}m]`);
            });
            if (smallVeins.length > 5) {
                player.sendMessage(`  §7...y ${smallVeins.length - 5} veta(s) Small más.`);
            }
        }

        if (totalVeins === 0) {
            player.sendMessage(`§7No se encontraron vetas de Enderite en este radio de ${radius} bloques.`);
        } else {
            player.sendMessage(`§aTotal: §6Large: ${found.large.length} blk (${largeVeins.length} veta(s)) §f| §bSmall: ${found.small.length} blk (${smallVeins.length} veta(s))`);
        }

        try { player.playSound("random.orb", player.location, { volume: 0.8, pitch: 1.2 }); } catch {}
    }));
});
