// src/input/ShortcutManager.ts
export class ShortcutManager {
    public onUndo: (() => void) | null = null;
    public onRedo: (() => void) | null = null;
    public onSave: (() => void) | null = null;

    public onSpaceDown: (() => void) | null = null;
    public onSpaceUp: (() => void) | null = null;

    public onZoomDown: (() => void) | null = null;
    public onZoomUp: (() => void) | null = null;

    public onRotateDown: (() => void) | null = null;
    public onRotateUp: (() => void) | null = null;

    public onPencil: (() => void) | null = null;
    public onEraser: (() => void) | null = null;

    // === NUEVOS ===
    public onFlipHorizontal: (() => void) | null = null;
    public onAltDown: (() => void) | null = null;
    public onAltUp: (() => void) | null = null;

    // === NUEVO: Escape para limpiar selecciones ===
    public onEscape: (() => void) | null = null;

    constructor() {
        this.bindEvents();
    }

    private bindEvents() {
        window.addEventListener('keydown', this.handleKeyDown.bind(this), { passive: false });
        window.addEventListener('keyup', this.handleKeyUp.bind(this), { passive: false });
    }

    private handleKeyDown(e: KeyboardEvent) {
        // === ESCAPE ===
        if (e.code === 'Escape') {
            e.preventDefault();
            this.onEscape?.();
            return;
        }
        // Atajo del Gotero (Alt)
        if (e.code === 'AltLeft' || e.code === 'AltRight') {
            e.preventDefault();
            if (!e.repeat) this.onAltDown?.();
            return;
        }

        if (e.code === 'Space') {
            e.preventDefault();
            if (!e.repeat) this.onSpaceDown?.();
            return;
        }
        if (e.code === 'KeyZ' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (!e.repeat) this.onZoomDown?.();
            return;
        }
        if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (!e.repeat) this.onRotateDown?.();
            return;
        }

        const isModifierPressed = e.ctrlKey || e.metaKey;

        // === TECLAS SIN MODIFICADOR (Aquí estaba el código inalcanzable) ===
        if (!isModifierPressed) {
            const key = e.key.toLowerCase();

            if (key === 'b') {
                this.onPencil?.(); // El ?.() evita el error de "posibly null"
                return;
            }
            if (key === 'e') {
                this.onEraser?.();
                return;
            }
            if (key === 'h') {
                this.onFlipHorizontal?.();
                return;
            }

            return; // ESTE return corta la ejecución. Todo lo de arriba debe estar antes de él.
        }

        // === TECLAS CON MODIFICADOR (Ctrl / Cmd) ===
        const key = e.key.toLowerCase();

        if (key === '+' || key === '-' || key === '=' || key === '0') {
            e.preventDefault();
            return;
        }
        if (key === 'z') {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey) {
                this.onRedo?.();
            } else {
                this.onUndo?.();
            }
            return;
        }
        if (key === 'y') {
            e.preventDefault();
            e.stopPropagation();
            this.onRedo?.();
            return;
        }
        if (key === 's') {
            e.preventDefault();
            e.stopPropagation();
            this.onSave?.();
            return;
        }
    }

    private handleKeyUp(e: KeyboardEvent) {
        if (e.code === 'AltLeft' || e.code === 'AltRight') {
            e.preventDefault();
            this.onAltUp?.();
        }
        if (e.code === 'Space') {
            e.preventDefault();
            this.onSpaceUp?.();
        }
        if (e.code === 'KeyZ') {
            e.preventDefault();
            this.onZoomUp?.();
        }
        if (e.code === 'KeyR') {
            e.preventDefault();
            this.onRotateUp?.();
        }
    }

    public destroy() {
        window.removeEventListener('keydown', this.handleKeyDown.bind(this));
        window.removeEventListener('keyup', this.handleKeyUp.bind(this));
    }
}