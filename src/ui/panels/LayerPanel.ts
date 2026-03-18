// src/ui/panels/LayerPanel.ts
import { LayerItem } from '../molecules/LayerItem';
import type { EventBus } from '../../input/EventBus';
import Sortable from 'sortablejs';

interface LayerStateUI {
    id: number;
    name: string;
    visible: boolean;
    opacity: number;
    active: boolean;
    expanded: boolean;
}

export class LayerPanel {
    public element: HTMLDivElement;
    private eventBus: EventBus;
    private static stylesInjected = false;

    private isVisible = false;
    private listContainer: HTMLDivElement;

    private layers: LayerStateUI[] = [
        { id: 0, name: 'Capa 1', visible: true, opacity: 1, active: true, expanded: false }
    ];

    constructor(eventBus: EventBus) {
        LayerPanel.injectStyles();
        this.eventBus = eventBus;

        this.element = document.createElement('div');
        this.element.className = 'panel';
        this.element.id = 'panel-layers';

        const header = document.createElement('div');
        header.className = 'panel-hdr';
        header.innerHTML = `<span class="panel-title">Capas</span>`;

        const actionsWrap = document.createElement('div');
        actionsWrap.style.display = 'flex';
        actionsWrap.style.gap = '4px';

        const addBtn = document.createElement('button');
        addBtn.className = 'panel-add';
        addBtn.title = 'Nueva capa';
        addBtn.innerHTML = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/></svg>`;
        addBtn.onclick = () => this.addLayer();

        const closeBtn = document.createElement('button');
        closeBtn.className = 'panel-close';
        closeBtn.innerHTML = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>`;
        closeBtn.onclick = () => this.eventBus.emit('TOGGLE_LAYER_PANEL');

        actionsWrap.appendChild(addBtn);
        actionsWrap.appendChild(closeBtn);
        header.appendChild(actionsWrap);
        this.element.appendChild(header);

        this.listContainer = document.createElement('div');
        this.listContainer.className = 'layer-list';
        this.element.appendChild(this.listContainer);

        const bgLayer = document.createElement('div');
        bgLayer.className = 'layer-item-wrapper layer-item--bg';
        bgLayer.innerHTML = `
          <div class="layer-main">
            <div class="layer-bg-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 10L6 6L9 9L11 7L14 10"/><circle cx="11.5" cy="5" r="1.5"/></svg></div>
            <span class="layer-name" style="color:var(--text-secondary)">Fondo</span>
          </div>
        `;
        this.element.appendChild(bgLayer);

        this.bindEvents();
        this.renderLayers();
    }

    private bindEvents() {
        this.eventBus.on('TOGGLE_LAYER_PANEL', () => {
            this.isVisible = !this.isVisible;
            if (this.isVisible) {
                this.element.classList.add('visible');
                this.initSortable();
            } else {
                this.element.classList.remove('visible');
            }
        });
    }

    private renderLayers() {
        this.listContainer.innerHTML = '';
        const reversedLayers = [...this.layers].reverse();

        reversedLayers.forEach(layer => {
            const item = new LayerItem({
                ...layer,
                isActive: layer.active,
                isExpanded: layer.expanded,
                onSelect: (id) => {
                    const clickedLayer = this.layers.find(l => l.id === id);
                    if (clickedLayer) {
                        if (clickedLayer.active) {
                            // FIX FLUJO UX: Si ya estaba activa, el segundo clic alterna el menú (abre/cierra)
                            clickedLayer.expanded = !clickedLayer.expanded;
                        } else {
                            // FIX FLUJO UX: Si no estaba activa, solo la activamos, NO la expandimos
                            this.layers.forEach(l => {
                                l.active = l.id === id;
                                l.expanded = false; // Se asegura de cerrar cualquier otra
                            });
                        }
                        this.renderLayers();
                    }
                },
                onToggleVis: (id) => {
                    const l = this.layers.find(x => x.id === id);
                    if (l) l.visible = !l.visible;
                    this.renderLayers();
                },
                onOpacityChange: (id, op) => {
                    const l = this.layers.find(x => x.id === id);
                    if (l) l.opacity = op;
                },
                onLock: (id) => this.eventBus.emit('LAYER_ACTION_LOCK', id),
                onDuplicate: (id) => this.eventBus.emit('LAYER_ACTION_DUPLICATE', id),
                onMergeDown: (id) => this.eventBus.emit('LAYER_ACTION_MERGE', id),
                onDelete: (id) => {
                    if (confirm('¿Eliminar esta capa?')) {
                        this.eventBus.emit('LAYER_ACTION_DELETE', id);
                        this.layers = this.layers.filter(l => l.id !== id);
                        if (this.layers.length > 0 && layer.active) {
                            this.layers[0].active = true;
                            this.layers[0].expanded = false;
                        }
                        this.renderLayers();
                    }
                }
            });
            item.mount(this.listContainer);
        });
    }

    private addLayer() {
        if (this.layers.length >= 10) return;
        const newId = Math.max(...this.layers.map(l => l.id), -1) + 1;
        this.layers.forEach(l => { l.active = false; l.expanded = false; });
        this.layers.push({ id: newId, name: `Capa ${newId + 1}`, visible: true, opacity: 1, active: true, expanded: false });
        this.renderLayers();
    }

    private initSortable() {
        if ((this.listContainer as any)._sortable) return;

        (this.listContainer as any)._sortable = Sortable.create(this.listContainer, {
            handle: '.layer-handle',
            animation: 120,
            ghostClass: 'layer-ghost',
            onStart: () => {
                this.listContainer.classList.add('is-dragging');
            },
            onEnd: () => {
                this.listContainer.classList.remove('is-dragging');

                // FIX SORTABLE: Sincronizamos el array de datos con la nueva realidad del DOM
                // 1. Obtenemos el orden visual actual leyendo los IDs del DOM de arriba a abajo
                const domItems = Array.from(this.listContainer.querySelectorAll('.layer-item-wrapper'));
                const visualOrderIds = domItems.map(el => parseInt((el as HTMLElement).dataset.id || '-1', 10));

                // 2. Como renderizamos haciendo un .reverse(), nuestro array interno debe ser el inverso del DOM
                const newLayersOrder = [...visualOrderIds].reverse();

                // 3. Reconstruimos this.layers en el orden correcto
                const updatedLayers: LayerStateUI[] = [];
                newLayersOrder.forEach(id => {
                    const layer = this.layers.find(l => l.id === id);
                    if (layer) updatedLayers.push(layer);
                });

                this.layers = updatedLayers;
                // No llamamos a renderLayers() aquí para no parpadear el DOM recién soltado por Sortable.
                // ¡El estado ya está sincronizado para el próximo clic!
            }
        });
    }

    public mount(parent: HTMLElement) {
        parent.appendChild(this.element);
    }

    private static injectStyles() {
        if (this.stylesInjected) return;
        this.stylesInjected = true;

        const style = document.createElement('style');
        style.textContent = `
      #panel-layers {
        top: 56px;
        right: 12px;
        width: 220px;
        z-index: var(--z-panel);
        max-height: calc(100vh - 80px);
      }
      .layer-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        overflow-y: auto;
        max-height: calc(100vh - 240px);
        padding-right: 4px;
      }
      
      .layer-item-wrapper {
        display: flex;
        flex-direction: column;
        border-radius: 7px;
        transition: background var(--t-fast);
        border: 1px solid transparent;
        background: transparent;
      }
      .layer-item-wrapper:hover {
        background: var(--surface-hover);
      }
      .layer-item-wrapper.active {
        background: var(--surface-active);
        border-color: rgba(1,109,232,.22);
      }
      
      .layer-main {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 7px;
        cursor: pointer;
        min-height: 44px;
      }
      
      /* ── Animación del Acordeón (CSS Grid Trick) ── */
      .layer-actions-wrapper {
        display: grid;
        grid-template-rows: 0fr; 
        transition: grid-template-rows 200ms cubic-bezier(0.4, 0, 0.2, 1);
      }
      .layer-item-wrapper.expanded .layer-actions-wrapper {
        grid-template-rows: 1fr; 
      }
      .layer-actions-overflow {
        overflow: hidden; 
      }
      .layer-actions-inner {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
        padding: 0 8px 6px 8px; 
      }

      /* ── Fix visual durante el arrastre (Sortable) ── */
      .layer-list.is-dragging .layer-actions-wrapper {
        grid-template-rows: 0fr !important;
      }

      .layer-item--bg {
        margin-top: 6px;
        border-top: 1px solid var(--surface-panel-border);
        cursor: default;
        background: transparent !important;
      }
      .layer-item--bg:hover {
        background: transparent !important;
      }
      
      .layer-handle {
        cursor: grab;
        color: var(--text-disabled);
        display: flex;
        align-items: center;
        padding: 2px;
        border-radius: 3px;
        flex-shrink: 0;
      }
      .layer-handle svg { width: 11px; height: 11px; }
      .layer-handle:hover { color: var(--text-secondary); }
      
      .layer-eye {
        width: 20px;
        height: 20px;
        border: none;
        background: transparent;
        color: var(--text-secondary);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 3px;
        flex-shrink: 0;
        outline: none;
      }
      .layer-eye svg { width: 12px; height: 12px; }
      .layer-eye:hover { background: var(--surface-hover); color: var(--text-primary); }
      
      .layer-thumb {
        width: 34px;
        height: 34px;
        border-radius: 4px;
        flex-shrink: 0;
        background: repeating-conic-gradient(#2a2a2a 0% 25%, #1a1a1a 0% 50%) 0 0/8px 8px;
      }
      .layer-name {
        font-size: var(--text-sm);
        color: var(--text-primary);
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .layer-op {
        -webkit-appearance: none;
        width: 40px;
        height: 2px;
        background: var(--col-graphite);
        border-radius: 1px;
        outline: none;
        cursor: pointer;
        flex-shrink: 0;
      }
      .layer-op::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 10px;
        height: 10px;
        background: #fff;
        border-radius: 50%;
        cursor: pointer;
      }
      .layer-bg-icon {
        width: 20px;
        height: 20px;
        color: var(--text-disabled);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-left: 14px;
      }
      .layer-bg-icon svg { width: 13px; height: 13px; }
      .layer-ghost {
        opacity: 0.4;
        background: var(--surface-pressed);
      }
    `;
        document.head.appendChild(style);
    }
}