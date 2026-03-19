// src/ui/organisms/BrushToolbar.ts
import { IconButton } from '../atoms/IconButton';
import type { EventBus } from '../../input/EventBus';
import type { Icons } from '../atoms/Icons';

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

    // Color global actual (cuadradito 7)
    private currentGlobalColor: string = '#000000';

    // Color guardado por herramienta
    // null = nunca se ha elegido un color explícito para esta herramienta
    // Se inicializa null para que usen el color CSS heredado (blanco en UI oscura)
    private toolColors: Map<string, string | null> = new Map();

    // Flag para evitar loop cuando nosotros emitimos SET_COLOR internamente
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

        // Inicializar todos los brushes con null — sin color explícito
        // el ícono hereda el color del CSS (var(--text-secondary) = gris/blanco)
        for (const def of this.drawingTools) {
            this.toolColors.set(def.id, null);
        }

        this.bindEvents();
    }

    private createToolButton(def: ToolDef) {
        const btn = new IconButton({
            icon: def.icon,
            title: def.title,
            onClick: () => {
                this.eventBus.emit(def.eventToEmit);
            }
        });

        this.buttons.set(def.id, btn);
        btn.mount(this.element);
    }

    private bindEvents() {

        // ── Cambio de color desde fuera (paleta, eyedropper, cuadradito 7) ──
        this.eventBus.on('SET_COLOR', (color: string) => {
            if (this._settingColorInternally) return;

            this.currentGlobalColor = color;

            // Guardar en la herramienta activa si es brush y actualizar su ícono
            const def = this._findDefById(this.activeToolId);
            if (def?.isBrush) {
                this.toolColors.set(this.activeToolId, color);
                const btn = this.buttons.get(this.activeToolId);
                if (btn) btn.element.style.color = color;
            }
        });

        // ── Activación por eventos de perfil ──────────────────────────────
        for (const [event, toolId] of Object.entries(this.profileEventToToolId)) {
            this.eventBus.on(event as any, () => {
                this._activateTool(toolId);
            });
        }

        // ── Herramientas de interacción (lasso, pan, etc.) ────────────────
        this.eventBus.on('REQUEST_TOOL_SWITCH', (toolId: string) => {
            const isOurButton = this.buttons.has(toolId);
            if (!isOurButton) {
                // Solo quitar el estado activo — NO tocar colores
                const prevBtn = this.buttons.get(this.activeToolId);
                if (prevBtn) prevBtn.setActive(false);

                this.activeToolId = toolId;
                this.eventBus.emit('ACTIVE_TOOL_CHANGED', toolId);
            }
        });
    }

    private _activateTool(toolId: string): void {
        // Quitar estado activo del anterior — NO resetear su color
        const prevBtn = this.buttons.get(this.activeToolId);
        if (prevBtn) prevBtn.setActive(false);

        // Activar el nuevo
        const btn = this.buttons.get(toolId);
        const def = this._findDefById(toolId);

        if (btn) {
            btn.setActive(true);

            if (def?.isBrush) {
                const savedColor = this.toolColors.get(toolId);

                if (savedColor !== null && savedColor !== undefined) {
                    // Esta herramienta ya tiene un color explícito — aplicarlo
                    btn.element.style.color = savedColor;

                    // Actualizar cuadradito 7 si cambió
                    if (savedColor !== this.currentGlobalColor) {
                        this.currentGlobalColor = savedColor;
                        this._settingColorInternally = true;
                        this.eventBus.emit('SET_COLOR', savedColor);
                        this._settingColorInternally = false;
                    }
                } else {
                    // Primera vez — herramienta sin color explícito todavía
                    // Dejar que herede el color CSS (visible en UI oscura)
                    // No emitimos SET_COLOR — el cuadradito 7 no cambia
                    btn.element.style.color = '';
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
            .bar-v {
                flex-direction: column;
            }
            .bar-brush {
                top: 50%;
                left: 12px;
                transform: translateY(-50%);
                z-index: var(--z-bar);
                padding: 6px;
            }
            .sep--h {
                width: 70%;
                height: 1px;
                align-self: center;
                margin: 2px 0;
            }
        `;
        document.head.appendChild(style);
    }
}