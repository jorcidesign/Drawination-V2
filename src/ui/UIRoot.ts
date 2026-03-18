// src/ui/UIRoot.ts
import type { EventBus } from '../input/EventBus';
import { TopCenterBar } from './organisms/TopCenterBar';
// Aquí importaremos el resto luego: TopLeftBar, BrushToolbar, etc.
import { BrushToolbar } from './organisms/BrushToolbar'; // <-- IMPORTAR
import { TopLeftBar } from './organisms/TopLeftBar';
import { TopRightBar } from './organisms/TopRightBar';
import { BottomLeftBar } from './organisms/BottomLeftBar';
import { HelpBar } from './organisms/HelpBar'; // <-- IMPORTAR
import { ColorPanel } from './panels/ColorPanel'; // <-- IMPORTAR
import { LayerPanel } from './panels/LayerPanel'; // <-- IMPORTAR
import { MenuPanel } from './panels/MenuPanel';
import { PanelManager } from './panels/PanelManager';

export class UIRoot {
    private container: HTMLDivElement;
    private eventBus: EventBus;

    // Organismos
    private topCenterBar: TopCenterBar;
    private brushToolbar: BrushToolbar; // <-- AÑADIR ESTO
    private topLeftBar: TopLeftBar;
    private topRightBar: TopRightBar;
    private bottomLeftBar: BottomLeftBar;
    private helpBar: HelpBar; // <-- AÑADIR ESTO
    private colorPanel: ColorPanel; // <-- DECLARAR
    private layerPanel: LayerPanel; // <-- DECLARAR
    private menuPanel: MenuPanel;
    private panelManager: PanelManager;

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;

        // Crear la capa principal de UI
        this.container = document.createElement('div');
        this.container.id = 'ui-root';

        // Instanciar Organismos
        this.topCenterBar = new TopCenterBar(this.eventBus);
        this.brushToolbar = new BrushToolbar(this.eventBus); // <-- AÑADIR ESTO
        this.topLeftBar = new TopLeftBar(this.eventBus); // <-- INSTANCIAR
        this.topRightBar = new TopRightBar(this.eventBus); // <-- INSTANCIAR
        this.bottomLeftBar = new BottomLeftBar(this.eventBus); // <-- INSTANCIAR
        this.helpBar = new HelpBar(this.eventBus); // <-- INSTANCIAR
        this.colorPanel = new ColorPanel(this.eventBus); // <-- INSTANCIAR
        this.layerPanel = new LayerPanel(this.eventBus); // <-- INSTANCIAR
        this.menuPanel = new MenuPanel(this.eventBus);
        this.panelManager = new PanelManager(this.menuPanel);

        // Montarlos en la capa UI
        this.topCenterBar.mount(this.container);
        this.brushToolbar.mount(this.container); // <-- AÑADIR ESTO
        this.topLeftBar.mount(this.container); // <-- AÑADIR ESTO
        this.topRightBar.mount(this.container); // <-- AÑADIR ESTO
        this.bottomLeftBar.mount(this.container); // <-- AÑADIR ESTO
        this.helpBar.mount(this.container); // <-- AÑADIR ESTO
        this.colorPanel.mount(this.container); // <-- MONTAR
        this.layerPanel.mount(this.container); // <-- MONTAR
        this.menuPanel.mount(this.container);

    }

    // Método para inyectar toda la UI en el DOM (se llama desde DrawinationApp)
    public mount(parentDomElement: HTMLElement = document.body) {
        parentDomElement.appendChild(this.container);
    }

    // Método para destruir la UI si fuera necesario
    public destroy() {
        if (this.container.parentElement) {
            this.container.parentElement.removeChild(this.container);
        }
    }
}