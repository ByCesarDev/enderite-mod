import { world, system } from "@minecraft/server";

/**
 * Handles Enderite Ore explosion transformation.
 * In Java upstream (EnderiteOre.java), any explosion that affects Enderite Ore
 * invokes wasExploded() and transforms the block into Cracked Enderite Ore.
 *
 * In Bedrock, we intercept the explosion before it processes block destruction,
 * remove ed:enderite from the impacted blocks list so it is not destroyed/dropped,
 * and then safely transform it into ed:cracked_enderite on the next tick.
 */
world.beforeEvents.explosion.subscribe((event) => {
    try {
        const getBlocks = typeof event.getImpactedBlocks === "function"
            ? () => event.getImpactedBlocks()
            : (typeof event.getUpdatedBlocks === "function" ? () => event.getUpdatedBlocks() : null);

        const impacted = getBlocks ? getBlocks() : [];
        if (!impacted || impacted.length === 0) return;

        const enderitePositions = [];
        const remaining = [];

        for (const block of impacted) {
            if (block?.typeId === "ed:enderite") {
                enderitePositions.push({
                    x: block.location.x,
                    y: block.location.y,
                    z: block.location.z
                });
            } else {
                remaining.push(block);
            }
        }

        if (enderitePositions.length === 0) return;

        // Prevent vanilla from destroying the Enderite Ore blocks
        if (typeof event.setImpactedBlocks === "function") {
            event.setImpactedBlocks(remaining);
        } else if (typeof event.setUpdatesBlocks === "function") {
            event.setUpdatesBlocks(remaining);
        }

        const dimension = event.dimension;
        system.run(() => {
            for (const loc of enderitePositions) {
                try {
                    const currentBlock = dimension.getBlock(loc);
                    if (currentBlock && currentBlock.typeId === "ed:enderite") {
                        dimension.setBlockType(loc, "ed:cracked_enderite");
                    }
                } catch {}
            }
        });
    } catch {}
});
