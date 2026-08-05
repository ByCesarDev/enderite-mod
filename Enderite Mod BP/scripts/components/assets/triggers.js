import * as mc from "@minecraft/server";
import { spawnBlockEntityComponent } from "./blocks/spawnBlockEntity.js";
import "./system/collision.js";
import * as ShulkerAPI from "./blocks/shulkers.js";

export function customComponents(data) {
  spawnBlockEntityComponent(data);
}

/** @param {mc.BlockComponentOnPlaceEvent} event */
export function blockPlace(event) {
  ShulkerAPI.shulkerPlace(event);
}

/** @param {mc.PlayerInteractWithEntityAfterEvent} data */
export function entityInteract(data) {
  const { target: entity } = data;
  if (!entity?.isValid) return;
  ShulkerAPI.openShulker(data);
}

/** @param {mc.EntitySpawnAfterEvent} data */
export function entitySpawn(data) {
  const { entity } = data;
  if (entity?.isValid && entity?.typeId === "minecraft:item") {
    const itemStack = entity.getComponent("item")?.itemStack;
    if (itemStack?.hasTag("ed:drop_remove")) entity.remove();
  }
}

/** @param {mc.EntityHitEntityAfterEvent} data */
export function entityHitEntity(data) {
  const { damagingEntity: player, hitEntity: entity } = data;
  if (
    player?.typeId === "minecraft:player" &&
    entity?.getComponent("type_family")?.hasTypeFamily("ed:shulker")
  ) {
    player.onScreenDisplay.setActionBar({
      translate: "actionbar.ed:shulker_destroy_hint"
    });
    player.playSound("random.orb", { pitch: 0.5 });
  }
}

/** @param {mc.PlayerBreakBlockBeforeEvent} event */
export function blockBreakBefore(event) {
  ShulkerAPI.shulkerBreak(event);
}

