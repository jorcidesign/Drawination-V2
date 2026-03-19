// src/ui/panels/MenuPanel.ts
import { IconButton } from '../atoms/IconButton';
import type { EventBus } from '../../input/EventBus';

export class MenuPanel {
    public element: HTMLDivElement;
    private eventBus: EventBus;
    private static stylesInjected = false;

    public isVisible = false;

    constructor(eventBus: EventBus) {
        MenuPanel.injectStyles();
        this.eventBus = eventBus;

        this.element = document.createElement('div');
        this.element.className = 'panel';
        this.element.id = 'panel-menu';

        // Botón Nuevo Proyecto
        const newProjectBtn = new IconButton({
            icon: 'add',
            title: 'Nuevo proyecto',
            onClick: () => {
                this.close();
                this.eventBus.emit('SHOW_NEW_PROJECT');
            }
        });
        newProjectBtn.mount(this.element);

        // Separador
        const sep = document.createElement('div');
        sep.className = 'sep sep--h';
        sep.style.width = '70%';
        sep.style.height = '1px';
        sep.style.alignSelf = 'center';
        sep.style.margin = '2px 0';
        this.element.appendChild(sep);

        // Botón Borrar todo (rojo)
        const clearBtn = new IconButton({
            icon: 'trash',
            title: 'Borrar todo el lienzo',
            variant: 'danger',
            onClick: () => {
                if (confirm('¿Seguro que deseas borrar todo el lienzo? Esta acción no se puede deshacer.')) {
                    this.eventBus.emit('CLEAR_ALL');
                    this.close();
                }
            }
        });
        clearBtn.mount(this.element);

        this.bindEvents();
    }

    private bindEvents() {
        this.eventBus.on('TOGGLE_MENU_PANEL', () => {
            if (this.isVisible) this.close();
            else this.open();
        });
    }

    public open() {
        this.isVisible = true;
        this.element.classList.add('visible');
    }

    public close() {
        this.isVisible = false;
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
            #panel-menu {
                top: 64px;
                left: 12px;
                width: 48px;
                padding: 6px;
                z-index: var(--z-panel);
                align-items: center;
                border-radius: var(--bar-radius);
                flex-direction: column;
                gap: 2px;
            }
        `;
        document.head.appendChild(style);
    }
}