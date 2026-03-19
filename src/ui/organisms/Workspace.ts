// src/ui/organisms/Workspace.ts

const CANVAS_SIZE_KEY = 'drawination_canvas_size';

function getInitialCanvasSize(): { width: number; height: number } {
  try {
    const saved = localStorage.getItem(CANVAS_SIZE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.width > 0 && parsed.height > 0) return parsed;
    }
  } catch (_) { }
  return { width: 1180, height: 1180 };
}

export class Workspace {
  public element: HTMLDivElement;
  private canvasArea: HTMLDivElement;
  private static stylesInjected = false;

  constructor() {
    Workspace.injectStyles();

    const { width, height } = getInitialCanvasSize();

    this.element = document.createElement('div');
    this.element.id = 'ws';

    this.canvasArea = document.createElement('div');
    this.canvasArea.id = 'canvas-area';
    this.canvasArea.style.width = `${width}px`;
    this.canvasArea.style.height = `${height}px`;

    const canvasBg = document.createElement('div');
    canvasBg.id = 'canvas-bg';
    this.canvasArea.appendChild(canvasBg);

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

  public getMountPoint(): HTMLDivElement {
    return this.canvasArea;
  }

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
                z-index: var(--z-canvas);
            }
            #canvas-area {
                /* Las dimensiones se setean inline desde JS — no hardcodeadas aquí */
                background: #fff;
                border-radius: 2px;
                box-shadow: 0 0 0 1px rgba(255,255,255,.07), 0 32px 80px rgba(0,0,0,.8);
                position: relative;
                overflow: hidden;
                /* Transición suave al cambiar de formato */
                transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
                            height 0.25s cubic-bezier(0.4, 0, 0.2, 1);
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
                z-index: 1;
                pointer-events: none;
            }
            #canvas-placeholder svg {
                opacity: .3;
            }
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