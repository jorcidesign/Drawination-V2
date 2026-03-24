// src/ui/organisms/BrushToolbar.ts
import { IconButton } from '../atoms/IconButton';
import type { EventBus } from '../../input/EventBus';
import type { Icons } from '../atoms/Icons';

// Color inicial del lápiz y color que heredan los demás pinceles
// la primera vez que se usan
const DEFAULT_BRUSH_COLOR = '#2280cf';

interface ToolDef {
    id: string;
    icon: keyof typeof Icons;
    title: string;
    eventToEmit: any;
    isBrush: boolean;
}

export class BrushToolbar {
    public element: HTMLDivElement;
    private eventBus: EventBus;
    private static stylesInjected = false;

    private buttons: Map<string, IconButton> = new Map();
    private activeToolId: string = '';

    private currentGlobalColor: string = DEFAULT_BRUSH_COLOR;

    // null = nunca usado → ícono en gris de la UI (sin style.color)
    // string = color guardado → ícono en ese color
    private toolColors: Map<string, string | null> = new Map();

    private _settingColorInternally = false;

    private readonly drawingTools: ToolDef[] = [
        { id: 'pencil-hb', icon: 'pencil', title: 'Lápiz (B)', eventToEmit: 'SET_PROFILE_PENCIL', isBrush: true },
        { id: 'ink-pen', icon: 'ink', title: 'Pluma de Tinta', eventToEmit: 'SET_PROFILE_INK', isBrush: true },
        { id: 'oil-brush', icon: 'oil', title: 'Pincel Óleo', eventToEmit: 'SET_PROFILE_PAINT', isBrush: true },
        { id: 'hard-round', icon: 'hardRound', title: 'Hard Round', eventToEmit: 'SET_PROFILE_HARD_ROUND', isBrush: true },
        { id: 'airbrush', icon: 'airbrush', title: 'Aerógrafo', eventToEmit: 'SET_PROFILE_AIRBRUSH', isBrush: true },
        { id: 'charcoal', icon: 'charcoal', title: 'Carboncillo', eventToEmit: 'SET_PROFILE_CHARCOAL', isBrush: true },
        { id: 'solid-fill', icon: 'fill', title: 'Relleno', eventToEmit: 'SET_PROFILE_FILL', isBrush: true },
    ];

    private readonly eraserTools: ToolDef[] = [
        { id: 'eraser', icon: 'eraser', title: 'Borrador Duro (E)', eventToEmit: 'SET_TOOL_ERASER', isBrush: false },
        { id: 'vector-eraser', icon: 'vectorEraser', title: 'Borrador Vectorial (⇧E)', eventToEmit: 'SET_TOOL_VECTOR_ERASER', isBrush: false },
    ];

    private readonly profileEventToToolId: Record<string, string> = {
        'SET_PROFILE_PENCIL': 'pencil-hb',
        'SET_PROFILE_INK': 'ink-pen',
        'SET_PROFILE_PAINT': 'oil-brush',
        'SET_PROFILE_HARD_ROUND': 'hard-round',
        'SET_PROFILE_AIRBRUSH': 'airbrush',
        'SET_PROFILE_CHARCOAL': 'charcoal',
        'SET_PROFILE_FILL': 'solid-fill',
        'SET_TOOL_ERASER': 'eraser',
        'SET_TOOL_VECTOR_ERASER': 'vector-eraser',
    };

    constructor(eventBus: EventBus) {
        BrushToolbar.injectStyles();
        this.eventBus = eventBus;

        this.element = document.createElement('div');
        this.element.className = 'bar bar-v bar-brush';

        this.drawingTools.forEach(def => this.createToolButton(def));

        const sep = document.createElement('div');
        sep.className = 'sep sep--h';
        this.element.appendChild(sep);

        this.eraserTools.forEach(def => this.createToolButton(def));

        // Todos los pinceles arrancan sin color (null = gris de la UI)
        for (const def of this.drawingTools) {
            this.toolColors.set(def.id, null);
        }

        this.bindEvents();
    }

    private createToolButton(def: ToolDef) {
        const btn = new IconButton({
            icon: def.icon,
            title: def.title,
            onClick: () => { this.eventBus.emit(def.eventToEmit); }
        });

        this.buttons.set(def.id, btn);
        btn.mount(this.element);
    }

    // Llamado desde AppContainer al arrancar para activar el lápiz
    // con el color correcto sin emitir eventos prematuros
    public activateDefault(toolId: string, color: string): void {
        this.currentGlobalColor = color;
        this.toolColors.set(toolId, color);

        const btn = this.buttons.get(toolId);
        if (btn) {
            btn.setActive(true);
            btn.element.style.color = color;
        }

        this.activeToolId = toolId;
        // No emitimos ACTIVE_TOOL_CHANGED aquí — el sistema todavía no está listo
    }

    private bindEvents() {

        this.eventBus.on('SET_COLOR', (color: string) => {
            if (this._settingColorInternally) return;

            this.currentGlobalColor = color;

            const def = this._findDefById(this.activeToolId);
            if (def?.isBrush) {
                this.toolColors.set(this.activeToolId, color);
                const btn = this.buttons.get(this.activeToolId);
                if (btn) btn.element.style.color = color;
            }
        });

        for (const [event, toolId] of Object.entries(this.profileEventToToolId)) {
            this.eventBus.on(event as any, () => {
                this._activateTool(toolId);
            });
        }

        this.eventBus.on('REQUEST_TOOL_SWITCH', (toolId: string) => {
            const isOurButton = this.buttons.has(toolId);
            if (!isOurButton) {
                const prevBtn = this.buttons.get(this.activeToolId);
                if (prevBtn) prevBtn.setActive(false);
                this.activeToolId = toolId;
                this.eventBus.emit('ACTIVE_TOOL_CHANGED', toolId);
            }
        });
    }

    private _activateTool(toolId: string): void {
        // Quitar activo del anterior — sin tocar su color
        const prevBtn = this.buttons.get(this.activeToolId);
        if (prevBtn) prevBtn.setActive(false);

        const btn = this.buttons.get(toolId);
        const def = this._findDefById(toolId);

        if (btn) {
            btn.setActive(true);

            if (def?.isBrush) {
                const savedColor = this.toolColors.get(toolId);

                if (savedColor === null || savedColor === undefined) {
                    // Primera vez que se usa — heredar el color global actual
                    const firstColor = this.currentGlobalColor;
                    this.toolColors.set(toolId, firstColor);
                    btn.element.style.color = firstColor;
                    // El color global ya es el correcto, no hace falta emitir SET_COLOR
                } else {
                    // Ya tiene color guardado — restaurarlo
                    btn.element.style.color = savedColor;

                    if (savedColor !== this.currentGlobalColor) {
                        this.currentGlobalColor = savedColor;
                        this._settingColorInternally = true;
                        this.eventBus.emit('SET_COLOR', savedColor);
                        this._settingColorInternally = false;
                    }
                }
            }
        }

        this.activeToolId = toolId;
        this.eventBus.emit('ACTIVE_TOOL_CHANGED', toolId);
    }

    private _findDefById(id: string): ToolDef | undefined {
        return [...this.drawingTools, ...this.eraserTools].find(d => d.id === id);
    }

    public mount(parent: HTMLElement) {
        parent.appendChild(this.element);
    }

    private static injectStyles() {
        if (this.stylesInjected) return;
        this.stylesInjected = true;

        const style = document.createElement('style');
        style.textContent = `
            .bar-v { flex-direction: column; }
            .bar-brush {
                top: 50%; left: 12px;
                transform: translateY(-50%);
                z-index: var(--z-bar);
                padding: 6px;
            }
            .sep--h {
                width: 70%; height: 1px;
                align-self: center; margin: 2px 0;
            }
        `;
        document.head.appendChild(style);
    }
}