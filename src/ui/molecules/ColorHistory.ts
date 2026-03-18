// src/ui/molecules/ColorHistory.ts
import { ColorSwatch } from '../atoms/ColorSwatch';
import type { EventBus } from '../../input/EventBus';

export class ColorHistory {
    public element: HTMLDivElement;
    private eventBus: EventBus;
    private history: string[] = [];

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
        this.element = document.createElement('div');
        this.element.style.display = 'flex';
        this.element.style.flexWrap = 'wrap';
        this.element.style.gap = '3px';
    }

    public addColor(hex: string) {
        const color = hex.toUpperCase();

        // Si ya es el primero, no hacemos nada
        if (this.history[0] === color) return;

        // Quitamos si ya existía para subirlo al primer lugar
        this.history = this.history.filter(c => c !== color);
        this.history.unshift(color);

        // Límite de 21 colores (3 filas de 7)
        if (this.history.length > 21) {
            this.history.pop();
        }

        this.render();
    }

    private render() {
        this.element.innerHTML = '';

        this.history.forEach(color => {
            const swatch = new ColorSwatch({
                color: color,
                onClick: (c) => this.eventBus.emit('SET_COLOR', c)
            });

            // Estilo para el grid de historial
            swatch.element.style.width = '26px';
            swatch.element.style.height = '26px';
            swatch.element.style.borderRadius = '4px';

            swatch.mount(this.element);
        });
    }

    public mount(parent: HTMLElement) {
        parent.appendChild(this.element);
    }
}