// src/app/DrawinationApp.ts
import '../history/commands/index';
import '../tools/index';
import { AppContainer } from './AppContainer';
import { DebugToolbar } from '../ui/debug/DebugToolbar';

export class DrawinationApp {
    private container: AppContainer;
    private debugToolbar: DebugToolbar;

    constructor(containerId: string) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(`Contenedor ${containerId} no encontrado`);

        // El Contenedor crea TODA la lógica del Core automáticamente
        this.container = new AppContainer(el);

        // La UI solo necesita el EventBus
        this.debugToolbar = new DebugToolbar(this.container.eventBus);
    }

    // Tu main.ts seguro llama a este método
    public async init() {
        await this.container.start();
        console.log("🚀 Drawination Engine iniciado (Arquitectura IoC)");
    }
}