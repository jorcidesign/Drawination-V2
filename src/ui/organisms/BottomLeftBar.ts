// src/ui/organisms/BottomLeftBar.ts
import { IconButton } from '../atoms/IconButton';
import type { EventBus } from '../../input/EventBus';

// Opciones del menú de zoom
const ZOOM_OPTIONS = [
  { label: 'Ajustar pantalla', value: -1 },  // -1 = fit especial
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.50 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1.00 },
  { label: '150%', value: 1.50 },
  { label: '200%', value: 2.00 },
];

// Opciones del menú de rotación
const ANGLE_OPTIONS = [
  { label: '0°', value: 0 },
  { label: '45°', value: 45 },
  { label: '90°', value: 90 },
  { label: '135°', value: 135 },
  { label: '180°', value: 180 },
  { label: '-90°', value: 270 },
  { label: '-45°', value: 315 },
];

export class BottomLeftBar {
  public element: HTMLDivElement;
  private eventBus: EventBus;
  private static stylesInjected = false;

  private zoomBtn: HTMLButtonElement;
  private angleBtn: HTMLButtonElement;

  // Referencia al menú abierto actualmente (para cerrarlo al abrir otro)
  private _activeMenu: HTMLDivElement | null = null;

  constructor(eventBus: EventBus) {
    BottomLeftBar.injectStyles();
    this.eventBus = eventBus;

    this.element = document.createElement('div');
    this.element.className = 'bar bar-bl';

    // ── Undo / Redo ───────────────────────────────────────────────────
    const undoBtn = new IconButton({
      icon: 'undo',
      title: 'Deshacer (Ctrl+Z)',
      variant: 'sm',
      onClick: () => this.eventBus.emit('REQUEST_UNDO')
    });
    undoBtn.mount(this.element);

    const redoBtn = new IconButton({
      icon: 'redo',
      title: 'Rehacer (Ctrl+Y)',
      variant: 'sm',
      onClick: () => this.eventBus.emit('REQUEST_REDO')
    });
    redoBtn.mount(this.element);

    this.element.appendChild(this.createSeparator());

    // ── Botón Zoom ────────────────────────────────────────────────────
    this.zoomBtn = document.createElement('button');
    this.zoomBtn.className = 'status-btn';
    this.zoomBtn.title = 'Zoom — click para opciones';
    this.zoomBtn.textContent = '100%';
    this.zoomBtn.onclick = (e) => {
      e.stopPropagation();
      this._toggleMenu('zoom', this.zoomBtn);
    };
    this.element.appendChild(this.zoomBtn);

    // ── Botón Ángulo ──────────────────────────────────────────────────
    this.angleBtn = document.createElement('button');
    this.angleBtn.className = 'status-btn';
    this.angleBtn.title = 'Rotación — click para opciones';
    this.angleBtn.textContent = '0°';
    this.angleBtn.onclick = (e) => {
      e.stopPropagation();
      this._toggleMenu('angle', this.angleBtn);
    };
    this.element.appendChild(this.angleBtn);

    this.bindEvents();

    // Cerrar menú al hacer click en cualquier otro lugar
    document.addEventListener('click', () => this._closeMenu());
  }

  private createSeparator(): HTMLDivElement {
    const sep = document.createElement('div');
    sep.className = 'sep';
    return sep;
  }

  private bindEvents() {
    // Actualizar display en tiempo real
    this.eventBus.on('VIEWPORT_CHANGED', ({ zoom, angle }) => {
      this.zoomBtn.textContent = `${Math.round(zoom * 100)}%`;
      this.angleBtn.textContent = `${Math.round(angle)}°`;
    });
  }

  // ── Menú emergente ────────────────────────────────────────────────────

  private _toggleMenu(type: 'zoom' | 'angle', anchor: HTMLButtonElement): void {
    // Si ya hay un menú abierto del mismo tipo, cerrarlo
    if (this._activeMenu) {
      this._closeMenu();
      return;
    }

    const options = type === 'zoom' ? ZOOM_OPTIONS : ANGLE_OPTIONS;
    const menu = document.createElement('div');
    menu.className = 'viewport-menu';

    options.forEach(opt => {
      const item = document.createElement('button');
      item.className = 'viewport-menu-item';
      item.textContent = opt.label;

      // Marcar la opción activa
      if (type === 'zoom' && opt.value !== -1) {
        const currentZoom = parseFloat(this.zoomBtn.textContent ?? '100') / 100;
        if (Math.abs(currentZoom - opt.value) < 0.01) {
          item.classList.add('viewport-menu-item--active');
        }
      }

      item.onclick = (e) => {
        e.stopPropagation();
        this._closeMenu();

        if (type === 'zoom') {
          if (opt.value === -1) {
            // "Ajustar pantalla" — reset completo
            this.eventBus.emit('RESET_ZOOM');
          } else {
            this.eventBus.emit('VIEWPORT_ZOOM_SET', opt.value);
          }
        } else {
          this.eventBus.emit('VIEWPORT_ANGLE_SET', opt.value);
        }
      };

      menu.appendChild(item);
    });

    // Posicionar el menú encima del botón
    document.body.appendChild(menu);
    this._activeMenu = menu;

    const rect = anchor.getBoundingClientRect();
    const menuH = menu.offsetHeight || options.length * 36 + 8;

    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.top - menuH - 6}px`;
  }

  private _closeMenu(): void {
    this._activeMenu?.remove();
    this._activeMenu = null;
  }

  public mount(parent: HTMLElement) {
    parent.appendChild(this.element);
  }

  private static injectStyles() {
    if (this.stylesInjected) return;
    this.stylesInjected = true;

    const style = document.createElement('style');
    style.textContent = `
            .bar-bl {
                bottom: 14px;
                left: 12px;
                z-index: var(--z-bar);
            }
            .status-btn {
                height: var(--btn-sm-size, 28px);
                padding: 0 8px;
                border-radius: 6px;
                border: none;
                background: transparent;
                color: var(--text-secondary);
                font-family: var(--font-mono);
                font-size: var(--text-sm);
                cursor: pointer;
                transition: background var(--t-fast), color var(--t-fast);
                white-space: nowrap;
                outline: none;
                font-variant-numeric: tabular-nums;
                min-width: 44px;
                text-align: center;
            }
            .status-btn:hover {
                background: var(--surface-hover);
                color: var(--text-primary);
            }
            .status-btn:active {
                background: var(--surface-active);
                color: var(--accent-bright);
            }

            /* ── Menú emergente ── */
            .viewport-menu {
                position: fixed;
                background: var(--surface-bar);
                border: 1px solid var(--surface-bar-border);
                border-radius: var(--bar-radius);
                padding: 4px;
                display: flex;
                flex-direction: column;
                gap: 1px;
                z-index: calc(var(--z-panel) + 10);
                min-width: 140px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.4);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                animation: viewport-menu-in 0.12s cubic-bezier(0.34, 1.2, 0.64, 1);
            }
            @keyframes viewport-menu-in {
                from { opacity: 0; transform: translateY(4px) scale(0.97); }
                to   { opacity: 1; transform: none; }
            }
            .viewport-menu-item {
                width: 100%;
                padding: 7px 12px;
                border: none;
                background: transparent;
                color: var(--text-secondary);
                font-family: var(--font-ui);
                font-size: var(--text-sm);
                font-variant-numeric: tabular-nums;
                text-align: left;
                cursor: pointer;
                border-radius: calc(var(--bar-radius) - 2px);
                transition: background var(--t-fast), color var(--t-fast);
                outline: none;
            }
            .viewport-menu-item:hover {
                background: var(--surface-hover);
                color: var(--text-primary);
            }
            .viewport-menu-item--active {
                color: var(--accent-bright);
                background: var(--surface-active);
            }
        `;
    document.head.appendChild(style);
  }
}