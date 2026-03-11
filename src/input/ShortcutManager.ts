// src/input/ShortcutManager.ts
export class ShortcutManager {
    // Patrón de Registro: Mapas dinámicos que asocian un string ('ctrl+z') con una función
    private bindingsDown = new Map<string, (e: KeyboardEvent) => void>();
    private bindingsUp = new Map<string, (e: KeyboardEvent) => void>();

    constructor() {
        this.bindEvents();
    }

    // === API DINÁMICA DE REGISTRO ===
    public bindDown(keyCombination: string, handler: (e: KeyboardEvent) => void) {
        this.bindingsDown.set(keyCombination.toLowerCase(), handler);
    }

    public bindUp(keyCombination: string, handler: (e: KeyboardEvent) => void) {
        this.bindingsUp.set(keyCombination.toLowerCase(), handler);
    }

    public unbindDown(keyCombination: string) {
        this.bindingsDown.delete(keyCombination.toLowerCase());
    }

    public unbindUp(keyCombination: string) {
        this.bindingsUp.delete(keyCombination.toLowerCase());
    }

    private bindEvents() {
        window.addEventListener('keydown', this.handleKeyDown.bind(this), { passive: false });
        window.addEventListener('keyup', this.handleKeyUp.bind(this), { passive: false });
    }

    // Traduce el evento crudo del navegador a un string limpio (Ej: "ctrl+z", "space", "b")
    private normalizeEvent(e: KeyboardEvent): string {
        const keys: string[] = [];

        if (e.ctrlKey || e.metaKey) keys.push('ctrl');
        if (e.shiftKey) keys.push('shift');

        // Si la tecla física presionada es Alt, la agregamos (evitamos duplicar si es combinada)
        if (e.altKey && e.code !== 'AltLeft' && e.code !== 'AltRight') {
            keys.push('alt');
        }

        if (e.code === 'Space') {
            keys.push('space');
        } else if (e.code === 'Escape') {
            keys.push('escape');
        } else if (e.code === 'AltLeft' || e.code === 'AltRight') {
            keys.push('alt');
        } else if (e.key && !['control', 'shift', 'alt', 'meta'].includes(e.key.toLowerCase())) {
            keys.push(e.key.toLowerCase());
        }

        return keys.join('+');
    }

    private handleKeyDown(e: KeyboardEvent) {
        // Ignoramos si el usuario está escribiendo dentro de un input real (por si a futuro agregas texto)
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

        const shortcut = this.normalizeEvent(e);

        if (this.bindingsDown.has(shortcut)) {
            e.preventDefault();
            e.stopPropagation();
            // Ejecutamos la función guardada y le pasamos el evento para que decida si ignorar el auto-repeat
            this.bindingsDown.get(shortcut)!(e);
        }
    }

    private handleKeyUp(e: KeyboardEvent) {
        const shortcut = this.normalizeEvent(e);

        if (this.bindingsUp.has(shortcut)) {
            e.preventDefault();
            this.bindingsUp.get(shortcut)!(e);
        }
    }

    public destroy() {
        window.removeEventListener('keydown', this.handleKeyDown.bind(this));
        window.removeEventListener('keyup', this.handleKeyUp.bind(this));
        this.bindingsDown.clear();
        this.bindingsUp.clear();
    }
}