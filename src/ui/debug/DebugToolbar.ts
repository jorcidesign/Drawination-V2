// src/ui/debug/DebugToolbar.ts
import type { EventBus } from '../../input/EventBus';

export class DebugToolbar {
    private container: HTMLElement;
    private eventBus: EventBus;

    // === NUEVO: Guardamos referencias a los inputs HTML ===
    private sliders: Record<string, { input: HTMLInputElement, span: HTMLSpanElement }> = {};

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
        this.container = document.createElement('div');
        this.setupStyles();
        this.buildButtons();
        this.bindEvents(); // <-- NUEVO
        document.body.appendChild(this.container);
    }

    private setupStyles() {
        this.container.style.position = 'absolute';
        this.container.style.top = '20px';
        this.container.style.right = '20px';
        this.container.style.zIndex = '99999';
        this.container.style.display = 'flex';
        this.container.style.gap = '10px';
    }

    private buildButtons() {
        // Herramientas de Dibujo
        this.createButton('✏️ Pincel (B)', '#2c3e50', () => this.eventBus.emit('SET_TOOL_PENCIL'));
        this.createButton('🧽 Goma (E)', '#2c3e50', () => this.eventBus.emit('SET_TOOL_ERASER'));
        this.createButton('🪣 Relleno', '#8e44ad', () => this.eventBus.emit('SET_PROFILE_FILL'));

        // === NUEVO: PALETA DE COLORES (MANGA) ===
        const colorContainer = document.createElement('div');
        colorContainer.style.display = 'flex';
        colorContainer.style.gap = '5px';
        colorContainer.style.backgroundColor = 'rgba(255,255,255,0.8)';
        colorContainer.style.padding = '5px';
        colorContainer.style.borderRadius = '4px';

        const colors = [
            { name: 'Negro', hex: '#000000' },
            { name: 'Blanco', hex: '#ffffff' },
            { name: 'Rojo', hex: '#e74c3c' },
            { name: 'Azul', hex: '#2980b9' },
            { name: 'Verde', hex: '#27ae60' }
        ];

        colors.forEach(c => {
            const cBtn = document.createElement('button');
            cBtn.style.width = '24px';
            cBtn.style.height = '24px';
            cBtn.style.backgroundColor = c.hex;
            cBtn.style.border = c.hex === '#ffffff' ? '1px solid #ccc' : 'none';
            cBtn.style.borderRadius = '50%';
            cBtn.style.cursor = 'pointer';
            cBtn.title = c.name;
            cBtn.onclick = () => this.eventBus.emit('SET_COLOR', c.hex);
            colorContainer.appendChild(cBtn);
        });

        this.container.appendChild(colorContainer);

        // Selector de Perfiles
        this.createButton('🖋️ Tinta', '#8e44ad', () => this.eventBus.emit('SET_PROFILE_INK'));
        this.createButton('📝 Lápiz', '#8e44ad', () => this.eventBus.emit('SET_PROFILE_PENCIL'));

        // === ACTUALIZADO: Pasamos un ID a cada slider ===
        this.createSlider('size', 'Tamaño', 1, 100, 15, (val) => this.eventBus.emit('UPDATE_BRUSH_SIZE', val));
        this.createSlider('opacity', 'Opacidad', 1, 100, 100, (val) => this.eventBus.emit('UPDATE_BRUSH_OPACITY', val / 100));

        // Acciones Globales
        this.createButton('▶ Timelapse', '#3498db', () => this.eventBus.emit('PLAY_TIMELAPSE'));
        this.createButton('🐞 Puntos', '#9b59b6', () => this.eventBus.emit('DEBUG_DRAW_POINTS'));
        this.createButton('⬆️ Rot', '#f39c12', () => this.eventBus.emit('RESET_ROTATION'));
        this.createButton('🗑️ Borrar', '#e74c3c', () => {
            if (confirm('¿Seguro?')) this.eventBus.emit('CLEAR_ALL');
        });
    }

    // Actualizamos la función para guardar los elementos en this.sliders
    private createSlider(id: string, label: string, min: number, max: number, defaultVal: number, onChange: (val: number) => void) {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '5px';
        wrapper.style.color = '#333';
        wrapper.style.fontFamily = 'sans-serif';
        wrapper.style.fontSize = '12px';
        wrapper.style.backgroundColor = 'rgba(255,255,255,0.8)';
        wrapper.style.padding = '5px 10px';
        wrapper.style.borderRadius = '4px';

        const span = document.createElement('span');
        span.innerText = `${label}: ${defaultVal}`;

        const input = document.createElement('input');
        input.type = 'range';
        input.min = min.toString();
        input.max = max.toString();
        input.value = defaultVal.toString();

        input.oninput = (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            span.innerText = `${label}: ${val}`;
            onChange(val);
        };

        wrapper.appendChild(input);
        wrapper.appendChild(span);
        this.container.appendChild(wrapper);

        // Guardamos la referencia para poder cambiar su valor desde afuera
        this.sliders[id] = { input, span };
    }

    // === NUEVO: Escuchamos cuando el motor pide sincronizar la UI ===
    private bindEvents() {
        this.eventBus.on('SYNC_UI_SLIDERS', (data: { size: number, opacity: number }) => {
            if (this.sliders['size']) {
                this.sliders['size'].input.value = data.size.toString();
                this.sliders['size'].span.innerText = `Tamaño: ${data.size}`;
            }
            if (this.sliders['opacity']) {
                const opcty = Math.round(data.opacity * 100);
                this.sliders['opacity'].input.value = opcty.toString();
                this.sliders['opacity'].span.innerText = `Opacidad: ${opcty}`;
            }
        });
    }

    private createButton(text: string, color: string, onClick: () => void) {
        const btn = document.createElement('button');
        btn.innerText = text;
        btn.style.padding = '10px';
        btn.style.backgroundColor = color;
        btn.style.color = 'white';
        btn.style.border = 'none';
        btn.style.cursor = 'pointer';
        btn.style.borderRadius = '4px';
        btn.onclick = onClick;
        this.container.appendChild(btn);
    }
}