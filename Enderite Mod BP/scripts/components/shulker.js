import * as mc from "@minecraft/server";
import * as minhoScript from "./assets/triggers.js";

mc.system.beforeEvents.startup.subscribe((data) => {
  data.blockComponentRegistry.registerCustomComponent("ed:on_place", {
    onPlace: (event) => {
      minhoScript.blockPlace(event);
    },
  });

  minhoScript.customComponents(data);
});

mc.world.afterEvents.playerInteractWithEntity.subscribe((data) => {
  minhoScript.entityInteract(data);
});

mc.world.afterEvents.entitySpawn.subscribe((data) => {
  minhoScript.entitySpawn(data);
});

mc.world.afterEvents.entityHitEntity.subscribe((data) => {
  minhoScript.entityHitEntity(data);
});

mc.world.beforeEvents.playerBreakBlock.subscribe((event) => {
  minhoScript.blockBreakBefore(event);
});

mc.world.afterEvents.playerBreakBlock.subscribe((event) => {
  const { brokenBlockPermutation, dimension, block } = event;
  if (brokenBlockPermutation?.type?.id === "ed:enderite_shulker_box") {
    const [entity] = dimension.getEntities({
      type: "ed:default_shulker",
      location: block.bottomCenter(),
      maxDistance: 0.75,
    });
    if (entity?.isValid) {
      entity.triggerEvent("ed:despawn_event");
    }
  }
});

