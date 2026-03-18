// src/ui/molecules/LayerItem.ts
import { Icons } from '../atoms/Icons';
import { LayerThumbnail } from '../atoms/LayerThumbnail';

export interface LayerItemProps {
    id: number;
    name: string;
    visible: boolean;
    opacity: number;
    isActive: boolean;
    onSelect: (id: number) => void;
    onToggleVis: (id: number) => void;
    onOpacityChange: (id: number, opacity: number) => void;
}

export class LayerItem {
    public element: HTMLDivElement;

    constructor(props: LayerItemProps) {
        this.element = document.createElement('div');
        this.element.className = `layer-item ${props.isActive ? 'active' : ''}`;
        this.element.dataset.id = props.id.toString();

        // Clic para seleccionar (evitando que se dispare si tocamos el ojito o el slider)
        this.element.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.layer-eye, .layer-op')) return;
            props.onSelect(props.id);
        });

        // 1. Drag Handle
        const handle = document.createElement('div');
        handle.className = 'layer-handle';
        handle.innerHTML = Icons.dragHandle;
        this.element.appendChild(handle);

        // 2. Visibilidad (Ojito)
        const eyeBtn = document.createElement('button');
        eyeBtn.className = 'layer-eye';
        eyeBtn.innerHTML = props.visible ? Icons.eyeOn : Icons.eyeOff;
        eyeBtn.onclick = (e) => {
            e.stopPropagation();
            props.onToggleVis(props.id);
        };
        this.element.appendChild(eyeBtn);

        // 3. Thumbnail
        const thumb = new LayerThumbnail();
        thumb.mount(this.element);

        // 4. Nombre
        const nameSpan = document.createElement('span');
        nameSpan.className = 'layer-name';
        nameSpan.textContent = props.name;
        this.element.appendChild(nameSpan);

        // 5. Opacidad (Mini Slider nativo)
        const opSlider = document.createElement('input');
        opSlider.type = 'range';
        opSlider.className = 'layer-op';
        opSlider.min = '0';
        opSlider.max = '100';
        opSlider.value = Math.round(props.opacity * 100).toString();
        opSlider.title = 'Opacidad';
        opSlider.oninput = (e) => {
            props.onOpacityChange(props.id, parseInt((e.target as HTMLInputElement).value) / 100);
        };
        this.element.appendChild(opSlider);
    }

    public mount(parent: HTMLElement) {
        parent.appendChild(this.element);
    }
}