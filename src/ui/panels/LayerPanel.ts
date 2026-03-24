// src/ui/panels/LayerPanel.ts
import { LayerItem } from '../molecules/LayerItem';
import type { EventBus } from '../../input/EventBus';
import { DEFAULT_BACKGROUND_COLOR } from '../../history/computeTimelineState';
import Sortable from 'sortablejs';

const BACKGROUND_PRESETS = [
  { color: '#ffffff', name: 'Blanco mate' },
  { color: '#7f7f7f', name: 'Gris pesado' },
  { color: '#2280cf', name: 'Plano azul' },
  { color: '#986e4c', name: 'Papel marrón' },
  { color: '#20242b', name: 'Plano oscuro' },
];

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

  private currentBgColor: string = DEFAULT_BACKGROUND_COLOR;
  private bgToolActive = false;
  private bgAccordionOpen = false;

  private bgWrapper: HTMLDivElement | null = null;
  private bgPreviewDot: HTMLDivElement | null = null;
  private bgAccordionWrap: HTMLDivElement | null = null;
  private bgChevron: HTMLDivElement | null = null;

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

    this.element.appendChild(this._buildBgLayer());
    this.bindEvents();
    this.renderLayers();
  }

  private _buildBgLayer(): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'layer-item-wrapper layer-item--bg';
    this.bgWrapper = wrapper;

    const mainRow = document.createElement('div');
    mainRow.className = 'layer-main';
    mainRow.style.cursor = 'pointer';

    const bgIcon = document.createElement('div');
    bgIcon.className = 'layer-bg-icon';
    bgIcon.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 10L6 6L9 9L11 7L14 10"/><circle cx="11.5" cy="5" r="1.5"/></svg>`;
    mainRow.appendChild(bgIcon);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'layer-name';
    nameSpan.style.color = 'var(--text-secondary)';
    nameSpan.textContent = 'Fondo';
    mainRow.appendChild(nameSpan);

    this.bgPreviewDot = document.createElement('div');
    this.bgPreviewDot.className = 'bg-color-dot';
    this._updateDot(this.currentBgColor);
    mainRow.appendChild(this.bgPreviewDot);

    const chevron = document.createElement('div');
    chevron.className = 'bg-chevron';
    chevron.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 4L5 7L8 4"/></svg>`;
    mainRow.appendChild(chevron);
    this.bgChevron = chevron;

    wrapper.appendChild(mainRow);

    const accordionWrap = document.createElement('div');
    accordionWrap.className = 'bg-accordion-wrap';
    this.bgAccordionWrap = accordionWrap;

    const accordionOverflow = document.createElement('div');
    accordionOverflow.className = 'bg-accordion-overflow';

    const swatchRow = document.createElement('div');
    swatchRow.className = 'bg-swatch-row';

    BACKGROUND_PRESETS.forEach(preset => {
      const swatch = document.createElement('button');
      swatch.className = 'bg-swatch';
      swatch.style.backgroundColor = preset.color;
      swatch.title = preset.name;
      if (preset.color === '#ffffff') swatch.style.outline = '1px solid rgba(0,0,0,0.12)';
      swatch.onclick = (e) => {
        e.stopPropagation();
        // Los swatches son elección explícita → van al timeline directamente
        this._applyBackground(preset.color);
      };
      swatchRow.appendChild(swatch);
    });

    accordionOverflow.appendChild(swatchRow);
    accordionWrap.appendChild(accordionOverflow);
    wrapper.appendChild(accordionWrap);

    mainRow.onclick = () => {
      if (!this.bgToolActive) this._activateBgTool();
      this._setAccordion(!this.bgAccordionOpen);
    };

    return wrapper;
  }

  private _updateDot(color: string): void {
    if (!this.bgPreviewDot) return;
    this.bgPreviewDot.style.backgroundColor = color;
    this.bgPreviewDot.style.outline = color.toLowerCase() === '#ffffff'
      ? '1px solid rgba(0,0,0,0.12)'
      : 'none';
  }

  private _setAccordion(open: boolean): void {
    this.bgAccordionOpen = open;
    this.bgAccordionWrap?.classList.toggle('bg-accordion-open', open);
    this.bgChevron?.classList.toggle('bg-chevron--open', open);
  }

  private _activateBgTool(): void {
    this.bgToolActive = true;
    this.bgWrapper?.classList.add('layer-item--bg-active');
    this.eventBus.emit('REQUEST_TOOL_SWITCH', 'background' as any);
    this.eventBus.emit('BACKGROUND_TOOL_ACTIVE', true);
    this.eventBus.emit('TOGGLE_COLOR_PANEL_FOR_BG');
  }

  private _deactivateBgTool(): void {
    if (!this.bgToolActive) return;
    this.bgToolActive = false;
    this.bgWrapper?.classList.remove('layer-item--bg-active');
    this._setAccordion(false);
    this.eventBus.emit('BACKGROUND_TOOL_ACTIVE', false);
  }

  // Aplicar color al fondo Y persistir en el timeline
  // Solo se llama en elecciones explícitas del usuario (swatches o APPLY_COLOR)
  private _applyBackground(color: string): void {
    this.currentBgColor = color;
    this._updateDot(color);
    // Sincronizar cuadradito 7
    this.eventBus.emit('SET_COLOR', color);
    // Persistir en el timeline — va al historial
    this.eventBus.emit('BACKGROUND_COLOR_CHANGED', color);
  }

  private bindEvents() {
    this.eventBus.on('TOGGLE_LAYER_PANEL', () => {
      this.isVisible = !this.isVisible;
      if (this.isVisible) {
        this.element.classList.add('visible');
        this.initSortable();
      } else {
        this.element.classList.remove('visible');
        this._deactivateBgTool();
      }
    });

    this.eventBus.on('ACTIVE_TOOL_CHANGED', (toolId: string) => {
      if (toolId !== 'background') this._deactivateBgTool();
    });

    this.eventBus.on('REQUEST_TOOL_SWITCH', (toolId: string) => {
      if (toolId !== 'background') this._deactivateBgTool();
    });

    // APPLY_COLOR = elección explícita del usuario (soltar el slider de iro.js)
    // → va al timeline
    this.eventBus.on('APPLY_COLOR', (color: string) => {
      if (this.bgToolActive) {
        this._applyBackground(color);
      }
    });

    // SET_COLOR = preview visual mientras arrastra el slider
    // → SOLO actualizar el dot y el fondo visualmente, NO persistir en el timeline
    this.eventBus.on('SET_COLOR', (color: string) => {
      if (this.bgToolActive) {
        this._updateDot(color);
        // Preview visual del fondo en tiempo real (sin commitLayerAction)
        // WorkspaceController escucha BACKGROUND_COLOR_CHANGED para persistir,
        // aquí solo actualizamos el CSS directamente via un evento especial de preview
        this.eventBus.emit('BACKGROUND_COLOR_PREVIEW', color);
      }
    });

    // Sincronizar dot cuando el fondo cambia desde fuera (undo/redo)
    this.eventBus.on('BACKGROUND_COLOR_CHANGED', (color: string) => {
      this.currentBgColor = color;
      this._updateDot(color);
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
              clickedLayer.expanded = !clickedLayer.expanded;
            } else {
              this.layers.forEach(l => { l.active = l.id === id; l.expanded = false; });
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
      handle: '.layer-handle', animation: 120, ghostClass: 'layer-ghost',
      onStart: () => this.listContainer.classList.add('is-dragging'),
      onEnd: () => {
        this.listContainer.classList.remove('is-dragging');
        const domItems = Array.from(this.listContainer.querySelectorAll('.layer-item-wrapper'));
        const newOrder = [...domItems.map(el => parseInt((el as HTMLElement).dataset.id || '-1', 10))].reverse();
        const updated: LayerStateUI[] = [];
        newOrder.forEach(id => { const l = this.layers.find(x => x.id === id); if (l) updated.push(l); });
        this.layers = updated;
      }
    });
  }

  public mount(parent: HTMLElement) { parent.appendChild(this.element); }

  private static injectStyles() {
    if (this.stylesInjected) return;
    this.stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
            #panel-layers { top:56px;right:12px;width:220px;z-index:var(--z-panel);max-height:calc(100vh - 80px); }
            .layer-list { display:flex;flex-direction:column;gap:4px;overflow-y:auto;max-height:calc(100vh - 280px);padding-right:4px; }
            .layer-item-wrapper { display:flex;flex-direction:column;border-radius:7px;transition:background var(--t-fast);border:1px solid transparent;background:transparent; }
            .layer-item-wrapper:hover { background:var(--surface-hover); }
            .layer-item-wrapper.active { background:var(--surface-active);border-color:rgba(1,109,232,.22); }
            .layer-main { display:flex;align-items:center;gap:6px;padding:5px 7px;cursor:pointer;min-height:44px; }
            .layer-actions-wrapper { display:grid;grid-template-rows:0fr;transition:grid-template-rows 200ms cubic-bezier(0.4,0,0.2,1); }
            .layer-item-wrapper.expanded .layer-actions-wrapper { grid-template-rows:1fr; }
            .layer-actions-overflow { overflow:hidden; }
            .layer-actions-inner { display:flex;align-items:center;justify-content:flex-end;gap:6px;padding:0 8px 6px 8px; }
            .layer-list.is-dragging .layer-actions-wrapper { grid-template-rows:0fr !important; }
            .layer-item--bg { margin-top:6px;border-top:1px solid var(--surface-panel-border);border-radius:0 0 7px 7px; }
            .layer-item--bg .layer-main { min-height:40px; }
            .layer-item--bg:hover { background:var(--surface-hover); }
            .layer-item--bg-active { background:var(--surface-active) !important;border-color:rgba(1,109,232,.22) !important;position:relative; }
            .layer-item--bg-active::before { content:'';position:absolute;left:0;top:20%;bottom:20%;width:2px;border-radius:0 1px 1px 0;background:var(--accent-bright,#0066cc);opacity:0.8; }
            .layer-bg-icon { width:20px;height:20px;color:var(--text-disabled);display:flex;align-items:center;justify-content:center;margin-left:14px;flex-shrink:0; }
            .layer-bg-icon svg { width:13px;height:13px; }
            .bg-color-dot { width:14px;height:14px;border-radius:50%;flex-shrink:0;box-shadow:0 0 0 1px rgba(0,0,0,0.15);margin-left:auto;transition:background-color 0.15s; }
            .bg-chevron { color:var(--text-disabled);display:flex;align-items:center;flex-shrink:0;transition:transform 0.2s;margin-left:4px; }
            .bg-chevron--open { transform:rotate(180deg); }
            .bg-accordion-wrap { display:grid;grid-template-rows:0fr;transition:grid-template-rows 200ms cubic-bezier(0.4,0,0.2,1); }
            .bg-accordion-wrap.bg-accordion-open { grid-template-rows:1fr; }
            .bg-accordion-overflow { overflow:hidden; }
            .bg-swatch-row { display:flex;gap:5px;padding:6px 12px 10px; }
            .bg-swatch { width:24px;height:24px;border-radius:5px;border:none;cursor:pointer;flex-shrink:0;transition:transform 0.12s,box-shadow 0.12s;outline:none; }
            .bg-swatch:hover { transform:scale(1.18);box-shadow:0 2px 8px rgba(0,0,0,0.4); }
            .layer-handle { cursor:grab;color:var(--text-disabled);display:flex;align-items:center;padding:2px;border-radius:3px;flex-shrink:0; }
            .layer-handle svg { width:11px;height:11px; }
            .layer-handle:hover { color:var(--text-secondary); }
            .layer-eye { width:20px;height:20px;border:none;background:transparent;color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:3px;flex-shrink:0;outline:none; }
            .layer-eye svg { width:12px;height:12px; }
            .layer-eye:hover { background:var(--surface-hover);color:var(--text-primary); }
            .layer-thumb { width:34px;height:34px;border-radius:4px;flex-shrink:0;background:repeating-conic-gradient(#2a2a2a 0% 25%,#1a1a1a 0% 50%) 0 0/8px 8px; }
            .layer-name { font-size:var(--text-sm);color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
            .layer-op { -webkit-appearance:none;width:40px;height:2px;background:var(--col-graphite);border-radius:1px;outline:none;cursor:pointer;flex-shrink:0; }
            .layer-op::-webkit-slider-thumb { -webkit-appearance:none;width:10px;height:10px;background:#fff;border-radius:50%;cursor:pointer; }
            .layer-ghost { opacity:0.4;background:var(--surface-pressed); }
        `;
    document.head.appendChild(style);
  }
}