// src/ui/debug/DebugToolbar.ts
import type { EventBus } from '../../input/EventBus';
import { DebugBot } from './DebugBot';

// === MATEMÁTICA EXPONENCIAL PARA SLIDERS ===
// Transforma un valor lineal (0 a 1) en una curva exponencial entre min y max
function linearToExp(t: number, min: number, max: number, power: number = 3): number {
    return min + (max - min) * Math.pow(t, power);
}

// Inversa: Transforma el valor del tamaño en px de vuelta a la posición (0 a 1) del slider
function expToLinear(val: number, min: number, max: number, power: number = 3): number {
    if (val <= min) return 0;
    if (val >= max) return 1;
    return Math.pow((val - min) / (max - min), 1 / power);
}

export class DebugToolbar {
    private container: HTMLElement;
    private eventBus: EventBus;

    // Guardamos los límites del perfil activo
    private currentMinSize = 1;
    private currentMaxSize = 100;

    private sliders: Record<string, { input: HTMLInputElement; span: HTMLSpanElement }> = {};
    private bot: DebugBot | null = null;
    private botBtn: HTMLButtonElement | null = null;

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
        this.container = document.createElement('div');
        this.setupStyles();
        this.buildButtons();
        this.bindEvents();
        document.body.appendChild(this.container);
    }

    public connectBot(canvasEl: HTMLElement): void {
        this.bot = new DebugBot(this.eventBus, canvasEl);
    }

    private setupStyles() {
        Object.assign(this.container.style, {
            position: 'absolute',
            top: '20px',
            right: '20px',
            zIndex: '99999',
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            maxWidth: '800px',
            justifyContent: 'flex-end',
        });
    }

    private buildButtons() {
        this.createButton('🧽 Goma (E)', '#2c3e50', () => this.eventBus.emit('SET_TOOL_ERASER'));
        this.createButton('🪣 Relleno', '#8e44ad', () => this.eventBus.emit('SET_PROFILE_FILL'));
        this.createButton('🪞 Flip (H)', '#e67e22', () => this.eventBus.emit('FLIP_HORIZONTAL'));

        // Paleta de colores rápida
        const colorRow = document.createElement('div');
        Object.assign(colorRow.style, {
            display: 'flex', gap: '5px', backgroundColor: 'rgba(255,255,255,0.8)',
            padding: '5px', borderRadius: '4px',
        });
        const colors = [
            { name: 'Negro', hex: '#000000' },
            { name: 'Blanco', hex: '#ffffff' },
            { name: 'Rojo', hex: '#e74c3c' },
            { name: 'Azul', hex: '#2980b9' },
            { name: 'Verde', hex: '#27ae60' },
        ];

        for (const { name, hex } of colors) {
            const btn = document.createElement('button');
            Object.assign(btn.style, {
                width: '24px', height: '24px',
                backgroundColor: hex,
                border: hex === '#ffffff' ? '1px solid #ccc' : 'none',
                borderRadius: '50%', cursor: 'pointer',
            });
            btn.title = name;
            btn.onclick = () => this.eventBus.emit('SET_COLOR', hex);
            colorRow.appendChild(btn);
        }
        this.container.appendChild(colorRow);

        this.createButton('🖋️ Tinta', '#8e44ad', () => this.eventBus.emit('SET_PROFILE_INK'));
        this.createButton('📝 Lápiz', '#8e44ad', () => this.eventBus.emit('SET_PROFILE_PENCIL'));
        this.createButton('🎨 Pintura', '#8e44ad', () => this.eventBus.emit('SET_PROFILE_PAINT'));
        this.createButton('🔵 Hard Round', '#8e44ad', () => this.eventBus.emit('SET_PROFILE_HARD_ROUND'));
        this.createButton('🔵 Airbrush', '#8e44ad', () => this.eventBus.emit('SET_PROFILE_AIRBRUSH'));
        this.createButton('⚫ Carboncillo', '#8e44ad', () => this.eventBus.emit('SET_PROFILE_CHARCOAL'));

        // Sliders: El de tamaño usa logica exponencial interna (0-1000)
        this.createSizeSlider('size', 'Tamaño');
        // El de opacidad (flujo visual) se mantiene lineal (1-100)
        this.createOpacitySlider('opacity', 'Opacidad');

        this.createButton('▶ Timelapse', '#3498db', () => this.eventBus.emit('PLAY_TIMELAPSE'));
        this.createButton('⬆️ Rot', '#f39c12', () => this.eventBus.emit('RESET_ROTATION'));
        this.createButton('🗑️ Borrar', '#e74c3c', () => { if (confirm('¿Seguro?')) this.eventBus.emit('CLEAR_ALL'); });

        this.botBtn = this.createButton('🤖 Bot', '#16a085', () => this._toggleBot());
    }

    private _toggleBot(): void {
        if (!this.bot) {
            console.warn('[DebugToolbar] Bot no conectado. Llama connectBot(canvasEl) primero.');
            return;
        }

        if (this.bot.isRunning()) {
            this.bot.stop();
            this.botBtn!.textContent = '🤖 Bot';
            this.botBtn!.style.backgroundColor = '#16a085';
        } else {
            this.botBtn!.textContent = '⏹ Detener';
            this.botBtn!.style.backgroundColor = '#c0392b';

            this.bot.start({
                totalStrokes: 20000,
                delayBetweenMs: 15,
                eraseRatio: 0.15,
                fillRatio: 0.05,
                undoEvery: 500,
                redoAfterUndo: true,
                strokeTypes: 'all',
            }).then(() => {
                this.botBtn!.textContent = '🤖 Bot';
                this.botBtn!.style.backgroundColor = '#16a085';
            });
        }
    }

    // Slider Exponencial (Mucha precisión en tamaños pequeños)
    private createSizeSlider(id: string, label: string) {
        const wrap = document.createElement('div');
        Object.assign(wrap.style, {
            display: 'flex', alignItems: 'center', gap: '5px',
            color: '#333', fontFamily: 'sans-serif', fontSize: '12px',
            backgroundColor: 'rgba(255,255,255,0.8)', padding: '5px 10px', borderRadius: '4px',
        });
        const span = document.createElement('span');

        const input = document.createElement('input');
        input.type = 'range';
        // 1000 pasos de resolución para fluidez
        input.min = "0";
        input.max = "1000";

        input.oninput = (e) => {
            const t = parseFloat((e.target as HTMLInputElement).value) / 1000;
            const sizePx = linearToExp(t, this.currentMinSize, this.currentMaxSize, 3);

            // Redondear a 1 decimal
            const finalSize = Math.round(sizePx * 10) / 10;
            span.textContent = `${label}: ${finalSize}px`;

            this.eventBus.emit('UPDATE_BRUSH_SIZE', finalSize);
        };

        wrap.appendChild(input);
        wrap.appendChild(span);
        this.container.appendChild(wrap);
        this.sliders[id] = { input, span };
    }

    // Slider Lineal estándar
    private createOpacitySlider(id: string, label: string) {
        const wrap = document.createElement('div');
        Object.assign(wrap.style, {
            display: 'flex', alignItems: 'center', gap: '5px',
            color: '#333', fontFamily: 'sans-serif', fontSize: '12px',
            backgroundColor: 'rgba(255,255,255,0.8)', padding: '5px 10px', borderRadius: '4px',
        });
        const span = document.createElement('span');

        const input = document.createElement('input');
        input.type = 'range';
        input.min = "1"; input.max = "100";

        input.oninput = (e) => {
            const v = parseFloat((e.target as HTMLInputElement).value);
            span.textContent = `${label}: ${v}%`;
            this.eventBus.emit('UPDATE_BRUSH_OPACITY', v / 100);
        };

        wrap.appendChild(input);
        wrap.appendChild(span);
        this.container.appendChild(wrap);
        this.sliders[id] = { input, span };
    }

    private bindEvents() {
        this.eventBus.on('SYNC_UI_SLIDERS', (payload) => {
            const { size, opacity, minSize, maxSize } = payload;

            // Refrescar límites matemáticos si existen
            if (minSize !== undefined) this.currentMinSize = minSize;
            if (maxSize !== undefined) this.currentMaxSize = maxSize;

            if (this.sliders['size']) {
                // Cálculo inverso: En qué posición (0 a 1000) debe estar el input para mostrar este 'size'
                const t = expToLinear(size, this.currentMinSize, this.currentMaxSize, 3);
                this.sliders['size'].input.value = String(Math.round(t * 1000));
                this.sliders['size'].span.textContent = `Tamaño: ${Math.round(size * 10) / 10}px`;
            }

            if (this.sliders['opacity']) {
                const pct = Math.round(opacity * 100);
                this.sliders['opacity'].input.value = String(pct);
                this.sliders['opacity'].span.textContent = `Opacidad: ${pct}%`;
            }
        });
    }

    private createButton(text: string, color: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.textContent = text;
        Object.assign(btn.style, {
            padding: '10px', backgroundColor: color,
            color: 'white', border: 'none', cursor: 'pointer', borderRadius: '4px',
        });
        btn.onclick = onClick;
        this.container.appendChild(btn);
        return btn;
    }
}