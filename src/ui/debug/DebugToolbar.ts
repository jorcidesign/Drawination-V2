// src/ui/debug/DebugToolbar.ts
import type { EventBus } from '../../input/EventBus';
import { DebugBot } from './DebugBot';

function linearToExp(t: number, min: number, max: number, power: number = 3): number {
    return min + (max - min) * Math.pow(t, power);
}

function expToLinear(val: number, min: number, max: number, power: number = 3): number {
    if (val <= min) return 0;
    if (val >= max) return 1;
    return Math.pow((val - min) / (max - min), 1 / power);
}

export class DebugToolbar {
    private container: HTMLElement;
    private eventBus: EventBus;
    private currentMinSize = 1;
    private currentMaxSize = 100;
    private sliders: Record<string, { input: HTMLInputElement; span: HTMLSpanElement }> = {};

    private bot: DebugBot | null = null;
    private botBtn: HTMLButtonElement | null = null;

    // === NUEVA BARRA CONTEXTUAL ===
    private contextBar: HTMLElement;
    private lassoMode: 'partial' | 'total' = 'partial';

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
        this.container = document.createElement('div');
        this.contextBar = document.createElement('div');

        this.setupStyles();
        this.buildButtons();
        this.buildContextBar();
        this.bindEvents();

        document.body.appendChild(this.container);
        document.body.appendChild(this.contextBar);
    }

    public connectBot(canvasEl: HTMLElement): void {
        this.bot = new DebugBot(this.eventBus, canvasEl);
    }

    private setupStyles() {
        Object.assign(this.container.style, {
            position: 'absolute', top: '20px', right: '20px',
            zIndex: '99999', display: 'flex', gap: '10px',
            flexWrap: 'wrap', maxWidth: '800px', justifyContent: 'flex-end',
        });

        Object.assign(this.contextBar.style, {
            position: 'absolute', bottom: '30px', left: '50%',
            transform: 'translateX(-50%)', zIndex: '99999',
            display: 'none', gap: '10px', backgroundColor: '#2c3e50',
            padding: '10px 20px', borderRadius: '30px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.3)', transition: 'all 0.2s ease',
        });
    }

    private buildContextBar() {
        this.eventBus.on('REQUEST_TOOL_SWITCH', (toolId) => {
            this.contextBar.innerHTML = ''; // Limpiamos barra

            if (toolId === 'lasso') {
                this.contextBar.style.display = 'flex';

                const btnToggle = document.createElement('button');
                this.styleContextButton(btnToggle, '#34495e');
                this.updateLassoBtnUI(btnToggle);

                btnToggle.onclick = () => {
                    this.lassoMode = this.lassoMode === 'partial' ? 'total' : 'partial';
                    this.updateLassoBtnUI(btnToggle);
                    this.eventBus.emit('TOGGLE_LASSO_MODE', this.lassoMode);
                };

                this.contextBar.appendChild(btnToggle);
            }
            else if (toolId === 'transform-handle') {
                this.contextBar.style.display = 'flex';

                const btnFlipH = document.createElement('button');
                btnFlipH.textContent = '🪞 Flip H';
                this.styleContextButton(btnFlipH, '#34495e');
                btnFlipH.onclick = () => this.eventBus.emit('SELECTION_FLIP_H');

                const btnFlipV = document.createElement('button');
                btnFlipV.textContent = '🔃 Flip V';
                this.styleContextButton(btnFlipV, '#34495e');
                btnFlipV.onclick = () => this.eventBus.emit('SELECTION_FLIP_V');

                const btnDuplicate = document.createElement('button');
                btnDuplicate.textContent = '📋 Duplicar';
                this.styleContextButton(btnDuplicate, '#27ae60');
                btnDuplicate.onclick = () => this.eventBus.emit('SELECTION_DUPLICATE');

                const btnDelete = document.createElement('button');
                btnDelete.textContent = '🗑️ Eliminar';
                this.styleContextButton(btnDelete, '#e74c3c');
                btnDelete.onclick = () => this.eventBus.emit('SELECTION_DELETE');

                this.contextBar.appendChild(btnFlipH);
                this.contextBar.appendChild(btnFlipV);
                this.contextBar.appendChild(btnDuplicate);
                this.contextBar.appendChild(btnDelete);
            }
            else {
                this.contextBar.style.display = 'none';
            }
        });
    }

    private styleContextButton(btn: HTMLButtonElement, bgColor: string) {
        Object.assign(btn.style, {
            padding: '8px 16px', backgroundColor: bgColor,
            color: 'white', border: 'none', cursor: 'pointer',
            borderRadius: '20px', fontWeight: 'bold', fontSize: '14px',
            outline: 'none'
        });
    }

    private updateLassoBtnUI(btn: HTMLButtonElement) {
        if (this.lassoMode === 'partial') {
            btn.textContent = '⭕ Selección: Parcial';
            btn.style.color = '#fff';
        } else {
            btn.textContent = '⏺ Selección: Total';
            btn.style.color = '#f1c40f'; // Amarillo para resaltar que es restrictivo
        }
    }

    private buildButtons() {
        // ── FILA DE CAPAS ──────────────────────────────────────────
        const layerRow = document.createElement('div');
        Object.assign(layerRow.style, {
            display: 'flex', gap: '5px', backgroundColor: 'rgba(255,255,255,0.9)',
            padding: '5px', borderRadius: '4px', alignItems: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        });

        const lbl = document.createElement('span');
        lbl.textContent = 'Capa: 0';
        lbl.style.fontWeight = 'bold';
        lbl.style.minWidth = '60px';

        this.eventBus.on('SYNC_LAYERS_CSS', () => {
            const state = (window as any).drawinationApp.container.history.getState();
            lbl.textContent = `Capa: ${state.derivedActiveLayerIndex}`;
        });

        const dispatchLayerSelect = (newIndex: number) => {
            const history = (window as any).drawinationApp.container.history;
            const current = history.getState().derivedActiveLayerIndex;

            if (current !== newIndex) {
                this.eventBus.emit('GLOBAL_INTERRUPTION');
                history.commitLayerAction('LAYER_SELECT', newIndex);
                this.eventBus.emit('SYNC_LAYERS_CSS');
            }
        };

        const btnUp = document.createElement('button');
        btnUp.textContent = '🔼';
        btnUp.onclick = () => {
            const state = (window as any).drawinationApp.container.history.getState();
            dispatchLayerSelect(Math.min(9, state.derivedActiveLayerIndex + 1));
        };

        const btnDown = document.createElement('button');
        btnDown.textContent = '🔽';
        btnDown.onclick = () => {
            const state = (window as any).drawinationApp.container.history.getState();
            dispatchLayerSelect(Math.max(0, state.derivedActiveLayerIndex - 1));
        };

        const btnHide = document.createElement('button');
        btnHide.textContent = '👁️ Toggle';
        btnHide.onclick = () => {
            const engine = (window as any).drawinationApp.container.engine;
            const history = (window as any).drawinationApp.container.history;
            const state = history.getState();
            const currentVisible = state.layersState.get(engine.activeLayerIndex)?.visible ?? true;

            history.commitLayerAction('LAYER_VISIBILITY', engine.activeLayerIndex, { visible: !currentVisible });
            this.eventBus.emit('SYNC_LAYERS_CSS');
        };

        const btnMerge = document.createElement('button');
        btnMerge.textContent = '⏬ Merge Down';
        btnMerge.onclick = async () => {
            const engine = (window as any).drawinationApp.container.engine;
            if (engine.activeLayerIndex === 0) return;

            this.eventBus.emit('GLOBAL_INTERRUPTION');
            const history = (window as any).drawinationApp.container.history;
            history.commitLayerAction('LAYER_MERGE_DOWN', engine.activeLayerIndex);

            const brush = (window as any).drawinationApp.container.activeBrush;
            await (window as any).drawinationApp.container.rebuilder.rebuild(brush);

            btnDown.click();
        };

        layerRow.appendChild(lbl);
        layerRow.appendChild(btnDown);
        layerRow.appendChild(btnUp);
        layerRow.appendChild(btnHide);
        layerRow.appendChild(btnMerge);
        this.container.appendChild(layerRow);

        // ── FILA DE HERRAMIENTAS Y COLORES ──────────────────────────────────
        this.createButton('🧽 Goma (E)', '#2c3e50', () => this.eventBus.emit('SET_TOOL_ERASER'));
        this.createButton('💥 Borrador Vectorial (Shift+E)', '#c0392b', () => this.eventBus.emit('SET_TOOL_VECTOR_ERASER'));
        this.createButton('🪣 Relleno', '#8e44ad', () => this.eventBus.emit('SET_PROFILE_FILL'));
        this.createButton('🔲 Lazo', '#e67e22', () => this.eventBus.emit('REQUEST_TOOL_SWITCH', 'lasso'));

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

        this.createSizeSlider('size', 'Tamaño');
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
        input.min = "0";
        input.max = "1000";

        input.oninput = (e) => {
            const t = parseFloat((e.target as HTMLInputElement).value) / 1000;
            const sizePx = linearToExp(t, this.currentMinSize, this.currentMaxSize, 3);
            const finalSize = Math.round(sizePx * 10) / 10;
            span.textContent = `${label}: ${finalSize}px`;
            this.eventBus.emit('UPDATE_BRUSH_SIZE', finalSize);
        };

        wrap.appendChild(input);
        wrap.appendChild(span);
        this.container.appendChild(wrap);
        this.sliders[id] = { input, span };
    }

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

            if (minSize !== undefined) this.currentMinSize = minSize;
            if (maxSize !== undefined) this.currentMaxSize = maxSize;

            if (this.sliders['size']) {
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