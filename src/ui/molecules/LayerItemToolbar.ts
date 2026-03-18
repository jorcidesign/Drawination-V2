// src/ui/molecules/LayerItemToolbar.ts
import { IconButton } from '../atoms/IconButton';
import type { EventBus } from '../../input/EventBus';

export class LayerItemToolbar {
    public element: HTMLDivElement;
    private eventBus: EventBus;
    private static stylesInjected = false;

    private currentLayerId: number = -1;

    constructor(eventBus: EventBus) {
        LayerItemToolbar.injectStyles();
        this.eventBus = eventBus;

        this.element = document.createElement('div');
        this.element.className = 'bar bar--v layer-toolbar';

        // 1. Bloquear
        const lockBtn = new IconButton({
            icon: 'lock',
            title: 'Bloquear Capa',
            variant: 'sm',
            onClick: () => this.eventBus.emit('LAYER_ACTION_LOCK', this.currentLayerId)
        });

        // 2. Duplicar
        const dupBtn = new IconButton({
            icon: 'duplicate',
            title: 'Duplicar Capa',
            variant: 'sm',
            onClick: () => this.eventBus.emit('LAYER_ACTION_DUPLICATE', this.currentLayerId)
        });

        // 3. Merge Down (Fusionar hacia abajo)
        const mergeBtn = new IconButton({
            icon: 'mergeDown',
            title: 'Fusionar hacia abajo',
            variant: 'sm',
            onClick: () => this.eventBus.emit('LAYER_ACTION_MERGE', this.currentLayerId)
        });

        // 4. Eliminar
        const delBtn = new IconButton({
            icon: 'trash',
            title: 'Eliminar Capa',
            variant: 'danger',
            onClick: () => {
                if (confirm('¿Eliminar esta capa?')) {
                    this.eventBus.emit('LAYER_ACTION_DELETE', this.currentLayerId);
                }
            }
        });

        lockBtn.mount(this.element);
        dupBtn.mount(this.element);
        mergeBtn.mount(this.element);

        const sep = document.createElement('div');
        sep.className = 'sep sep--h';
        this.element.appendChild(sep);

        delBtn.mount(this.element);
    }

    // Se llama desde el LayerPanel para posicionar el menú dinámicamente
    public show(layerId: number, topPosition: number) {
        this.currentLayerId = layerId;
        this.element.classList.add('visible');
        // Lo alineamos con el centro de la capa activa
        this.element.style.transform = `translateY(${topPosition}px)`;
    }

    public hide() {
        this.element.classList.remove('visible');
    }

    public mount(parent: HTMLElement) {
        parent.appendChild(this.element);
    }

    private static injectStyles() {
        if (this.stylesInjected) return;
        this.stylesInjected = true;

        const style = document.createElement('style');
        style.textContent = `
      .layer-toolbar {
        position: absolute;
        left: -42px; /* Flota por fuera del panel hacia la izquierda */
        top: 0;
        padding: 4px;
        z-index: 10;
        opacity: 0;
        pointer-events: none;
        transition: transform 150ms ease, opacity 150ms ease;
      }
      .layer-toolbar.visible {
        opacity: 1;
        pointer-events: all;
      }
    `;
        document.head.appendChild(style);
    }
}