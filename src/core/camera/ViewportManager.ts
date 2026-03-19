// src/core/camera/ViewportManager.ts

import type { EventBus } from '../../input/EventBus';

export class ViewportManager {
    public x: number = 0;
    public y: number = 0;
    public zoom: number = 1;
    public angle: number = 0;
    public scaleX: number = 1;

    private container: HTMLElement;
    private eventBus: EventBus | null = null;

    private readonly MIN_ZOOM = 0.1;
    private readonly MAX_ZOOM = 30.0;

    private readonly UI_TOP = 56;
    private readonly UI_LEFT = 60;
    private readonly UI_RIGHT = 0;
    private readonly UI_BOTTOM = 48;
    private readonly PADDING = 32;

    private _userHasNavigated = false;
    private _canvasWidth = 1180;
    private _canvasHeight = 1180;
    private _resizeHandler: () => void;

    constructor(container: HTMLElement) {
        this.container = container;
        this.applyTransform();

        let resizeTimer: ReturnType<typeof setTimeout>;
        this._resizeHandler = () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => this._onWindowResize(), 60);
        };
        window.addEventListener('resize', this._resizeHandler);
    }

    public setEventBus(bus: EventBus): void {
        this.eventBus = bus;
    }

    // ── Navegación manual ─────────────────────────────────────────────────

    public pan(dx: number, dy: number) {
        this.x += dx;
        this.y += dy;
        this._userHasNavigated = true;
        this.applyTransform();
        this._emitChanged();
    }

    public screenToCanvas(screenX: number, screenY: number) {
        const sx = (screenX - this.x) / (this.zoom * this.scaleX);
        const sy = (screenY - this.y) / this.zoom;
        const rad = this.angle * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return {
            x: sx * cos + sy * sin,
            y: -sx * sin + sy * cos,
        };
    }

    public zoomBy(scaleFactor: number, screenX: number, screenY: number) {
        const oldZoom = this.zoom;
        let newZoom = this.zoom * scaleFactor;
        newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, newZoom));
        if (newZoom === oldZoom) return;

        const canvasPt = this.screenToCanvas(screenX, screenY);
        this.zoom = newZoom;

        const rad = this.angle * Math.PI / 180;
        const rx = canvasPt.x * Math.cos(rad) - canvasPt.y * Math.sin(rad);
        const ry = canvasPt.x * Math.sin(rad) + canvasPt.y * Math.cos(rad);

        this.x = screenX - (rx * this.zoom * this.scaleX);
        this.y = screenY - (ry * this.zoom);

        this._userHasNavigated = true;
        this.applyTransform();
        this._emitChanged();
    }

    // Zoom absoluto con centrado — usado por el menú de zoom de la UI.
    // Setea el zoom deseado y luego calcula x/y para centrar en ese zoom.
    // _centerXY() NUNCA toca this.zoom — esa es la regla fija.
    public setZoom(targetZoom: number): void {
        this.zoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, targetZoom));
        this.angle = 0;
        this.scaleX = 1;
        this._userHasNavigated = false;
        this._centerXY(this._canvasWidth, this._canvasHeight);
        this.applyTransform();
        this._emitChanged();
    }

    public setAngle(newAngle: number, pivotScreenX: number, pivotScreenY: number) {
        const canvasPt = this.screenToCanvas(pivotScreenX, pivotScreenY);

        this.angle = newAngle % 360;
        if (this.angle < 0) this.angle += 360;

        const rad = this.angle * Math.PI / 180;
        const rx = canvasPt.x * Math.cos(rad) - canvasPt.y * Math.sin(rad);
        const ry = canvasPt.x * Math.sin(rad) + canvasPt.y * Math.cos(rad);

        this.x = pivotScreenX - (rx * this.zoom * this.scaleX);
        this.y = pivotScreenY - (ry * this.zoom);

        this._userHasNavigated = true;
        this.applyTransform();
        this._emitChanged();
    }

    // Ángulo absoluto con pivote en centro de pantalla — usado por el menú de rotación.
    public setAngleAbsolute(degrees: number): void {
        const pivotX = window.innerWidth / 2;
        const pivotY = window.innerHeight / 2;
        this.setAngle(degrees, pivotX, pivotY);
    }

    public flipHorizontal(pivotScreenX: number, pivotScreenY: number) {
        const canvasPt = this.screenToCanvas(pivotScreenX, pivotScreenY);

        this.scaleX *= -1;

        const rad = this.angle * Math.PI / 180;
        const rx = canvasPt.x * Math.cos(rad) - canvasPt.y * Math.sin(rad);
        const ry = canvasPt.x * Math.sin(rad) + canvasPt.y * Math.cos(rad);

        this.x = pivotScreenX - (rx * this.zoom * this.scaleX);
        this.y = pivotScreenY - (ry * this.zoom);

        this._userHasNavigated = true;
        this.applyTransform();
        this._emitChanged();
    }

    // ── Reset completo (nuevo proyecto / arranque) ────────────────────────
    // Calcula el zoom fit y centra. Resetea el flag de navegación.
    public reset(canvasWidth: number, canvasHeight: number): void {
        this._canvasWidth = canvasWidth;
        this._canvasHeight = canvasHeight;
        this._userHasNavigated = false;
        this.angle = 0;
        this.scaleX = 1;

        // Calcular zoom fit aquí — reset sí calcula zoom, setZoom no
        const availW = window.innerWidth - this.UI_LEFT - this.UI_RIGHT - this.PADDING * 2;
        const availH = window.innerHeight - this.UI_TOP - this.UI_BOTTOM - this.PADDING * 2;
        this.zoom = Math.min(1, availW / canvasWidth, availH / canvasHeight);

        this._centerXY(canvasWidth, canvasHeight);
        this.applyTransform();
        this._emitChanged();
    }

    // ── Resize reactivo ───────────────────────────────────────────────────
    private _onWindowResize(): void {
        if (!this._userHasNavigated) {
            // Posición neutral — recalcular zoom fit y re-centrar
            this.reset(this._canvasWidth, this._canvasHeight);
            return;
        }

        // Posición de trabajo — anclar el punto central visible
        const newCenterX = window.innerWidth / 2;
        const newCenterY = window.innerHeight / 2;

        const anchorCanvas = this.screenToCanvas(newCenterX, newCenterY);

        const rad = this.angle * Math.PI / 180;
        const rx = anchorCanvas.x * Math.cos(rad) - anchorCanvas.y * Math.sin(rad);
        const ry = anchorCanvas.x * Math.sin(rad) + anchorCanvas.y * Math.cos(rad);

        this.x = Math.round(newCenterX - rx * this.zoom * this.scaleX);
        this.y = Math.round(newCenterY - ry * this.zoom);

        this.applyTransform();
        this._emitChanged();
    }

    // ── Centrar x/y dado el zoom actual ──────────────────────────────────
    // CONTRATO: nunca modifica this.zoom. Solo calcula x/y.
    private _centerXY(canvasWidth: number, canvasHeight: number): void {
        const availW = window.innerWidth - this.UI_LEFT - this.UI_RIGHT - this.PADDING * 2;
        const availH = window.innerHeight - this.UI_TOP - this.UI_BOTTOM - this.PADDING * 2;
        const centerX = this.UI_LEFT + this.PADDING + availW / 2;
        const centerY = this.UI_TOP + this.PADDING + availH / 2;

        this.x = Math.round(centerX - (canvasWidth * this.zoom) / 2);
        this.y = Math.round(centerY - (canvasHeight * this.zoom) / 2);
    }

    private _emitChanged(): void {
        this.eventBus?.emit('VIEWPORT_CHANGED', {
            zoom: this.zoom,
            angle: this.angle,
        });
    }

    public applyTransform() {
        this.container.style.transform =
            `translate3d(${this.x}px, ${this.y}px, 0) ` +
            `scale(${this.zoom * this.scaleX}, ${this.zoom}) ` +
            `rotate(${this.angle}deg)`;
    }

    public destroy(): void {
        window.removeEventListener('resize', this._resizeHandler);
    }
}