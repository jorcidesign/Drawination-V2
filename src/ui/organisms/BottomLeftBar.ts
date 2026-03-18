// src/ui/organisms/BottomLeftBar.ts
import { IconButton } from '../atoms/IconButton';
import type { EventBus } from '../../input/EventBus';

export class BottomLeftBar {
    public element: HTMLDivElement;
    private eventBus: EventBus;
    private static stylesInjected = false;

    private zoomBtn: HTMLButtonElement;
    private angleBtn: HTMLButtonElement;

    constructor(eventBus: EventBus) {
        BottomLeftBar.injectStyles();
        this.eventBus = eventBus;

        this.element = document.createElement('div');
        this.element.className = 'bar bar-bl';

        // 1. Botón Deshacer (Undo) - Variante pequeña (sm)
        const undoBtn = new IconButton({
            icon: 'undo',
            title: 'Deshacer (Ctrl+Z)',
            variant: 'sm',
            onClick: () => this.eventBus.emit('REQUEST_UNDO')
        });
        undoBtn.mount(this.element);

        // 2. Botón Rehacer (Redo) - Variante pequeña (sm)
        const redoBtn = new IconButton({
            icon: 'redo',
            title: 'Rehacer (Ctrl+Y)',
            variant: 'sm',
            onClick: () => this.eventBus.emit('REQUEST_REDO')
        });
        redoBtn.mount(this.element);

        // Separador
        this.element.appendChild(this.createSeparator());

        // 3. Botón de estado: Zoom
        this.zoomBtn = document.createElement('button');
        this.zoomBtn.className = 'status-btn';
        this.zoomBtn.title = 'Click para restablecer zoom';
        this.zoomBtn.textContent = '100%';
        this.zoomBtn.onclick = () => this.eventBus.emit('RESET_ZOOM');
        this.element.appendChild(this.zoomBtn);

        // 4. Botón de estado: Ángulo (Rotación)
        this.angleBtn = document.createElement('button');
        this.angleBtn.className = 'status-btn';
        this.angleBtn.title = 'Click para restablecer rotación';
        this.angleBtn.textContent = '0°';
        this.angleBtn.onclick = () => this.eventBus.emit('RESET_ROTATION');
        this.element.appendChild(this.angleBtn);

        this.bindEvents();
    }

    private createSeparator(): HTMLDivElement {
        const sep = document.createElement('div');
        sep.className = 'sep';
        return sep;
    }

    private bindEvents() {
        // Escuchamos los cambios de la cámara para actualizar los textos en tiempo real
        this.eventBus.on('VIEWPORT_CHANGED', ({ zoom, angle }) => {
            // Formatear zoom (ej: 1.5 -> 150%)
            const zoomPct = Math.round(zoom * 100);
            this.zoomBtn.textContent = `${zoomPct}%`;

            // Formatear ángulo (ej: 45.2 -> 45°)
            const angleDeg = Math.round(angle);
            this.angleBtn.textContent = `${angleDeg}°`;
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
      .bar-bl {
        bottom: 14px;
        left: 12px;
        z-index: var(--z-bar);
      }
      .status-btn {
        height: var(--btn-sm-size);
        padding: 0 8px;
        border-radius: 6px;
        border: none;
        background: transparent;
        color: var(--text-secondary);
        font-family: var(--font-mono);
        font-size: var(--text-sm);
        cursor: pointer;
        transition: background var(--t-fast), color var(--t-fast);
        white-space: nowrap;
        outline: none;
      }
      .status-btn:hover {
        background: var(--surface-hover);
        color: var(--text-primary);
      }
      .status-btn:active {
        background: var(--surface-active);
        color: var(--accent-bright);
      }
    `;
        document.head.appendChild(style);
    }
}