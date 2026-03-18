// src/ui/panels/ColorPanel.ts
import { IconButton } from '../atoms/IconButton';
import { DynamicShades } from '../molecules/DynamicShades';
import { ColorHistory } from '../molecules/ColorHistory';
import type { EventBus } from '../../input/EventBus';
import iro from '@jaames/iro';
export class ColorPanel {
    public element: HTMLDivElement;
    private eventBus: EventBus;
    private static stylesInjected = false;

    private isVisible = false;
    private iroContainer: HTMLDivElement;
    private iroInstance: any = null;

    private dynamicShades: DynamicShades;
    private colorHistory: ColorHistory;

    constructor(eventBus: EventBus) {
        ColorPanel.injectStyles();
        this.eventBus = eventBus;

        this.element = document.createElement('div');
        this.element.className = 'panel';
        this.element.id = 'panel-color';

        // 1. Header (Título y Botón X)
        const header = document.createElement('div');
        header.className = 'panel-hdr';
        header.innerHTML = `<span class="panel-title">Color</span>`;

        const closeBtn = new IconButton({
            icon: 'close',
            onClick: () => this.eventBus.emit('TOGGLE_COLOR_PANEL')
        });
        closeBtn.element.className = 'panel-close'; // Override de clase para botón pequeño
        closeBtn.mount(header);
        this.element.appendChild(header);

        // 2. Iro.js Container
        this.iroContainer = document.createElement('div');
        this.iroContainer.id = 'iro-wrap';
        this.element.appendChild(this.iroContainer);

        // 3. Tonalidades (Dynamic Shades)
        const shadesLbl = document.createElement('span');
        shadesLbl.className = 'sec-lbl';
        shadesLbl.textContent = 'Tonalidades';
        this.element.appendChild(shadesLbl);

        this.dynamicShades = new DynamicShades(this.eventBus);
        this.dynamicShades.mount(this.element);

        // 4. Historial (Color History)
        const histLbl = document.createElement('span');
        histLbl.className = 'sec-lbl';
        histLbl.textContent = 'Historial';
        this.element.appendChild(histLbl);

        this.colorHistory = new ColorHistory(this.eventBus);
        this.colorHistory.mount(this.element);

        this.bindEvents();
    }

    private bindEvents() {
        this.eventBus.on('TOGGLE_COLOR_PANEL', () => {
            this.isVisible = !this.isVisible;
            if (this.isVisible) {
                this.element.classList.add('visible');
                this.initIro(); // <--- Llamamos directo a initIro()
            } else {
                this.element.classList.remove('visible');
            }
        });
        this.eventBus.on('SET_COLOR', (color) => {
            // Actualizamos Tonalidades y el Historial
            this.dynamicShades.updateColor(color);
            this.colorHistory.addColor(color);

            // Si el panel está abierto y el color NO vino de iro.js, actualizamos iro.js
            if (this.iroInstance && this.iroInstance.color.hexString.toUpperCase() !== color.toUpperCase()) {
                this.iroInstance.color.hexString = color;
            }
        });
    }

    // private loadIroJs() {
    //     if ((window as any).iro) {
    //         this.initIro();
    //         return;
    //     }
    //     const script = document.createElement('script');
    //     script.src = 'https://cdn.jsdelivr.net/npm/@jaames/iro@5';
    //     script.onload = () => this.initIro();
    //     document.head.appendChild(script);
    // }

    private initIro() {
        if (this.iroInstance) return;

        const startColor = (this.colorHistory as any).history[0] || '#000000';

        // Ahora usamos iro directamente sin el (window as any)
        this.iroInstance = new (iro.ColorPicker as any)(this.iroContainer, {
            width: 208,
            color: startColor,
            layout: [
                { component: iro.ui.Box },
                { component: iro.ui.Slider, options: { sliderType: 'hue' } }
            ],
            borderWidth: 0,
            padding: 4,
            handleRadius: 7,
            handleStrokeWidth: 2
        });

        this.iroInstance.on('color:change', (color: any) => {
            this.eventBus.emit('SET_COLOR', color.hexString);
        });
    }

    public mount(parent: HTMLElement) {
        parent.appendChild(this.element);
    }

    private static injectStyles() {
        if (this.stylesInjected) return;
        this.stylesInjected = true;

        const style = document.createElement('style');
        style.textContent = `
      .panel {
        position: absolute;
        background: var(--surface-panel);
        border: 1px solid var(--surface-panel-border);
        border-radius: var(--panel-radius);
        padding: var(--panel-pad);
        box-shadow: var(--panel-shadow);
        display: none;
        flex-direction: column;
        gap: 10px;
        pointer-events: all;
        animation: panel-in var(--t-slow) both;
      }
      @keyframes panel-in {
        from { opacity: 0; transform: translateY(-5px) scale(.97); }
        to { opacity: 1; transform: none; }
      }
      .panel.visible {
        display: flex;
      }
      .panel-hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--surface-panel-border);
        flex-shrink: 0;
      }
      .panel-title {
        font-size: var(--text-xs);
        font-weight: 600;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: .8px;
      }
      .panel-close {
        width: 20px;
        height: 20px;
        border-radius: 4px;
        border: none;
        background: transparent;
        color: var(--text-secondary);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background var(--t-fast), color var(--t-fast);
        outline: none;
        flex-shrink: 0;
      }
      .panel-close:hover {
        background: rgba(231,76,60,.14);
        color: #E74C3C;
      }
      .sec-lbl {
        font-size: 9px;
        color: var(--text-disabled);
        text-transform: uppercase;
        letter-spacing: .8px;
        display: block;
        margin-top: 2px;
      }
      /* Posicionamiento Perfecto */
      #panel-color {
        top: 56px;
        left: 60px; /* <--- FIX DE UX: Cae justo a la derecha de la BrushToolbar (que mide 48px) */
        width: 236px;
        z-index: var(--z-panel);
      }
      #iro-wrap {
        display: flex;
        justify-content: center;
        padding: 4px 0 2px;
      }
    `;
        document.head.appendChild(style);
    }
}