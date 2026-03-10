// src/core/engine/CanvasEngine.ts
export class CanvasEngine {
    public container: HTMLDivElement;
    public transformContainer: HTMLDivElement;
    public width: number;
    public height: number;

    private layers: HTMLCanvasElement[] = [];
    public activeLayerIndex: number = 0;

    public paintingCanvas: HTMLCanvasElement;
    public paintingContext: CanvasRenderingContext2D;

    constructor(width: number = 700, height: number = 700) {
        this.width = width;
        this.height = height;

        this.container = document.createElement('div');
        this.container.id = 'drawination-engine';
        this.container.style.position = 'relative';
        this.container.style.width = `${this.width}px`;
        this.container.style.height = `${this.height}px`;
        this.container.style.touchAction = 'none';
        this.container.style.userSelect = 'none';
        this.container.style.overflow = 'hidden';

        this.transformContainer = document.createElement('div');
        this.transformContainer.style.position = 'absolute';
        this.transformContainer.style.width = '100%';
        this.transformContainer.style.height = '100%';
        this.transformContainer.style.transformOrigin = '0 0';
        this.container.appendChild(this.transformContainer);

        this.paintingCanvas = document.createElement('canvas');
        this.setupCanvasDimensions(this.paintingCanvas);
        this.paintingCanvas.style.zIndex = '10000';
        this.paintingCanvas.style.pointerEvents = 'none';
        this.paintingContext = this.paintingCanvas.getContext('2d')!;

        this.transformContainer.appendChild(this.paintingCanvas);
        this.addLayer();
    }

    private setupCanvasDimensions(canvas: HTMLCanvasElement) {
        canvas.width = this.width;
        canvas.height = this.height;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
    }

    public addLayer(): HTMLCanvasElement {
        const layer = document.createElement('canvas');
        layer.className = 'drawination-layer';
        this.setupCanvasDimensions(layer);

        layer.style.zIndex = this.layers.length.toString();

        this.layers.push(layer);
        this.transformContainer.insertBefore(layer, this.paintingCanvas);

        this.activeLayerIndex = this.layers.length - 1;
        return layer;
    }

    public getActiveLayerContext(): CanvasRenderingContext2D {
        return this.layers[this.activeLayerIndex].getContext('2d')!;
    }

    public commitPaintingCanvas() {
        const activeContext = this.getActiveLayerContext();

        // === BLINDAJE CONTRA CORRUPCIÓN DE OPACIDAD ===
        activeContext.save();
        activeContext.globalAlpha = 1.0; // Transfiere el dibujo exactamente como se ve, sin atenuarlo
        activeContext.globalCompositeOperation = 'source-over';

        activeContext.drawImage(this.paintingCanvas, 0, 0);

        activeContext.restore(); // Quitamos el candado
        // ==============================================

        this.clearPaintingCanvas();
    }

    public clearPaintingCanvas() {
        this.paintingContext.clearRect(0, 0, this.width, this.height);
    }

    public clearActiveLayer() {
        const activeContext = this.getActiveLayerContext();
        activeContext.clearRect(0, 0, this.width, this.height);
    }
}