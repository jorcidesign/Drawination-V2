// src/ui/atoms/ColorSwatch.ts

export interface ColorSwatchProps {
    color: string; // Hexadecimal
    title?: string;
    isActiveSlot?: boolean; // Si es true, es el slot gigante que abre el panel
    onClick?: (color: string) => void;
}

export class ColorSwatch {
    public element: HTMLButtonElement;
    private color: string;
    private static stylesInjected = false;

    constructor(props: ColorSwatchProps) {
        ColorSwatch.injectStyles();
        this.color = props.color;

        this.element = document.createElement('button');
        this.element.className = 'swatch';
        this.element.style.backgroundColor = this.color;

        if (props.title) this.element.title = props.title;

        // Si es blanco, le damos un borde para que no se pierda
        if (this.color.toUpperCase() === '#FFFFFF') {
            this.element.style.outline = '1px solid rgba(255,255,255,0.2)';
        }

        if (props.isActiveSlot) {
            this.element.classList.add('swatch--active-slot');
        }

        if (props.onClick) {
            this.element.addEventListener('click', () => props.onClick!(this.color));
        }
    }

    // Permite actualizar el color en tiempo real (útil para el slot activo)
    public setColor(newColor: string) {
        this.color = newColor;
        this.element.style.backgroundColor = newColor;
        if (newColor.toUpperCase() === '#FFFFFF') {
            this.element.style.outline = '1px solid rgba(255,255,255,0.2)';
        } else {
            this.element.style.outline = 'none';
        }
    }

    public setActiveState(isActive: boolean) {
        if (isActive) {
            this.element.classList.add('swatch--active-slot');
        } else {
            this.element.classList.remove('swatch--active-slot');
        }
    }

    public mount(parent: HTMLElement) {
        parent.appendChild(this.element);
    }

    private static injectStyles() {
        if (this.stylesInjected) return;
        this.stylesInjected = true;

        const style = document.createElement('style');
        style.textContent = `
      .swatch {
        width: 28px;
        height: 28px;
        border-radius: 5px;
        border: none;
        cursor: pointer;
        flex-shrink: 0;
        transition: transform var(--t-fast), box-shadow var(--t-fast);
        outline: none;
      }
      .swatch:hover {
        transform: scale(1.14);
        box-shadow: 0 2px 8px rgba(0,0,0,.5);
        z-index: 1;
      }
      .swatch--active-slot {
        width: 30px;
        height: 30px;
        border-radius: 6px;
        outline: 2px solid var(--accent-bright) !important;
        outline-offset: 2px;
      }
    `;
        document.head.appendChild(style);
    }
}