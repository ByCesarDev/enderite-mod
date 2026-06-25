import { world, system, EquipmentSlot, ItemStack } from "@minecraft/server";

system.runInterval(() => {
	let players = world.getAllPlayers();
	players.forEach((player) => {
		const equippable = player?.getComponent("equippable");
		const inventory = player.getComponent("inventory");
		let chestSlot = equippable?.getEquipment(EquipmentSlot.Chest);
		let damage = chestSlot?.getComponent("durability")?.damage;

		// Elytras
		const tierElytras = {
			"elytra:chesplate": 9,
			"elytra:enderite": 9,
		};

		if (
			!player.hasTag("change_durability") &&
			player.isGliding &&
			chestSlot &&
			tierElytras[chestSlot?.getDynamicProperty("elytra:variant")] > 0
		) {
			system.runTimeout(() => {
				let NewchestSlot = equippable?.getEquipment(EquipmentSlot.Chest);
				if (NewchestSlot && NewchestSlot.getComponent("durability").damage > damage) {
					player.addTag("change_durability");
				}
			}, 1);
		}

		// Passive Effects
		passiveEffects(player, equippable, chestSlot);

		if (player.hasTag("change_durability")) {
			let chance = Math.floor(Math.random() * 11);
			let damageChance = tierElytras[chestSlot?.getDynamicProperty("elytra:variant")];
			if (chance <= damageChance) {
				let prevDurability = chestSlot.clone();
				prevDurability.getComponent("durability").damage = damage - 1;
				equippable.setEquipment(EquipmentSlot.Chest, prevDurability);
			} else {
				// Effect handling (if any)
			}
			player.removeTag("change_durability");
		}

		// Broken Elytras
		if (
			chestSlot?.getComponent("durability")?.damage === 431 &&
			chestSlot?.typeId === "minecraft:elytra" &&
			chestSlot?.getDynamicPropertyTotalByteCount() > 0
		) {
			player.playSound("random.break");
			turnItemInto(
				chestSlot,
				new ItemStack(chestSlot.getDynamicProperty("elytra:variant") + "_broken"),
				EquipmentSlot.Chest,
				undefined,
				equippable
			);
		}

		// Repaired Elytras
		if (chestSlot?.getComponent("durability")?.damage < 431 && chestSlot?.typeId?.endsWith("_broken")) {
			turnItemInto(
				chestSlot,
				new ItemStack(chestSlot?.typeId.replace(/_broken/g, "")),
				EquipmentSlot.Chest,
				undefined,
				equippable
			);
		}

		player.setDynamicProperty("score:score", (player.getDynamicProperty("score:score") || 0) + 1);

		if (player.getDynamicProperty("score:score") < 2 && !player.isSneaking) {
			player.nameTag = player.name;
		}

		if (player.getDynamicProperty("score:score") < 2 && player.isSneaking) {
			player.nameTag = "";
		}

		if (player.getDynamicProperty("score:score") >= 11 && !player.hasTag("cooldown:score")) {
			if (chestSlot?.getDynamicProperty("elytra:variant") === undefined) {
				player.nameTag = "§f";
			}

			if (chestSlot?.getDynamicProperty("elytra:variant") === "elytra:chesplate") {
				player.nameTag = "§6";
			}

			if (chestSlot?.getDynamicProperty("elytra:variant") === "elytra:enderite") {
				player.nameTag = "§7";
			}

			player.setDynamicProperty("score:score", 0);
		}

		if (
			chestSlot?.typeId?.startsWith("elytra:") &&
			!chestSlot?.typeId?.endsWith("_broken") &&
			chestSlot?.getComponent("durability")?.damage !== 431
		) {
			system.runTimeout(() => {
				// Modified Elytra
				player.setDynamicProperty("score:score", 12);

				const protectionValues = {
					"elytra:chesplate": 9,
					"elytra:enderite": 9,
				};

				const parts = chestSlot?.typeId.split(":");
				let modifiedElytra = new ItemStack("minecraft:elytra");

				if (chestSlot) {
					modifiedElytra.setDynamicProperty("elytra:variant", chestSlot.typeId);
					modifiedElytra.setDynamicProperty("elytra:protection", protectionValues[chestSlot.typeId] || 9);
					modifiedElytra.nameTag =
						"§r§d" +
						parts[1].charAt(0).toUpperCase() +
						parts[1].substring(1) +
						" " +
						parts[0].charAt(0).toUpperCase() +
						parts[0].substring(1);
					modifiedElytra.getComponent("durability").damage = chestSlot.getComponent("durability").damage;
					turnItemInto(chestSlot, modifiedElytra, EquipmentSlot.Chest, undefined, equippable);
				}
			});
		}

		// Check inventory slots
		for (let i = 0; i <= 35; i++) {
			const getItem = inventory?.container?.getItem(i);
			if (getItem !== undefined) {
				const getSlot = getItem?.getDynamicProperty("elytra:variant");
				let slotItem;
				if (getSlot !== undefined) {
					slotItem = new ItemStack(getSlot);
				}
				if (getItem.typeId?.endsWith("_broken") && getItem.getComponent("durability")?.damage !== 431) {
					slotItem = new ItemStack(getItem.typeId.replace(/_broken/g, ""));
				}
				if (slotItem !== undefined) {
					slotItem.getComponent("durability").damage = getItem.getComponent("durability").damage;
					turnItemInto(getItem, slotItem, i, inventory);
				}
			}
		}
	});
});

// Function to replace an item with another item
function turnItemInto(itemToReplace, ItemToGet, slot, inventory, equippable) {
	let damageReplace = itemToReplace.getComponent("durability");
	let damageItemToGet = ItemToGet.getComponent("durability");

	damageItemToGet.damage = damageReplace.damage;

	const enchantments = itemToReplace.getComponent("enchantable").getEnchantments();
	enchantments.forEach((enchantment) => {
		ItemToGet.getComponent("enchantable").addEnchantment(enchantment);
	});

	if (slot !== EquipmentSlot.Chest && inventory) {
		inventory.container.setItem(slot, ItemToGet);
	} else if (equippable) {
		equippable.setEquipment(slot, ItemToGet);
	}
}

// Function to handle passive effects
function passiveEffects(player, equippable, chestSlot) {
	const worldEntities = player.dimension.getEntities({ tags: ['elytra:test'] });

	// Wind Charge
	let playervelocity = player.getVelocity();
	let velocityX = Math.abs(parseFloat(playervelocity.x.toFixed(1)));
	let velocityY = Math.abs(parseFloat(playervelocity.y.toFixed(1)));
	let velocityZ = Math.abs(parseFloat(playervelocity.z.toFixed(1)));

	if (
		player.isGliding &&
		(Math.abs(velocityX) > 0.9 || Math.abs(velocityY) > 0.9 || Math.abs(velocityZ) > 0.9)
	) {
		const nearestEntities = player.dimension.getEntities({ location: player.location, maxDistance: 2 });
		nearestEntities.forEach((entity) => {
			if (entity.id === player.id || entity.getComponent("health") === undefined) return;

			const viewDirection = player.getViewDirection();
			const directionX = viewDirection.x;
			const directionZ = viewDirection.z;
			// Handle effect here if needed
		}, 1);
	}
}

// Apply protection from custom elytras
world.afterEvents.entityHurt.subscribe((event) => {
	const player = event.hurtEntity;
	if (player.typeId !== "minecraft:player") return;

	const equippable = player.getComponent("equippable");
	const chestSlot = equippable?.getEquipment(EquipmentSlot.Chest);

	if (chestSlot?.getDynamicProperty("elytra:protection")) {
		const protection = chestSlot.getDynamicProperty("elytra:protection");
		const reduction = protection * 0.04;
		const healAmount = Math.min(event.damage * reduction, event.damage - 1);
		const health = player.getComponent("health");
		health.current = Math.min(health.effectiveMax, health.current + healAmount);
	}
});

// Subscribe to player spawn events
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
	if (initialSpawn === true) {
		player.setDynamicProperty("score:score", 0);
	}
});
