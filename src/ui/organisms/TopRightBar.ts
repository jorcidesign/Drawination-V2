// src/ui/organisms/TopRightBar.ts
import { IconButton } from '../atoms/IconButton';
import type { EventBus } from '../../input/EventBus';

export class TopRightBar {
    public element: HTMLDivElement;
    private eventBus: EventBus;
    private static stylesInjected = false;

    private layersBtn: IconButton;

    constructor(eventBus: EventBus) {
        TopRightBar.injectStyles();
        this.eventBus = eventBus;

        this.element = document.createElement('div');
        this.element.className = 'bar bar-tr';

        // 1. Botón Capas
        this.layersBtn = new IconButton({
            icon: 'layers',
            title: 'Capas',
            onClick: () => {
                // Solo emitimos la intención, la UI reaccionará al evento de confirmación
                this.eventBus.emit('TOGGLE_LAYER_PANEL');
            }
        });
        this.layersBtn.mount(this.element);

        // Separador
        this.element.appendChild(this.createSeparator());

        // 2. Botón Descargar PNG
        const downloadImgBtn = new IconButton({
            icon: 'downloadImage',
            title: 'Descargar PNG',
            onClick: () => this.eventBus.emit('DOWNLOAD_PNG')
        });
        downloadImgBtn.mount(this.element);

        // 3. Botón Descargar Video Timelapse
        const downloadVidBtn = new IconButton({
            icon: 'downloadVideo',
            title: 'Descargar Timelapse (30s)',
            onClick: () => this.eventBus.emit('DOWNLOAD_VIDEO')
        });
        downloadVidBtn.mount(this.element);

        // Separador
        this.element.appendChild(this.createSeparator());

        // 4. Botón Reproducir Timelapse (Destacado)
        const playTimelapseBtn = new IconButton({
            icon: 'play',
            title: 'Reproducir Timelapse',
            variant: 'accent',
            onClick: () => this.eventBus.emit('PLAY_TIMELAPSE')
        });
        playTimelapseBtn.mount(this.element);

        this.bindEvents();
    }

    private bindEvents() {
        // === FIX: Escuchamos la "fuente única de verdad" del panel ===
        this.eventBus.on('LAYER_PANEL_STATE_CHANGED', (isOpen) => {
            this.layersBtn.setActive(isOpen);
        });
    }

    private createSeparator(): HTMLDivElement {
        const sep = document.createElement('div');
        sep.className = 'sep';
        return sep;
    }

    public mount(parent: HTMLElement) {
        parent.appendChild(this.element);
    }

    private static injectStyles() {
        if (this.stylesInjected) return;
        this.stylesInjected = true;

        const style = document.createElement('style');
        style.textContent = `
      .bar-tr {
        top: 12px;
        right: 12px;
        z-index: var(--z-bar);
      }
    `;
        document.head.appendChild(style);
    }
}