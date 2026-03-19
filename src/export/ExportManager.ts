// src/export/ExportManager.ts
//
// Exportación PNG 2x y video timelapse estilo Procreate.
//
// REPRODUCCIÓN CRONOLÓGICA:
//   El video reproduce los eventos en orden real incluyendo TRANSFORM y HIDE.
//   Misma lógica que TimelapsePlayer.buildPlaylist() — los TRANSFORM consecutivos
//   sobre el mismo grupo se colapsan en una sola matriz para evitar micro-saltos.
//   Los trazos ocultos por HIDE desaparecen en el momento correcto del video.
//
// ESTRUCTURA DEL VIDEO:
//   1. Resultado final   — 2s
//   2. Fade a blanco     — 0.5s
//   3. Timelapse         — duración dinámica (5.5s – 25.5s)
//   4. Fade a blanco     — 0.5s
//   5. Marca de agua     — 1.5s

import type { CanvasEngine } from '../core/engine/CanvasEngine';
import type { HistoryManager } from '../history/HistoryManager';
import type { BrushEngine } from '../core/render/BrushEngine';
import type { StorageManager } from '../storage/StorageManager';
import type { TimelineEvent } from '../history/TimelineTypes';
import { CommandFactory } from '../history/commands/CommandFactory';

const EXPORT_SCALE = 2;
const INTRO_MS = 2_000;
const FADE_IN_MS = 500;
const FADE_OUT_MS = 500;
const WATERMARK_MS = 1_500;
const FIXED_MS = INTRO_MS + FADE_IN_MS + FADE_OUT_MS + WATERMARK_MS;
const MIN_TIMELAPSE_MS = 5_500;
const MAX_TIMELAPSE_MS = 25_500;
const MS_PER_STROKE = 50;
const VIDEO_FPS = 30;
const FADE_STEPS = 20;

// Evento interno para transforms colapsados
interface CollapsedTransform {
    kind: 'transform';
    targetIds: string[];
    matrix: number[];
}

// Evento interno para hides
interface HideEvent {
    kind: 'hide';
    targetIds: string[];
}

// Evento de dibujo enriquecido con data lista
interface DrawEvent {
    kind: 'draw';
    event: TimelineEvent;
    data: ArrayBuffer;
}

type PlaylistItem = DrawEvent | CollapsedTransform | HideEvent;

export class ExportManager {
    private engine: CanvasEngine;
    private history: HistoryManager;
    private activeBrush: BrushEngine;
    private storage: StorageManager;

    private _cancelled = false;
    private _overlay: HTMLDivElement | null = null;

    constructor(
        engine: CanvasEngine,
        history: HistoryManager,
        activeBrush: BrushEngine,
        storage: StorageManager,
    ) {
        this.engine = engine;
        this.history = history;
        this.activeBrush = activeBrush;
        this.storage = storage;
    }

    // ── PNG 2x ────────────────────────────────────────────────────────────

    public async exportPNG(): Promise<void> {
        const srcW = this.engine.width;
        const srcH = this.engine.height;
        const dstW = srcW * EXPORT_SCALE;
        const dstH = srcH * EXPORT_SCALE;

        const out = document.createElement('canvas');
        out.width = dstW;
        out.height = dstH;
        const ctx = out.getContext('2d')!;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, dstW, dstH);

        const { layersState, layerRoute } = this.history.getState();

        for (let i = 0; i < 10; i++) {
            const layerState = layersState.get(i);
            if (!layerState?.visible) continue;
            const routedIndex = layerRoute.get(i) ?? i;
            if (routedIndex !== i) continue;
            const srcCanvas = this.engine.getLayerCanvas(i);
            ctx.save();
            ctx.globalAlpha = layerState.opacity;
            ctx.drawImage(srcCanvas, 0, 0, dstW, dstH);
            ctx.restore();
        }

        this._downloadCanvas(out, `drawination_${this._timestamp()}.png`, 'image/png');
    }

    // ── Video timelapse ───────────────────────────────────────────────────

    public async exportVideo(): Promise<void> {
        if (!this._isMediaRecorderSupported()) {
            alert('Tu navegador no soporta grabación de video (MediaRecorder API). Prueba con Chrome o Edge.');
            return;
        }

        const spine = this.history.getTimelineSpine();
        if (spine.length === 0) {
            alert('No hay trazos para exportar.');
            return;
        }

        this._cancelled = false;

        // Construir playlist cronológica con transforms y hides
        const { playlist, drawCount } = await this._buildPlaylist(spine);

        if (drawCount === 0) {
            alert('No hay trazos para exportar.');
            return;
        }

        // Calcular duración dinámica basada en trazos de dibujo
        const idealTimelapse = drawCount * MS_PER_STROKE;
        const timelapseMs = Math.max(MIN_TIMELAPSE_MS, Math.min(MAX_TIMELAPSE_MS, idealTimelapse));
        const msPerStroke = timelapseMs / drawCount;
        const totalMs = FIXED_MS + timelapseMs;

        this._showOverlay(totalMs);

        const W = this.engine.width;
        const H = this.engine.height;

        const recCanvas = document.createElement('canvas');
        recCanvas.width = W;
        recCanvas.height = H;
        const ctx = recCanvas.getContext('2d')!;

        const finalSnapshot = this._captureFinalResult(W, H);

        if (this._cancelled) { this._hideOverlay(); return; }

        const stream = recCanvas.captureStream(VIDEO_FPS);
        const mimeType = this._getSupportedMimeType();
        const recorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 8_000_000,
        });

        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        const recordingDone = new Promise<void>((resolve) => {
            recorder.onstop = () => {
                if (!this._cancelled) {
                    const blob = new Blob(chunks, { type: mimeType });
                    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
                    this._downloadBlob(blob, `drawination_timelapse_${this._timestamp()}.${ext}`);
                }
                resolve();
            };
        });

        recorder.start();

        // ── FASE 1: Resultado final — 2s ──────────────────────────────────
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(finalSnapshot, 0, 0);
        await this._sleep(INTRO_MS);
        if (this._cancelled) { recorder.stop(); await recordingDone; this._hideOverlay(); return; }

        // ── FASE 2: Fade a blanco — 0.5s ─────────────────────────────────
        await this._fadeToWhite(ctx, W, H, FADE_IN_MS);
        if (this._cancelled) { recorder.stop(); await recordingDone; this._hideOverlay(); return; }

        // ── FASE 3: Timelapse cronológico ─────────────────────────────────
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);

        // Estado mutable durante la reproducción
        const currentTransforms = new Map<string, DOMMatrix>();
        const hiddenIds = new Set<string>();
        let strokesDone = 0;

        for (const item of playlist) {
            if (this._cancelled) break;

            if (item.kind === 'draw') {
                const cmd = CommandFactory.create(item.event, this.activeBrush);
                const t = currentTransforms.get(item.event.id);
                if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];

                ctx.save();
                cmd.execute(ctx);
                ctx.restore();

                strokesDone++;
                this._updateProgress(strokesDone, drawCount);
                await this._sleep(msPerStroke);

            } else if (item.kind === 'transform') {
                // Aplicar transform en vivo: redibujar todo el canvas
                const newMatrix = new DOMMatrix(item.matrix);
                for (const id of item.targetIds) {
                    const current = currentTransforms.get(id) ?? new DOMMatrix();
                    currentTransforms.set(id, newMatrix.multiply(current));
                }

                // Redibujar canvas completo con las nuevas matrices
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, W, H);

                for (const pItem of playlist) {
                    if (pItem.kind !== 'draw') continue;
                    if (hiddenIds.has(pItem.event.id)) continue;
                    // Solo redibujar los que ya fueron pintados (antes del cursor actual)
                    const idx = playlist.indexOf(pItem);
                    const currentIdx = playlist.indexOf(item);
                    if (idx >= currentIdx) continue;

                    const cmd = CommandFactory.create(pItem.event, this.activeBrush);
                    const t = currentTransforms.get(pItem.event.id);
                    if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];
                    ctx.save();
                    cmd.execute(ctx);
                    ctx.restore();
                }

                // Pausa breve para que el transform sea visible
                await this._sleep(msPerStroke * 3);

            } else if (item.kind === 'hide') {
                for (const id of item.targetIds) hiddenIds.add(id);

                // Redibujar canvas sin los trazos ocultos
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, W, H);

                for (const pItem of playlist) {
                    if (pItem.kind !== 'draw') continue;
                    if (hiddenIds.has(pItem.event.id)) continue;
                    const idx = playlist.indexOf(pItem);
                    const currentIdx = playlist.indexOf(item);
                    if (idx >= currentIdx) continue;

                    const cmd = CommandFactory.create(pItem.event, this.activeBrush);
                    const t = currentTransforms.get(pItem.event.id);
                    if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];
                    ctx.save();
                    cmd.execute(ctx);
                    ctx.restore();
                }

                await this._sleep(msPerStroke * 2);
            }
        }

        if (this._cancelled) { recorder.stop(); await recordingDone; this._hideOverlay(); return; }

        // ── FASE 4: Fade a blanco — 0.5s ─────────────────────────────────
        await this._fadeToWhite(ctx, W, H, FADE_OUT_MS);
        if (this._cancelled) { recorder.stop(); await recordingDone; this._hideOverlay(); return; }

        // ── FASE 5: Marca de agua — 1.5s ──────────────────────────────────
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);
        this._drawWatermark(ctx, W, H);

        await this._sleepFrames(4);
        await this._sleep(WATERMARK_MS - 67);
        await this._sleepFrames(4);

        recorder.stop();
        await recordingDone;
        this._hideOverlay();
    }

    // ── Construcción de playlist cronológica ──────────────────────────────

    private async _buildPlaylist(spine: TimelineEvent[]): Promise<{ playlist: PlaylistItem[]; drawCount: number }> {
        const playlist: PlaylistItem[] = [];
        const hiddenByEnd = new Set<string>();
        let drawCount = 0;

        // Pre-calcular qué IDs están ocultos al final (para saber qué precargar)
        for (const ev of spine) {
            if (ev.type === 'HIDE' && ev.targetIds) {
                for (const id of ev.targetIds) hiddenByEnd.add(id);
            }
        }

        // Precargar datos de trazos visibles
        const drawingSpine = spine.filter(
            ev => ev.type === 'STROKE' || ev.type === 'ERASE' || ev.type === 'FILL'
        );
        const dataMap = await this._preloadAll(drawingSpine);

        // Construir playlist en orden cronológico
        let i = 0;
        while (i < spine.length) {
            const ev = spine[i];

            if (ev.type === 'STROKE' || ev.type === 'ERASE' || ev.type === 'FILL') {
                const data = dataMap.get(ev.id);
                if (data) {
                    playlist.push({
                        kind: 'draw',
                        event: { ...ev, data },
                        data,
                    });
                    drawCount++;
                }
                i++;

            } else if (ev.type === 'TRANSFORM' && ev.targetIds && ev.transformMatrix) {
                // Colapsar transforms consecutivos sobre el mismo grupo
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
                    matrix: [
                        currentMatrix.a, currentMatrix.b,
                        currentMatrix.c, currentMatrix.d,
                        currentMatrix.e, currentMatrix.f,
                    ],
                });

                i = j;

            } else if (ev.type === 'HIDE' && ev.targetIds) {
                playlist.push({
                    kind: 'hide',
                    targetIds: ev.targetIds,
                });
                i++;

            } else {
                i++;
            }
        }

        return { playlist, drawCount };
    }

    // ── Overlay de progreso ───────────────────────────────────────────────

    private _showOverlay(totalMs: number): void {
        const overlay = document.createElement('div');
        overlay.id = 'export-overlay';

        const totalSec = Math.round(totalMs / 1000);

        overlay.innerHTML = `
            <div class="export-card">
                <div class="export-spinner"></div>
                <div class="export-title">Exportando video</div>
                <div class="export-sub">Duración estimada: ~${totalSec}s</div>
                <div class="export-bar-wrap">
                    <div class="export-bar" id="export-bar"></div>
                </div>
                <div class="export-pct" id="export-pct">Preparando trazos…</div>
                <button class="export-cancel" id="export-cancel">Cancelar</button>
            </div>
        `;

        const style = document.createElement('style');
        style.id = 'export-overlay-styles';
        style.textContent = `
            #export-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.72);
                backdrop-filter: blur(6px);
                -webkit-backdrop-filter: blur(6px);
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .export-card {
                background: #1c1c1e;
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 16px;
                padding: 36px 40px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 14px;
                min-width: 320px;
                box-shadow: 0 24px 64px rgba(0,0,0,0.6);
            }
            .export-spinner {
                width: 36px;
                height: 36px;
                border: 3px solid rgba(255,255,255,0.12);
                border-top-color: #0066cc;
                border-radius: 50%;
                animation: export-spin 0.8s linear infinite;
            }
            @keyframes export-spin { to { transform: rotate(360deg); } }
            .export-title {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-size: 17px;
                font-weight: 600;
                color: #ffffff;
                letter-spacing: -0.2px;
            }
            .export-sub {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-size: 13px;
                color: rgba(255,255,255,0.45);
            }
            .export-bar-wrap {
                width: 240px;
                height: 4px;
                background: rgba(255,255,255,0.1);
                border-radius: 2px;
                overflow: hidden;
            }
            .export-bar {
                height: 100%;
                width: 0%;
                background: #0066cc;
                border-radius: 2px;
                transition: width 0.1s ease;
            }
            .export-pct {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-size: 12px;
                color: rgba(255,255,255,0.4);
                font-variant-numeric: tabular-nums;
            }
            .export-cancel {
                margin-top: 6px;
                padding: 8px 24px;
                background: rgba(255,255,255,0.07);
                border: 1px solid rgba(255,255,255,0.12);
                border-radius: 8px;
                color: rgba(255,255,255,0.6);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-size: 13px;
                cursor: pointer;
                transition: background 0.15s, color 0.15s;
            }
            .export-cancel:hover {
                background: rgba(231,76,60,0.2);
                border-color: rgba(231,76,60,0.4);
                color: #e74c3c;
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(overlay);
        this._overlay = overlay;

        document.getElementById('export-cancel')?.addEventListener('click', () => {
            this._cancelled = true;
            const btn = document.getElementById('export-cancel') as HTMLButtonElement;
            if (btn) { btn.textContent = 'Cancelando…'; btn.disabled = true; }
        });
    }

    private _updateProgress(done: number, total: number): void {
        const pct = Math.round((done / total) * 100);
        const bar = document.getElementById('export-bar');
        const label = document.getElementById('export-pct');
        if (bar) bar.style.width = `${pct}%`;
        if (label) label.textContent = `Trazo ${done} de ${total} (${pct}%)`;
    }

    private _hideOverlay(): void {
        this._overlay?.remove();
        this._overlay = null;
        document.getElementById('export-overlay-styles')?.remove();
    }

    // ── Helpers de render ─────────────────────────────────────────────────

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

    private async _fadeToWhite(
        ctx: CanvasRenderingContext2D,
        W: number,
        H: number,
        durationMs: number
    ): Promise<void> {
        const stepMs = durationMs / FADE_STEPS;
        const alphaStep = 1 / FADE_STEPS;

        for (let i = 1; i <= FADE_STEPS; i++) {
            ctx.save();
            ctx.globalAlpha = alphaStep * i;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
            await this._sleep(stepMs);
        }
    }

    private _drawWatermark(ctx: CanvasRenderingContext2D, W: number, H: number): void {
        const cx = W / 2;
        const cy = H / 2;

        ctx.beginPath();
        ctx.arc(cx - 128, cy - 2, 9, 0, Math.PI * 2);
        ctx.fillStyle = '#0066cc';
        ctx.fill();

        ctx.font = '500 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillStyle = '#1a1a1a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('DrawinationV2', cx + 18, cy);

        ctx.font = '400 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillStyle = '#888888';
        ctx.fillText('Built with Drawination V2', cx, cy + 46);

        ctx.font = '400 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillStyle = '#0066cc';
        ctx.fillText('drawinationv2.vercel.app', cx, cy + 70);
    }

    // ── Helpers genéricos ─────────────────────────────────────────────────

    private async _preloadAll(events: TimelineEvent[]): Promise<Map<string, ArrayBuffer>> {
        const dataMap = new Map<string, ArrayBuffer>();
        const idsNeeded: string[] = [];

        for (const ev of events) {
            if (ev.data) {
                dataMap.set(ev.id, ev.data);
            } else {
                idsNeeded.push(ev.id);
            }
        }

        if (idsNeeded.length > 0) {
            const batch = await this.storage.loadEventDataBatch(idsNeeded);
            for (const [id, buf] of batch.entries()) {
                dataMap.set(id, buf);
            }
        }

        return dataMap;
    }

    private _sleepFrames(n: number): Promise<void> {
        return new Promise((resolve) => {
            let remaining = n;
            const tick = () => {
                remaining--;
                if (remaining <= 0) resolve();
                else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
    }

    private _downloadCanvas(canvas: HTMLCanvasElement, filename: string, type: string): void {
        canvas.toBlob((blob) => {
            if (!blob) return;
            this._downloadBlob(blob, filename);
        }, type, 1.0);
    }

    private _downloadBlob(blob: Blob, filename: string): void {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    private _timestamp(): string {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    }

    private _sleep(ms: number): Promise<void> {
        return new Promise(r => setTimeout(r, Math.max(0, ms)));
    }

    private _isMediaRecorderSupported(): boolean {
        return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported !== undefined;
    }

    private _getSupportedMimeType(): string {
        const types = [
            'video/mp4;codecs=avc1',
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return 'video/webm';
    }
}