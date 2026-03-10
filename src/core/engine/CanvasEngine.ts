// src/core/CanvasEngine.ts
export class CanvasEngine {
    public container: HTMLDivElement;

    // === NUEVO CONTENEDOR MÓVIL ===
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
        this.container.style.overflow = 'hidden'; // Evita que se vea el lienzo cuando paneas fuera del recuadro

        // === CREAMOS EL CONTENEDOR DE TRANSFORMACIÓN ===
        this.transformContainer = document.createElement('div');
        this.transformContainer.style.position = 'absolute';
        this.transformContainer.style.width = '100%';
        this.transformContainer.style.height = '100%';
        this.transformContainer.style.transformOrigin = '0 0'; // Crucial para que el zoom nazca desde la esquina
        this.container.appendChild(this.transformContainer);

        this.paintingCanvas = document.createElement('canvas');
        this.setupCanvasDimensions(this.paintingCanvas);
        this.paintingCanvas.style.zIndex = '10000';
        this.paintingCanvas.style.pointerEvents = 'none';
        this.paintingContext = this.paintingCanvas.getContext('2d', { willReadFrequently: true })!;

        // Apendamos al transformContainer en lugar del main container
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
        // Apendamos al transformContainer
        this.transformContainer.insertBefore(layer, this.paintingCanvas);

        this.activeLayerIndex = this.layers.length - 1;
        return layer;
    }

    public getActiveLayerContext(): CanvasRenderingContext2D {
        return this.layers[this.activeLayerIndex].getContext('2d')!;
    }

    public commitPaintingCanvas() {
        const activeContext = this.getActiveLayerContext();
        activeContext.drawImage(this.paintingCanvas, 0, 0);
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