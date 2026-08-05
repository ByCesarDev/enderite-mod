import { world, system } from "@minecraft/server";

const TP_ITEMS = {
  "ed:enderite_sword": 0,
  "ed:enderite_sword_tp": 16,
  "ed:enderite_sword_tp_l2": 32,
  "ed:enderite_sword_tp_l3": 48,
  "ed:enderite_sword_tp_l4": 64,
  "enderite:shield": 0,
  "enderite:shield_tp": 16,
  "enderite:shield_tp_lv2": 32,
  "enderite:shield_tp_lv3": 48,
  "enderite:shield_tp_lv4": 64,
};

function applyTPLore(itemStack) {
  if (!itemStack || !(itemStack.typeId in TP_ITEMS)) return false;

  try {
    const currentLore = itemStack.getLore();
    // Check if lore is already applied (we can check by length, since we add 5 lines)
    if (currentLore && currentLore.length >= 4) {
       return false;
    }
  } catch {}

  try {
    const charge = TP_ITEMS[itemStack.typeId];
    const isShield = itemStack.typeId.includes("shield");
    
    // We use RawMessage for all translations so it supports language changing dynamically!
    const lore = [
        { text: " " },
        { translate: "lore.ed:charge", with: [charge.toString()] },
        { translate: "lore.ed:upgrade_info" },
        { translate: "lore.ed:ender_pearls" },
        { translate: isShield ? "lore.ed:shield_teleport" : "lore.ed:sword_teleport" }
    ];
    
    itemStack.setLore(lore);
    return true;
  } catch (e) {
    try {
      // Fallback for older API versions if RawMessage array fails
      itemStack.setLore([
        " ",
        "§3Charge: " + charge,
        "§7Upgrade in Enderite Crafting Tools with",
        "§7ender pearls to load teleportation uses.",
        isShield ? "§7Teleport attackers with sneaking + right click!" : "§7Teleport with sneaking + right click!"
      ]);
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
    if (applyTPLore(itemStack)) {
      itemComp.itemStack = itemStack;
    }
  } catch {}
});

// Continuously verify and update inventory / equipped tp items
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
            if (item && item.typeId in TP_ITEMS) {
              if (applyTPLore(item)) {
                inventory.setItem(i, item);
              }
            }
          }
        }
      } catch {}

      // Check equipment slots
      try {
        const equippable = player.getComponent("equippable");
        if (equippable) {
          const slots = ["Mainhand", "Offhand"];
          for (const slotName of slots) {
            const item = equippable.getEquipment(slotName);
            if (item && item.typeId in TP_ITEMS) {
              if (applyTPLore(item)) {
                equippable.setEquipment(slotName, item);
              }
            }
          }
        }
      } catch {}
    }
  } catch {}
}, 20);
