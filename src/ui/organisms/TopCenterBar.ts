// src/ui/organisms/TopCenterBar.ts
import { Slider } from '../atoms/Slider';
import { IconButton } from '../atoms/IconButton';
import type { EventBus } from '../../input/EventBus';

function linearToExp(t: number, min: number, max: number, power: number = 3): number {
    return min + (max - min) * Math.pow(t, power);
}

function expToLinear(val: number, min: number, max: number, power: number = 3): number {
    if (val <= min) return 0;
    if (val >= max) return 1;
    return Math.pow((val - min) / (max - min), 1 / power);
}

const TOOL_SLIDER_CONFIG: Record<string, { size: boolean; opacity: boolean }> = {
    'pencil-hb': { size: true, opacity: true },
    'ink-pen': { size: true, opacity: true },
    'oil-brush': { size: true, opacity: true },
    'hard-round': { size: true, opacity: true },
    'airbrush': { size: true, opacity: true },
    'charcoal': { size: true, opacity: true },
    'solid-fill': { size: false, opacity: true },
    'eraser': { size: true, opacity: true },
    'vector-eraser': { size: false, opacity: false },
    'lasso': { size: false, opacity: false },
    'transform-handle': { size: false, opacity: false },
    'pan': { size: false, opacity: false },
    'zoom': { size: false, opacity: false },
    'rotate': { size: false, opacity: false },
    'move': { size: false, opacity: false },
};

export class TopCenterBar {
    public element: HTMLDivElement;
    private eventBus: EventBus;
    private static stylesInjected = false;

    private sizeSlider: Slider;
    private opacitySlider: Slider;
    private sizeWrap: HTMLDivElement;
    private opacityWrap: HTMLDivElement;
    private sep1: HTMLDivElement;
    private sep2: HTMLDivElement;

    private currentMinSize = 1;
    private currentMaxSize = 100;

    constructor(eventBus: EventBus) {
        TopCenterBar.injectStyles();
        this.eventBus = eventBus;

        this.element = document.createElement('div');
        this.element.className = 'bar bar-tc';

        this.sizeWrap = document.createElement('div');
        this.sizeWrap.className = 'slider-outer';

        this.sizeSlider = new Slider({
            min: 0, max: 1000, value: 130,
            formatLabel: (val) => {
                const sizePx = linearToExp(val / 1000, this.currentMinSize, this.currentMaxSize, 3);
                return `Tamaño: ${Math.round(sizePx * 10) / 10}px`;
            },
            onInput: (val) => {
                const sizePx = linearToExp(val / 1000, this.currentMinSize, this.currentMaxSize, 3);
                this.eventBus.emit('UPDATE_BRUSH_SIZE', Math.round(sizePx * 10) / 10);
            }
        });
        this.sizeSlider.mount(this.sizeWrap);

        this.sep1 = document.createElement('div');
        this.sep1.className = 'sep';

        const eyedropperBtn = new IconButton({
            icon: 'eyedropper',
            title: 'Cuentagotas',
            onClick: () => this.launchEyedropper()
        });

        this.sep2 = document.createElement('div');
        this.sep2.className = 'sep';

        this.opacityWrap = document.createElement('div');
        this.opacityWrap.className = 'slider-outer';

        this.opacitySlider = new Slider({
            min: 1, max: 100, value: 80,
            formatLabel: (val) => `Opacidad: ${val}%`,
            onInput: (val) => {
                this.eventBus.emit('UPDATE_BRUSH_OPACITY', val / 100);
            }
        });
        this.opacitySlider.mount(this.opacityWrap);

        this.element.appendChild(this.sizeWrap);
        this.element.appendChild(this.sep1);
        eyedropperBtn.mount(this.element);
        this.element.appendChild(this.sep2);
        this.element.appendChild(this.opacityWrap);

        this.bindEvents();
    }

    private bindEvents() {
        this.eventBus.on('SYNC_UI_SLIDERS', (payload) => {
            const { size, opacity, minSize, maxSize } = payload;
            if (minSize !== undefined) this.currentMinSize = minSize;
            if (maxSize !== undefined) this.currentMaxSize = maxSize;
            const t = expToLinear(size, this.currentMinSize, this.currentMaxSize, 3);
            this.sizeSlider.setValue(Math.round(t * 1000), `Tamaño: ${Math.round(size * 10) / 10}px`);
            this.opacitySlider.setValue(Math.round(opacity * 100), `Opacidad: ${Math.round(opacity * 100)}%`);
        });

        this.eventBus.on('ACTIVE_TOOL_CHANGED', (toolId: string) => {
            this._applySliderConfig(toolId);
        });

        this.eventBus.on('REQUEST_TOOL_SWITCH', (toolId: string) => {
            this._applySliderConfig(toolId);
        });
    }

    private _applySliderConfig(toolId: string): void {
        const config = TOOL_SLIDER_CONFIG[toolId];
        if (!config) return;
        this._setSliderEnabled(this.sizeWrap, this.sep1, config.size);
        this._setSliderEnabled(this.opacityWrap, this.sep2, config.opacity);
    }

    private _setSliderEnabled(wrap: HTMLDivElement, sep: HTMLDivElement, enabled: boolean): void {
        wrap.classList.toggle('slider-outer--disabled', !enabled);
        sep.style.opacity = enabled ? '1' : '0.2';
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
                // Eyedropper = elección explícita del usuario → va al historial
                this.eventBus.emit('APPLY_COLOR', result.sRGBHex);
                this.eventBus.emit('SET_COLOR', result.sRGBHex);
            }
        } catch (e) { /* usuario canceló */ }
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
                width: 1px; height: 18px;
                background: var(--surface-bar-border);
                flex-shrink: 0;
                transition: opacity 0.2s;
            }
            .bar-tc {
                top: 12px; left: 50%;
                transform: translateX(-50%);
                z-index: var(--z-bar);
            }
            .slider-outer { transition: opacity 0.2s; }
            .slider-outer--disabled { opacity: 0.3; pointer-events: none; }
        `;
        document.head.appendChild(style);
    }
}