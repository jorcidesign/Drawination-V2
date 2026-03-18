// src/ui/atoms/IconButton.ts
import { Icons } from './Icons';

export interface IconButtonProps {
    icon: keyof typeof Icons;
    title?: string;
    variant?: 'default' | 'active' | 'accent' | 'sm' | 'danger';
    onClick?: (e: MouseEvent) => void;
    id?: string;
}

export class IconButton {
    public element: HTMLButtonElement;
    private static stylesInjected = false;

    constructor(props: IconButtonProps) {
        IconButton.injectStyles();

        this.element = document.createElement('button');
        this.element.className = 'btn';

        if (props.id) this.element.id = props.id;
        if (props.title) this.element.title = props.title;

        // Wrap SVG in a span for layered effects
        this.element.innerHTML = `
            <span class="btn__ink" aria-hidden="true"></span>
            <span class="btn__icon">${Icons[props.icon]}</span>
        `;

        if (props.variant === 'sm') this.element.classList.add('btn--sm');
        if (props.variant === 'active') this.element.classList.add('btn--active');
        if (props.variant === 'accent') this.element.classList.add('btn--accent');
        if (props.variant === 'danger') this.element.classList.add('btn--danger');

        if (props.onClick) {
            this.element.addEventListener('click', props.onClick);
        }
    }

    public setActive(isActive: boolean) {
        this.element.classList.toggle('btn--active', isActive);
    }

    public mount(parent: HTMLElement) {
        parent.appendChild(this.element);
    }

    private static injectStyles() {
        if (this.stylesInjected) return;
        this.stylesInjected = true;

        const style = document.createElement('style');
        style.textContent = `
            /* ─── Ma (間) — Japanese negative space aesthetic ─── */

            .btn {
                position: relative;
                width: var(--btn-size, 36px);
                height: var(--btn-size, 36px);
                border: none;
                background: transparent;
                color: var(--text-secondary, #888);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                padding: 0;
                outline: none;
                /* Radios asimétricos — como piedras pulidas por el agua */
                border-radius: 10px 8px 10px 8px;
                transition:
                    color 180ms cubic-bezier(0.4, 0, 0.2, 1),
                    border-radius 220ms cubic-bezier(0.4, 0, 0.2, 1);
                /* Trazo sumi-e: borde ultra-fino, casi invisible */
                box-shadow: inset 0 0 0 0px transparent;
                overflow: hidden;
                -webkit-tap-highlight-color: transparent;
            }

            /* Capa de tinta: el "fondo activo" que se expande desde el centro */
            .btn__ink {
                position: absolute;
                inset: 0;
                border-radius: inherit;
                background: var(--surface-hover, rgba(0,0,0,0.06));
                opacity: 0;
                transform: scale(0.7);
                transition:
                    opacity 180ms ease,
                    transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
                pointer-events: none;
            }

            .btn__icon {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1;
                transition: transform 180ms cubic-bezier(0.34, 1.2, 0.64, 1);
            }

            .btn__icon svg {
                width: 20px;
                height: 20px;
                pointer-events: none;
                /* fill heredado de currentColor */
            }

            /* ── Hover: el espacio "se llena" suavemente ── */
            .btn:hover .btn__ink {
                opacity: 1;
                transform: scale(1);
            }
            .btn:hover {
                color: var(--text-primary, #1a1a1a);
                /* Radios más redondos al hover — se "suaviza" */
                border-radius: 12px 10px 12px 10px;
            }
            .btn:hover .btn__icon {
                transform: scale(1.08);
            }

            /* ── Press: compresión como sello hanko ── */
            .btn:active .btn__icon {
                transform: scale(0.88);
                transition-duration: 60ms;
            }
            .btn:active .btn__ink {
                background: var(--surface-pressed, rgba(0,0,0,0.11));
                transition-duration: 60ms;
            }

            /* ── Active: estado seleccionado, tinta sobre papel ── */
            .btn--active {
                color: var(--accent-bright, #0066cc);
                border-radius: 8px 12px 8px 12px;
            }
            .btn--active .btn__ink {
                opacity: 1;
                transform: scale(1);
                background: var(--surface-active, rgba(0, 102, 204, 0.1));
            }
            /* Trazo lateral izquierdo — como un pincel vertical */
            .btn--active::before {
                content: '';
                position: absolute;
                left: 0;
                top: 20%;
                bottom: 20%;
                width: 2px;
                border-radius: 0 1px 1px 0;
                background: var(--accent-bright, #0066cc);
                opacity: 0.8;
            }
            .btn--active:hover .btn__ink {
                background: var(--surface-pressed, rgba(0, 102, 204, 0.16));
            }

            /* ── Accent: lleno de tinta ── */
            .btn--accent {
                color: #fff;
                border-radius: 10px 6px 10px 6px;
            }
            .btn--accent .btn__ink {
                opacity: 1;
                transform: scale(1);
                background: var(--accent, #0055bb);
            }
            .btn--accent:hover .btn__ink {
                background: var(--accent-bright, #0066cc);
            }

            /* ── Small: forma cuadrada más clásica ── */
            .btn--sm {
                width: var(--btn-sm-size, 28px);
                height: var(--btn-sm-size, 28px);
                border-radius: 7px 5px 7px 5px;
            }
            .btn--sm .btn__icon svg {
                width: 16px;
                height: 16px;
            }

            /* ── Danger: rojo sutil, como lacre ── */
            .btn--danger:hover {
                color: #c0392b;
                border-radius: 12px 8px 12px 8px;
            }
            .btn--danger:hover .btn__ink {
                background: rgba(192, 57, 43, 0.1);
            }

            /* ── Focus visible: accesibilidad con trazo fino ── */
            .btn:focus-visible {
                box-shadow:
                    0 0 0 1.5px var(--accent-bright, #0066cc),
                    0 0 0 3px rgba(0, 102, 204, 0.15);
            }
        `;
        document.head.appendChild(style);
    }
}