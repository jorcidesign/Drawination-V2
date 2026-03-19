// src/ui/panels/NewProjectModal.ts
//
// Modal de nuevo proyecto — mismos estilos que el loader de exportación.
// Muestra 3 opciones de formato con preview CSS proporcional.
// Si hay trazos existentes pide confirmación antes de borrar.

import type { EventBus } from '../../input/EventBus';

export interface CanvasPreset {
    id: string;
    label: string;
    sublabel: string;
    width: number;
    height: number;
    // Proporción visual para el preview CSS (no las dimensiones reales)
    previewW: number;
    previewH: number;
}

export const CANVAS_PRESETS: CanvasPreset[] = [
    {
        id: 'portrait',
        label: 'Portrait',
        sublabel: 'Instagram · 4:5',
        width: 1056,
        height: 1320,
        previewW: 56,
        previewH: 70,
    },
    {
        id: 'square',
        label: 'Clásico',
        sublabel: 'Universal · 1:1',
        width: 1180,
        height: 1180,
        previewW: 64,
        previewH: 64,
    },
    {
        id: 'landscape',
        label: 'Escena',
        sublabel: 'Cine · 16:9',
        width: 1528,
        height: 860,
        previewW: 80,
        previewH: 45,
    },
];

export class NewProjectModal {
    private eventBus: EventBus;
    private _overlay: HTMLDivElement | null = null;
    private _selectedPreset: CanvasPreset = CANVAS_PRESETS[1]; // cuadrado por defecto
    private _hasExistingWork: () => boolean;

    constructor(eventBus: EventBus, hasExistingWork: () => boolean) {
        this.eventBus = eventBus;
        this._hasExistingWork = hasExistingWork;
    }

    public show(): void {
        if (this._overlay) return;
        this._selectedPreset = CANVAS_PRESETS[1]; // reset a cuadrado
        this._render();
    }

    public hide(): void {
        this._overlay?.remove();
        this._overlay = null;
        document.getElementById('np-modal-styles')?.remove();
    }

    private _render(): void {
        const overlay = document.createElement('div');
        overlay.id = 'np-overlay';

        const hasWork = this._hasExistingWork();

        overlay.innerHTML = `
            <div class="np-card">
                <div class="np-header">
                    <span class="np-title">Nuevo proyecto</span>
                    <button class="np-close" id="np-close-btn" title="Cancelar">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>

                ${hasWork ? `
                <div class="np-warning">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M7 1L13 12H1L7 1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                        <line x1="7" y1="5" x2="7" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        <circle cx="7" cy="10" r="0.75" fill="currentColor"/>
                    </svg>
                    El proyecto actual se perderá
                </div>
                ` : ''}

                <div class="np-sub">Elige el formato del lienzo</div>

                <div class="np-presets" id="np-presets">
                    ${CANVAS_PRESETS.map(preset => `
                        <button class="np-preset ${preset.id === 'square' ? 'np-preset--active' : ''}"
                                data-id="${preset.id}">
                            <div class="np-preview-wrap">
                                <div class="np-preview"
                                     style="width:${preset.previewW}px;height:${preset.previewH}px">
                                </div>
                            </div>
                            <span class="np-preset-label">${preset.label}</span>
                            <span class="np-preset-sub">${preset.sublabel}</span>
                        </button>
                    `).join('')}
                </div>

                <div class="np-actions">
                    <button class="np-btn np-btn--cancel" id="np-cancel-btn">Cancelar</button>
                    <button class="np-btn np-btn--confirm" id="np-confirm-btn">
                        Crear proyecto
                    </button>
                </div>
            </div>
        `;

        const style = document.createElement('style');
        style.id = 'np-modal-styles';
        style.textContent = `
            #np-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.72);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .np-card {
                background: #1c1c1e;
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 20px;
                padding: 28px 32px 24px;
                display: flex;
                flex-direction: column;
                gap: 20px;
                min-width: 380px;
                max-width: 440px;
                box-shadow: 0 32px 80px rgba(0,0,0,0.7);
                animation: np-in 0.2s cubic-bezier(0.34, 1.2, 0.64, 1);
            }
            @keyframes np-in {
                from { opacity: 0; transform: scale(0.95) translateY(8px); }
                to   { opacity: 1; transform: none; }
            }
            .np-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .np-title {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-size: 17px;
                font-weight: 600;
                color: #ffffff;
                letter-spacing: -0.3px;
            }
            .np-close {
                width: 30px; height: 30px;
                border: none;
                background: rgba(255,255,255,0.07);
                border-radius: 8px;
                color: rgba(255,255,255,0.5);
                cursor: pointer;
                display: flex; align-items: center; justify-content: center;
                transition: background 0.15s, color 0.15s;
            }
            .np-close:hover { background: rgba(231,76,60,0.2); color: #e74c3c; }
            .np-warning {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 14px;
                background: rgba(231,76,60,0.12);
                border: 1px solid rgba(231,76,60,0.25);
                border-radius: 10px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-size: 13px;
                color: rgba(231,76,60,0.9);
            }
            .np-sub {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-size: 13px;
                color: rgba(255,255,255,0.4);
            }
            .np-presets {
                display: flex;
                gap: 12px;
                align-items: flex-end;
                justify-content: center;
            }
            .np-preset {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 10px;
                padding: 16px 8px 14px;
                background: rgba(255,255,255,0.04);
                border: 1.5px solid rgba(255,255,255,0.1);
                border-radius: 14px;
                cursor: pointer;
                transition: background 0.15s, border-color 0.15s, transform 0.15s;
            }
            .np-preset:hover {
                background: rgba(255,255,255,0.08);
                border-color: rgba(255,255,255,0.2);
                transform: translateY(-1px);
            }
            .np-preset--active {
                background: rgba(0, 102, 204, 0.15) !important;
                border-color: #0066cc !important;
            }
            .np-preview-wrap {
                height: 80px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .np-preview {
                background: rgba(255,255,255,0.12);
                border: 1.5px solid rgba(255,255,255,0.25);
                border-radius: 4px;
                transition: background 0.15s;
            }
            .np-preset--active .np-preview {
                background: rgba(0, 102, 204, 0.25);
                border-color: rgba(0, 102, 204, 0.6);
            }
            .np-preset-label {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-size: 13px;
                font-weight: 500;
                color: rgba(255,255,255,0.85);
            }
            .np-preset-sub {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-size: 11px;
                color: rgba(255,255,255,0.35);
                text-align: center;
            }
            .np-actions {
                display: flex;
                gap: 10px;
                margin-top: 4px;
            }
            .np-btn {
                flex: 1;
                height: 42px;
                border-radius: 12px;
                border: none;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: background 0.15s, transform 0.1s;
            }
            .np-btn:active { transform: scale(0.98); }
            .np-btn--cancel {
                background: rgba(255,255,255,0.07);
                color: rgba(255,255,255,0.5);
                border: 1px solid rgba(255,255,255,0.1);
            }
            .np-btn--cancel:hover {
                background: rgba(255,255,255,0.11);
                color: rgba(255,255,255,0.7);
            }
            .np-btn--confirm {
                background: #0066cc;
                color: #ffffff;
            }
            .np-btn--confirm:hover { background: #0077ee; }
        `;

        document.head.appendChild(style);
        document.body.appendChild(overlay);
        this._overlay = overlay;

        // ── Selección de preset ───────────────────────────────────────────
        const presetsEl = document.getElementById('np-presets');
        presetsEl?.addEventListener('click', (e) => {
            const btn = (e.target as HTMLElement).closest('.np-preset') as HTMLElement;
            if (!btn) return;

            const id = btn.dataset.id;
            const preset = CANVAS_PRESETS.find(p => p.id === id);
            if (!preset) return;

            this._selectedPreset = preset;

            // Actualizar estado visual
            presetsEl.querySelectorAll('.np-preset').forEach(b => {
                b.classList.toggle('np-preset--active', (b as HTMLElement).dataset.id === id);
            });
        });

        // ── Cerrar ────────────────────────────────────────────────────────
        document.getElementById('np-close-btn')?.addEventListener('click', () => this.hide());
        document.getElementById('np-cancel-btn')?.addEventListener('click', () => this.hide());

        // Clic fuera del card también cierra
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.hide();
        });

        // ── Confirmar ─────────────────────────────────────────────────────
        document.getElementById('np-confirm-btn')?.addEventListener('click', () => {
            this.eventBus.emit('NEW_PROJECT', {
                width: this._selectedPreset.width,
                height: this._selectedPreset.height,
            });
            this.hide();
        });
    }
}