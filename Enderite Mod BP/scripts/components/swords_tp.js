import { system } from '@minecraft/server';
import { useEnderiteSwordTeleport } from '../core/teleport.js';

system.beforeEvents.startup.subscribe(initEvent => {
    const itemRegistry = initEvent.itemComponentRegistry;
    if (!itemRegistry) return;

    const swordHandler = {
        onUse: useEvent => {
            const { source: player, itemStack } = useEvent;
            if (player && player.isSneaking) {
                useEnderiteSwordTeleport(player, itemStack);
            }
        }
    };

    // Registrar componentes de todas las variantes de espada teleportable
    itemRegistry.registerCustomComponent('ed:sword16', swordHandler);
    itemRegistry.registerCustomComponent('ed:sword32', swordHandler);
    itemRegistry.registerCustomComponent('ed:sword48', swordHandler);
    itemRegistry.registerCustomComponent('ed:sword64', swordHandler);
});