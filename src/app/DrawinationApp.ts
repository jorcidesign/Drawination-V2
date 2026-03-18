// src/app/DrawinationApp.ts
import '../history/commands/index';
import '../tools/index';
import { AppContainer } from './AppContainer';
import { DebugToolbar } from '../ui/debug/DebugToolbar';
import { UIRoot } from '../ui/UIRoot';
import '../ui/tokens/design-tokens.css'; // Importa variables
import '../ui/tokens/base.css';          // Importa reset y layout base

export class DrawinationApp {
    private container: AppContainer;
    private uiRoot: UIRoot; // <--- AÑADIR ESTO
    // private debugToolbar: DebugToolbar;

    constructor(containerId: string) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(`Contenedor ${containerId} no encontrado`);

        this.container = new AppContainer(el);
        // this.debugToolbar = new DebugToolbar(this.container.eventBus);
        this.uiRoot = new UIRoot(this.container.eventBus);
    }

    public async init() {
        await this.container.start();
        this.uiRoot.mount(document.body);
        console.log("🚀 Drawination Engine iniciado");
        // this.debugToolbar.connectBot(this.container.engine.container);
    }
}