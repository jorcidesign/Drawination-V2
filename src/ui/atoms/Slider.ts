// src/ui/atoms/Slider.ts

export interface SliderProps {
    id?: string;
    min: number;
    max: number;
    value: number;
    // Función para que el padre decida cómo se formatea el texto (ej: "Tamaño: 15px")
    formatLabel: (val: number) => string;
    // Evento que se dispara en tiempo real al arrastrar
    onInput?: (val: number) => void;
    // Evento que se dispara al soltar el slider
    onChange?: (val: number) => void;
}

export class Slider {
    public element: HTMLDivElement;
    private input: HTMLInputElement;
    private label: HTMLSpanElement;
    private static stylesInjected = false;

    constructor(props: SliderProps) {
        Slider.injectStyles();

        // Contenedor principal
        this.element = document.createElement('div');
        this.element.className = 'slider-wrap';
        if (props.id) this.element.id = props.id;

        // Etiqueta de texto
        this.label = document.createElement('span');
        this.label.className = 'slider-label';
        this.label.textContent = props.formatLabel(props.value);

        // Input Range
        this.input = document.createElement('input');
        this.input.type = 'range';
        this.input.className = 'slider';
        this.input.min = props.min.toString();
        this.input.max = props.max.toString();
        this.input.value = props.value.toString();

        // Conectar eventos
        this.input.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            this.label.textContent = props.formatLabel(val);
            if (props.onInput) props.onInput(val);
        });

        this.input.addEventListener('change', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            if (props.onChange) props.onChange(val);
        });

        // Ensamblar
        this.element.appendChild(this.input);
        this.element.appendChild(this.label);
    }

    // Método para actualizar el valor desde fuera (ej: deshacer o cambiar de herramienta)
    public setValue(val: number, formattedLabel: string) {
        this.input.value = val.toString();
        this.label.textContent = formattedLabel;
    }

    public mount(parent: HTMLElement) {
        parent.appendChild(this.element);
    }

    private static injectStyles() {
        if (this.stylesInjected) return;
        this.stylesInjected = true;

        const style = document.createElement('style');
        style.textContent = `
      .slider-wrap {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 88px;
      }
      .slider-label {
        font-size: var(--text-xs);
        color: var(--text-secondary);
        text-align: center;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 3px;
        background: var(--col-graphite);
        border-radius: 2px;
        outline: none;
        cursor: pointer;
      }
      .slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 12px;
        height: 12px;
        background: #fff;
        border-radius: 50%;
        cursor: pointer;
        transition: transform var(--t-fast), box-shadow var(--t-fast);
        box-shadow: 0 1px 4px rgba(0,0,0,.5);
      }
      .slider::-webkit-slider-thumb:hover {
        transform: scale(1.25);
        box-shadow: 0 0 0 3px var(--accent-glow);
      }
    `;
        document.head.appendChild(style);
    }
}