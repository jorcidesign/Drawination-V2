// src/ui/molecules/DynamicShades.ts
import { ColorSwatch } from '../atoms/ColorSwatch';
import type { EventBus } from '../../input/EventBus';

export class DynamicShades {
    public element: HTMLDivElement;
    private eventBus: EventBus;
    private swatches: ColorSwatch[] = [];

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
        this.element = document.createElement('div');
        this.element.style.display = 'flex';
        this.element.style.gap = '2px';
    }

    // Matemáticas de color (Hex -> HSL -> Hex)
    private hexToHsl(hex: string): [number, number, number] {
        let r = parseInt(hex.slice(1, 3), 16) / 255;
        let g = parseInt(hex.slice(3, 5), 16) / 255;
        let b = parseInt(hex.slice(5, 7), 16) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
    }

    private hslToHex(h: number, s: number, l: number): string {
        s /= 100; l /= 100;
        const k = (n: number) => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        const hex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
        return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`.toUpperCase();
    }

    public updateColor(baseHex: string) {
        this.element.innerHTML = '';
        this.swatches = [];

        const [h, s] = this.hexToHsl(baseHex);
        // 7 Niveles de luminosidad ideales para hacer sombras y brillos
        const lightnessLevels = [85, 70, 55, 40, 28, 18, 10];

        lightnessLevels.forEach(l => {
            const shadeHex = this.hslToHex(h, Math.min(s, 95), l);
            const swatch = new ColorSwatch({
                color: shadeHex,
                onClick: (c) => this.eventBus.emit('SET_COLOR', c)
            });

            // Estilos específicos para que llene la fila
            swatch.element.style.flex = '1';
            swatch.element.style.height = '18px';
            swatch.element.style.width = 'auto';
            swatch.element.style.borderRadius = '3px';

            swatch.mount(this.element);
            this.swatches.push(swatch);
        });
    }

    public mount(parent: HTMLElement) {
        parent.appendChild(this.element);
    }
}