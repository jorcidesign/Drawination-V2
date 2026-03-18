// src/ui/organisms/Workspace.ts

export class Workspace {
    public element: HTMLDivElement;
    private canvasArea: HTMLDivElement;
    private static stylesInjected = false;

    constructor() {
        Workspace.injectStyles();

        // 1. Contenedor principal (fondo oscuro de toda la pantalla)
        this.element = document.createElement('div');
        this.element.id = 'ws';

        // 2. Área del Canvas (El "papel" blanco con sombra)
        this.canvasArea = document.createElement('div');
        this.canvasArea.id = 'canvas-area';

        // 3. Patrón cuadriculado (ajedrez de fondo para transparencias)
        const canvasBg = document.createElement('div');
        canvasBg.id = 'canvas-bg';
        this.canvasArea.appendChild(canvasBg);

        // 4. Placeholder (Opcional: se puede ocultar cuando el motor cargue)
        const placeholder = document.createElement('div');
        placeholder.id = 'canvas-placeholder';
        placeholder.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#999" stroke-width="1.5">
        <path d="M8 36 L16 24 L24 30 L32 18 L40 36Z" stroke-linejoin="round"/>
        <circle cx="34" cy="14" r="4"/>
      </svg>
      Lienzo de dibujo
    `;
        this.canvasArea.appendChild(placeholder);

        this.element.appendChild(this.canvasArea);
    }

    // El motor (DrawinationApp) llamará a esto para saber DÓNDE inyectar los <canvas> reales
    public getMountPoint(): HTMLDivElement {
        return this.canvasArea;
    }

    // Montamos el workspace en el body
    public mount(parent: HTMLElement) {
        parent.appendChild(this.element);
    }

    private static injectStyles() {
        if (this.stylesInjected) return;
        this.stylesInjected = true;

        const style = document.createElement('style');
        style.textContent = `
      #ws {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--surface-app);
        z-index: var(--z-canvas); /* Queda al fondo de todo */
      }
      #canvas-area {
        /* Estas dimensiones podrían ser dinámicas después si el usuario elige el tamaño del lienzo */
        width: 1180px; 
        height: 1180px; 
        background: #fff;
        border-radius: 2px;
        box-shadow: 0 0 0 1px rgba(255,255,255,.07), 0 32px 80px rgba(0,0,0,.8);
        position: relative;
        overflow: hidden;
      }
      #canvas-bg {
        position: absolute;
        inset: 0;
        background: repeating-conic-gradient(#f8f8f8 0% 25%, #ececec 0% 50%) 0 0/20px 20px;
        z-index: 0;
      }
      #canvas-placeholder {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: #bbb;
        font-size: 13px;
        letter-spacing: .5px;
        z-index: 1; /* Por encima del cuadriculado, pero debajo de los <canvas> del motor */
        pointer-events: none;
      }
      #canvas-placeholder svg {
        opacity: .3;
      }
      /* Cuando el CanvasEngine meta su 'drawination-engine', lo aseguramos arriba del placeholder */
      #drawination-engine {
        position: absolute !important;
        top: 0;
        left: 0;
        z-index: 10;
      }
    `;
        document.head.appendChild(style);
    }
}