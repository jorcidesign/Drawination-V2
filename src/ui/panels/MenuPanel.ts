// src/ui/panels/MenuPanel.ts
import { IconButton } from '../atoms/IconButton';
import type { EventBus } from '../../input/EventBus';

export class MenuPanel {
    public element: HTMLDivElement;
    private eventBus: EventBus;
    private static stylesInjected = false;

    public isVisible = false; // Pública para que el PanelManager la lea

    constructor(eventBus: EventBus) {
        MenuPanel.injectStyles();
        this.eventBus = eventBus;

        this.element = document.createElement('div');
        this.element.className = 'panel';
        this.element.id = 'panel-menu';

        // Botón único: Borrar Todo (Rojo)
        const clearBtn = new IconButton({
            icon: 'trash',
            title: 'Borrar todo el lienzo',
            variant: 'danger',
            onClick: () => {
                if (confirm('¿Seguro que deseas borrar todo el lienzo? Esta acción no se puede deshacer.')) {
                    this.eventBus.emit('CLEAR_ALL');
                    this.close(); // Cerramos el panel tras limpiar
                }
            }
        });

        clearBtn.mount(this.element);
        this.bindEvents();
    }

    private bindEvents() {
        // Escucha el evento que emite la hamburguesa en el TopLeftBar
        this.eventBus.on('TOGGLE_MENU_PANEL', () => {
            if (this.isVisible) {
                this.close();
            } else {
                this.open();
            }
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
        /* Encaje de rompecabezas */
        top: 64px; /* Justo debajo de la TopLeftBar */
        left: 12px; /* Alineado a la izquierda como la BrushToolbar */
        width: 48px; /* 36px del botón + 6px + 6px de padding */
        padding: 6px;
        
        z-index: var(--z-panel);
        align-items: center; /* Centra el botón rojo internamente */
        border-radius: var(--bar-radius); /* Mismo radio curvo que las barras */
      }
    `;
        document.head.appendChild(style);
    }
}