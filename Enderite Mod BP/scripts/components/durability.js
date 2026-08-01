import { world } from '@minecraft/server';

const tools = [
    'ed:enderite_sword',
    'ed:enderite_axe',
    'ed:enderite_shovel',
    'ed:enderite_pickaxe',
    'ed:enderite_hoe'
];

world.afterEvents.playerBreakBlock.subscribe(event => {
    const { itemStackBeforeBreak, player } = event;
    const survival = player.getGameMode() == "survival";
    if (!itemStackBeforeBreak || !tools.includes(itemStackBeforeBreak.typeId)) return;

    if (survival) {
        try {
            const durability = itemStackBeforeBreak.getComponent('durability');
            durability.damage += 1;
            player.getComponent('equippable').setEquipment('Mainhand', itemStackBeforeBreak);
        } catch {
            player.playSound('random.break', { pitch: 1, location: player.location, volume: 1 });
            player.getComponent('equippable').setEquipment('Mainhand');
        }
    }
});