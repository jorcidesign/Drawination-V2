// src/core/ShortcutManager.ts
export class ShortcutManager {
    public onUndo: (() => void) | null = null;
    public onRedo: (() => void) | null = null;
    public onSave: (() => void) | null = null;

    public onSpaceDown: (() => void) | null = null;
    public onSpaceUp: (() => void) | null = null;

    public onZoomDown: (() => void) | null = null;
    public onZoomUp: (() => void) | null = null;

    // === NUEVOS: Eventos para Rotación (Tecla R) ===
    public onRotateDown: (() => void) | null = null;
    public onRotateUp: (() => void) | null = null;

    public onPencil: (() => void) | null = null;
    public onEraser: (() => void) | null = null;

    constructor() {
        this.bindEvents();
    }

    private bindEvents() {
        window.addEventListener('keydown', this.handleKeyDown.bind(this), { passive: false });
        window.addEventListener('keyup', this.handleKeyUp.bind(this), { passive: false });
    }

    // En el método handleKeyDown:
    private handleKeyDown(e: KeyboardEvent) {
        if (e.code === 'Space') {
            e.preventDefault();
            if (!e.repeat && this.onSpaceDown) this.onSpaceDown();
            return;
        }
        if (e.code === 'KeyZ' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (!e.repeat && this.onZoomDown) this.onZoomDown();
            return;
        }
        if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (!e.repeat && this.onRotateDown) this.onRotateDown();
            return;
        }

        const isModifierPressed = e.ctrlKey || e.metaKey;

        // === NUEVOS ATAJOS (SIN MODIFICADORES) ===
        if (!isModifierPressed) {
            const key = e.key.toLowerCase();
            if (key === 'b') {
                if (this.onPencil) this.onPencil();
                return;
            }
            if (key === 'e') {
                if (this.onEraser) this.onEraser();
                return;
            }
            return;
        }

        const key = e.key.toLowerCase();

        if (key === '+' || key === '-' || key === '=' || key === '0') {
            e.preventDefault();
            return;
        }
        if (key === 'z') {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey) {
                if (this.onRedo) this.onRedo();
            } else {
                if (this.onUndo) this.onUndo();
            }
            return;
        }
        if (key === 'y') {
            e.preventDefault();
            e.stopPropagation();
            if (this.onRedo) this.onRedo();
            return;
        }
        if (key === 's') {
            e.preventDefault();
            e.stopPropagation();
            if (this.onSave) this.onSave();
            return;
        }
    }

    private handleKeyUp(e: KeyboardEvent) {
        if (e.code === 'Space') {
            e.preventDefault();
            if (this.onSpaceUp) this.onSpaceUp();
        }
        if (e.code === 'KeyZ') {
            e.preventDefault();
            if (this.onZoomUp) this.onZoomUp();
        }
        // === SOLTAR TECLA R ===
        if (e.code === 'KeyR') {
            e.preventDefault();
            if (this.onRotateUp) this.onRotateUp();
        }
    }

    public destroy() {
        window.removeEventListener('keydown', this.handleKeyDown.bind(this));
        window.removeEventListener('keyup', this.handleKeyUp.bind(this));
    }
}