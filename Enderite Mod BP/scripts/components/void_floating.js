import { world, system } from "@minecraft/server";

function isVoidFloatingItem(itemStack) {
  if (!itemStack) return false;
  const id = itemStack.typeId;
  return id.startsWith("ed:") || id.startsWith("enderite:");
}

// Runs every tick (20 FPS) for exact mathematical parity with: tp @s ~ ~.06 ~
system.runInterval(() => {
  const dimensions = ["overworld", "nether", "the_end"];

  for (const dimId of dimensions) {
    try {
      const dimension = world.getDimension(dimId);
      const itemEntities = dimension.getEntities({ type: "minecraft:item" });

      for (const entity of itemEntities) {
        if (!entity?.isValid) continue;

        const itemStack = entity.getComponent("item")?.itemStack;
        if (!isVoidFloatingItem(itemStack)) continue;

        // 1. Make item fireproof natively
        try {
          entity.triggerEvent("become_fire_immune");
        } catch {}

        // 2. Smooth upward levitation (identical to tp @s ~ ~.06 ~)
        const loc = entity.location;
        entity.teleport(
          { x: loc.x, y: loc.y + 0.06, z: loc.z },
          { checkForBlocks: false }
        );
      }
    } catch {}
  }
}, 1);
