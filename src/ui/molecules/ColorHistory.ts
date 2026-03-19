// src/ui/molecules/ColorHistory.ts
// Solo reacciona a APPLY_COLOR — elecciones explícitas del usuario.
// No reordena colores que ya están en el historial.
// No duplica colores.
import { ColorSwatch } from '../atoms/ColorSwatch';
import type { EventBus } from '../../input/EventBus';

export class ColorHistory {
    public element: HTMLDivElement;
    private eventBus: EventBus;
    private history: string[] = [];
    private readonly MAX_COLORS = 21;

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
        this.element = document.createElement('div');
        this.element.style.display = 'flex';
        this.element.style.flexWrap = 'wrap';
        this.element.style.gap = '3px';

        // Solo escucha APPLY_COLOR — no SET_COLOR
        // Esto evita que cambios de herramienta o drag de iro.js contaminen el historial
        this.eventBus.on('APPLY_COLOR', (color: string) => {
            this.addColor(color);
        });
    }

    public addColor(hex: string) {
        const color = hex.toUpperCase();

        // Si ya existe en el historial — no hacer nada
        // No reordenamos: el historial es estable, no baila con cada cambio
        if (this.history.includes(color)) return;

        // Color nuevo — añadir al inicio
        this.history.unshift(color);

        // Respetar límite
        if (this.history.length > this.MAX_COLORS) {
            this.history.pop();
        }

        this.render();
    }

    public getLastColor(): string | null {
        return this.history[0] ?? null;
    }

    private render() {
        this.element.innerHTML = '';

        this.history.forEach(color => {
            const swatch = new ColorSwatch({
                color,
                onClick: (c) => {
                    // Click en historial = elección explícita
                    this.eventBus.emit('APPLY_COLOR', c);
                    this.eventBus.emit('SET_COLOR', c);
                }
            });

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