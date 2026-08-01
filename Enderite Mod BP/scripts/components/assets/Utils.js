import { Block, Container, ItemStack } from "@minecraft/server";

export class Vector {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    static sum(vetorA, vetorB) {
        return new Vector(
            (vetorA?.x || 0) + (vetorB?.x || 0),
            (vetorA?.y || 0) + (vetorB?.y || 0),
            (vetorA?.z || 0) + (vetorB?.z || 0)
        );
    }

    static subtract(vetorA, vetorB) {
        if (!vetorA || !vetorB) return undefined;
        return new Vector((vetorA.x || 0) - (vetorB.x || 0), (vetorA.y || 0) - (vetorB.y || 0), (vetorA.z || 0) - (vetorB.z || 0));
    }

    static compare(a, b) {
        if (!a || !b) return false;
        return Math.floor(a.x) === Math.floor(b.x) &&
            Math.floor(a.y) === Math.floor(b.y) &&
            Math.floor(a.z) === Math.floor(b.z);
    }
}

export function hasSpaceInContainer(container, itemStack) {
    if (!container || !itemStack) return false;
    const maxStack = itemStack.maxAmount;
    const itemType = itemStack.typeId;

    for (let i = 0; i < container.size; i++) {
        const slot = container.getItem(i);
        if (!slot) return true;
        if (slot.typeId === itemType && slot.amount < maxStack) return true;
    }

    return false;
}

export function addItem(container, itemStack) {
    if (!container || !itemStack) return itemStack?.amount || 0;
    let remaining = itemStack.amount;
    const maxStack = itemStack.maxAmount;
    const itemType = itemStack.typeId;

    for (let i = 0; i < container.size; i++) {
        const slot = container.getItem(i);
        if (slot && slot.typeId === itemType && slot.amount < maxStack) {
            const space = maxStack - slot.amount;
            const toAdd = Math.min(space, remaining);
            slot.amount += toAdd;
            container.setItem(i, slot);
            remaining -= toAdd;
            if (remaining <= 0) return 0;
        }
    }

    for (let i = 0; i < container.size; i++) {
        const slot = container.getItem(i);
        if (!slot) {
            const toAdd = Math.min(maxStack, remaining);
            const newStack = itemStack.clone();
            newStack.amount = toAdd;
            container.setItem(i, newStack);
            remaining -= toAdd;
            if (remaining <= 0) return 0;
        }
    }

    return remaining;
}

export function getConnectedHoppers(block) {
    const hoppers = {};
    if (!block) return hoppers;

    const above = block.above();
    if (
        above?.typeId === "minecraft:hopper" &&
        !above.getRedstonePower() &&
        above.permutation.getState("facing_direction") === 0
    ) {
        hoppers["above"] = above;
    }

    const below = block.below();
    if (below?.typeId === "minecraft:hopper") {
        hoppers["below"] = below;
    }

    return hoppers;
}
