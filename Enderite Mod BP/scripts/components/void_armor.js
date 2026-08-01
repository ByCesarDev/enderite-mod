import { world, system, EntityEquippableComponent } from "@minecraft/server";

const VOID_ARMOR_IDS = new Set([
  "ed:diamond_helmet",
  "ed:diamond_chestplate",
  "ed:diamond_leggings",
  "ed:diamond_boots",
  "ed:gold_helmet",
  "ed:gold_chestplate",
  "ed:gold_leggings",
  "ed:gold_boots",
  "ed:iron_helmet",
  "ed:iron_chestplate",
  "ed:iron_leggings",
  "ed:iron_boots",
  "ed:netherite_helmet",
  "ed:netherite_chestplate",
  "ed:netherite_leggings",
  "ed:netherite_boots",
]);

function applyVoidLore(itemStack) {
  if (!itemStack || !VOID_ARMOR_IDS.has(itemStack.typeId)) return false;

  try {
    const currentLore = itemStack.getLore();
    if (currentLore && currentLore.length > 0) {
      const hasVoidLore = currentLore.some(
        (line) =>
          typeof line === "string" &&
          (line.includes("Void Floating") ||
            line.includes("Flotar en vacío") ||
            line.includes("void_floating"))
      );
      if (hasVoidLore) return false;
    }
  } catch {}

  try {
    itemStack.setLore([{ translate: "enchantment.enderitemod.void_floating" }]);
    return true;
  } catch (e) {
    try {
      itemStack.setLore(["§7Flotar en vacío"]);
      return true;
    } catch {}
  }
  return false;
}

// Apply lore when items spawn as world entities
world.afterEvents.entitySpawn.subscribe((event) => {
  try {
    const { entity } = event;
    if (!entity?.isValid || entity.typeId !== "minecraft:item") return;

    const itemComp = entity.getComponent("item");
    if (!itemComp?.itemStack) return;

    const itemStack = itemComp.itemStack;
    if (applyVoidLore(itemStack)) {
      itemComp.itemStack = itemStack;
    }
  } catch {}
});

// Continuously verify and update inventory / equipped void armor
system.runInterval(() => {
  try {
    for (const player of world.getPlayers()) {
      if (!player?.isValid) continue;

      // Check main inventory
      try {
        const inventory = player.getComponent("inventory")?.container;
        if (inventory) {
          for (let i = 0; i < inventory.size; i++) {
            const item = inventory.getItem(i);
            if (item && VOID_ARMOR_IDS.has(item.typeId)) {
              if (applyVoidLore(item)) {
                inventory.setItem(i, item);
              }
            }
          }
        }
      } catch {}

      // Check armor equipment slots
      try {
        const equippable = player.getComponent("equippable");
        if (equippable) {
          const slots = ["Head", "Chest", "Legs", "Feet"];
          for (const slotName of slots) {
            const item = equippable.getEquipment(slotName);
            if (item && VOID_ARMOR_IDS.has(item.typeId)) {
              if (applyVoidLore(item)) {
                equippable.setEquipment(slotName, item);
              }
            }
          }
        }
      } catch {}
    }
  } catch {}
}, 20);
