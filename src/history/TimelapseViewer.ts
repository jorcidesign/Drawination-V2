// src/history/TimelapseViewer.ts
//
// Overlay SPA fullscreen para reproducción del timelapse.
//
// CONTROLES:
//   - Slider draggable con seek real (redibuja desde 0 hasta el frame pedido)
//   - Botón pause/play
//   - Botón cerrar (X) — vuelve al canvas intacto
//   - Velocidad: 1x / 2x / 4x

import type { CanvasEngine } from '../core/engine/CanvasEngine';
import type { HistoryManager } from '../history/HistoryManager';
import type { BrushEngine } from '../core/render/BrushEngine';
import type { StorageManager } from '../storage/StorageManager';
import type { TimelineEvent } from './TimelineTypes';
import type { CanvasRebuilder } from '../core/render/CanvasRebuilder';
import { CommandFactory } from './commands/CommandFactory';

const MS_PER_STROKE_BASE = 40;
const FADE_STEPS = 16;

interface DrawItem {
    kind: 'draw';
    event: TimelineEvent;
    data: ArrayBuffer;
}
interface TransformItem {
    kind: 'transform';
    targetIds: string[];
    matrix: number[];
}
interface HideItem {
    kind: 'hide';
    targetIds: string[];
}
type PlaylistItem = DrawItem | TransformItem | HideItem;

export class TimelapseViewer {
    private engine: CanvasEngine;
    private history: HistoryManager;
    private activeBrush: BrushEngine;
    private storage: StorageManager;
    private rebuilder: CanvasRebuilder;

    private _overlay: HTMLDivElement | null = null;
    private _playing = false;
    private _cancelled = false;
    private _paused = false;
    private _speed = 1;
    private _seeking = false;

    private _playlist: PlaylistItem[] = [];
    private _drawCount = 0;
    private _currentDraw = 0;

    private _recCanvas: HTMLCanvasElement | null = null;
    private _recCtx: CanvasRenderingContext2D | null = null;

    private _resumeResolve: (() => void) | null = null;

    constructor(
        engine: CanvasEngine,
        history: HistoryManager,
        activeBrush: BrushEngine,
        storage: StorageManager,
        rebuilder: CanvasRebuilder,
    ) {
        this.engine = engine;
        this.history = history;
        this.activeBrush = activeBrush;
        this.storage = storage;
        this.rebuilder = rebuilder;
    }

    public isPlaying(): boolean {
        return this._playing;
    }

    public async play(): Promise<void> {
        if (this._playing) return;

        const spine = this.history.getTimelineSpine();
        if (spine.length === 0) {
            alert('No hay trazos para reproducir.');
            return;
        }

        this._playing = true;
        this._cancelled = false;
        this._paused = false;
        this._speed = 1;
        this._currentDraw = 0;
        this._seeking = false;

        const { playlist, drawCount } = await this._buildPlaylist(spine);
        this._playlist = playlist;
        this._drawCount = drawCount;

        if (drawCount === 0) {
            this._playing = false;
            return;
        }

        this._showOverlay();

        const W = this.engine.width;
        const H = this.engine.height;
        this._recCanvas = document.createElement('canvas');
        this._recCanvas.width = W;
        this._recCanvas.height = H;
        this._recCtx = this._recCanvas.getContext('2d')!;

        const canvasWrap = document.getElementById('tl-canvas-wrap');
        if (canvasWrap) {
            this._recCanvas.style.cssText = `
                width: 100%;
                height: 100%;
                object-fit: contain;
                border-radius: 4px;
            `;
            canvasWrap.appendChild(this._recCanvas);
        }

        this._recCtx.fillStyle = '#ffffff';
        this._recCtx.fillRect(0, 0, W, H);

        await this._reproduce();

        if (!this._cancelled) {
            await this._showFinalResult();
        }

        this._playing = false;
        this._hideOverlay();
        await this.rebuilder.rebuild(this.activeBrush);
    }

    // ── Seek: redibuja desde 0 hasta targetDrawIndex ──────────────────────
    // Construye el estado completo del canvas en ese punto de la historia.
    private async _seekTo(targetDrawIndex: number): Promise<void> {
        if (!this._recCtx || !this._recCanvas) return;

        const ctx = this._recCtx;
        const W = this._recCanvas.width;
        const H = this._recCanvas.height;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);

        const currentTransforms = new Map<string, DOMMatrix>();
        const hiddenIds = new Set<string>();
        let drawsSeen = 0;

        for (const item of this._playlist) {
            if (drawsSeen >= targetDrawIndex) break;

            if (item.kind === 'draw') {
                const cmd = CommandFactory.create(item.event, this.activeBrush);
                const t = currentTransforms.get(item.event.id);
                if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];
                if (!hiddenIds.has(item.event.id)) {
                    ctx.save();
                    cmd.execute(ctx);
                    ctx.restore();
                }
                drawsSeen++;

            } else if (item.kind === 'transform') {
                const newMatrix = new DOMMatrix(item.matrix);
                for (const id of item.targetIds) {
                    const current = currentTransforms.get(id) ?? new DOMMatrix();
                    currentTransforms.set(id, newMatrix.multiply(current));
                }
                // Aplicar transforms a lo ya dibujado
                if (drawsSeen > 0) {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, W, H);
                    let redrawnCount = 0;
                    for (const pi of this._playlist) {
                        if (redrawnCount >= drawsSeen) break;
                        if (pi.kind !== 'draw') continue;
                        if (hiddenIds.has(pi.event.id)) { redrawnCount++; continue; }
                        const cmd = CommandFactory.create(pi.event, this.activeBrush);
                        const t = currentTransforms.get(pi.event.id);
                        if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];
                        ctx.save();
                        cmd.execute(ctx);
                        ctx.restore();
                        redrawnCount++;
                    }
                }

            } else if (item.kind === 'hide') {
                for (const id of item.targetIds) hiddenIds.add(id);
            }
        }

        this._currentDraw = targetDrawIndex;
        this._updateSlider();
    }

    // ── Reproducción principal ────────────────────────────────────────────

    private async _reproduce(): Promise<void> {
        const ctx = this._recCtx!;
        const W = this.engine.width;
        const H = this.engine.height;

        const currentTransforms = new Map<string, DOMMatrix>();
        const hiddenIds = new Set<string>();
        const processedDrawItems: DrawItem[] = [];

        for (let i = 0; i < this._playlist.length; i++) {
            if (this._cancelled) break;

            // Si hay un seek pendiente, saltar al frame pedido
            if (this._seeking) {
                this._seeking = false;
                // Reconstruir estado desde el seek
                const targetDraw = this._currentDraw;
                await this._seekTo(targetDraw);
                // Reposicionar el índice del loop al frame correcto
                i = this._findPlaylistIndexForDraw(targetDraw);
                // Reconstruir currentTransforms/hiddenIds hasta ese punto
                this._rebuildState(targetDraw, currentTransforms, hiddenIds, processedDrawItems);
                continue;
            }

            await this._waitIfPaused();
            if (this._cancelled) break;
            if (this._seeking) { i--; continue; } // volver a procesar el seek

            const item = this._playlist[i];
            const msPerStroke = MS_PER_STROKE_BASE / this._speed;

            if (item.kind === 'draw') {
                const cmd = CommandFactory.create(item.event, this.activeBrush);
                const t = currentTransforms.get(item.event.id);
                if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];

                if (!hiddenIds.has(item.event.id)) {
                    ctx.save();
                    cmd.execute(ctx);
                    ctx.restore();
                }

                processedDrawItems.push(item);
                this._currentDraw++;
                this._updateSlider();
                await this._sleep(msPerStroke);

            } else if (item.kind === 'transform') {
                const newMatrix = new DOMMatrix(item.matrix);
                for (const id of item.targetIds) {
                    const current = currentTransforms.get(id) ?? new DOMMatrix();
                    currentTransforms.set(id, newMatrix.multiply(current));
                }

                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, W, H);
                for (const di of processedDrawItems) {
                    if (hiddenIds.has(di.event.id)) continue;
                    const cmd = CommandFactory.create(di.event, this.activeBrush);
                    const t = currentTransforms.get(di.event.id);
                    if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];
                    ctx.save();
                    cmd.execute(ctx);
                    ctx.restore();
                }

                await this._sleep(msPerStroke * 3);

            } else if (item.kind === 'hide') {
                for (const id of item.targetIds) hiddenIds.add(id);

                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, W, H);
                for (const di of processedDrawItems) {
                    if (hiddenIds.has(di.event.id)) continue;
                    const cmd = CommandFactory.create(di.event, this.activeBrush);
                    const t = currentTransforms.get(di.event.id);
                    if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];
                    ctx.save();
                    cmd.execute(ctx);
                    ctx.restore();
                }

                await this._sleep(msPerStroke * 2);
            }
        }
    }

    // Encuentra el índice en la playlist que corresponde a N trazos de dibujo
    private _findPlaylistIndexForDraw(targetDraw: number): number {
        let drawsSeen = 0;
        for (let i = 0; i < this._playlist.length; i++) {
            if (this._playlist[i].kind === 'draw') {
                if (drawsSeen >= targetDraw) return i;
                drawsSeen++;
            }
        }
        return this._playlist.length;
    }

    // Reconstruye los mapas de estado hasta N trazos
    private _rebuildState(
        targetDraw: number,
        transforms: Map<string, DOMMatrix>,
        hiddenIds: Set<string>,
        processedItems: DrawItem[]
    ): void {
        transforms.clear();
        hiddenIds.clear();
        processedItems.length = 0;
        let drawsSeen = 0;

        for (const item of this._playlist) {
            if (drawsSeen >= targetDraw) break;
            if (item.kind === 'draw') {
                processedItems.push(item);
                drawsSeen++;
            } else if (item.kind === 'transform') {
                const newMatrix = new DOMMatrix(item.matrix);
                for (const id of item.targetIds) {
                    const current = transforms.get(id) ?? new DOMMatrix();
                    transforms.set(id, newMatrix.multiply(current));
                }
            } else if (item.kind === 'hide') {
                for (const id of item.targetIds) hiddenIds.add(id);
            }
        }
    }

    private async _showFinalResult(): Promise<void> {
        const ctx = this._recCtx!;
        const W = this.engine.width;
        const H = this.engine.height;
        const snap = this._captureFinalResult(W, H);

        const alphaStep = 1 / FADE_STEPS;
        for (let i = 1; i <= FADE_STEPS; i++) {
            ctx.save();
            ctx.globalAlpha = alphaStep * i;
            ctx.drawImage(snap, 0, 0);
            ctx.restore();
            await this._sleep(500 / FADE_STEPS);
        }

        await this._sleep(1500);
    }

    // ── Overlay UI ────────────────────────────────────────────────────────

    private _showOverlay(): void {
        const overlay = document.createElement('div');
        overlay.id = 'tl-overlay';

        overlay.innerHTML = `
            <div id="tl-header">
                <span id="tl-title">Timelapse</span>
                <button id="tl-close" title="Cerrar y volver al canvas">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M2 2L16 16M16 2L2 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
            <div id="tl-canvas-wrap"></div>
            <div id="tl-controls">
                <button id="tl-playpause" title="Pause / Play">
                    <svg id="tl-pause-icon" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <rect x="4" y="3" width="4" height="14" rx="1"/>
                        <rect x="12" y="3" width="4" height="14" rx="1"/>
                    </svg>
                    <svg id="tl-play-icon" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style="display:none">
                        <path d="M5 3L17 10L5 17V3Z"/>
                    </svg>
                </button>
                <div id="tl-slider-wrap">
                    <div id="tl-slider-track">
                        <div id="tl-slider-fill"></div>
                        <div id="tl-slider-thumb"></div>
                    </div>
                    <div id="tl-time">
                        <span id="tl-current">0</span>
                        <span> / </span>
                        <span id="tl-total">0</span>
                        <span> trazos</span>
                    </div>
                </div>
                <div id="tl-speed-wrap">
                    <button class="tl-speed-btn tl-speed-active" data-speed="1">1×</button>
                    <button class="tl-speed-btn" data-speed="2">2×</button>
                    <button class="tl-speed-btn" data-speed="4">4×</button>
                </div>
            </div>
        `;

        const style = document.createElement('style');
        style.id = 'tl-styles';
        style.textContent = `
            #tl-overlay {
                position: fixed;
                inset: 0;
                background: #0a0a0a;
                z-index: 999999;
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 0;
                user-select: none;
            }
            #tl-header {
                width: 100%;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 16px 24px;
                flex-shrink: 0;
            }
            #tl-title {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-size: 14px;
                font-weight: 500;
                color: rgba(255,255,255,0.5);
                letter-spacing: 0.5px;
                text-transform: uppercase;
            }
            #tl-close {
                width: 36px;
                height: 36px;
                border: none;
                background: rgba(255,255,255,0.07);
                border-radius: 8px;
                color: rgba(255,255,255,0.5);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.15s, color 0.15s;
            }
            #tl-close:hover {
                background: rgba(255,255,255,0.12);
                color: #fff;
            }
            #tl-canvas-wrap {
                flex: 1;
                width: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 24px;
                min-height: 0;
            }
            #tl-canvas-wrap canvas {
                max-width: 100%;
                max-height: 100%;
                background: #fff;
                border-radius: 4px;
                box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 24px 64px rgba(0,0,0,0.6);
            }
            #tl-controls {
                width: 100%;
                max-width: 900px;
                display: flex;
                align-items: center;
                gap: 16px;
                padding: 20px 24px 28px;
                flex-shrink: 0;
            }
            #tl-playpause {
                width: 40px;
                height: 40px;
                border: none;
                background: rgba(255,255,255,0.1);
                border-radius: 50%;
                color: #fff;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                transition: background 0.15s;
            }
            #tl-playpause:hover { background: rgba(255,255,255,0.18); }
            #tl-slider-wrap {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            #tl-slider-track {
                position: relative;
                height: 4px;
                background: rgba(255,255,255,0.15);
                border-radius: 2px;
                cursor: pointer;
                padding: 10px 0;
                margin: -10px 0;
            }
            #tl-slider-fill {
                position: absolute;
                left: 0;
                top: 10px;
                height: 4px;
                width: 0%;
                background: #fff;
                border-radius: 2px;
                pointer-events: none;
                transition: width 0.08s linear;
            }
            #tl-slider-thumb {
                position: absolute;
                top: 50%;
                left: 0%;
                width: 14px;
                height: 14px;
                background: #fff;
                border-radius: 50%;
                transform: translate(-50%, -50%);
                pointer-events: none;
                transition: left 0.08s linear, transform 0.1s;
                box-shadow: 0 0 0 3px rgba(255,255,255,0.15);
            }
            #tl-slider-track:hover #tl-slider-fill { background: #0066cc; }
            #tl-slider-track:hover #tl-slider-thumb {
                background: #0066cc;
                box-shadow: 0 0 0 4px rgba(0,102,204,0.3);
                transform: translate(-50%, -50%) scale(1.2);
            }
            #tl-time {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-size: 12px;
                color: rgba(255,255,255,0.35);
                font-variant-numeric: tabular-nums;
            }
            #tl-speed-wrap {
                display: flex;
                gap: 4px;
                flex-shrink: 0;
            }
            .tl-speed-btn {
                padding: 6px 10px;
                border: 1px solid rgba(255,255,255,0.12);
                background: transparent;
                border-radius: 6px;
                color: rgba(255,255,255,0.4);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.15s;
            }
            .tl-speed-btn:hover {
                background: rgba(255,255,255,0.08);
                color: rgba(255,255,255,0.7);
            }
            .tl-speed-active {
                background: rgba(255,255,255,0.12) !important;
                border-color: rgba(255,255,255,0.3) !important;
                color: #fff !important;
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(overlay);
        this._overlay = overlay;

        const totalEl = document.getElementById('tl-total');
        if (totalEl) totalEl.textContent = String(this._drawCount);

        // Botón cerrar
        document.getElementById('tl-close')?.addEventListener('click', () => {
            this._cancelled = true;
            this._resumeResolve?.();
        });

        // Botón pause/play
        document.getElementById('tl-playpause')?.addEventListener('click', () => {
            this._togglePause();
        });

        // Velocidad
        document.querySelectorAll('.tl-speed-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const speed = parseFloat((btn as HTMLElement).dataset.speed || '1');
                this._speed = speed;
                document.querySelectorAll('.tl-speed-btn').forEach(b => b.classList.remove('tl-speed-active'));
                btn.classList.add('tl-speed-active');
                if (this._paused) this._togglePause();
            });
        });

        // Slider — seek real con click y drag
        this._bindSlider();
    }

    private _bindSlider(): void {
        const track = document.getElementById('tl-slider-track');
        if (!track) return;

        const getTargetDraw = (clientX: number): number => {
            const rect = track.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            return Math.round(pct * this._drawCount);
        };

        const doSeek = (clientX: number) => {
            const target = getTargetDraw(clientX);
            this._currentDraw = target;
            this._seeking = true;
            // Actualizar slider visualmente de inmediato para feedback instantáneo
            this._updateSlider();
            // Si estaba pausado, mantenerlo pausado tras el seek
            if (!this._paused) {
                this._paused = true;
                this._updatePauseIcon();
            }
            // Despertar el loop para que procese el seek
            this._resumeResolve?.();
        };

        // Click
        track.addEventListener('click', (e) => {
            doSeek(e.clientX);
        });

        // Drag
        let dragging = false;
        track.addEventListener('mousedown', (e) => {
            dragging = true;
            doSeek(e.clientX);
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            doSeek(e.clientX);
        });

        window.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            // Al soltar el drag, reanudar reproducción
            if (this._paused) {
                this._paused = false;
                this._updatePauseIcon();
                this._resumeResolve?.();
            }
        });
    }

    private _togglePause(): void {
        this._paused = !this._paused;
        this._updatePauseIcon();
        if (!this._paused) {
            this._resumeResolve?.();
        }
    }

    private _updatePauseIcon(): void {
        const pauseIcon = document.getElementById('tl-pause-icon');
        const playIcon = document.getElementById('tl-play-icon');
        if (this._paused) {
            if (pauseIcon) pauseIcon.style.display = 'none';
            if (playIcon) playIcon.style.display = 'block';
        } else {
            if (pauseIcon) pauseIcon.style.display = 'block';
            if (playIcon) playIcon.style.display = 'none';
        }
    }

    private _waitIfPaused(): Promise<void> {
        if (!this._paused) return Promise.resolve();
        return new Promise((resolve) => {
            this._resumeResolve = resolve;
        });
    }

    private _updateSlider(): void {
        const pct = this._drawCount > 0
            ? (this._currentDraw / this._drawCount) * 100
            : 0;

        const fill = document.getElementById('tl-slider-fill');
        const thumb = document.getElementById('tl-slider-thumb');
        const current = document.getElementById('tl-current');

        if (fill) fill.style.width = `${pct}%`;
        if (thumb) thumb.style.left = `${pct}%`;
        if (current) current.textContent = String(this._currentDraw);
    }

    private _hideOverlay(): void {
        // Limpiar event listeners del drag
        window.removeEventListener('mousemove', () => { });
        window.removeEventListener('mouseup', () => { });

        this._overlay?.remove();
        this._overlay = null;
        document.getElementById('tl-styles')?.remove();
        this._recCanvas = null;
        this._recCtx = null;
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private _captureFinalResult(W: number, H: number): HTMLCanvasElement {
        const snap = document.createElement('canvas');
        snap.width = W;
        snap.height = H;
        const ctx = snap.getContext('2d')!;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);

        const { layersState, layerRoute } = this.history.getState();

        for (let i = 0; i < 10; i++) {
            const layerState = layersState.get(i);
            if (!layerState?.visible) continue;
            const routedIndex = layerRoute.get(i) ?? i;
            if (routedIndex !== i) continue;
            const srcCanvas = this.engine.getLayerCanvas(i);
            ctx.save();
            ctx.globalAlpha = layerState.opacity;
            ctx.drawImage(srcCanvas, 0, 0);
            ctx.restore();
        }

        return snap;
    }

    private async _buildPlaylist(spine: TimelineEvent[]): Promise<{ playlist: PlaylistItem[]; drawCount: number }> {
        const playlist: PlaylistItem[] = [];
        let drawCount = 0;

        const drawingSpine = spine.filter(
            ev => ev.type === 'STROKE' || ev.type === 'ERASE' || ev.type === 'FILL'
        );
        const dataMap = await this._preloadAll(drawingSpine);

        let i = 0;
        while (i < spine.length) {
            const ev = spine[i];

            if (ev.type === 'STROKE' || ev.type === 'ERASE' || ev.type === 'FILL') {
                const data = dataMap.get(ev.id);
                if (data) {
                    playlist.push({ kind: 'draw', event: { ...ev, data }, data });
                    drawCount++;
                }
                i++;

            } else if (ev.type === 'TRANSFORM' && ev.targetIds && ev.transformMatrix) {
                let currentMatrix = new DOMMatrix(ev.transformMatrix);
                const sortedIds = ev.targetIds.slice().sort().join(',');

                let j = i + 1;
                while (
                    j < spine.length &&
                    spine[j].type === 'TRANSFORM' &&
                    spine[j].targetIds!.slice().sort().join(',') === sortedIds
                ) {
                    const nextM = new DOMMatrix(spine[j].transformMatrix);
                    currentMatrix = nextM.multiply(currentMatrix);
                    j++;
                }

                playlist.push({
                    kind: 'transform',
                    targetIds: ev.targetIds,
                    matrix: [currentMatrix.a, currentMatrix.b, currentMatrix.c, currentMatrix.d, currentMatrix.e, currentMatrix.f],
                });
                i = j;

            } else if (ev.type === 'HIDE' && ev.targetIds) {
                playlist.push({ kind: 'hide', targetIds: ev.targetIds });
                i++;

            } else {
                i++;
            }
        }

        return { playlist, drawCount };
    }

    private async _preloadAll(events: TimelineEvent[]): Promise<Map<string, ArrayBuffer>> {
        const dataMap = new Map<string, ArrayBuffer>();
        const idsNeeded: string[] = [];

        for (const ev of events) {
            if (ev.data) dataMap.set(ev.id, ev.data);
            else idsNeeded.push(ev.id);
        }

        if (idsNeeded.length > 0) {
            const batch = await this.storage.loadEventDataBatch(idsNeeded);
            for (const [id, buf] of batch.entries()) dataMap.set(id, buf);
        }

        return dataMap;
    }

    private _sleep(ms: number): Promise<void> {
        return new Promise(r => setTimeout(r, Math.max(0, ms)));
    }
}