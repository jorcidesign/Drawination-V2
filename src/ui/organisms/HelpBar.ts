// src/ui/organisms/HelpBar.ts
import { IconButton } from '../atoms/IconButton';
import type { EventBus } from '../../input/EventBus';
import type { Icons } from '../atoms/Icons';

export class HelpBar {
    public element: HTMLDivElement;
    private barInner: HTMLDivElement;
    private eventBus: EventBus;
    private static stylesInjected = false;

    private lassoMode: 'partial' | 'total' = 'partial';

    constructor(eventBus: EventBus) {
        HelpBar.injectStyles();
        this.eventBus = eventBus;

        // Wrapper para las animaciones
        this.element = document.createElement('div');
        this.element.id = 'helpbar-wrap';

        // Usamos la clase .bar global para estandarizar altura, fondo y bordes
        this.barInner = document.createElement('div');
        this.barInner.className = 'bar';
        this.barInner.id = 'helpbar';

        this.element.appendChild(this.barInner);
        this.bindEvents();
    }

    private bindEvents() {
        this.eventBus.on('REQUEST_TOOL_SWITCH', (toolId) => {
            if (toolId === 'lasso') {
                this.renderLassoMode();
            } else if (toolId === 'transform-handle') {
                this.renderTransformMode();
            } else {
                this.hide();
            }
        });

        this.eventBus.on('TOGGLE_LASSO_MODE', (mode) => {
            this.lassoMode = mode;
            const toggleBtn = document.getElementById('lasso-toggle') as HTMLButtonElement;
            if (toggleBtn) this.updateLassoBtnUI(toggleBtn);
        });
    }

    private renderLassoMode() {
        this.barInner.innerHTML = '';
        this.element.classList.add('visible');

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'helpbar-toggle';
        toggleBtn.id = 'lasso-toggle';
        toggleBtn.title = 'Cambiar modo de selección';
        this.updateLassoBtnUI(toggleBtn);

        toggleBtn.onclick = () => {
            this.lassoMode = this.lassoMode === 'partial' ? 'total' : 'partial';
            this.updateLassoBtnUI(toggleBtn);
            this.eventBus.emit('TOGGLE_LASSO_MODE', this.lassoMode);
        };

        this.barInner.appendChild(toggleBtn);
    }

    private updateLassoBtnUI(btn: HTMLButtonElement) {
        if (this.lassoMode === 'partial') {
            btn.innerHTML = '⭕ <span>Selección Parcial</span>';
            btn.style.color = 'var(--text-primary)';
        } else {
            btn.innerHTML = '⬛ <span>Selección Total</span>';
            btn.style.color = 'var(--col-blue)';
        }
    }

    private renderTransformMode() {
        this.barInner.innerHTML = '';
        this.element.classList.add('visible');

        const actions: { id: string, icon: keyof typeof Icons, label: string, event: any, danger?: boolean }[] = [
            { id: 'dup', icon: 'duplicate', label: 'Duplicar Selección', event: 'SELECTION_DUPLICATE' },
            { id: 'fliph', icon: 'flipH', label: 'Espejo Horizontal', event: 'SELECTION_FLIP_H' },
            { id: 'flipv', icon: 'flipV', label: 'Espejo Vertical', event: 'SELECTION_FLIP_V' },
            { id: 'del', icon: 'trash', label: 'Eliminar Selección', event: 'SELECTION_DELETE', danger: true },
        ];

        actions.forEach((action, index) => {
            // Átomo estándar: IconButton sin textos abajo
            const btn = new IconButton({
                icon: action.icon,
                title: action.label, // El texto ahora vive en el tooltip nativo
                variant: action.danger ? 'danger' : 'default',
                onClick: () => this.eventBus.emit(action.event)
            });

            btn.mount(this.barInner);

            // Separador entre botones (excepto en el último)
            if (index < actions.length - 1) {
                const sep = document.createElement('div');
                sep.className = 'sep'; // Usamos el separador estándar de la app
                this.barInner.appendChild(sep);
            }
        });
    }

    private hide() {
        this.element.classList.remove('visible');
    }

    public mount(parent: HTMLElement) {
        parent.appendChild(this.element);
    }

    private static injectStyles() {
        if (this.stylesInjected) return;
        this.stylesInjected = true;

        const style = document.createElement('style');
        style.textContent = `
      #helpbar-wrap {
        position: fixed;
        bottom: 14px; /* Misma altura que BottomLeftBar */
        left: 50%;
        transform: translateX(-50%) translateY(70px);
        z-index: var(--z-bar);
        pointer-events: none;
        opacity: 0;
        transition: opacity var(--t-normal), transform var(--t-normal);
      }
      #helpbar-wrap.visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
        pointer-events: all;
      }
      #helpbar {
        position: relative !important; /* Anula el absolute de la clase .bar para centrar bien */
        width: max-content;
      }
      .helpbar-toggle {
        height: var(--btn-size); /* Estandariza a 36px exactos */
        padding: 0 12px;
        border-radius: var(--btn-radius);
        border: none;
        background: transparent;
        color: var(--text-primary);
        font-family: var(--font-ui);
        font-size: var(--text-md);
        font-weight: 500;
        cursor: pointer;
        transition: background var(--t-fast), color var(--t-fast);
        display: flex;
        align-items: center;
        gap: 8px;
        outline: none;
      }
      .helpbar-toggle:hover {
        background: var(--surface-hover);
      }
      .helpbar-toggle span {
        margin-top: 1px; /* Ajuste visual minúsculo para la fuente */
      }
    `;
        document.head.appendChild(style);
    }
}