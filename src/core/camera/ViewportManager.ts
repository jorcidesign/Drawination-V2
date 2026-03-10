// src/core/ViewportManager.ts
export class ViewportManager {
    public x: number = 0;
    public y: number = 0;
    public zoom: number = 1;
    public angle: number = 0;

    private container: HTMLElement;

    private readonly MIN_ZOOM = 0.1;
    private readonly MAX_ZOOM = 30.0;

    constructor(container: HTMLElement) {
        this.container = container;
        this.applyTransform();
    }

    public pan(dx: number, dy: number) {
        this.x += dx;
        this.y += dy;
        this.applyTransform();
    }

    // === MAGIA MATEMÁTICA: Proyectar pantalla a lienzo rotado ===
    public screenToCanvas(screenX: number, screenY: number) {
        // 1. Quitamos la traslación y la escala
        const sx = (screenX - this.x) / this.zoom;
        const sy = (screenY - this.y) / this.zoom;

        // 2. Quitamos la rotación usando la Matriz de Rotación Inversa
        const rad = this.angle * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        return {
            x: sx * cos + sy * sin,
            y: -sx * sin + sy * cos
        };
    }

    public zoomBy(scaleFactor: number, screenX: number, screenY: number) {
        const oldZoom = this.zoom;
        let newZoom = this.zoom * scaleFactor;

        newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, newZoom));
        if (newZoom === oldZoom) return;

        // Anclamos la coordenada para que no tiemble al hacer zoom
        const canvasPt = this.screenToCanvas(screenX, screenY);
        this.zoom = newZoom;

        // Recalculamos X e Y proyectando de vuelta (Matriz de Rotación Directa)
        const rad = this.angle * Math.PI / 180;
        const rx = canvasPt.x * Math.cos(rad) - canvasPt.y * Math.sin(rad);
        const ry = canvasPt.x * Math.sin(rad) + canvasPt.y * Math.cos(rad);

        this.x = screenX - (rx * this.zoom);
        this.y = screenY - (ry * this.zoom);

        this.applyTransform();
    }

    // === NUEVO: Establecer ángulo pivoteando sobre un punto de la pantalla ===
    public setAngle(newAngle: number, pivotScreenX: number, pivotScreenY: number) {
        const canvasPt = this.screenToCanvas(pivotScreenX, pivotScreenY);

        // Normalizamos el ángulo entre 0 y 360
        this.angle = newAngle % 360;
        if (this.angle < 0) this.angle += 360;

        const rad = this.angle * Math.PI / 180;
        const rx = canvasPt.x * Math.cos(rad) - canvasPt.y * Math.sin(rad);
        const ry = canvasPt.x * Math.sin(rad) + canvasPt.y * Math.cos(rad);

        // Compensamos X e Y para que el centro de rotación no se mueva de su sitio
        this.x = pivotScreenX - (rx * this.zoom);
        this.y = pivotScreenY - (ry * this.zoom);

        this.applyTransform();
    }

    private applyTransform() {
        // El orden de CSS es vital: Traslada -> Escala -> Rota
        this.container.style.transform = `translate3d(${this.x}px, ${this.y}px, 0) scale(${this.zoom}) rotate(${this.angle}deg)`;
    }
}