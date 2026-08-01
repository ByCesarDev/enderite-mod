import * as mc from "@minecraft/server";
import { Vector } from "../Utils.js";

/** @param {mc.StartupEvent} data */
export function spawnBlockEntityComponent(data) {
  const handler = {
    onPlace: ({ block, dimension }, eventData) => {
      const params = eventData?.params || {};
      const identifier = params.identifier || "ed:default_shulker";
      const entityName = params.entity_name || "tile.ed:enderite_shulker_box.name";
      const spawnEvent = params.spawn_event || "ed:switch_to_enderite_shulker_box";
      const spawnOnCenter = params.spawn_on_center ?? false;
      const location = spawnOnCenter ? block.center() : block.bottomCenter();

      let [entity] = dimension.getEntities({
        type: identifier,
        location: location,
        maxDistance: 0.75,
      });

      if (!entity?.isValid) {
        entity = dimension.spawnEntity(
          identifier,
          location,
          spawnEvent ? { spawnEvent } : {},
        );
      }

      if (entity?.isValid) {
        if (entityName) entity.nameTag = entityName;
        try {
          entity.setProperty(
            "ed:cardinal_direction",
            block.permutation.getState("minecraft:cardinal_direction"),
          );
        } catch {
          entity.setProperty(
            "ed:facing_direction",
            block.permutation.getState("minecraft:facing_direction"),
          );
        }
      }
    },
    onPlayerDestroy: ({ block, dimension }, eventData) => {
      const params = eventData?.params || {};
      const identifier = params.identifier || "ed:default_shulker";
      const onBreakEvent = params.on_break_event || "ed:despawn_event";
      const spawnOnCenter = params.spawn_on_center ?? false;
      const location = spawnOnCenter ? block.center() : block.bottomCenter();

      const [entity] = dimension.getEntities({
        type: identifier,
        location: location,
        maxDistance: 0.75,
      });

      if (entity?.isValid) {
        if (onBreakEvent) entity.triggerEvent(onBreakEvent);
      }
    },
    beforeOnPlayerDestroy: ({ block, dimension }, eventData) => {
      const params = eventData?.params || {};
      const identifier = params.identifier || "ed:default_shulker";
      const onBreakEvent = params.on_break_event || "ed:despawn_event";
      const spawnOnCenter = params.spawn_on_center ?? false;
      const location = spawnOnCenter ? block.center() : block.bottomCenter();

      const [entity] = dimension.getEntities({
        type: identifier,
        location: location,
        maxDistance: 0.75,
      });

      if (entity?.isValid) {
        if (onBreakEvent) entity.triggerEvent(onBreakEvent);
      }
    },
  };

  data.blockComponentRegistry.registerCustomComponent("ed:spawn_block_entity", handler);
}
