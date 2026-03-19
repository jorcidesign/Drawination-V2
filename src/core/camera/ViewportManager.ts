// src/core/camera/ViewportManager.ts
//
// RESIZE REACTIVO:
//   Cuando la ventana cambia de tamaño, el comportamiento depende
//   de si el usuario ha navegado manualmente o no:
//
//   - Sin navegación manual (posición neutral):
//     Re-centra y recalcula zoom automáticamente con reset().
//
//   - Con navegación manual (el usuario movió/rotó/zoomeó):
//     Ancla el punto del canvas que estaba en el centro de la
//     pantalla anterior — ese mismo punto queda en el centro
//     del nuevo espacio disponible. El canvas no salta.
//     Mismo comportamiento que Google Maps, Figma, Miro.

export class ViewportManager {
    public x: number = 0;
    public y: number = 0;
    public zoom: number = 1;
    public angle: number = 0;
    public scaleX: number = 1;

    private container: HTMLElement;

    private readonly MIN_ZOOM = 0.1;
    private readonly MAX_ZOOM = 30.0;

    // Offsets de las barras de UI
    private readonly UI_TOP = 56;
    private readonly UI_LEFT = 60;
    private readonly UI_RIGHT = 0;
    private readonly UI_BOTTOM = 48;
    private readonly PADDING = 32;

    // Flag: el usuario navegó manualmente al menos una vez
    private _userHasNavigated = false;

    // Dimensiones del canvas actual — necesarias para el ancla de resize
    private _canvasWidth = 1180;
    private _canvasHeight = 1180;

    // Handler del resize guardado para poder eliminarlo si fuera necesario
    private _resizeHandler: () => void;

    constructor(container: HTMLElement) {
        this.container = container;
        this.applyTransform();

        // Debounce del resize — 60ms es suficiente para que el browser
        // termine de actualizar window.innerWidth/Height sin disparar
        // demasiados recálculos durante el arrastre del borde de ventana
        let resizeTimer: ReturnType<typeof setTimeout>;
        this._resizeHandler = () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => this._onWindowResize(), 60);
        };

        window.addEventListener('resize', this._resizeHandler);
    }

    // ── Navegación manual ─────────────────────────────────────────────────

    public pan(dx: number, dy: number) {
        this.x += dx;
        this.y += dy;
        this._userHasNavigated = true;
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

        this._userHasNavigated = true;
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

        this._userHasNavigated = true;
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

        this._userHasNavigated = true;
        this.applyTransform();
    }

    // ── Reset y centrado inteligente ──────────────────────────────────────
    // Centra el canvas en el espacio disponible, hace zoom-out si no cabe.
    // Resetea el flag de navegación — la próxima vez que el usuario
    // mueva algo volverá a ser "navegado".
    public reset(canvasWidth: number, canvasHeight: number): void {
        this._canvasWidth = canvasWidth;
        this._canvasHeight = canvasHeight;
        this._userHasNavigated = false;

        this._centerCanvas(canvasWidth, canvasHeight);
    }

    // ── Handler interno de resize ─────────────────────────────────────────
    private _onWindowResize(): void {
        if (!this._userHasNavigated) {
            // Posición neutral — re-centrar con las dimensiones actuales
            this._centerCanvas(this._canvasWidth, this._canvasHeight);
            return;
        }

        // Posición de trabajo — anclar el punto del canvas que estaba
        // en el centro de la pantalla antes del resize.
        //
        // El punto central de pantalla es simplemente (innerW/2, innerH/2).
        // Como el resize ya ocurrió cuando llegamos aquí, usamos las
        // dimensiones nuevas directamente — el punto canvas que calcula
        // screenToCanvas() es invariante al tamaño de ventana porque
        // solo depende de this.x/y/zoom/angle que NO cambiaron todavía.
        const newCenterX = window.innerWidth / 2;
        const newCenterY = window.innerHeight / 2;

        // Punto del canvas que antes estaba en el centro de la pantalla
        // (calculado con las matrices actuales, que aún no cambiaron)
        const anchorCanvas = this.screenToCanvas(newCenterX, newCenterY);

        // Ahora re-posicionamos para que ese mismo punto quede
        // en el centro del nuevo espacio de pantalla
        const rad = this.angle * Math.PI / 180;
        const rx = anchorCanvas.x * Math.cos(rad) - anchorCanvas.y * Math.sin(rad);
        const ry = anchorCanvas.x * Math.sin(rad) + anchorCanvas.y * Math.cos(rad);

        this.x = Math.round(newCenterX - rx * this.zoom * this.scaleX);
        this.y = Math.round(newCenterY - ry * this.zoom);

        this.applyTransform();
    }

    // ── Cálculo de centrado ───────────────────────────────────────────────
    private _centerCanvas(canvasWidth: number, canvasHeight: number): void {
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;

        const availW = screenW - this.UI_LEFT - this.UI_RIGHT - this.PADDING * 2;
        const availH = screenH - this.UI_TOP - this.UI_BOTTOM - this.PADDING * 2;

        const zoomFitW = availW / canvasWidth;
        const zoomFitH = availH / canvasHeight;
        const zoomFit = Math.min(zoomFitW, zoomFitH);

        this.zoom = Math.min(1, zoomFit);
        this.angle = 0;
        this.scaleX = 1;

        const centerX = this.UI_LEFT + this.PADDING + availW / 2;
        const centerY = this.UI_TOP + this.PADDING + availH / 2;

        this.x = Math.round(centerX - (canvasWidth * this.zoom) / 2);
        this.y = Math.round(centerY - (canvasHeight * this.zoom) / 2);

        this.applyTransform();
    }

    public applyTransform() {
        this.container.style.transform =
            `translate3d(${this.x}px, ${this.y}px, 0) ` +
            `scale(${this.zoom * this.scaleX}, ${this.zoom}) ` +
            `rotate(${this.angle}deg)`;
    }

    // Limpiar el listener si el viewport se destruye
    public destroy(): void {
        window.removeEventListener('resize', this._resizeHandler);
    }
}