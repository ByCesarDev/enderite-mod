import { world, system } from "@minecraft/server";

const ORE_ID = "ed:enderite";
const VEIN_STATE = "ed:vein_type";

/**
 * Connected Component Clustering: Groups individual ore blocks into physical clusters.
 * Blocks touching faces, edges, or corners (dx<=1, dy<=1, dz<=1) belong to the same connected cluster.
 * @param {Array<{x: number, y: number, z: number, veinType: number}>} blocks
 * @returns {Array<{type: number, blocks: Array<{x: number, y: number, z: number}>, center: {x: number, y: number, z: number}}>}
 */
function groupIntoVeins(blocks) {
    const visited = new Set();
    const clusters = [];

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

        clusters.push({
            type: blocks[i].veinType,
            blocks: cluster.map(b => ({ x: b.x, y: b.y, z: b.z })),
            center: { x: avgX, y: avgY, z: avgZ }
        });
    }

    return clusters;
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
            // Yield every 64 columns (~15,360 block queries) for optimal performance at 60 FPS
            if (checkedColumns % 64 === 0) {
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

        player.sendMessage(`§d[Enderite Debug] §fEscaneando chunk actual §7[X: ${minChunkX}..${maxChunkX}, Z: ${minChunkZ}..${maxChunkZ}] §fde Y=8 a Y=128...`);

        runAsyncJob(scanAreaGenerator(player, minChunkX, maxChunkX, minChunkZ, maxChunkZ, 8, 128, (found) => {
            const largeClusters = groupIntoVeins(found.large);
            const smallClusters = groupIntoVeins(found.small);
            const unknownClusters = groupIntoVeins(found.unknown);
            const totalClusters = largeClusters.length + smallClusters.length + unknownClusters.length;

            if (totalClusters === 0) {
                player.sendMessage("§7[Enderite Debug] No se encontraron bloques de Enderite en este chunk.");
                return;
            }

            if (largeClusters.length > 0) {
                player.sendMessage(`§6LARGE (Y=8..32) [${largeClusters.length} cluster(s) conectado(s), ${found.large.length} blk]:`);
                largeClusters.forEach((c, idx) => {
                    player.sendMessage(`  §e#${idx + 1} §7(${c.blocks.length} blk) centro §f${c.center.x} ${c.center.y} ${c.center.z}§7:`);
                    c.blocks.forEach(b => player.sendMessage(`    §7- §f${b.x}, ${b.y}, ${b.z}`));
                });
            }

            if (smallClusters.length > 0) {
                player.sendMessage(`§bSMALL (Y=8..96) [${smallClusters.length} cluster(s) conectado(s), ${found.small.length} blk]:`);
                smallClusters.forEach((c, idx) => {
                    player.sendMessage(`  §3#${idx + 1} §7(${c.blocks.length} blk) centro §f${c.center.x} ${c.center.y} ${c.center.z}§7:`);
                    c.blocks.forEach(b => player.sendMessage(`    §7- §f${b.x}, ${b.y}, ${b.z}`));
                });
            }

            if (unknownClusters.length > 0) {
                player.sendMessage(`§7UNKNOWN/MANUAL [${unknownClusters.length} cluster(s), ${found.unknown.length} blk]:`);
                unknownClusters.forEach((c, idx) => {
                    player.sendMessage(`  §8#${idx + 1} §7(${c.blocks.length} blk) centro §f${c.center.x} ${c.center.y} ${c.center.z}§7:`);
                    c.blocks.forEach(b => player.sendMessage(`    §7- §f${b.x}, ${b.y}, ${b.z}`));
                });
            }

            let summary = `§aTotal Chunk: §6Large: ${largeClusters.length} cluster(s) (${found.large.length} blk) §f| §bSmall: ${smallClusters.length} cluster(s) (${found.small.length} blk)`;
            if (unknownClusters.length > 0) {
                summary += ` §f| §7Manual: ${unknownClusters.length} cluster(s) (${found.unknown.length} blk)`;
            }
            player.sendMessage(summary);

            try { player.playSound("random.orb", player.location, { volume: 0.8, pitch: 1.2 }); } catch {}
        }));
        return;
    }

    // MODE 2: /scriptevent ed:find_ore nearest
    if (message === "nearest") {
        const radius = 128;
        player.sendMessage(`§d[Enderite Debug] §fBuscando clusters más cercanos en radio de ${radius} bloques...`);

        runAsyncJob(scanAreaGenerator(player, px - radius, px + radius, pz - radius, pz + radius, 8, 128, (found) => {
            const largeClusters = groupIntoVeins(found.large);
            const smallClusters = groupIntoVeins(found.small);
            const unknownClusters = groupIntoVeins(found.unknown);

            player.sendMessage(`§d[Enderite Debug] §fResultados más cercanos desde §e${px}, ${py}, ${pz}§f:`);

            if (largeClusters.length > 0) {
                largeClusters.sort((a, b) => {
                    const distA = Math.hypot(a.center.x - px, a.center.y - py, a.center.z - pz);
                    const distB = Math.hypot(b.center.x - px, b.center.y - py, b.center.z - pz);
                    return distA - distB;
                });
                const closest = largeClusters[0];
                const dist = Math.hypot(closest.center.x - px, closest.center.y - py, closest.center.z - pz).toFixed(1);
                player.sendMessage(`§6Nearest LARGE: §fX=${closest.center.x} Y=${closest.center.y} Z=${closest.center.z} §7(${closest.blocks.length} blk, dist: ${dist}m)`);
            } else {
                player.sendMessage(`§6Nearest LARGE: §7Ninguna encontrada en radio inspeccionado de ${radius}m`);
            }

            if (smallClusters.length > 0) {
                smallClusters.sort((a, b) => {
                    const distA = Math.hypot(a.center.x - px, a.center.y - py, a.center.z - pz);
                    const distB = Math.hypot(b.center.x - px, b.center.y - py, b.center.z - pz);
                    return distA - distB;
                });
                const closest = smallClusters[0];
                const dist = Math.hypot(closest.center.x - px, closest.center.y - py, closest.center.z - pz).toFixed(1);
                player.sendMessage(`§bNearest SMALL: §fX=${closest.center.x} Y=${closest.center.y} Z=${closest.center.z} §7(${closest.blocks.length} blk, dist: ${dist}m)`);
            } else {
                player.sendMessage(`§bNearest SMALL: §7Ninguna encontrada en radio inspeccionado de ${radius}m`);
            }

            if (unknownClusters.length > 0) {
                unknownClusters.sort((a, b) => {
                    const distA = Math.hypot(a.center.x - px, a.center.y - py, a.center.z - pz);
                    const distB = Math.hypot(b.center.x - px, b.center.y - py, b.center.z - pz);
                    return distA - distB;
                });
                const closest = unknownClusters[0];
                const dist = Math.hypot(closest.center.x - px, closest.center.y - py, closest.center.z - pz).toFixed(1);
                player.sendMessage(`§7Nearest MANUAL: §fX=${closest.center.x} Y=${closest.center.y} Z=${closest.center.z} §7(${closest.blocks.length} blk, dist: ${dist}m)`);
            }

            try { player.playSound("random.orb", player.location, { volume: 0.8, pitch: 1.2 }); } catch {}
        }));
        return;
    }

    // MODE 3: /scriptevent ed:find_ore [radius] (default 64, clamped 16..128)
    const parsedRadius = Number.parseInt(message);
    const radius = Number.isFinite(parsedRadius) ? Math.max(16, Math.min(parsedRadius, 128)) : 64;

    player.sendMessage(`§d[Enderite Debug] §fBuscando Enderite en radio de §e${radius} bloques §fdesde §7${px}, ${py}, ${pz}§f...`);

    runAsyncJob(scanAreaGenerator(player, px - radius, px + radius, pz - radius, pz + radius, 8, 128, (found) => {
        const largeClusters = groupIntoVeins(found.large);
        const smallClusters = groupIntoVeins(found.small);
        const unknownClusters = groupIntoVeins(found.unknown);
        const totalClusters = largeClusters.length + smallClusters.length + unknownClusters.length;

        player.sendMessage(`§d[Enderite Debug] §aEscaneo completado (radio ${radius}m):`);

        if (largeClusters.length > 0) {
            player.sendMessage(`§6LARGE (Y=8..32) [${largeClusters.length} cluster(s), ${found.large.length} blk]:`);
            largeClusters.slice(0, 5).forEach((c, i) => {
                const dist = Math.hypot(c.center.x - px, c.center.y - py, c.center.z - pz).toFixed(1);
                player.sendMessage(`  §e#${i + 1} §7(${c.blocks.length} blk) en §f${c.center.x}, ${c.center.y}, ${c.center.z} §7[${dist}m]`);
            });
            if (largeClusters.length > 5) {
                player.sendMessage(`  §7...y ${largeClusters.length - 5} cluster(s) Large más.`);
            }
        }

        if (smallClusters.length > 0) {
            player.sendMessage(`§bSMALL (Y=8..96) [${smallClusters.length} cluster(s), ${found.small.length} blk]:`);
            smallClusters.slice(0, 5).forEach((c, i) => {
                const dist = Math.hypot(c.center.x - px, c.center.y - py, c.center.z - pz).toFixed(1);
                player.sendMessage(`  §3#${i + 1} §7(${c.blocks.length} blk) en §f${c.center.x}, ${c.center.y}, ${c.center.z} §7[${dist}m]`);
            });
            if (smallClusters.length > 5) {
                player.sendMessage(`  §7...y ${smallClusters.length - 5} cluster(s) Small más.`);
            }
        }

        if (unknownClusters.length > 0) {
            player.sendMessage(`§7UNKNOWN/MANUAL [${unknownClusters.length} cluster(s), ${found.unknown.length} blk]:`);
            unknownClusters.slice(0, 3).forEach((c, i) => {
                const dist = Math.hypot(c.center.x - px, c.center.y - py, c.center.z - pz).toFixed(1);
                player.sendMessage(`  §8#${i + 1} §7(${c.blocks.length} blk) en §f${c.center.x}, ${c.center.y}, ${c.center.z} §7[${dist}m]`);
            });
        }

        if (totalClusters === 0) {
            player.sendMessage(`§7No se encontraron bloques de Enderite en este radio de ${radius} bloques.`);
        } else {
            let totalMsg = `§aTotal: §6Large: ${found.large.length} blk (${largeClusters.length} cluster(s)) §f| §bSmall: ${found.small.length} blk (${smallClusters.length} cluster(s))`;
            if (found.unknown.length > 0) {
                totalMsg += ` §f| §7Manual: ${found.unknown.length} blk (${unknownClusters.length} cluster(s))`;
            }
            player.sendMessage(totalMsg);
        }

        try { player.playSound("random.orb", player.location, { volume: 0.8, pitch: 1.2 }); } catch {}
    }));
});
