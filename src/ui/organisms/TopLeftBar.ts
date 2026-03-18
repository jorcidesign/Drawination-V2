// src/ui/organisms/TopLeftBar.ts
import { IconButton } from '../atoms/IconButton';
import { ColorSwatch } from '../atoms/ColorSwatch';
import type { EventBus } from '../../input/EventBus';

export class TopLeftBar {
    public element: HTMLDivElement;
    private eventBus: EventBus;
    private static stylesInjected = false;

    private lassoBtn: IconButton;
    private activeColorSwatch: ColorSwatch;
    private currentColor: string = '#000000';

    // Los 6 colores fijos de acceso rápido
    private readonly quickColors = [
        { hex: '#000000', name: 'Negro' },
        { hex: '#E74C3C', name: 'Rojo' },
        { hex: '#2980B9', name: 'Azul' },
        { hex: '#27AE60', name: 'Verde' },
        { hex: '#F1C40F', name: 'Amarillo' },
        { hex: '#FFFFFF', name: 'Blanco' },
    ];

    constructor(eventBus: EventBus) {
        TopLeftBar.injectStyles();
        this.eventBus = eventBus;

        this.element = document.createElement('div');
        this.element.className = 'bar bar-tl';

        // 1. Botón Hamburguesa (Menú)
        const menuBtn = new IconButton({
            icon: 'menu',
            title: 'Menú',
            onClick: () => this.eventBus.emit('TOGGLE_MENU_PANEL')
        });
        menuBtn.mount(this.element);

        // Separador
        this.element.appendChild(this.createSeparator());

        // 2. Fila de Paleta de Colores
        const paletteRow = document.createElement('div');
        paletteRow.className = 'palette-row';

        // 2.1 Colores fijos
        this.quickColors.forEach(c => {
            const swatch = new ColorSwatch({
                color: c.hex,
                title: c.name,
                onClick: (color) => this.eventBus.emit('SET_COLOR', color)
            });
            swatch.mount(paletteRow);
        });

        // 2.2 Slot de Color Activo (El 7mo más grande)
        this.activeColorSwatch = new ColorSwatch({
            color: this.currentColor,
            title: 'Color activo — abrir paleta',
            isActiveSlot: true,
            onClick: () => this.eventBus.emit('TOGGLE_COLOR_PANEL')
        });
        this.activeColorSwatch.mount(paletteRow);

        this.element.appendChild(paletteRow);

        // Separador
        this.element.appendChild(this.createSeparator());

        // 3. Botón Lazo
        this.lassoBtn = new IconButton({
            icon: 'lasso',
            title: 'Lazo (L)',
            onClick: () => this.eventBus.emit('REQUEST_TOOL_SWITCH', 'lasso')
        });
        this.lassoBtn.mount(this.element);

        // 4. Botón Flip Horizontal
        const flipHBtn = new IconButton({
            icon: 'flipH',
            title: 'Espejo Horizontal',
            onClick: () => this.eventBus.emit('FLIP_HORIZONTAL')
        });
        flipHBtn.mount(this.element);

        this.bindEvents();
    }

    private createSeparator(): HTMLDivElement {
        const sep = document.createElement('div');
        sep.className = 'sep';
        return sep;
    }

    private bindEvents() {
        // Escuchar cambios de color para actualizar el 7mo slot
        this.eventBus.on('SET_COLOR', (color) => {
            this.currentColor = color;
            this.activeColorSwatch.setColor(color);
        });

        // Escuchar cambio de herramienta para iluminar el Lazo si se selecciona
        this.eventBus.on('REQUEST_TOOL_SWITCH', (toolId) => {
            if (toolId === 'lasso') {
                this.lassoBtn.setActive(true);
            } else {
                this.lassoBtn.setActive(false);
            }
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
      .bar-tl {
        top: 12px;
        left: 12px;
        z-index: var(--z-bar);
      }
      .palette-row {
        display: flex;
        gap: 2px;
        align-items: center;
      }
    `;
        document.head.appendChild(style);
    }
}