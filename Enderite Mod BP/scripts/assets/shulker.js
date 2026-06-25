import { world, system, ItemStack, GameMode } from "@minecraft/server";

const SHULKER_BLOCK = "ed:enderite_shulker_box";
const SHULKER_ENTITY = "ed:enderite_shulker_box_entity";

function serializeContainer(container) {
	const data = [];
	for (let i = 0; i < container.size; i++) {
		const item = container.getItem(i);
		data.push(item ? { id: item.typeId, count: item.amount } : null);
	}
	return JSON.stringify(data);
}

function deserializeContainer(container, json) {
	try {
		const data = JSON.parse(json);
		for (let i = 0; i < Math.min(data.length, container.size); i++) {
			container.setItem(i, data[i] ? new ItemStack(data[i].id, data[i].count) : undefined);
		}
	} catch {}
}

function formatName(id) {
	const parts = id.split(":");
	return parts[1].split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function buildLore(json) {
	try {
		const slots = JSON.parse(json);
		const counts = {};
		for (const slot of slots) {
			if (slot) counts[slot.id] = (counts[slot.id] || 0) + slot.count;
		}
		const entries = Object.entries(counts);
		if (!entries.length) return [];
		const lines = entries.slice(0, 6).map(([id, count]) => "§7" + formatName(id) + " §f" + (count > 1 ? "x" + count : ""));
		if (entries.length > 6) lines.push("§7and " + (entries.length - 6) + " more...");
		return lines;
	} catch { return []; }
}

function getShulkerEntity(block) {
	const entities = block.dimension.getEntitiesAtBlockLocation(block.location);
	return entities.find(e => e.typeId === SHULKER_ENTITY && e.isValid());
}

function getQueue(player) {
	const raw = world.getDynamicProperty("sq_" + player.name);
	return raw ? JSON.parse(raw) : [];
}

function setQueue(player, queue) {
	world.setDynamicProperty("sq_" + player.name, queue.length ? JSON.stringify(queue) : undefined);
}

world.afterEvents.playerPlaceBlock.subscribe(event => {
	if (event.block.typeId !== SHULKER_BLOCK) return;

	const loc = event.block.location;
	const entity = event.block.dimension.spawnEntity(SHULKER_ENTITY, { x: loc.x + 0.5, y: loc.y, z: loc.z + 0.5 });

	const queue = getQueue(event.player);
	const data = queue.shift();
	setQueue(event.player, queue);

	if (data) {
		system.runTimeout(() => {
			if (!entity.isValid()) return;
			const container = entity.getComponent("inventory")?.container;
			if (container) deserializeContainer(container, data);
		}, 1);
	}
});

world.beforeEvents.playerBreakBlock.subscribe(event => {
	if (event.block.typeId !== SHULKER_BLOCK) return;
	event.cancel = true;

	const block = event.block;
	const player = event.player;

	system.runTimeout(() => {
		const entity = getShulkerEntity(block);

		let lore = [];
		if (entity) {
			const container = entity.getComponent("inventory")?.container;
			if (container && player) {
				const data = serializeContainer(container);
				const queue = getQueue(player);
				queue.push(data);
				setQueue(player, queue);
				lore = buildLore(data);
			}
			entity.triggerEvent("despawn");
		}

		block.setType("minecraft:air");

		const item = new ItemStack(SHULKER_BLOCK, 1);
		if (lore.length) item.setLore(lore);
		const bl = block.location;
		block.dimension.spawnItem(item, { x: bl.x + 0.5, y: bl.y + 0.5, z: bl.z + 0.5 });

		if (player?.getGameMode() !== GameMode.creative) {
			const tool = player?.getComponent("equippable")?.getEquipment("Mainhand");
			if (tool?.typeId) {
				try {
					const dur = tool.getComponent("durability");
					if (dur) dur.damage += 1;
					player.getComponent("equippable").setEquipment("Mainhand", tool);
				} catch {}
			}
		}
	}, 0);
});

world.afterEvents.entityHurt.subscribe(event => {
	if (event.hurtEntity?.typeId !== SHULKER_ENTITY) return;
	event.hurtEntity.setProperty("ed:is_opened", false);
});

world.afterEvents.playerInteractWithEntity.subscribe(event => {
	if (event.target?.typeId !== SHULKER_ENTITY) return;
	system.runTimeout(() => {
		if (!event.target.isValid()) return;
		try {
			const container = event.target.getComponent("inventory")?.container;
			if (container) event.target.setProperty("ed:is_opened", true);
		} catch {}
	}, 1);
});

system.runInterval(() => {
	for (const player of world.getAllPlayers()) {
		for (const entity of player.dimension.getEntities({ type: SHULKER_ENTITY, location: player.location, maxDistance: 48 })) {
			if (entity.location.y < -64) entity.applyImpulse({ x: 0, y: 0.4, z: 0 });
		}
	}
}, 10);
