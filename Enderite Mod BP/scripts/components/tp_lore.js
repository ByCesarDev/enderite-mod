import { world, system } from "@minecraft/server";
import { SWORD_CAPACITIES, SHIELD_CAPACITIES, getTeleportCharge, updateSwordLore } from "../core/teleport.js";

const TP_ITEMS = {
  ...SWORD_CAPACITIES,
  ...SHIELD_CAPACITIES
};

const ARMOR_ITEMS = new Set([
  "ed:enderite_helmet",
  "ed:enderite_chestplate",
  "ed:enderite_leggings",
  "ed:enderite_boots",
  "ed:enderite_elytra_chesplate",
  "ed:enderite_elytra_chesplate_broken",
  "elytra:chesplate",
  "elytra:chesplate_broken"
]);

function applyTPLore(itemStack) {
  if (!itemStack) return false;

  const isSword = itemStack.typeId in SWORD_CAPACITIES;
  const isShield = itemStack.typeId in SHIELD_CAPACITIES;
  const isArmor = ARMOR_ITEMS.has(itemStack.typeId);

  if (!isSword && !isShield && !isArmor) return false;

  // Manejo de espadas teleportables con carga dinámica
  if (isSword) {
    const capacity = SWORD_CAPACITIES[itemStack.typeId];
    if (capacity <= 0) return false;

    const currentCharge = getTeleportCharge(itemStack);
    
    // Verificar si el lore ya está al día con la carga actual
    let needsUpdate = true;
    try {
      const rawLore = itemStack.getRawLore() ?? [];
      const chargeEntry = rawLore.find(l => l?.translate === "lore.ed:charge");
      if (chargeEntry?.with?.[0] === String(currentCharge) && chargeEntry?.with?.[1] === String(capacity)) {
        needsUpdate = false;
      }
    } catch (e) {}

    if (!needsUpdate) return false;

    updateSwordLore(itemStack, currentCharge, capacity);
    return true;
  }

  // Manejo de armaduras y escudos
  try {
    const currentLore = itemStack.getLore();
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
        const charge = SHIELD_CAPACITIES[itemStack.typeId] ?? 0;
        lore = [
            { text: " " },
            { translate: "lore.ed:charge", with: [charge.toString()] },
            { translate: "lore.ed:upgrade_info" },
            { translate: "lore.ed:ender_pearls" },
            { translate: "lore.ed:shield_teleport" }
        ];
    }
    
    itemStack.setLore(lore);
    return true;
  } catch (e) {
    try {
      if (isArmor) {
        itemStack.setLore([
          "§9+4 Armor Toughness",
          "§9+1 Knockback Resistance"
        ]);
      } else {
        const charge = SHIELD_CAPACITIES[itemStack.typeId] ?? 0;
        itemStack.setLore([
          " ",
          "§3Charge: " + charge,
          "§7Upgrade in Enderite Crafting Tools with",
          "§7ender pearls to load teleportation uses.",
          "§7Teleport attackers with sneaking + right click!"
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
