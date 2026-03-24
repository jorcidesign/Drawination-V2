// src/core/engine/CanvasEngine.ts
export const DEFAULT_BACKGROUND_COLOR = '#ffffff';

export class CanvasEngine {
    public container: HTMLDivElement;
    public transformContainer: HTMLDivElement;
    public width: number;
    public height: number;

    private layers: HTMLCanvasElement[] = [];
    public activeLayerIndex: number = 0;
    private readonly MAX_LAYERS = 10;

    public paintingCanvas: HTMLCanvasElement;
    public paintingContext: CanvasRenderingContext2D;

    constructor(width: number = 1180, height: number = 1180) {
        this.width = width;
        this.height = height;

        this.container = document.createElement('div');
        this.container.id = 'drawination-engine';
        this.container.style.touchAction = 'none';
        this.container.style.userSelect = 'none';

        this.transformContainer = document.createElement('div');
        this.transformContainer.style.position = 'absolute';
        this.transformContainer.style.transformOrigin = '0 0';
        this.transformContainer.style.backgroundColor = DEFAULT_BACKGROUND_COLOR;
        this._applyTransformContainerSize();
        this.container.appendChild(this.transformContainer);

        for (let i = 0; i < this.MAX_LAYERS; i++) this._addLayer(i);

        this.paintingCanvas = document.createElement('canvas');
        this._setupCanvasDimensions(this.paintingCanvas);
        this.paintingCanvas.style.zIndex = '10000';
        this.paintingCanvas.style.pointerEvents = 'none';
        this.paintingContext = this.paintingCanvas.getContext('2d')!;
        this.transformContainer.appendChild(this.paintingCanvas);
    }

    public resize(newWidth: number, newHeight: number): void {
        this.width = newWidth;
        this.height = newHeight;
        this._applyTransformContainerSize();
        for (let i = 0; i < this.MAX_LAYERS; i++) {
            this.layers[i].width = newWidth;
            this.layers[i].height = newHeight;
        }
        this.paintingCanvas.width = newWidth;
        this.paintingCanvas.height = newHeight;
    }

    private _applyTransformContainerSize(): void {
        this.transformContainer.style.width = `${this.width}px`;
        this.transformContainer.style.height = `${this.height}px`;
    }

    private _setupCanvasDimensions(canvas: HTMLCanvasElement) {
        canvas.width = this.width;
        canvas.height = this.height;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
    }

    private _addLayer(index: number) {
        const layer = document.createElement('canvas');
        layer.className = `drawination-layer layer-${index}`;
        this._setupCanvasDimensions(layer);
        layer.style.zIndex = index.toString();
        this.layers.push(layer);
        this.transformContainer.appendChild(layer);
    }

    public getLayerContext(index: number): CanvasRenderingContext2D {
        return this.layers[Math.max(0, Math.min(this.MAX_LAYERS - 1, index))].getContext('2d')!;
    }

    public getLayerCanvas(index: number): HTMLCanvasElement {
        return this.layers[Math.max(0, Math.min(this.MAX_LAYERS - 1, index))];
    }

    public getActiveLayerContext(): CanvasRenderingContext2D {
        return this.getLayerContext(this.activeLayerIndex);
    }

    public clearAllLayers() {
        for (const layer of this.layers) {
            layer.getContext('2d')!.clearRect(0, 0, this.width, this.height);
        }
    }

    public commitPaintingCanvas() {
        const activeContext = this.getActiveLayerContext();
        activeContext.save();
        activeContext.globalAlpha = 1.0;
        activeContext.globalCompositeOperation = 'source-over';
        activeContext.drawImage(this.paintingCanvas, 0, 0);
        activeContext.restore();
        this.clearPaintingCanvas();
    }

    public clearPaintingCanvas() {
        this.paintingContext.clearRect(0, 0, this.width, this.height);
    }

    public clearActiveLayer() {
        this.getActiveLayerContext().clearRect(0, 0, this.width, this.height);
    }
}