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

  // Manejo de espadas con carga dinámica y espada base
  if (isSword) {
    const capacity = SWORD_CAPACITIES[itemStack.typeId] ?? 0;
    const currentCharge = getTeleportCharge(itemStack);
    
    // Verificar si el lore ya está al día con la carga actual
    let needsUpdate = true;
    try {
      const rawLore = itemStack.getRawLore() ?? [];
      const hasLeadingEmpty = rawLore.length > 0 && typeof rawLore[0]?.text === 'string' && rawLore[0].text.trim() === "";
      const chargeEntry = rawLore.find(l => l?.translate === "lore.ed:charge" || l?.translate === "lore.ed:charge_zero");
      if (!hasLeadingEmpty) {
        if (capacity > 0) {
          if (chargeEntry?.translate === "lore.ed:charge" && chargeEntry?.with?.[0] === String(currentCharge) && chargeEntry?.with?.[1] === String(capacity)) {
            needsUpdate = false;
          }
        } else {
          if (chargeEntry?.translate === "lore.ed:charge_zero") {
            needsUpdate = false;
          }
        }
      }
    } catch (e) {}

    if (!needsUpdate) return false;

    updateSwordLore(itemStack, currentCharge, capacity);
    return true;
  }

  // Manejo de armaduras y escudos
  try {
    const rawLore = itemStack.getRawLore() ?? [];
    const hasLeadingEmpty = !isArmor && rawLore.length > 0 && typeof rawLore[0]?.text === 'string' && rawLore[0].text.trim() === "";
    const currentLore = itemStack.getLore();
    const targetLength = isArmor ? 2 : 4;
    if (!hasLeadingEmpty && currentLore && currentLore.length === targetLength) {
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
        const capacity = SHIELD_CAPACITIES[itemStack.typeId] ?? 0;
        const chargeEntry = capacity > 0
            ? { translate: "lore.ed:charge", with: [String(capacity), String(capacity)] }
            : { translate: "lore.ed:charge_zero" };
        lore = [
            chargeEntry,
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
        const chargeText = charge > 0 ? `§3Charge: ${charge}/${charge}` : "§3Charge: 0";
        itemStack.setLore([
          chargeText,
          "§7Upgrade in smithing table with",
          "§7enderpearls to load teleportation uses.",
          "§7Teleport attacker with sneaking + block!"
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
