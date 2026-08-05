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

const ARMOR_ITEMS = new Set([
  "ed:enderite_helmet",
  "ed:enderite_chestplate",
  "ed:enderite_leggings",
  "ed:enderite_boots",
  "ed:enderite_elytra_chesplate",
  "ed:enderite_elytra_chesplate_broken",
  "elytra:chesplate",
  "elytra:chesplate_broken" // ID from the json earlier might be this
]);

function applyTPLore(itemStack) {
  if (!itemStack) return false;

  const isTP = itemStack.typeId in TP_ITEMS;
  const isArmor = ARMOR_ITEMS.has(itemStack.typeId);

  if (!isTP && !isArmor) return false;

  try {
    const currentLore = itemStack.getLore();
    // Armaduras tienen 2 lineas, TP tools tienen 5
    const targetLength = isArmor ? 2 : 5;
    if (currentLore && currentLore.length >= targetLength) {
       return false;
    }
  } catch {}

  try {
    let lore = [];
    if (isArmor) {
        lore = [
            { translate: "lore.ed:armor_toughness" },
            { translate: "lore.ed:knockback_resistance" }
        ];
    } else {
        const charge = TP_ITEMS[itemStack.typeId];
        const isShield = itemStack.typeId.includes("shield");
        lore = [
            { text: " " },
            { translate: "lore.ed:charge", with: [charge.toString()] },
            { translate: "lore.ed:upgrade_info" },
            { translate: "lore.ed:ender_pearls" },
            { translate: isShield ? "lore.ed:shield_teleport" : "lore.ed:sword_teleport" }
        ];
    }
    
    itemStack.setLore(lore);
    return true;
  } catch (e) {
    try {
      if (isArmor) {
        itemStack.setLore([
          "§9+4 Armor Toughness", // Fallback if translations fail
          "§9+1 Knockback Resistance"
        ]);
      } else {
        const charge = TP_ITEMS[itemStack.typeId];
        const isShield = itemStack.typeId.includes("shield");
        itemStack.setLore([
          " ",
          "§3Charge: " + charge,
          "§7Upgrade in Enderite Crafting Tools with",
          "§7ender pearls to load teleportation uses.",
          isShield ? "§7Teleport attackers with sneaking + right click!" : "§7Teleport with sneaking + right click!"
        ]);
      }
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
            if (item && (item.typeId in TP_ITEMS || ARMOR_ITEMS.has(item.typeId))) {
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
          const slots = ["Mainhand", "Offhand", "Head", "Chest", "Legs", "Feet"];
          for (const slotName of slots) {
            const item = equippable.getEquipment(slotName);
            if (item && (item.typeId in TP_ITEMS || ARMOR_ITEMS.has(item.typeId))) {
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
