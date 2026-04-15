// src/app/DrawinationApp.ts
import '../history/commands/index';
import '../tools/index';
import { AppContainer, INITIAL_BRUSH_COLOR } from './AppContainer';
import { UIRoot } from '../ui/UIRoot';
import '../ui/tokens/design-tokens.css';
import '../ui/tokens/base.css';

export class DrawinationApp {
    public container: AppContainer;
    private uiRoot: UIRoot;

    constructor(containerId: string) {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(`Contenedor ${containerId} no encontrado`);

        this.container = new AppContainer(el);
        this.uiRoot = new UIRoot(this.container.eventBus);
    }

    public async init() {
        await this.container.start();
        this.uiRoot.mount(document.body);

        // === FIX: Auto-seleccionar Lápiz al inicio ===
        requestAnimationFrame(() => {
            this.container.eventBus.emit('SET_PROFILE_PENCIL');
            this.container.eventBus.emit('SET_COLOR', INITIAL_BRUSH_COLOR);
        });

        console.log("🚀 Drawination Engine iniciado");
    }
}