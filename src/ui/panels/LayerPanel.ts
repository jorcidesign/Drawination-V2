// src/ui/panels/LayerPanel.ts
import { Icons } from '../atoms/Icons';
import { LayerItem } from '../molecules/LayerItem';
import type { EventBus, LayersStatePayload } from '../../input/EventBus';
import { DEFAULT_BACKGROUND_COLOR } from '../../history/computeTimelineState';
import Sortable from 'sortablejs';

const BACKGROUND_PRESETS = [
  { color: '#ffffff', name: 'Blanco mate' },
  { color: '#7f7f7f', name: 'Gris pesado' },
  { color: '#2280cf', name: 'Plano azul' },
  { color: '#986e4c', name: 'Papel marrón' },
  { color: '#20242b', name: 'Plano oscuro' },
];

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

  private lastPayload: LayersStatePayload | null = null;
  private sortableInstance: Sortable | null = null;

  private expandedLayerIndex: number | null = null;

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

    // BETA: botón de nueva capa deshabilitado hasta que capas esté listo
    const addBtn = document.createElement('button');
    addBtn.className = 'panel-add';
    addBtn.title = 'Nueva capa (próximamente)';
    addBtn.innerHTML = Icons.add;
    addBtn.disabled = true;
    addBtn.style.opacity = '0.3';
    addBtn.style.cursor = 'not-allowed';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'panel-close';
    closeBtn.innerHTML = Icons.close;
    closeBtn.onclick = () => this.eventBus.emit('TOGGLE_LAYER_PANEL');

    actionsWrap.appendChild(addBtn);
    actionsWrap.appendChild(closeBtn);
    header.appendChild(actionsWrap);
    this.element.appendChild(header);

    // BETA: lista de capas oculta — se muestra el banner "Coming Soon"
    this.listContainer = document.createElement('div');
    this.listContainer.className = 'layer-list';
    this.listContainer.style.display = 'none';
    this.element.appendChild(this.listContainer);

    // Banner elegante "Coming Soon"
    this.element.appendChild(this._buildComingSoonBanner());

    this.element.appendChild(this._buildBgLayer());
    this.bindEvents();
  }

  /** Banner de capas Coming Soon — temporal para la beta */
  private _buildComingSoonBanner(): HTMLDivElement {
    const banner = document.createElement('div');
    banner.className = 'layers-coming-soon';
    banner.innerHTML = `
      <div class="lcs-lock">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="3"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <div class="lcs-title">Múltiples capas</div>
      <div class="lcs-sub">Coming soon</div>
    `;
    return banner;
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

  private _renderLayers(payload: LayersStatePayload): void {
    this.lastPayload = payload;

    if (this.sortableInstance) {
      this.sortableInstance.destroy();
      this.sortableInstance = null;
    }

    this.listContainer.innerHTML = '';

    const { createdLayers, layersState, activeLayerIndex, layerOrder } = payload;

    const reversedLayers = [...layerOrder]
      .filter(id => createdLayers.includes(id))
      .reverse();

    for (const layerIndex of reversedLayers) {
      const state = layersState.get(layerIndex)!;
      const isActive = layerIndex === activeLayerIndex;
      const isExpanded = isActive && this.expandedLayerIndex === layerIndex;

      const item = new LayerItem({
        layerIndex,
        state,
        isActive,
        isExpanded,
        onSelect: (idx) => {
          if (idx === activeLayerIndex) {
            this.expandedLayerIndex = this.expandedLayerIndex === idx ? null : idx;
            this._renderLayers(this.lastPayload!);
          } else {
            this.expandedLayerIndex = null;
            this.eventBus.emit('LAYER_ACTION_SELECT', idx);
          }
        },
        onToggleVisibility: (idx) => this.eventBus.emit('LAYER_ACTION_TOGGLE_VISIBILITY', idx),
        onToggleLock: (idx) => this.eventBus.emit('LAYER_ACTION_LOCK', idx),
        onDuplicate: (idx) => this.eventBus.emit('LAYER_ACTION_DUPLICATE', idx),
        onMergeDown: (idx) => this.eventBus.emit('LAYER_ACTION_MERGE', idx),
        onDelete: (idx) => this.eventBus.emit('LAYER_ACTION_DELETE', idx),
        onOpacityChange: (idx, opacity) => this.eventBus.emit('LAYER_ACTION_OPACITY', { layerIndex: idx, opacity }),
      });

      this.listContainer.appendChild(item.element);
    }

    if (this.isVisible) this._initSortable();
  }

  private _initSortable(): void {
    if (this.sortableInstance) {
      this.sortableInstance.destroy();
      this.sortableInstance = null;
    }

    this.sortableInstance = Sortable.create(this.listContainer, {
      handle: '.layer-handle',
      animation: 150,
      ghostClass: 'layer-ghost',
      onStart: () => {
        this.listContainer.classList.add('is-dragging');
        this.expandedLayerIndex = null;
      },
      onEnd: (evt) => {
        this.listContainer.classList.remove('is-dragging');
        if (evt.newIndex === evt.oldIndex) return;

        const items = Array.from(
          this.listContainer.querySelectorAll('.layer-item-wrapper[data-layer-index]')
        );
        const newVisualOrder = items
          .map(el => parseInt((el as HTMLElement).dataset.layerIndex ?? '-1', 10))
          .filter(idx => idx >= 0);

        if (newVisualOrder.length === 0) return;

        const newBottomToTop = [...newVisualOrder].reverse();

        const uncreated = this.lastPayload!.layerOrder.filter(id => !this.lastPayload!.createdLayers.includes(id));
        const fullOrder = [...uncreated, ...newBottomToTop];

        this.eventBus.emit('LAYER_ACTION_REORDER', fullOrder);
      },
    });
  }

  private _updateDot(color: string): void {
    if (!this.bgPreviewDot) return;
    this.bgPreviewDot.style.backgroundColor = color;
    this.bgPreviewDot.style.outline = color.toLowerCase() === '#ffffff' ? '1px solid rgba(0,0,0,0.12)' : 'none';
  }

  private _setAccordion(open: boolean): void {
    this.bgAccordionOpen = open;
    this.bgAccordionWrap?.classList.toggle('bg-accordion-open', open);
    this.bgChevron?.classList.toggle('bg-chevron--open', open);
  }

  private _activateBgTool(): void {
    this.bgToolActive = true;
    this.bgWrapper?.classList.add('layer-item--bg-active');
    this.eventBus.emit('BACKGROUND_TOOL_ACTIVE', true);
    this.eventBus.emit('TOGGLE_COLOR_PANEL_FOR_BG');

    // === FIX: Deselecciona visual y lógicamente cualquier otra herramienta ===
    this.eventBus.emit('REQUEST_TOOL_SWITCH', 'background');
  }

  private _deactivateBgTool(): void {
    if (!this.bgToolActive) return;
    this.bgToolActive = false;
    this.bgWrapper?.classList.remove('layer-item--bg-active');
    this._setAccordion(false);
    this.eventBus.emit('BACKGROUND_TOOL_ACTIVE', false);
  }

  private _applyBackground(color: string): void {
    this.currentBgColor = color;
    this._updateDot(color);
    this.eventBus.emit('SET_COLOR', color);
    this.eventBus.emit('BACKGROUND_COLOR_CHANGED', color);
  }

  private bindEvents(): void {
    this.eventBus.on('LAYERS_STATE_CHANGED', (payload) => { this._renderLayers(payload); });

    this.eventBus.on('TOGGLE_LAYER_PANEL', () => {
      this.isVisible = !this.isVisible;
      if (this.isVisible) {
        this.element.classList.add('visible');
        if (this.lastPayload) this._renderLayers(this.lastPayload);
      } else {
        this.element.classList.remove('visible');
        this._deactivateBgTool();
      }
      this.eventBus.emit('LAYER_PANEL_STATE_CHANGED', this.isVisible);
    });

    this.eventBus.on('ACTIVE_TOOL_CHANGED', (toolId) => { if (toolId !== 'background') this._deactivateBgTool(); });
    this.eventBus.on('REQUEST_TOOL_SWITCH', (toolId) => { if (toolId !== 'background') this._deactivateBgTool(); });
    this.eventBus.on('APPLY_COLOR', (color) => { if (this.bgToolActive) this._applyBackground(color); });
    this.eventBus.on('SET_COLOR', (color) => {
      if (this.bgToolActive) {
        this._updateDot(color);
        this.eventBus.emit('BACKGROUND_COLOR_PREVIEW', color);
      }
    });
    this.eventBus.on('BACKGROUND_COLOR_CHANGED', (color) => { this.currentBgColor = color; this._updateDot(color); });
  }

  public mount(parent: HTMLElement) { parent.appendChild(this.element); }

  private static injectStyles() {
    if (this.stylesInjected) return;
    this.stylesInjected = true;

    const style = document.createElement('style');
    style.textContent = `
      #panel-layers { top: 56px; right: 12px; width: 230px; z-index: var(--z-panel); max-height: calc(100vh - 80px); }
      .layer-list { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; max-height: calc(100vh - 280px); padding-right: 4px; }
      .layer-item-wrapper { display: flex; flex-direction: column; border-radius: 7px; transition: background var(--t-fast); border: 1px solid transparent; background: transparent; }
      .layer-item-wrapper:hover { background: var(--surface-hover); }
      .layer-item-wrapper.active { background: var(--surface-active); border-color: rgba(1,109,232,.22); }

      .layer-main { display: flex; align-items: center; gap: 6px; padding: 5px 7px; cursor: pointer; min-height: 44px; }
      .layer-handle { cursor: grab; color: var(--text-disabled); display: flex; align-items: center; padding: 2px; border-radius: 3px; flex-shrink: 0; }
      .layer-handle svg { width: 14px; height: 14px; }
      .layer-handle:hover { color: var(--text-secondary); }

      .layer-eye, .layer-lock {
        width: 20px; height: 20px; border: none; background: transparent;
        color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center;
        border-radius: 3px; flex-shrink: 0; outline: none; transition: background var(--t-fast);
      }
      .layer-eye svg, .layer-lock svg { width: 14px; height: 14px; }
      .layer-eye:hover, .layer-lock:hover { background: var(--surface-hover); color: var(--text-primary); }
      .layer-lock.is-locked { color: var(--text-primary); background: rgba(0,0,0,0.05); }

      .layer-thumb { width: 34px; height: 34px; border-radius: 4px; flex-shrink: 0; background: repeating-conic-gradient(#2a2a2a 0% 25%, #1a1a1a 0% 50%) 0 0/8px 8px; }
      .layer-name { font-size: var(--text-sm); color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

      .layer-actions-wrapper { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 200ms cubic-bezier(0.4,0,0.2,1); }
      .layer-actions-wrapper.expanded { grid-template-rows: 1fr; border-top: 1px solid rgba(0,0,0,0.05); margin-top: 2px;}
      .layer-list.is-dragging .layer-actions-wrapper { grid-template-rows: 0fr !important; }
      .layer-actions-overflow { overflow: hidden; }
      .layer-actions-inner { display: flex; flex-direction: column; gap: 8px; padding: 8px; }

      .layer-action-btns { display: flex; gap: 4px; justify-content: flex-end; }
      .layer-btn {
        width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
        border-radius: 6px; border: none; background: rgba(0,0,0,0.03);
        color: var(--text-secondary); cursor: pointer; transition: background var(--t-fast); flex-shrink: 0;
      }
      .layer-btn svg { width: 15px; height: 15px; }
      .layer-btn:hover:not(:disabled) { background: rgba(0,0,0,0.06); color: var(--text-primary); }
      .layer-btn:disabled { opacity: 0.3; cursor: not-allowed; }
      .layer-btn--danger:hover:not(:disabled) { background: rgba(231,76,60,0.1); color: #e74c3c; }

      .layer-op-wrap {
        display: flex; flex-direction: row-reverse; align-items: center; gap: 8px;
        background: rgba(0,0,0,0.03); padding: 5px 8px; border-radius: 6px;
      }
      .layer-op-label {
        font-size: 11px; color: var(--text-secondary);
        font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0;
      }
      .layer-op-slider {
        -webkit-appearance: none; flex: 1; height: 2px;
        background: var(--col-graphite); border-radius: 1px; outline: none; cursor: pointer;
      }
      .layer-op-slider::-webkit-slider-thumb {
        -webkit-appearance: none; width: 12px; height: 12px;
        background: #fff; border-radius: 50%; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      }

      .layer-ghost { opacity: 0.4; background: var(--surface-pressed); }
      .panel-add { width: 24px; height: 24px; border: none; background: transparent; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 4px; outline: none; transition: background var(--t-fast), color var(--t-fast); }
      .panel-add svg { width: 16px; height: 16px; }
      .panel-add:hover:not(:disabled) { background: var(--surface-hover); color: var(--text-primary); }

      .layer-item--bg { margin-top: 6px; border-top: 1px solid var(--surface-panel-border); border-radius: 0 0 7px 7px; }
      .layer-item--bg .layer-main { min-height: 40px; }
      .layer-item--bg:hover { background: var(--surface-hover); }
      .layer-item--bg-active { background: var(--surface-active) !important; border-color: rgba(1,109,232,.22) !important; position: relative; }
      .layer-item--bg-active::before { content: ''; position: absolute; left: 0; top: 20%; bottom: 20%; width: 2px; border-radius: 0 1px 1px 0; background: var(--accent-bright, #0066cc); opacity: 0.8; }
      .layer-bg-icon { width: 20px; height: 20px; color: var(--text-disabled); display: flex; align-items: center; justify-content: center; margin-left: 14px; flex-shrink: 0; }
      .layer-bg-icon svg { width: 13px; height: 13px; }
      .bg-color-dot { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 0 1px rgba(0,0,0,0.15); margin-left: auto; transition: background-color 0.15s; }
      .bg-chevron { color: var(--text-disabled); display: flex; align-items: center; flex-shrink: 0; transition: transform 0.2s; margin-left: 4px; }
      .bg-chevron--open { transform: rotate(180deg); }
      .bg-accordion-wrap { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 200ms cubic-bezier(0.4,0,0.2,1); }
      .bg-accordion-wrap.bg-accordion-open { grid-template-rows: 1fr; }
      .bg-accordion-overflow { overflow: hidden; }
      .bg-swatch-row { display: flex; gap: 5px; padding: 6px 12px 10px; }
      .bg-swatch { width: 24px; height: 24px; border-radius: 5px; border: none; cursor: pointer; flex-shrink: 0; transition: transform 0.12s, box-shadow 0.12s; outline: none; }
      .bg-swatch:hover { transform: scale(1.18); box-shadow: 0 2px 8px rgba(0,0,0,0.4); }

      /* ── Coming Soon Banner ────────────────────────────────────────────── */
      .layers-coming-soon {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 6px; padding: 20px 12px 18px;
        margin: 6px 0 4px;
        background: linear-gradient(135deg, rgba(0,102,204,0.07) 0%, rgba(120,80,240,0.07) 100%);
        border: 1px solid rgba(0,102,204,0.14);
        border-radius: 10px;
        position: relative; overflow: hidden;
      }
      .layers-coming-soon::before {
        content: '';
        position: absolute; inset: 0;
        background: linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 60%);
        pointer-events: none;
      }
      .lcs-lock {
        width: 28px; height: 28px;
        display: flex; align-items: center; justify-content: center;
        background: linear-gradient(135deg, rgba(0,102,204,0.15), rgba(120,80,240,0.15));
        border-radius: 8px;
        color: #0066cc;
        animation: lcs-float 3s ease-in-out infinite;
      }
      .lcs-lock svg { width: 14px; height: 14px; }
      @keyframes lcs-float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
      }
      .lcs-title {
        font-size: 12px; font-weight: 600;
        color: var(--text-primary);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        letter-spacing: -0.1px;
      }
      .lcs-sub {
        font-size: 10px; font-weight: 500;
        color: #0066cc;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        text-transform: uppercase; letter-spacing: 0.8px;
        opacity: 0.8;
      }
    `;
    document.head.appendChild(style);
  }
}