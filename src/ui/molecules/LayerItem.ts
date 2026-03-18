// src/ui/molecules/LayerItem.ts
import { Icons } from '../atoms/Icons';
import { LayerThumbnail } from '../atoms/LayerThumbnail';
import { IconButton } from '../atoms/IconButton';

export interface LayerItemProps {
    id: number;
    name: string;
    visible: boolean;
    opacity: number;
    isActive: boolean;
    isExpanded: boolean; // <--- NUEVA PROPIEDAD
    onSelect: (id: number) => void;
    onToggleVis: (id: number) => void;
    onOpacityChange: (id: number, opacity: number) => void;
    onLock: (id: number) => void;
    onDuplicate: (id: number) => void;
    onMergeDown: (id: number) => void;
    onDelete: (id: number) => void;
}

export class LayerItem {
    public element: HTMLDivElement;

    constructor(props: LayerItemProps) {
        this.element = document.createElement('div');
        // Añadimos la clase 'expanded' dinámicamente
        this.element.className = `layer-item-wrapper ${props.isActive ? 'active' : ''} ${props.isExpanded ? 'expanded' : ''}`;
        this.element.dataset.id = props.id.toString();

        // ── FILA 1: Principal ──
        const mainRow = document.createElement('div');
        mainRow.className = 'layer-main';
        mainRow.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.layer-eye, .layer-op')) return;
            props.onSelect(props.id);
        });

        const handle = document.createElement('div');
        handle.className = 'layer-handle';
        handle.innerHTML = Icons.dragHandle;
        mainRow.appendChild(handle);

        const eyeBtn = document.createElement('button');
        eyeBtn.className = 'layer-eye';
        eyeBtn.innerHTML = props.visible ? Icons.eyeOn : Icons.eyeOff;
        eyeBtn.onclick = (e) => {
            e.stopPropagation();
            props.onToggleVis(props.id);
        };
        mainRow.appendChild(eyeBtn);

        const thumb = new LayerThumbnail();
        thumb.mount(mainRow);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'layer-name';
        nameSpan.textContent = props.name;
        mainRow.appendChild(nameSpan);

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
        opSlider.onclick = (e) => e.stopPropagation();
        mainRow.appendChild(opSlider);

        this.element.appendChild(mainRow);

        // ── FILA 2: Acciones (Acordeón Animado) ──
        const actionsWrapper = document.createElement('div');
        actionsWrapper.className = 'layer-actions-wrapper'; // Controla el alto (0 a 1fr)

        const actionsOverflow = document.createElement('div');
        actionsOverflow.className = 'layer-actions-overflow'; // Oculta el contenido al colapsar

        const actionsInner = document.createElement('div');
        actionsInner.className = 'layer-actions-inner'; // Contiene los botones reales y sus márgenes

        const lockBtn = new IconButton({ icon: 'lock', title: 'Bloquear', variant: 'sm', onClick: () => props.onLock(props.id) });
        const dupBtn = new IconButton({ icon: 'duplicate', title: 'Duplicar', variant: 'sm', onClick: () => props.onDuplicate(props.id) });
        const mergeBtn = new IconButton({ icon: 'mergeDown', title: 'Fusionar', variant: 'sm', onClick: () => props.onMergeDown(props.id) });
        const delBtn = new IconButton({ icon: 'trash', title: 'Eliminar', variant: 'danger', onClick: () => props.onDelete(props.id) });

        lockBtn.mount(actionsInner);
        dupBtn.mount(actionsInner);
        mergeBtn.mount(actionsInner);

        const sep = document.createElement('div');
        sep.style.width = '1px';
        sep.style.height = '14px';
        sep.style.background = 'var(--surface-bar-border)';
        sep.style.margin = '0 4px';
        actionsInner.appendChild(sep);

        delBtn.mount(actionsInner);

        actionsOverflow.appendChild(actionsInner);
        actionsWrapper.appendChild(actionsOverflow);
        this.element.appendChild(actionsWrapper);
    }

    public mount(parent: HTMLElement) {
        parent.appendChild(this.element);
    }
}