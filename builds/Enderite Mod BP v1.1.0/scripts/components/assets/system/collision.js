import { system, world } from "@minecraft/server";
import { Vector } from "../Utils.js";

// Sistema de Colisão
world.afterEvents.dataDrivenEntityTrigger.subscribe(
  (data) => {
    const { entity } = data;
    if (!entity?.isValid) return;

    const block = entity.dimension.getBlock(entity.location);
    if (!block || block.isAir || block.typeId !== "ed:enderite_shulker_box") {
      entity.triggerEvent("ed:despawn_event");
      return;
    }

    const collisionMode = block.permutation.getState("ed:collision_mode");
    const [nearestPlayer] = entity.dimension.getPlayers({
      maxDistance: 8,
      location: block.center(),
      closest: 1,
    });

    if (nearestPlayer) {
      let correctViewDirection;
      if (!collisionMode) {
        const entityView = nearestPlayer.getEntitiesFromViewDirection({
          maxDistance: nearestPlayer.getGameMode() === "Creative" ? 5 : 3,
        })[0]?.entity;
        if (entityView?.id == entity.id) correctViewDirection = true;
      }
      if (collisionMode) {
        const blockView = nearestPlayer.getBlockFromViewDirection({
          maxDistance: nearestPlayer.getGameMode() === "Creative" ? 5 : 3,
        })?.block;
        if (Vector.compare(blockView, block)) correctViewDirection = true;
      }

      if (correctViewDirection) {
        if (!nearestPlayer.isSneaking && collisionMode) {
          entity.triggerEvent("ed:set_block_collision");
          block.setPermutation(
            block.permutation.withState("ed:collision_mode", false),
          );
        }
        if (nearestPlayer.isSneaking && !collisionMode) {
          entity.triggerEvent("ed:remove_collision");
          block.setPermutation(
            block.permutation.withState("ed:collision_mode", true),
          );
        }

        if (!nearestPlayer.isSneaking && system.currentTick % 2 == 0)
          entity.dimension.spawnEntity(
            "ed:outline_selection",
            block.bottomCenter(),
          );
      }
    } else if (collisionMode) {
      entity.triggerEvent("ed:set_block_collision");
      block.setPermutation(
        block.permutation.withState("ed:collision_mode", false),
      );
      entity.teleport(block.bottomCenter());
    }
  },
  { eventTypes: ["ed:players_nearby"] },
);
