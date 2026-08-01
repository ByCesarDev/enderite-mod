import { system, world, EntityEquippableComponent, EquipmentSlot } from "@minecraft/server";


let tags = ["enderite"]

system.runInterval(() => {
    try {
        let w = world.getDimension("overworld");
        for (let p of world.getPlayers()) {
            let equip = p.getComponent(EntityEquippableComponent.componentId);
            let hand = equip.getEquipment(EquipmentSlot.Mainhand);
            const runCmd = (cmd) => (p.runCommand ? p.runCommand(cmd) : p.runCommandAsync(cmd));
            runCmd(`function arrow`)
            runCmd(`function gamerule`)
            for (let bows of tags) {
                if (p.hasTag("using")) {
                    if (p.hasTag(bows) && hand.typeId == `ed:${bows}_bow`) {
                        runCmd(`playanimation @s animation.weapons.bow_and_arrow root 0.001 "!query.is_using_item"`)
                    }

                }
                if (p.hasComponent("health").currentValue == 0) {

                    p.removeTag(bows);
                }
            }
        }
    } catch (e) {

    }
})


world.afterEvents.itemUse.subscribe((use) => {
    try {
        let p = use.source;
        let bow = "_bow";
        let item = use.itemStack.typeId;
        if (item.toLowerCase().includes(bow)) {
            p.addTag("using");
        }
    } catch (e) {

    }
});

world.afterEvents.itemStopUse.subscribe((stop) => {
    try {
        let p = stop.source;
        let item = stop.itemStack;
        let durability = item.getComponent("durability").damage;
        let maxDurability = item.getComponent("durability").maxDurability;
        p.removeTag("using");

        const runCmd = (cmd) => (p.runCommand ? p.runCommand(cmd) : p.runCommandAsync(cmd));
        for (let bows of tags) {
            if (item.typeId == `ed:${bows}_bow` && p.hasTag("using")) {
                runCmd(`replaceitem entity @s slot.weapon.mainhand 0 ${item.typeId} 1 ${durability + 2}`)
                if (durability == maxDurability) {
                    runCmd(`replaceitem entity @s slot.weapon.mainhand 0 air`)
                    runCmd("playsound random.item_break @s ~~~")
                }
            }
        }
    } catch (e) {

    }
})
