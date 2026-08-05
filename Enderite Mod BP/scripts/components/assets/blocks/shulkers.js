import {
  BlockComponentOnPlaceEvent,
  BlockComponentTickEvent,
  BlockTypes,
  EnchantmentTypes,
  Entity,
  ItemStack,
  Player,
  PlayerInteractWithEntityAfterEvent,
  system,
  world,
} from "@minecraft/server";
import { shulkersConfig } from "../config/shulkersConfig.js";
import { addItem, getConnectedHoppers, hasSpaceInContainer } from "../Utils.js";

const SHULKER_BLOCK = "ed:enderite_shulker_box";
const SHULKER_ENTITY = "ed:default_shulker";

const DYNAMIC_PROPERTY_KEY = "ed:container_data";
const pendingPlacements = new Map();

function serializeContainer(container) {
  const data = [];
  for (let i = 0; i < container.size; i++) {
    const item = container.getItem(i);
    if (!item) {
      data.push(null);
      continue;
    }
    const slotData = { id: item.typeId, count: item.amount };
    try {
      const durabilityComp = item.getComponent("durability");
      if (durabilityComp && typeof durabilityComp.damage === "number" && durabilityComp.damage > 0) {
        slotData.damage = durabilityComp.damage;
      }
    } catch {}
    try {
      if (item.nameTag) slotData.nameTag = item.nameTag;
    } catch {}
    try {
      const enchantable = item.getComponent("enchantable") || item.getComponent("minecraft:enchantable");
      if (enchantable) {
        const enchants = enchantable.getEnchantments();
        if (enchants && enchants.length) {
          slotData.enchantments = enchants.map((e) => ({
            id: typeof e.type === "string" ? e.type : (e.type?.id || String(e.type)),
            level: e.level,
          }));
        }
      } else {
        const enchantsComp = item.getComponent("enchantments");
        if (enchantsComp && enchantsComp.enchantments) {
          const list = [];
          for (const e of enchantsComp.enchantments) {
            if (e && e.type) {
              list.push({ id: e.type.id || String(e.type), level: e.level });
            }
          }
          if (list.length) slotData.enchantments = list;
        }
      }
    } catch {}
    try {
      const dp = item.getDynamicProperty(DYNAMIC_PROPERTY_KEY);
      if (dp) slotData.container_data = dp;
    } catch {}
    try {
      const lore = item.getLore();
      if (lore && lore.length) slotData.lore = lore;
    } catch {}
    data.push(slotData);
  }
  return JSON.stringify(data);
}

function deserializeContainer(container, json) {
  try {
    const data = JSON.parse(json);
    for (let i = 0; i < Math.min(data.length, container.size); i++) {
      if (!data[i]) {
        container.setItem(i, undefined);
        continue;
      }
      const item = new ItemStack(data[i].id, data[i].count);
      if (data[i].damage !== undefined && data[i].damage > 0) {
        try {
          const durabilityComp = item.getComponent("durability");
          if (durabilityComp) {
            durabilityComp.damage = data[i].damage;
          }
        } catch {}
      }
      if (data[i].nameTag) {
        try {
          item.nameTag = data[i].nameTag;
        } catch {}
      }
      if (data[i].enchantments && Array.isArray(data[i].enchantments) && data[i].enchantments.length > 0) {
        try {
          const enchantable = item.getComponent("enchantable") || item.getComponent("minecraft:enchantable");
          if (enchantable) {
            for (const ench of data[i].enchantments) {
              if (!ench || !ench.id) continue;
              const typeObj = EnchantmentTypes ? EnchantmentTypes.get(ench.id) : undefined;
              try {
                enchantable.addEnchantment({ type: typeObj || ench.id, level: ench.level || 1 });
              } catch {
                try {
                  enchantable.addEnchantment({ type: ench.id, level: ench.level || 1 });
                } catch {}
              }
            }
          } else {
            const enchantsComp = item.getComponent("enchantments");
            if (enchantsComp && enchantsComp.enchantments) {
              for (const ench of data[i].enchantments) {
                const typeObj = EnchantmentTypes ? EnchantmentTypes.get(ench.id) : undefined;
                if (typeObj) {
                  try {
                    enchantsComp.enchantments.addEnchantment({ type: typeObj, level: ench.level || 1 });
                  } catch {}
                }
              }
            }
          }
        } catch {}
      }
      if (data[i].container_data) {
        try {
          item.setDynamicProperty(DYNAMIC_PROPERTY_KEY, data[i].container_data);
        } catch {}
      }
      if (data[i].lore && Array.isArray(data[i].lore)) {
        try {
          item.setLore(data[i].lore);
        } catch {}
      }
      container.setItem(i, item);
    }
  } catch {}
}

const maxAmountCache = new Map();

function getMaxAmount(id) {
  if (maxAmountCache.has(id)) return maxAmountCache.get(id);
  try {
    const item = new ItemStack(id, 1);
    const max = item.maxAmount || 64;
    maxAmountCache.set(id, max);
    return max;
  } catch {
    maxAmountCache.set(id, 64);
    return 64;
  }
}

function getTranslationKey(id) {
  if (!id) return undefined;
  try {
    const item = new ItemStack(id, 1);
    return item.localizationKey;
  } catch (error) {
    console.warn(`[Shulker Debug] Could not get localizationKey for ${id}: ${error}`);
    return undefined;
  }
}

function buildLore(json) {
  try {
    const slots = JSON.parse(json);
    const counts = {};
    for (const slot of slots) {
      if (!slot) continue;
      const key = slot.nameTag ? `${slot.id}||${slot.nameTag}` : slot.id;
      if (!counts[key]) {
        counts[key] = { id: slot.id, nameTag: slot.nameTag, totalCount: 0 };
      }
      counts[key].totalCount += slot.count;
    }

    const stackEntries = [];
    for (const entry of Object.values(counts)) {
      const maxStack = getMaxAmount(entry.id);
      let remaining = entry.totalCount;
      while (remaining > 0) {
        const countInThisStack = Math.min(remaining, maxStack);
        stackEntries.push({ id: entry.id, nameTag: entry.nameTag, count: countInThisStack });
        remaining -= countInThisStack;
      }
    }

    if (!stackEntries.length) return [];

    const lines = stackEntries.slice(0, 5).map(({ id, nameTag, count }) => {
      const countText = ` §fx${count}`;

      if (nameTag) {
        return {
          rawtext: [
            { text: `§7${nameTag}${countText}` },
          ],
        };
      }

      const translationKey = getTranslationKey(id);

      if (!translationKey) {
        return {
          rawtext: [
            { text: `§7${id}${countText}` },
          ],
        };
      }

      return {
        rawtext: [
          { text: "§7" },
          { translate: translationKey },
          { text: countText },
        ],
      };
    });

    if (stackEntries.length > 5) {
      lines.push({
        rawtext: [
          { text: "§7" },
          { translate: "lore.ed:shulker_more", with: [String(stackEntries.length - 5)] }
        ],
      });
    }

    return lines;
  } catch (error) {
    console.warn(`[Shulker Debug] Error building lore: ${error}`);
    return [];
  }
}

world.afterEvents.dataDrivenEntityTrigger.subscribe(
  (data) => {
    const { entity } = data;
    if (!entity?.isValid) return;
    const playersUses = JSON.parse(
      entity.getDynamicProperty("playersUses") || "{}",
    );

    for (const playerId of Object.keys(playersUses)) {
      const player = world.getEntity(playerId);

      if (!player?.isValid) {
        delete playersUses[playerId];
        continue;
      }

      const entitiesInView = player.getEntitiesFromViewDirection({
        maxDistance: player.getGameMode() === "Creative" ? 5 : 3,
        families: ["ed:shulker"],
      });

      if (
        JSON.stringify(player.getViewVector ? player.getViewVector() : player.getViewDirection()) !=
        playersUses[playerId].viewDirection
      )
        closeShulker(player, entity);
      else if (entitiesInView.length < 1) closeShulker(player, entity);
    }
  },
  { eventTypes: ["ed:shulker_opened_tick"] },
);

world.afterEvents.dataDrivenEntityTrigger.subscribe(
  (data) => {
    const { entity } = data;
    if (!entity?.isValid) return;
    const block = entity.dimension.getBlock(entity.location);
    const shulkerInv = entity.getComponent("inventory").container;

    const hoppersConnected = getConnectedHoppers(block);

    if (hoppersConnected.above) {
      const hopperBlock = hoppersConnected.above;
      const hopperInv = hopperBlock.getComponent("inventory").container;

      for (let i = 0; i < hopperInv.size; i++) {
        const slot = hopperInv.getItem(i);
        if (slot) {
          const itemToAdd = slot.clone();
          itemToAdd.amount = 1;

          if (hasSpaceInContainer(shulkerInv, itemToAdd)) {
            addItem(shulkerInv, itemToAdd);
            hopperInv.setItem(
              i,
              slot.amount > 1 ? (slot.amount--, slot) : null,
            );
            break;
          }
        }
      }
    }

    if (hoppersConnected.below) {
      const hopperBlock = hoppersConnected.below;
      const hopperInv = hopperBlock.getComponent("inventory").container;

      for (let i = 0; i < shulkerInv.size; i++) {
        const slot = shulkerInv.getItem(i);
        if (slot) {
          const itemToAdd = slot.clone();
          itemToAdd.amount = 1;

          if (hasSpaceInContainer(hopperInv, itemToAdd)) {
            addItem(hopperInv, itemToAdd);
            shulkerInv.setItem(i, slot.amount > 1 ? (slot.amount--, slot) : null);
            break;
          }
        }
      }
    }
  },
  { eventTypes: ["ed:hopper_system"] },
);

function getShulkerEntity(dimension, location) {
  if (!dimension || !location) return undefined;
  try {
    const atBlock = dimension.getEntitiesAtBlockLocation(location);
    const found = atBlock.find((e) => e.typeId === SHULKER_ENTITY && e.isValid);
    if (found) {
      console.warn(`[Shulker Debug] Found shulker entity at exact block location: ${location.x},${location.y},${location.z}`);
      return found;
    }
  } catch {}

  try {
    const nearby = dimension.getEntities({
      type: SHULKER_ENTITY,
      location: { x: location.x + 0.5, y: location.y + 0.5, z: location.z + 0.5 },
      maxDistance: 1.5,
    });
    const found = nearby.find((e) => e.isValid);
    if (found) {
      console.warn(`[Shulker Debug] Found shulker entity via radius search at: ${location.x},${location.y},${location.z}`);
    }
    return found;
  } catch {}

  console.warn(`[Shulker Debug] WARNING: No shulker entity found at ${location.x},${location.y},${location.z}`);
  return undefined;
}

function extractDataFromItem(item) {
  if (!item) {
    console.warn(`[Shulker Debug] extractDataFromItem called with empty/null item`);
    return null;
  }
  try {
    const dp = item.getDynamicProperty(DYNAMIC_PROPERTY_KEY);
    console.warn(`[Shulker Debug] Read DynamicProperty from ${item.typeId}: ${dp ? "DATA PRESENT (" + dp.length + " chars)" : "NO DATA"}`);
    if (dp) return dp;
  } catch (err) {
    console.warn(`[Shulker Debug] Error reading DynamicProperty: ${err}`);
  }
  return null;
}

if (world.beforeEvents?.playerInteractWithBlock?.subscribe) {
  world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    if (event.itemStack?.typeId !== SHULKER_BLOCK) return;
    const player = event.player;
    if (!player?.isValid) return;

    console.warn(`[Shulker Debug] beforeEvents.playerInteractWithBlock: Player ${player.name} interacted with ${event.itemStack.typeId}`);
    const data = extractDataFromItem(event.itemStack);
    if (data) {
      pendingPlacements.set(player.id, data);
      console.warn(`[Shulker Debug] Stored pending placement data for player ID ${player.id}`);
    } else {
      console.warn(`[Shulker Debug] No container data on item held by ${player.name}`);
    }
  });
}

function processPlacementRestoration(player, block) {
  if (!player?.isValid || !block?.dimension) return;
  console.warn(`[Shulker Debug] processPlacementRestoration triggered for player ${player.name} at block ${block.location.x},${block.location.y},${block.location.z}`);

  let data = pendingPlacements.get(player.id);
  if (data) {
    pendingPlacements.delete(player.id);
    console.warn(`[Shulker Debug] Retrieved pending placement data from map for player ${player.name}`);
  } else {
    console.warn(`[Shulker Debug] No pending placement data found in map for player ${player.name}`);
    try {
      const equippable = player.getComponent("equippable");
      let item = equippable?.getEquipment("Mainhand");
      if (item?.typeId !== SHULKER_BLOCK) {
        item = equippable?.getEquipment("Offhand");
      }
      if (item?.typeId === SHULKER_BLOCK) {
        data = extractDataFromItem(item);
        console.warn(`[Shulker Debug] Directly extracted data from player hand item: ${Boolean(data)}`);
      }
    } catch (err) {
      console.warn(`[Shulker Debug] Error checking hand equipment: ${err}`);
    }
  }

  if (data) {
    const dimension = block.dimension;
    const location = { x: block.location.x, y: block.location.y, z: block.location.z };

    system.runTimeout(() => {
      console.warn(`[Shulker Debug] Timeout tick 1: Restoring shulker inventory...`);
      const entity = getShulkerEntity(dimension, location);
      if (entity?.isValid) {
        const container = entity.getComponent("inventory")?.container;
        if (container) {
          deserializeContainer(container, data);
        } else {
          console.warn(`[Shulker Debug] WARNING: Shulker entity has no inventory component!`);
        }
      } else {
        console.warn(`[Shulker Debug] WARNING: Could not find valid shulker entity to restore inventory!`);
      }
    }, 1);
  } else {
    console.warn(`[Shulker Debug] Placement complete (Empty Shulker Box - no inventory data to restore).`);
  }
}

if (world.afterEvents?.playerPlaceBlock?.subscribe) {
  world.afterEvents.playerPlaceBlock.subscribe((event) => {
    if (event.block.typeId !== SHULKER_BLOCK) return;
    console.warn(`[Shulker Debug] afterEvents.playerPlaceBlock fired for player ${event.player?.name}`);
    processPlacementRestoration(event.player, event.block);
  });
}

/** @param {BlockComponentOnPlaceEvent} data */
export function shulkerPlace(data) {
  const { block, player } = data;
  block.setPermutation(block.permutation.withState("ed:was_placed", true));
  console.warn(`[Shulker Debug] CustomComponent ed:on_place fired for block at ${block.location.x},${block.location.y},${block.location.z}`);
  if (player) {
    processPlacementRestoration(player, block);
  }
}

/** @param {import("@minecraft/server").PlayerBreakBlockBeforeEvent} event */
export function shulkerBreak(event) {
  if (event.block.typeId !== SHULKER_BLOCK) return;
  event.cancel = true;

  const block = event.block;
  const player = event.player;
  const dimension = block.dimension;
  const location = { x: block.location.x, y: block.location.y, z: block.location.z };

  console.warn(`[Shulker Debug] beforeEvents.playerBreakBlock fired for ${player?.name} at ${location.x},${location.y},${location.z}`);

  system.runTimeout(() => {
    console.warn(`[Shulker Debug] shulkerBreak timeout tick 0: Processing block break and item drop...`);
    const entity = getShulkerEntity(dimension, location);
    let lore = [];
    let data = null;

    if (entity?.isValid) {
      const container = entity.getComponent("inventory")?.container;
      if (container && player?.isValid) {
        data = serializeContainer(container);
        lore = buildLore(data);

        for (let i = 0; i < container.size; i++) {
          container.setItem(i, undefined);
        }
      }
      entity.triggerEvent("ed:despawn_event");
    } else {
      console.warn(`[Shulker Debug] WARNING: Shulker entity was not valid or not found at break time!`);
    }

    block.setType("minecraft:air");

    const item = new ItemStack(SHULKER_BLOCK, 1);
    if (data) {
      try {
        item.setDynamicProperty(DYNAMIC_PROPERTY_KEY, data);
        console.warn(`[Shulker Debug] Saved DynamicProperty onto dropped item (${data.length} chars)`);
      } catch (err) {
        console.warn(`[Shulker Debug] Error setting DynamicProperty on dropped item: ${err}`);
      }
    }
    if (lore.length) {
      item.setLore(lore);
      console.warn(`[Shulker Debug] Set lore on dropped item: ${JSON.stringify(lore)}`);
    }

    let addedToInventory = false;
    if (player?.isValid && player.getGameMode() !== "Creative") {
      const inv = player.getComponent("inventory")?.container;
      if (inv && hasSpaceInContainer(inv, item)) {
        addItem(inv, item);
        addedToInventory = true;
        console.warn(`[Shulker Debug] Added dropped shulker item directly to player inventory.`);
      }
    }

    if (!addedToInventory) {
      const itemEntity = dimension.spawnItem(item, { x: location.x + 0.5, y: location.y + 0.5, z: location.z + 0.5 });
      try {
        itemEntity.applyImpulse({ x: 0, y: 0.15, z: 0 });
      } catch {}
      console.warn(`[Shulker Debug] Spawned dropped shulker item into world with impulse.`);
    }

    if (player?.isValid && player.getGameMode() !== "Creative") {
      const equippable = player.getComponent("equippable");
      const tool = equippable?.getEquipment("Mainhand");
      if (tool?.typeId) {
        try {
          const dur = tool.getComponent("durability");
          if (dur) {
            dur.damage += 1;
            equippable.setEquipment("Mainhand", tool);
          }
        } catch {}
      }
    }
  }, 0);
}

/** @param {PlayerInteractWithEntityAfterEvent} data */
export function openShulker(data) {
  const { target: entity, player } = data;
  if (!entity?.isValid) return;
  const dimension = entity.dimension;

  if (entity.getComponent("type_family").hasTypeFamily("ed:shulker")) {
    const block = dimension.getBlock(entity.location);
    const isOpened = entity.getProperty("ed:is_opened");
    let playersUses = JSON.parse(
      entity.getDynamicProperty("playersUses") || "{}",
    );

    if (!isOpened)
      (entity.setProperty("ed:is_opened", true),
        dimension.playSound(
          shulkersConfig[block.typeId]?.openSound ||
            shulkersConfig[entity.typeId]?.openSound,
          entity.location,
        ));

    delete playersUses[player.id];
    entity.setDynamicProperty("playersUses", JSON.stringify(playersUses));

    system.runTimeout(() => {
      if (player?.isValid && entity?.isValid) {
        playersUses = JSON.parse(
          entity.getDynamicProperty("playersUses") || "{}",
        );
        playersUses[player.id] = {
          viewDirection: JSON.stringify(player.getViewVector ? player.getViewVector() : player.getViewDirection()),
        };
        entity.setDynamicProperty("playersUses", JSON.stringify(playersUses));
      }
    }, 2);
  }
}

/**
 * @param {Player} player
 * @param {Entity} entity
 */
export function closeShulker(player, entity) {
  if (!entity?.isValid || !player?.isValid) return;
  const dimension = entity.dimension;

  if (entity.getComponent("type_family").hasTypeFamily("ed:shulker")) {
    const block = dimension.getBlock(entity.location);
    const isOpened = entity.getProperty("ed:is_opened");
    const playersUses = JSON.parse(
      entity.getDynamicProperty("playersUses") || "{}",
    );

    if (isOpened && Object.keys(playersUses).length == 1)
      (entity.setProperty("ed:is_opened", false),
        dimension.playSound(
          shulkersConfig[block.typeId]?.closeSound ||
            shulkersConfig[entity.typeId]?.closeSound,
          entity.location,
        ));
    delete playersUses[player.id];
    entity.setDynamicProperty("playersUses", JSON.stringify(playersUses));
  }
}

