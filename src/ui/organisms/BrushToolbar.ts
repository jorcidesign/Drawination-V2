// src/ui/organisms/BrushToolbar.ts
import { IconButton } from '../atoms/IconButton';
import type { EventBus } from '../../input/EventBus';
import type { Icons } from '../atoms/Icons';

interface ToolDef {
    id: string;
    icon: keyof typeof Icons;
    title: string;
    eventToEmit: any; // El evento que dispara al hacer clic
}

export class BrushToolbar {
    public element: HTMLDivElement;
    private eventBus: EventBus;
    private static stylesInjected = false;

    private buttons: Map<string, IconButton> = new Map();
    private activeToolId: string = 'pencil';
    private currentColor: string = '#000000';

    // Configuración de los 9 pinceles actuales
    private readonly drawingTools: ToolDef[] = [
        { id: 'pencil', icon: 'pencil', title: 'Lápiz (B)', eventToEmit: 'SET_PROFILE_PENCIL' },
        { id: 'ink-pen', icon: 'ink', title: 'Pluma de Tinta', eventToEmit: 'SET_PROFILE_INK' },
        { id: 'oil-brush', icon: 'oil', title: 'Pincel Óleo', eventToEmit: 'SET_PROFILE_PAINT' },
        { id: 'hard-round', icon: 'hardRound', title: 'Hard Round', eventToEmit: 'SET_PROFILE_HARD_ROUND' },
        { id: 'airbrush', icon: 'airbrush', title: 'Aerógrafo', eventToEmit: 'SET_PROFILE_AIRBRUSH' },
        { id: 'charcoal', icon: 'charcoal', title: 'Carboncillo', eventToEmit: 'SET_PROFILE_CHARCOAL' },
        { id: 'solid-fill', icon: 'fill', title: 'Relleno', eventToEmit: 'SET_PROFILE_FILL' },
    ];

    private readonly eraserTools: ToolDef[] = [
        { id: 'eraser', icon: 'eraser', title: 'Borrador Duro (E)', eventToEmit: 'SET_TOOL_ERASER' },
        { id: 'vector-eraser', icon: 'vectorEraser', title: 'Borrador Vectorial (⇧E)', eventToEmit: 'SET_TOOL_VECTOR_ERASER' },
    ];

    constructor(eventBus: EventBus) {
        BrushToolbar.injectStyles();
        this.eventBus = eventBus;

        this.element = document.createElement('div');
        this.element.className = 'bar bar-v bar-brush';

        // 1. Instanciar herramientas de dibujo
        this.drawingTools.forEach(def => this.createToolButton(def));

        // Separador horizontal
        const sep = document.createElement('div');
        sep.className = 'sep sep--h';
        this.element.appendChild(sep);

        // 2. Instanciar borradores
        this.eraserTools.forEach(def => this.createToolButton(def));

        this.bindEvents();
    }

    private createToolButton(def: ToolDef) {
        const btn = new IconButton({
            icon: def.icon,
            title: def.title,
            onClick: () => {
                // Emitimos el evento específico de la herramienta
                this.eventBus.emit(def.eventToEmit);
            }
        });

        this.buttons.set(def.id, btn);
        btn.mount(this.element);
    }

    private bindEvents() {
        // Escuchar el cambio global de herramienta
        this.eventBus.on('REQUEST_TOOL_SWITCH', (toolId) => {
            // 1. Apagar todos
            this.buttons.forEach((btn, id) => {
                btn.setActive(false);
                btn.element.style.color = ''; // Quitar color personalizado al desactivar
            });

            // 2. Encender el nuevo
            const activeBtn = this.buttons.get(toolId);
            if (activeBtn) {
                activeBtn.setActive(true);
                // Si es una herramienta de dibujo, le aplicamos el color activo
                if (!this.eraserTools.find(e => e.id === toolId)) {
                    activeBtn.element.style.color = this.currentColor;
                }
                this.activeToolId = toolId;
            }
        });

        // Escuchar cambio de color para teñir el ícono de la herramienta activa
        this.eventBus.on('SET_COLOR', (color) => {
            this.currentColor = color;

            // Solo coloreamos si la herramienta activa NO es un borrador
            if (!this.eraserTools.find(e => e.id === this.activeToolId)) {
                const activeBtn = this.buttons.get(this.activeToolId);
                if (activeBtn) {
                    // El inline style tiene prioridad sobre la clase CSS
                    activeBtn.element.style.color = this.currentColor;
                }
            }
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