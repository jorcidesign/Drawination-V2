// src/ui/molecules/LayerItem.ts
import { Icons } from '../atoms/Icons';
import type { LayerState } from '../../history/TimelineTypes';

export interface LayerItemProps {
    layerIndex: number;
    state: LayerState;
    isActive: boolean;
    isExpanded: boolean;
    onSelect: (index: number) => void;
    onToggleVisibility: (index: number) => void;
    onToggleLock: (index: number) => void;
    onDuplicate: (index: number) => void;
    onMergeDown: (index: number) => void;
    onDelete: (index: number) => void;
    onOpacityChange: (index: number, opacity: number) => void;
}

export class LayerItem {
    public element: HTMLDivElement;

    constructor(props: LayerItemProps) {
        this.element = document.createElement('div');
        this.element.className = `layer-item-wrapper ${props.isActive ? 'active' : ''} ${props.isExpanded ? 'expanded' : ''}`;
        this.element.dataset.layerIndex = String(props.layerIndex);

        // ── Row 1: Main ───────────────────────────────────────────────────
        const mainRow = document.createElement('div');
        mainRow.className = 'layer-main';

        const handle = document.createElement('div');
        handle.className = 'layer-handle';
        handle.innerHTML = Icons.dragHandle;
        mainRow.appendChild(handle);

        const eyeBtn = document.createElement('button');
        eyeBtn.className = 'layer-eye';
        eyeBtn.title = props.state.visible ? 'Ocultar capa' : 'Mostrar capa';
        eyeBtn.innerHTML = props.state.visible ? Icons.eyeOn : `<div style="opacity: 0.35">${Icons.eyeOff}</div>`;
        eyeBtn.onclick = (e) => { e.stopPropagation(); props.onToggleVisibility(props.layerIndex); };
        mainRow.appendChild(eyeBtn);

        const thumb = document.createElement('div');
        thumb.className = 'layer-thumb';
        mainRow.appendChild(thumb);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'layer-name';
        nameSpan.textContent = props.state.name;
        mainRow.appendChild(nameSpan);

        const lockBtn = document.createElement('button');
        lockBtn.className = `layer-lock ${props.state.locked ? 'is-locked' : ''}`;
        lockBtn.title = props.state.locked ? 'Desbloquear capa' : 'Bloquear capa';
        lockBtn.innerHTML = Icons.lock;
        lockBtn.onclick = (e) => { e.stopPropagation(); props.onToggleLock(props.layerIndex); };
        mainRow.appendChild(lockBtn);

        this.element.appendChild(mainRow);

        mainRow.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.layer-eye, .layer-lock')) return;
            props.onSelect(props.layerIndex);
        });

        // ── Row 2: Accordion ──────────────────────────────────────────────
        const actionsWrapper = document.createElement('div');
        actionsWrapper.className = `layer-actions-wrapper ${props.isExpanded ? 'expanded' : ''}`;

        const actionsOverflow = document.createElement('div');
        actionsOverflow.className = 'layer-actions-overflow';

        const actionsInner = document.createElement('div');
        actionsInner.className = 'layer-actions-inner';

        // Icon-only action buttons — text removed, title attribute for tooltip
        const btnRow = document.createElement('div');
        btnRow.className = 'layer-action-btns';

        const dupBtn = document.createElement('button');
        dupBtn.className = 'layer-btn';
        dupBtn.title = 'Duplicar capa';
        dupBtn.innerHTML = Icons.duplicate;
        dupBtn.onclick = () => props.onDuplicate(props.layerIndex);

        const mergeBtn = document.createElement('button');
        mergeBtn.className = 'layer-btn';
        mergeBtn.title = 'Fusionar hacia abajo';
        mergeBtn.innerHTML = Icons.mergeDown;
        if (props.state.locked) mergeBtn.disabled = true;
        mergeBtn.onclick = () => props.onMergeDown(props.layerIndex);

        const delBtn = document.createElement('button');
        delBtn.className = 'layer-btn layer-btn--danger';
        delBtn.title = 'Eliminar capa';
        delBtn.innerHTML = Icons.trash;
        if (props.state.locked) delBtn.disabled = true;
        delBtn.onclick = () => props.onDelete(props.layerIndex);

        btnRow.appendChild(dupBtn);
        btnRow.appendChild(mergeBtn);
        btnRow.appendChild(delBtn);
        actionsInner.appendChild(btnRow);

        // Opacity slider — label on the RIGHT, slider fills remaining space
        const opWrap = document.createElement('div');
        opWrap.className = 'layer-op-wrap';

        const opLabel = document.createElement('span');
        opLabel.className = 'layer-op-label';
        opLabel.textContent = `${Math.round(props.state.opacity * 100)}%`;

        const opSlider = document.createElement('input');
        opSlider.type = 'range';
        opSlider.className = 'layer-op-slider';
        opSlider.min = '0';
        opSlider.max = '100';
        opSlider.value = String(Math.round(props.state.opacity * 100));

        opSlider.oninput = (e) => {
            const val = parseInt((e.target as HTMLInputElement).value);
            opLabel.textContent = `${val}%`;
        };
        opSlider.onchange = (e) => {
            const val = parseInt((e.target as HTMLInputElement).value);
            props.onOpacityChange(props.layerIndex, val / 100);
        };

        // flex-direction: row-reverse in CSS puts label on right, slider on left
        opWrap.appendChild(opSlider);
        opWrap.appendChild(opLabel);
        actionsInner.appendChild(opWrap);

        actionsOverflow.appendChild(actionsInner);
        actionsWrapper.appendChild(actionsOverflow);
        this.element.appendChild(actionsWrapper);
    }
}   