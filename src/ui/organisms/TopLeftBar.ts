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

        const menuBtn = new IconButton({
            icon: 'menu',
            title: 'Menú',
            onClick: () => this.eventBus.emit('TOGGLE_MENU_PANEL')
        });
        menuBtn.mount(this.element);

        this.element.appendChild(this.createSeparator());

        const paletteRow = document.createElement('div');
        paletteRow.className = 'palette-row';

        // Paleta rápida — elección explícita → APPLY_COLOR + SET_COLOR
        this.quickColors.forEach(c => {
            const swatch = new ColorSwatch({
                color: c.hex,
                title: c.name,
                onClick: (color) => {
                    this.eventBus.emit('APPLY_COLOR', color);
                    this.eventBus.emit('SET_COLOR', color);
                }
            });
            swatch.mount(paletteRow);
        });

        // Cuadradito 7 — abre el panel de color
        this.activeColorSwatch = new ColorSwatch({
            color: this.currentColor,
            title: 'Color activo — abrir paleta',
            isActiveSlot: true,
            onClick: () => this.eventBus.emit('TOGGLE_COLOR_PANEL')
        });
        this.activeColorSwatch.mount(paletteRow);

        this.element.appendChild(paletteRow);
        this.element.appendChild(this.createSeparator());

        this.lassoBtn = new IconButton({
            icon: 'lasso',
            title: 'Lazo (L)',
            onClick: () => this.eventBus.emit('REQUEST_TOOL_SWITCH', 'lasso')
        });
        this.lassoBtn.mount(this.element);

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
        // Cuadradito 7 responde a SET_COLOR — siempre, venga de donde venga
        this.eventBus.on('SET_COLOR', (color) => {
            this.currentColor = color;
            this.activeColorSwatch.setColor(color);
        });

        // También actualizar en APPLY_COLOR por si acaso
        this.eventBus.on('APPLY_COLOR', (color) => {
            this.currentColor = color;
            this.activeColorSwatch.setColor(color);
        });

        this.eventBus.on('REQUEST_TOOL_SWITCH', (toolId) => {
            this.lassoBtn.setActive(toolId === 'lasso');
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