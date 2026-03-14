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

        this.container = new AppContainer(el);
        this.debugToolbar = new DebugToolbar(this.container.eventBus);
    }

    public async init() {
        await this.container.start();
        console.log("🚀 Drawination Engine iniciado");
        this.debugToolbar.connectBot(this.container.engine.container);
    }
}