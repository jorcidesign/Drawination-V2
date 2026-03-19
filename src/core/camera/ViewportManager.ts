// src/core/camera/ViewportManager.ts
export class ViewportManager {
    public x: number = 0;
    public y: number = 0;
    public zoom: number = 1;
    public angle: number = 0;
    public scaleX: number = 1;

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

    public screenToCanvas(screenX: number, screenY: number) {
        const sx = (screenX - this.x) / (this.zoom * this.scaleX);
        const sy = (screenY - this.y) / this.zoom;

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

        const canvasPt = this.screenToCanvas(screenX, screenY);
        this.zoom = newZoom;

        const rad = this.angle * Math.PI / 180;
        const rx = canvasPt.x * Math.cos(rad) - canvasPt.y * Math.sin(rad);
        const ry = canvasPt.x * Math.sin(rad) + canvasPt.y * Math.cos(rad);

        this.x = screenX - (rx * this.zoom * this.scaleX);
        this.y = screenY - (ry * this.zoom);

        this.applyTransform();
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

        this.applyTransform();
    }

    public flipHorizontal(pivotScreenX: number, pivotScreenY: number) {
        const canvasPt = this.screenToCanvas(pivotScreenX, pivotScreenY);

        this.scaleX *= -1;

        const rad = this.angle * Math.PI / 180;
        const rx = canvasPt.x * Math.cos(rad) - canvasPt.y * Math.sin(rad);
        const ry = canvasPt.x * Math.sin(rad) + canvasPt.y * Math.cos(rad);

        this.x = pivotScreenX - (rx * this.zoom * this.scaleX);
        this.y = pivotScreenY - (ry * this.zoom);

        this.applyTransform();
    }

    // ── Reset completo del viewport ───────────────────────────────────────
    // Centra el canvas de las dimensiones dadas en el contenedor de pantalla.
    // Llama applyTransform() internamente — no se puede olvidar.
    public reset(canvasWidth: number, canvasHeight: number): void {
        const containerW = this.container.parentElement?.clientWidth ?? window.innerWidth;
        const containerH = this.container.parentElement?.clientHeight ?? window.innerHeight;

        this.zoom = 1;
        this.angle = 0;
        this.scaleX = 1;
        this.x = Math.round((containerW - canvasWidth) / 2);
        this.y = Math.round((containerH - canvasHeight) / 2);

        this.applyTransform();
    }

    public applyTransform() {
        this.container.style.transform = `translate3d(${this.x}px, ${this.y}px, 0) scale(${this.zoom * this.scaleX}, ${this.zoom}) rotate(${this.angle}deg)`;
    }
}