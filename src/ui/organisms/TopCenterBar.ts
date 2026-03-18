// src/ui/organisms/TopCenterBar.ts
import { Slider } from '../atoms/Slider';
import { IconButton } from '../atoms/IconButton';
import type { EventBus } from '../../input/EventBus';

// Funciones matemáticas para la curva del slider de tamaño
function linearToExp(t: number, min: number, max: number, power: number = 3): number {
    return min + (max - min) * Math.pow(t, power);
}

function expToLinear(val: number, min: number, max: number, power: number = 3): number {
    if (val <= min) return 0;
    if (val >= max) return 1;
    return Math.pow((val - min) / (max - min), 1 / power);
}

export class TopCenterBar {
    public element: HTMLDivElement;
    private eventBus: EventBus;
    private static stylesInjected = false;

    private sizeSlider: Slider;
    private opacitySlider: Slider;

    private currentMinSize = 1;
    private currentMaxSize = 100;

    constructor(eventBus: EventBus) {
        TopCenterBar.injectStyles();
        this.eventBus = eventBus;

        this.element = document.createElement('div');
        this.element.className = 'bar bar-tc';

        // 1. Átomo: Slider de Tamaño
        this.sizeSlider = new Slider({
            min: 0,
            max: 1000,
            value: 130,
            formatLabel: (val) => {
                const t = val / 1000;
                const sizePx = linearToExp(t, this.currentMinSize, this.currentMaxSize, 3);
                const finalSize = Math.round(sizePx * 10) / 10;
                return `Tamaño: ${finalSize}px`;
            },
            onInput: (val) => {
                const t = val / 1000;
                const sizePx = linearToExp(t, this.currentMinSize, this.currentMaxSize, 3);
                const finalSize = Math.round(sizePx * 10) / 10;
                this.eventBus.emit('UPDATE_BRUSH_SIZE', finalSize);
            }
        });

        // Separador
        const sep1 = document.createElement('div');
        sep1.className = 'sep';

        // 2. Átomo: Botón Eyedropper
        const eyedropperBtn = new IconButton({
            icon: 'eyedropper',
            title: 'Cuentagotas',
            onClick: () => this.launchEyedropper()
        });

        // Separador
        const sep2 = document.createElement('div');
        sep2.className = 'sep';

        // 3. Átomo: Slider de Opacidad
        this.opacitySlider = new Slider({
            min: 1,
            max: 100,
            value: 80,
            formatLabel: (val) => `Opacidad: ${val}%`,
            onInput: (val) => {
                this.eventBus.emit('UPDATE_BRUSH_OPACITY', val / 100);
            }
        });

        // Ensamblaje
        this.sizeSlider.mount(this.element);
        this.element.appendChild(sep1);
        eyedropperBtn.mount(this.element);
        this.element.appendChild(sep2);
        this.opacitySlider.mount(this.element);

        // Escuchar cambios desde el core (cuando se cambia de herramienta, por ejemplo)
        this.bindEvents();
    }

    private bindEvents() {
        this.eventBus.on('SYNC_UI_SLIDERS', (payload) => {
            const { size, opacity, minSize, maxSize } = payload;

            if (minSize !== undefined) this.currentMinSize = minSize;
            if (maxSize !== undefined) this.currentMaxSize = maxSize;

            // Actualizar slider de tamaño
            const t = expToLinear(size, this.currentMinSize, this.currentMaxSize, 3);
            const sizeVal = Math.round(t * 1000);
            const sizeFormatted = `Tamaño: ${Math.round(size * 10) / 10}px`;
            this.sizeSlider.setValue(sizeVal, sizeFormatted);

            // Actualizar slider de opacidad
            const opacityVal = Math.round(opacity * 100);
            this.opacitySlider.setValue(opacityVal, `Opacidad: ${opacityVal}%`);
        });
    }

    private async launchEyedropper() {
        if (!(window as any).EyeDropper) {
            console.warn('EyeDropper API no disponible en este navegador');
            return;
        }
        try {
            const dropper = new (window as any).EyeDropper();
            const result = await dropper.open();
            if (result?.sRGBHex) {
                this.eventBus.emit('SET_COLOR', result.sRGBHex);
            }
        } catch (e) {
            // El usuario canceló (presionó Esc)
        }
    }

    public mount(parent: HTMLElement) {
        parent.appendChild(this.element);
    }

    private static injectStyles() {
        if (this.stylesInjected) return;
        this.stylesInjected = true;

        const style = document.createElement('style');
        style.textContent = `
      .bar {
        background: var(--surface-bar);
        border: 1px solid var(--surface-bar-border);
        border-radius: var(--bar-radius);
        padding: var(--bar-pad);
        display: flex;
        align-items: center;
        gap: var(--bar-gap);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        position: absolute;
      }
      .sep {
        width: 1px;
        height: 18px;
        background: var(--surface-bar-border);
        flex-shrink: 0;
      }
      .bar-tc {
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        z-index: var(--z-bar);
      }
    `;
        document.head.appendChild(style);
    }
}