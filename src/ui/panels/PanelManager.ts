// src/ui/panels/PanelManager.ts
import type { MenuPanel } from './MenuPanel';

export class PanelManager {
    private menuPanel: MenuPanel;

    constructor(menuPanel: MenuPanel) {
        this.menuPanel = menuPanel;
        this.bindGlobalEvents();
    }

    private bindGlobalEvents() {
        // Escuchamos clics en toda la ventana
        window.addEventListener('pointerdown', (e) => {
            const target = e.target as HTMLElement;

            // Si el menú está abierto...
            if (this.menuPanel.isVisible) {
                // Comprobamos si hicimos clic FUERA del panel de menú Y FUERA del botón de hamburguesa
                const clickedInsideMenu = target.closest('#panel-menu');
                const clickedHamburger = target.closest('#btn-menu');

                if (!clickedInsideMenu && !clickedHamburger) {
                    // Clic fuera -> Cerramos el menú
                    this.menuPanel.close();
                }
            }
        });
    }
}