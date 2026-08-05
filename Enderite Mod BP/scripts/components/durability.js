import { world, system } from '@minecraft/server';

const tools = [
    'ed:enderite_sword',
    'ed:enderite_axe',
    'ed:enderite_shovel',
    'ed:enderite_pickaxe',
    'ed:enderite_hoe',
   
    // Vanilla Like
    'ed:netherite_axe',
    'ed:netherite_pickaxe',
    'ed:netherite_hoe',
    'ed:netherite_shovel',
    'ed:netherite_sword'
];

world.afterEvents.playerBreakBlock.subscribe(event => {
    try {
        const { itemStackBeforeBreak, player } = event;
        
        if (!itemStackBeforeBreak || !tools.includes(itemStackBeforeBreak.typeId)) {
            return;
        }

        let gameMode = "unknown";
        try {
            gameMode = player.getGameMode();
        } catch (e) {}
        
        const modeStr = String(gameMode).toLowerCase();
        const survival = modeStr === "survival" || modeStr === "unknown";

        if (survival) {
            // Wait 1 tick to avoid vanilla overriding our item update
            system.run(() => {
                try {
                    const equippable = player.getComponent('equippable');
                    const currentItem = equippable.getEquipment('Mainhand');
                    
                    // Make sure they are still holding the same tool
                    if (!currentItem || currentItem.typeId !== itemStackBeforeBreak.typeId) return;

                    const durability = currentItem.getComponent('durability');
                    if (!durability) return;

                    if (durability.damage + 1 >= durability.maxDurability) {
                        player.playSound('random.break', { pitch: 1, location: player.location, volume: 1 });
                        equippable.setEquipment('Mainhand', undefined);
                    } else {
                        durability.damage += 1;
                        equippable.setEquipment('Mainhand', currentItem);
                    }
                } catch (e) {}
            });
        }
    } catch (error) {}
});