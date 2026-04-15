// src/history/TimelapseViewer.ts
import type { CanvasEngine } from '../core/engine/CanvasEngine';
import type { HistoryManager } from '../history/HistoryManager';
import type { BrushEngine } from '../core/render/BrushEngine';
import type { StorageManager } from '../storage/StorageManager';
import type { TimelineEvent } from './TimelineTypes';
import type { CanvasRebuilder } from '../core/render/CanvasRebuilder';
import { CommandFactory } from './commands/CommandFactory';
import { DEFAULT_BACKGROUND_COLOR } from './computeTimelineState';

const MS_PER_STROKE_BASE = 40;
const FADE_STEPS = 16;
const MAX_LAYERS = 10;
const SEEK_KEYFRAME_INTERVAL = 25;

interface SeekKeyframe {
    drawIndex: number;
    playlistIndex: number;
    bgColor: string;
    layerCreated: Set<number>;
    layerVisible: Map<number, boolean>;
    layerOrder: number[];
    currentTransforms: Map<string, number[]>;
    hiddenIds: Set<string>;
    layerSnapshots: Map<number, ImageData>;
}

interface DrawItem { kind: 'draw'; event: TimelineEvent; data: ArrayBuffer }
interface TransformItem { kind: 'transform'; targetIds: string[]; matrix: number[] }
interface DuplicateGroupItem { kind: 'duplicate-group'; events: TimelineEvent[] }
interface HideItem { kind: 'hide'; targetIds: string[] }
interface BgItem { kind: 'bg'; color: string }
interface LayerVisibilityItem { kind: 'layer-visibility'; layerIndex: number; visible: boolean }
interface LayerCreateItem { kind: 'layer-create'; layerIndex: number }
interface LayerDeleteItem { kind: 'layer-delete'; layerIndex: number }
interface LayerReorderItem { kind: 'layer-reorder'; layerOrder: number[] }

type PlaylistItem = DrawItem | TransformItem | DuplicateGroupItem | HideItem | BgItem | LayerVisibilityItem | LayerCreateItem | LayerDeleteItem | LayerReorderItem;

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

    private _layerCanvases: Map<number, HTMLCanvasElement> = new Map();
    private _layerVisible: Map<number, boolean> = new Map();
    private _layerCreated: Set<number> = new Set([0]);
    private _layerOrder: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

    private _resumeResolve: (() => void) | null = null;
    private _seekKeyframes: SeekKeyframe[] = [];

    constructor(engine: CanvasEngine, history: HistoryManager, activeBrush: BrushEngine, storage: StorageManager, rebuilder: CanvasRebuilder) {
        this.engine = engine;
        this.history = history;
        this.activeBrush = activeBrush;
        this.storage = storage;
        this.rebuilder = rebuilder;
    }

    public isPlaying(): boolean { return this._playing; }

    public async play(): Promise<void> {
        if (this._playing) return;

        const spine = this.history.getTimelineSpine();
        if (spine.length === 0) { alert('No hay trazos para reproducir.'); return; }

        this._playing = true;
        this._cancelled = false;
        this._paused = false;
        this._speed = 1;
        this._currentDraw = 0;
        this._seeking = false;

        const { playlist, drawCount, seekKeyframes } = await this._buildPlaylist(spine);
        this._playlist = playlist;
        this._drawCount = drawCount;
        this._seekKeyframes = seekKeyframes;

        if (drawCount === 0) { this._playing = false; return; }

        this._showOverlay();

        const W = this.engine.width;
        const H = this.engine.height;

        this._recCanvas = document.createElement('canvas');
        this._recCanvas.width = W;
        this._recCanvas.height = H;
        this._recCtx = this._recCanvas.getContext('2d')!;

        const canvasWrap = document.getElementById('tl-canvas-wrap');
        if (canvasWrap) {
            this._recCanvas.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:4px;';
            canvasWrap.appendChild(this._recCanvas);
        }

        const currentState = this.history.getState();
        this._layerCreated = new Set(currentState.createdLayers);
        this._layerOrder = [...currentState.layerOrder];
        this._layerVisible = new Map();

        this._layerCanvases.clear();
        for (let i = 0; i < MAX_LAYERS; i++) {
            const c = document.createElement('canvas');
            c.width = W; c.height = H;
            this._layerCanvases.set(i, c);
            this._layerVisible.set(i, currentState.layersState.get(i)?.visible ?? true);
        }

        const initialBg = currentState.backgroundColor ?? DEFAULT_BACKGROUND_COLOR;
        this._recCtx.fillStyle = initialBg;
        this._recCtx.fillRect(0, 0, W, H);

        this._layerCreated = new Set([0]);
        this._layerOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        for (let i = 0; i < MAX_LAYERS; i++) {
            this._layerVisible.set(i, true);
        }

        await this._reproduce();

        if (!this._cancelled) await this._showFinalResult();

        this._playing = false;
        this._hideOverlay();
        await this.rebuilder.rebuild(this.activeBrush);
    }

    private _composeLayers(bgColor: string): void {
        const ctx = this._recCtx!;
        const W = this._recCanvas!.width;
        const H = this._recCanvas!.height;

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, W, H);

        for (const layerIndex of this._layerOrder) {
            if (!this._layerCreated.has(layerIndex) || !this._layerVisible.get(layerIndex)) continue;

            const layerCanvas = this._layerCanvases.get(layerIndex);
            if (layerCanvas) {
                ctx.save();
                ctx.drawImage(layerCanvas, 0, 0);
                ctx.restore();
            }
        }
    }

    private async _seekTo(targetDrawIndex: number): Promise<void> {
        const W = this._recCanvas!.width;
        const H = this._recCanvas!.height;

        let bestKeyframe: SeekKeyframe | null = null;
        for (const kf of this._seekKeyframes) {
            if (kf.drawIndex <= targetDrawIndex) bestKeyframe = kf;
            else break;
        }

        if (bestKeyframe) {
            this._layerCreated = new Set(bestKeyframe.layerCreated);
            this._layerVisible = new Map(bestKeyframe.layerVisible);
            this._layerOrder = [...bestKeyframe.layerOrder];

            for (const [li, imageData] of bestKeyframe.layerSnapshots) {
                const lc = this._layerCanvases.get(li);
                if (lc) lc.getContext('2d')!.putImageData(imageData, 0, 0);
            }
            for (let i = 0; i < MAX_LAYERS; i++) {
                if (!bestKeyframe.layerSnapshots.has(i)) {
                    const lc = this._layerCanvases.get(i);
                    if (lc) lc.getContext('2d')!.clearRect(0, 0, W, H);
                }
            }
        } else {
            this._layerCreated = new Set([0]);
            this._layerVisible.clear();
            this._layerOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
            for (let i = 0; i < MAX_LAYERS; i++) {
                this._layerVisible.set(i, true);
                const lc = this._layerCanvases.get(i);
                if (lc) lc.getContext('2d')!.clearRect(0, 0, W, H);
            }
        }

        let bgColor = bestKeyframe?.bgColor ?? DEFAULT_BACKGROUND_COLOR;
        const currentTransforms = new Map<string, DOMMatrix>();
        const hiddenIds = new Set<string>(bestKeyframe?.hiddenIds ?? []);
        let drawsSeen = bestKeyframe?.drawIndex ?? 0;

        if (bestKeyframe) {
            for (const [id, mat] of bestKeyframe.currentTransforms) {
                currentTransforms.set(id, new DOMMatrix(mat));
            }
        }

        const startIndex = bestKeyframe?.playlistIndex ?? 0;
        for (let idx = startIndex; idx < this._playlist.length; idx++) {
            if (drawsSeen >= targetDrawIndex) break;
            const item = this._playlist[idx];

            if (item.kind === 'bg') {
                bgColor = item.color;
            } else if (item.kind === 'layer-visibility') {
                this._layerVisible.set(item.layerIndex, item.visible);
            } else if (item.kind === 'layer-create') {
                this._layerCreated.add(item.layerIndex);
            } else if (item.kind === 'layer-delete') {
                this._layerCreated.delete(item.layerIndex);
            } else if (item.kind === 'layer-reorder') {
                const uncreated = this._layerOrder.filter(id => !this._layerCreated.has(id));
                this._layerOrder = [...uncreated, ...item.layerOrder];
            } else if (item.kind === 'draw') {
                const layerCtx = this._layerCanvases.get(item.event.layerIndex ?? 0)?.getContext('2d');
                if (layerCtx && !hiddenIds.has(item.event.id)) {
                    const cmd = CommandFactory.create(item.event, this.activeBrush);
                    const t = currentTransforms.get(item.event.id);
                    if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];
                    layerCtx.save();
                    cmd.execute(layerCtx);
                    layerCtx.restore();
                }
                drawsSeen++;
            } else if (item.kind === 'duplicate-group') {
                for (const synEv of item.events) {
                    if (synEv.transformMatrix) {
                        currentTransforms.set(synEv.id, new DOMMatrix(synEv.transformMatrix));
                    }
                    const layerCtx = this._layerCanvases.get(synEv.layerIndex ?? 0)?.getContext('2d');
                    if (layerCtx && !hiddenIds.has(synEv.id)) {
                        const cmd = CommandFactory.create(synEv, this.activeBrush);
                        const t = currentTransforms.get(synEv.id);
                        if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];
                        layerCtx.save();
                        cmd.execute(layerCtx);
                        layerCtx.restore();
                    }
                }
                drawsSeen++;
            } else if (item.kind === 'transform') {
                const newMatrix = new DOMMatrix(item.matrix);
                for (const id of item.targetIds) {
                    const current = currentTransforms.get(id) ?? new DOMMatrix();
                    currentTransforms.set(id, newMatrix.multiply(current));
                }
            } else if (item.kind === 'hide') {
                for (const id of item.targetIds) hiddenIds.add(id);
            }
        }

        this._composeLayers(bgColor);
        this._currentDraw = targetDrawIndex;
        this._updateSlider();
    }

    private _findPlaylistIndexForDraw(targetDraw: number): number {
        let drawsSeen = 0;
        for (let i = 0; i < this._playlist.length; i++) {
            if (this._playlist[i].kind === 'draw' || this._playlist[i].kind === 'duplicate-group') {
                if (drawsSeen >= targetDraw) return i;
                drawsSeen++;
            }
        }
        return this._playlist.length;
    }

    private _reproduce(): Promise<void> {
        return new Promise<void>((resolveMain) => {
            const W = this.engine.width;

            const currentTransforms = new Map<string, DOMMatrix>();
            const hiddenIds = new Set<string>();
            let currentBg = this.history.getState().backgroundColor ?? DEFAULT_BACKGROUND_COLOR;
            let playlistIdx = 0;

            let lastTimestamp: number | null = null;
            let accumulated = 0;

            const tick = async (timestamp: number) => {
                if (this._cancelled) { resolveMain(); return; }

                if (this._seeking) {
                    this._seeking = false;
                    const targetDraw = this._currentDraw;
                    await this._seekTo(targetDraw);
                    playlistIdx = this._findPlaylistIndexForDraw(targetDraw);

                    currentTransforms.clear();
                    hiddenIds.clear();
                    currentBg = DEFAULT_BACKGROUND_COLOR;

                    for (const pi of this._playlist.slice(0, playlistIdx)) {
                        if (pi.kind === 'bg') currentBg = pi.color;
                        else if (pi.kind === 'duplicate-group') {
                            for (const synEv of pi.events) {
                                if (synEv.transformMatrix) {
                                    currentTransforms.set(synEv.id, new DOMMatrix(synEv.transformMatrix));
                                }
                            }
                        } else if (pi.kind === 'transform') {
                            const m = new DOMMatrix(pi.matrix);
                            for (const id of pi.targetIds) {
                                currentTransforms.set(id, m.multiply(currentTransforms.get(id) ?? new DOMMatrix()));
                            }
                        } else if (pi.kind === 'hide') {
                            for (const id of pi.targetIds) hiddenIds.add(id);
                        }
                    }

                    lastTimestamp = null;
                    accumulated = 0;
                    requestAnimationFrame(tick);
                    return;
                }

                if (this._paused) {
                    await this._waitIfPaused();
                    if (this._cancelled) { resolveMain(); return; }
                    lastTimestamp = null;
                    accumulated = 0;
                    requestAnimationFrame(tick);
                    return;
                }

                if (playlistIdx >= this._playlist.length) { resolveMain(); return; }

                const msPerStroke = MS_PER_STROKE_BASE / this._speed;
                if (lastTimestamp !== null) {
                    accumulated += timestamp - lastTimestamp;
                } else {
                    accumulated = msPerStroke;
                }
                lastTimestamp = timestamp;

                while (playlistIdx < this._playlist.length && accumulated >= msPerStroke) {
                    if (this._cancelled || this._seeking || this._paused) break;

                    const item = this._playlist[playlistIdx];
                    playlistIdx++;

                    if (item.kind === 'bg') {
                        currentBg = item.color;
                        this._composeLayers(currentBg);
                        accumulated -= msPerStroke * 2;

                    } else if (item.kind === 'layer-visibility') {
                        this._layerVisible.set(item.layerIndex, item.visible);
                        this._composeLayers(currentBg);
                        accumulated -= msPerStroke;

                    } else if (item.kind === 'layer-create') {
                        this._layerCreated.add(item.layerIndex);
                        this._composeLayers(currentBg);
                        accumulated -= msPerStroke;

                    } else if (item.kind === 'layer-delete') {
                        this._layerCreated.delete(item.layerIndex);
                        this._composeLayers(currentBg);
                        accumulated -= msPerStroke;

                    } else if (item.kind === 'layer-reorder') {
                        const uncreated = this._layerOrder.filter(id => !this._layerCreated.has(id));
                        this._layerOrder = [...uncreated, ...item.layerOrder];
                        this._composeLayers(currentBg);
                        accumulated -= msPerStroke;

                    } else if (item.kind === 'draw') {
                        const layerIdx = item.event.layerIndex ?? 0;
                        const layerCanvas = this._layerCanvases.get(layerIdx);
                        const layerCtx = layerCanvas?.getContext('2d');

                        if (layerCtx && !hiddenIds.has(item.event.id)) {
                            const cmd = CommandFactory.create(item.event, this.activeBrush);
                            const t = currentTransforms.get(item.event.id);
                            if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];
                            layerCtx.save();
                            cmd.execute(layerCtx);
                            layerCtx.restore();
                        }

                        this._composeLayers(currentBg);
                        this._currentDraw++;
                        this._updateSlider();
                        accumulated -= msPerStroke;

                    } else if (item.kind === 'duplicate-group') {
                        // Dibujar instantáneamente todo el grupo
                        for (const synEv of item.events) {
                            if (synEv.transformMatrix) {
                                currentTransforms.set(synEv.id, new DOMMatrix(synEv.transformMatrix));
                            }
                            const layerCtx = this._layerCanvases.get(synEv.layerIndex ?? 0)?.getContext('2d');
                            if (layerCtx && !hiddenIds.has(synEv.id)) {
                                const cmd = CommandFactory.create(synEv, this.activeBrush);
                                const t = currentTransforms.get(synEv.id);
                                if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];
                                layerCtx.save();
                                cmd.execute(layerCtx);
                                layerCtx.restore();
                            }
                        }

                        this._composeLayers(currentBg);
                        this._currentDraw++;
                        this._updateSlider();
                        accumulated -= msPerStroke;

                    } else if (item.kind === 'transform') {
                        const newMatrix = new DOMMatrix(item.matrix);
                        for (const id of item.targetIds) {
                            const current = currentTransforms.get(id) ?? new DOMMatrix();
                            currentTransforms.set(id, newMatrix.multiply(current));
                        }

                        for (let li = 0; li < MAX_LAYERS; li++) {
                            const lc = this._layerCanvases.get(li);
                            if (lc) lc.getContext('2d')!.clearRect(0, 0, W, this._recCanvas!.height);
                        }

                        let drawsSeen = 0;
                        for (const pi of this._playlist.slice(0, playlistIdx)) {
                            if (pi.kind === 'draw') {
                                if (hiddenIds.has(pi.event.id)) { drawsSeen++; continue; }
                                if (drawsSeen >= this._currentDraw) break;

                                const li = pi.event.layerIndex ?? 0;
                                const lctx = this._layerCanvases.get(li)?.getContext('2d');
                                if (lctx) {
                                    const cmd = CommandFactory.create(pi.event, this.activeBrush);
                                    const t = currentTransforms.get(pi.event.id);
                                    if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];
                                    lctx.save();
                                    cmd.execute(lctx);
                                    lctx.restore();
                                }
                                drawsSeen++;
                            } else if (pi.kind === 'duplicate-group') {
                                if (drawsSeen >= this._currentDraw) break;
                                for (const synEv of pi.events) {
                                    if (hiddenIds.has(synEv.id)) continue;
                                    const li = synEv.layerIndex ?? 0;
                                    const lctx = this._layerCanvases.get(li)?.getContext('2d');
                                    if (lctx) {
                                        const cmd = CommandFactory.create(synEv, this.activeBrush);
                                        const t = currentTransforms.get(synEv.id);
                                        if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];
                                        lctx.save();
                                        cmd.execute(lctx);
                                        lctx.restore();
                                    }
                                }
                                drawsSeen++;
                            }
                        }

                        this._composeLayers(currentBg);
                        accumulated -= msPerStroke * 3;

                    } else if (item.kind === 'hide') {
                        for (const id of item.targetIds) hiddenIds.add(id);

                        for (let li = 0; li < MAX_LAYERS; li++) {
                            const lc = this._layerCanvases.get(li);
                            if (lc) lc.getContext('2d')!.clearRect(0, 0, W, this._recCanvas!.height);
                        }

                        let drawsSeen = 0;
                        for (const pi of this._playlist.slice(0, playlistIdx)) {
                            if (pi.kind === 'draw') {
                                if (drawsSeen >= this._currentDraw) break;
                                if (hiddenIds.has(pi.event.id)) { drawsSeen++; continue; }

                                const li = pi.event.layerIndex ?? 0;
                                const lctx = this._layerCanvases.get(li)?.getContext('2d');
                                if (lctx) {
                                    const cmd = CommandFactory.create(pi.event, this.activeBrush);
                                    const t = currentTransforms.get(pi.event.id);
                                    if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];
                                    lctx.save();
                                    cmd.execute(lctx);
                                    lctx.restore();
                                }
                                drawsSeen++;
                            } else if (pi.kind === 'duplicate-group') {
                                if (drawsSeen >= this._currentDraw) break;
                                for (const synEv of pi.events) {
                                    if (hiddenIds.has(synEv.id)) continue;
                                    const li = synEv.layerIndex ?? 0;
                                    const lctx = this._layerCanvases.get(li)?.getContext('2d');
                                    if (lctx) {
                                        const cmd = CommandFactory.create(synEv, this.activeBrush);
                                        const t = currentTransforms.get(synEv.id);
                                        if (t) cmd.transform = [t.a, t.b, t.c, t.d, t.e, t.f];
                                        lctx.save();
                                        cmd.execute(lctx);
                                        lctx.restore();
                                    }
                                }
                                drawsSeen++;
                            }
                        }

                        this._composeLayers(currentBg);
                        accumulated -= msPerStroke * 2;
                    }
                }

                requestAnimationFrame(tick);
            };

            requestAnimationFrame(tick);
        });
    }

    private async _showFinalResult(): Promise<void> {
        const W = this.engine.width;
        const H = this.engine.height;
        const { backgroundColor, layersState, layerOrder } = this.history.getState();

        const snap = document.createElement('canvas');
        snap.width = W;
        snap.height = H;
        const sCtx = snap.getContext('2d')!;

        sCtx.fillStyle = backgroundColor ?? DEFAULT_BACKGROUND_COLOR;
        sCtx.fillRect(0, 0, W, H);

        for (const i of layerOrder) {
            const layerState = layersState.get(i);
            if (!layerState?.visible) continue;

            sCtx.save();
            sCtx.globalAlpha = layerState.opacity;
            sCtx.drawImage(this.engine.getLayerCanvas(i), 0, 0);
            sCtx.restore();
        }

        const alphaStep = 1 / FADE_STEPS;
        for (let j = 1; j <= FADE_STEPS; j++) {
            this._recCtx!.save();
            this._recCtx!.globalAlpha = alphaStep * j;
            this._recCtx!.drawImage(snap, 0, 0);
            this._recCtx!.restore();
            await this._sleep(500 / FADE_STEPS);
        }
        await this._sleep(1500);
    }

    private _showOverlay(): void {
        const overlay = document.createElement('div');
        overlay.id = 'tl-overlay';
        overlay.innerHTML = `
            <div id="tl-header">
                <span id="tl-title">Timelapse</span>
                <button id="tl-close" title="Cerrar">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M2 2L16 16M16 2L2 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
            <div id="tl-canvas-wrap"></div>
            <div id="tl-controls">
                <button id="tl-playpause">
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
                        <span id="tl-current">0</span> / <span id="tl-total">0</span> trazos
                    </div>
                </div>
                <div id="tl-speed-wrap">
                    <button class="tl-speed-btn tl-speed-active" data-speed="1">1×</button>
                    <button class="tl-speed-btn" data-speed="2">2×</button>
                    <button class="tl-speed-btn" data-speed="4">4×</button>
                </div>
            </div>`;

        const style = document.createElement('style');
        style.id = 'tl-styles';
        style.textContent = `
            #tl-overlay { position:fixed;inset:0;background:#0a0a0a;z-index:999999;display:flex;flex-direction:column;align-items:center;user-select:none; }
            #tl-header { width:100%;display:flex;align-items:center;justify-content:space-between;padding:16px 24px;flex-shrink:0; }
            #tl-title { font-family:-apple-system,sans-serif;font-size:14px;font-weight:500;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.5px; }
            #tl-close { width:36px;height:36px;border:none;background:rgba(255,255,255,0.07);border-radius:8px;color:rgba(255,255,255,0.5);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s,color 0.15s; }
            #tl-close:hover { background:rgba(255,255,255,0.12);color:#fff; }
            #tl-canvas-wrap { flex:1;width:100%;display:flex;align-items:center;justify-content:center;padding:0 24px;min-height:0; }
            #tl-canvas-wrap canvas { max-width:100%;max-height:100%;border-radius:4px;box-shadow:0 0 0 1px rgba(255,255,255,0.06),0 24px 64px rgba(0,0,0,0.6); }
            #tl-controls { width:100%;max-width:900px;display:flex;align-items:center;gap:16px;padding:20px 24px 28px;flex-shrink:0; }
            #tl-playpause { width:40px;height:40px;border:none;background:rgba(255,255,255,0.1);border-radius:50%;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background 0.15s; }
            #tl-playpause:hover { background:rgba(255,255,255,0.18); }
            #tl-slider-wrap { flex:1;display:flex;flex-direction:column;gap:8px; }
            #tl-slider-track { position:relative;height:4px;background:rgba(255,255,255,0.15);border-radius:2px;cursor:pointer;padding:10px 0;margin:-10px 0; }
            #tl-slider-fill { position:absolute;left:0;top:10px;height:4px;width:0%;background:#fff;border-radius:2px;pointer-events:none;transition:width 0.08s linear; }
            #tl-slider-thumb { position:absolute;top:50%;left:0%;width:14px;height:14px;background:#fff;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;transition:left 0.08s linear;box-shadow:0 0 0 3px rgba(255,255,255,0.15); }
            #tl-slider-track:hover #tl-slider-fill { background:#0066cc; }
            #tl-slider-track:hover #tl-slider-thumb { background:#0066cc;box-shadow:0 0 0 4px rgba(0,102,204,0.3);transform:translate(-50%,-50%) scale(1.2); }
            #tl-time { font-family:-apple-system,sans-serif;font-size:12px;color:rgba(255,255,255,0.35);font-variant-numeric:tabular-nums; }
            #tl-speed-wrap { display:flex;gap:4px;flex-shrink:0; }
            .tl-speed-btn { padding:6px 10px;border:1px solid rgba(255,255,255,0.12);background:transparent;border-radius:6px;color:rgba(255,255,255,0.4);font-family:-apple-system,sans-serif;font-size:12px;cursor:pointer;transition:all 0.15s; }
            .tl-speed-btn:hover { background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7); }
            .tl-speed-active { background:rgba(255,255,255,0.12)!important;border-color:rgba(255,255,255,0.3)!important;color:#fff!important; }`;

        document.head.appendChild(style);
        document.body.appendChild(overlay);
        this._overlay = overlay;

        const totalEl = document.getElementById('tl-total');
        if (totalEl) totalEl.textContent = String(this._drawCount);

        document.getElementById('tl-close')?.addEventListener('click', () => { this._cancelled = true; this._resumeResolve?.(); });
        document.getElementById('tl-playpause')?.addEventListener('click', () => this._togglePause());

        document.querySelectorAll('.tl-speed-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._speed = parseFloat((btn as HTMLElement).dataset.speed || '1');
                document.querySelectorAll('.tl-speed-btn').forEach(b => b.classList.remove('tl-speed-active'));
                btn.classList.add('tl-speed-active');
                if (this._paused) this._togglePause();
            });
        });

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
            this._currentDraw = getTargetDraw(clientX);
            this._seeking = true;
            this._updateSlider();
            if (!this._paused) { this._paused = true; this._updatePauseIcon(); }
            this._resumeResolve?.();
        };

        track.addEventListener('click', (e) => doSeek(e.clientX));

        let dragging = false;
        track.addEventListener('mousedown', (e) => { dragging = true; doSeek(e.clientX); e.preventDefault(); });
        window.addEventListener('mousemove', (e) => { if (dragging) doSeek(e.clientX); });
        window.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            if (this._paused) { this._paused = false; this._updatePauseIcon(); this._resumeResolve?.(); }
        });
    }

    private _togglePause(): void {
        this._paused = !this._paused;
        this._updatePauseIcon();
        if (!this._paused) this._resumeResolve?.();
    }

    private _updatePauseIcon(): void {
        const pauseIcon = document.getElementById('tl-pause-icon');
        const playIcon = document.getElementById('tl-play-icon');
        if (this._paused) { pauseIcon && (pauseIcon.style.display = 'none'); playIcon && (playIcon.style.display = 'block'); }
        else { pauseIcon && (pauseIcon.style.display = 'block'); playIcon && (playIcon.style.display = 'none'); }
    }

    private _waitIfPaused(): Promise<void> {
        if (!this._paused) return Promise.resolve();
        return new Promise((resolve) => { this._resumeResolve = resolve; });
    }

    private _updateSlider(): void {
        const pct = this._drawCount > 0 ? (this._currentDraw / this._drawCount) * 100 : 0;
        const fill = document.getElementById('tl-slider-fill');
        const thumb = document.getElementById('tl-slider-thumb');
        const current = document.getElementById('tl-current');
        if (fill) fill.style.width = `${pct}%`;
        if (thumb) thumb.style.left = `${pct}%`;
        if (current) current.textContent = String(this._currentDraw);
    }

    private _hideOverlay(): void {
        window.removeEventListener('mousemove', () => { });
        window.removeEventListener('mouseup', () => { });
        this._overlay?.remove();
        this._overlay = null;
        document.getElementById('tl-styles')?.remove();
        this._recCanvas = null;
        this._recCtx = null;
        this._layerCanvases.clear();
    }

    private async _buildPlaylist(spine: TimelineEvent[]): Promise<{ playlist: PlaylistItem[]; drawCount: number; seekKeyframes: SeekKeyframe[] }> {
        const playlist: PlaylistItem[] = [];
        let drawCount = 0;

        const kfLayerCreated: Set<number> = new Set([0]);
        const kfLayerVisible: Map<number, boolean> = new Map(Array.from({ length: MAX_LAYERS }, (_, i) => [i, true]));
        const kfLayerOrder: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        const kfTransforms: Map<string, number[]> = new Map();
        const kfHiddenIds: Set<string> = new Set();
        let kfBgColor = DEFAULT_BACKGROUND_COLOR;

        const W = this.engine.width;
        const H = this.engine.height;
        const kfLayerCanvases: Map<number, HTMLCanvasElement> = new Map();
        for (let i = 0; i < MAX_LAYERS; i++) {
            const c = document.createElement('canvas');
            c.width = W; c.height = H;
            kfLayerCanvases.set(i, c);
        }

        const seekKeyframes: SeekKeyframe[] = [];
        const drawingSpine = spine.filter(ev => ev.type === 'STROKE' || ev.type === 'ERASE' || ev.type === 'FILL' || ev.type === 'DUPLICATE_GROUP');
        const dataMap = await this._preloadAll(drawingSpine);

        let i = 0;
        while (i < spine.length) {
            const ev = spine[i];

            if (ev.type === 'DUPLICATE_GROUP' && ev.clonePayloads) {
                const syntheticEvents: TimelineEvent[] = [];
                for (const payload of ev.clonePayloads) {
                    const syntheticEvent: TimelineEvent = {
                        id: payload.id,
                        type: 'STROKE',
                        toolId: 'duplicate',
                        profileId: payload.profileId,
                        layerIndex: ev.layerIndex,
                        timestamp: ev.timestamp,
                        color: payload.color,
                        size: payload.size,
                        opacity: payload.opacity,
                        data: payload.data,
                        bbox: payload.bbox,
                        transformMatrix: payload.matrix,
                        isSaved: true,
                    };
                    syntheticEvents.push(syntheticEvent);

                    if (payload.matrix) {
                        kfTransforms.set(payload.id, payload.matrix);
                    }

                    if (!kfHiddenIds.has(payload.id)) {
                        const lc = kfLayerCanvases.get(ev.layerIndex ?? 0);
                        const lctx = lc?.getContext('2d');
                        if (lctx) {
                            const cmd = CommandFactory.create(syntheticEvent, this.activeBrush);
                            if (payload.matrix) cmd.transform = payload.matrix;
                            lctx.save();
                            cmd.execute(lctx);
                            lctx.restore();
                        }
                    }
                }

                playlist.push({ kind: 'duplicate-group', events: syntheticEvents });
                drawCount++;

                if (drawCount % SEEK_KEYFRAME_INTERVAL === 0) {
                    const layerSnapshots = new Map<number, ImageData>();
                    for (const [li, lc] of kfLayerCanvases) {
                        const lctx = lc.getContext('2d')!;
                        layerSnapshots.set(li, lctx.getImageData(0, 0, W, H));
                    }
                    seekKeyframes.push({
                        drawIndex: drawCount,
                        playlistIndex: playlist.length,
                        bgColor: kfBgColor,
                        layerCreated: new Set(kfLayerCreated),
                        layerVisible: new Map(kfLayerVisible),
                        layerOrder: [...kfLayerOrder],
                        currentTransforms: new Map(kfTransforms),
                        hiddenIds: new Set(kfHiddenIds),
                        layerSnapshots,
                    });
                }
                i++;
                continue;
            }

            if (ev.type === 'STROKE' || ev.type === 'ERASE' || ev.type === 'FILL') {
                const data = dataMap.get(ev.id);
                if (data) {
                    if (!kfHiddenIds.has(ev.id)) {
                        const lc = kfLayerCanvases.get(ev.layerIndex ?? 0);
                        const lctx = lc?.getContext('2d');
                        if (lctx) {
                            const cmd = CommandFactory.create({ ...ev, data }, this.activeBrush);
                            const mat = kfTransforms.get(ev.id);
                            if (mat) cmd.transform = mat;
                            lctx.save();
                            cmd.execute(lctx);
                            lctx.restore();
                        }
                    }

                    playlist.push({ kind: 'draw', event: { ...ev, data }, data });
                    drawCount++;

                    if (drawCount % SEEK_KEYFRAME_INTERVAL === 0) {
                        const layerSnapshots = new Map<number, ImageData>();
                        for (const [li, lc] of kfLayerCanvases) {
                            const lctx = lc.getContext('2d')!;
                            layerSnapshots.set(li, lctx.getImageData(0, 0, W, H));
                        }
                        seekKeyframes.push({
                            drawIndex: drawCount,
                            playlistIndex: playlist.length,
                            bgColor: kfBgColor,
                            layerCreated: new Set(kfLayerCreated),
                            layerVisible: new Map(kfLayerVisible),
                            layerOrder: [...kfLayerOrder],
                            currentTransforms: new Map(kfTransforms),
                            hiddenIds: new Set(kfHiddenIds),
                            layerSnapshots,
                        });
                    }
                }
                i++;

            } else if (ev.type === 'BACKGROUND_COLOR' && ev.backgroundColor) {
                kfBgColor = ev.backgroundColor;
                playlist.push({ kind: 'bg', color: ev.backgroundColor });
                i++;

            } else if (ev.type === 'LAYER_VISIBILITY') {
                kfLayerVisible.set(ev.layerIndex, ev.visible ?? true);
                playlist.push({ kind: 'layer-visibility', layerIndex: ev.layerIndex, visible: ev.visible ?? true });
                i++;

            } else if (ev.type === 'LAYER_CREATE') {
                kfLayerCreated.add(ev.layerIndex);
                playlist.push({ kind: 'layer-create', layerIndex: ev.layerIndex });
                i++;

            } else if (ev.type === 'LAYER_DELETE') {
                kfLayerCreated.delete(ev.layerIndex);
                playlist.push({ kind: 'layer-delete', layerIndex: ev.layerIndex });
                i++;

            } else if (ev.type === 'LAYER_REORDER' && ev.layerOrder) {
                const uncreated = kfLayerOrder.filter(id => !kfLayerCreated.has(id));
                kfLayerOrder.splice(0, kfLayerOrder.length, ...uncreated, ...ev.layerOrder);
                playlist.push({ kind: 'layer-reorder', layerOrder: ev.layerOrder });
                i++;

            } else if (ev.type === 'TRANSFORM' && ev.targetIds && ev.transformMatrix) {
                let currentMatrix = new DOMMatrix(ev.transformMatrix);
                const sortedIds = ev.targetIds.slice().sort().join(',');
                let j = i + 1;
                while (j < spine.length && spine[j].type === 'TRANSFORM' && spine[j].targetIds!.slice().sort().join(',') === sortedIds) {
                    currentMatrix = new DOMMatrix(spine[j].transformMatrix).multiply(currentMatrix);
                    j++;
                }
                const matArr = [currentMatrix.a, currentMatrix.b, currentMatrix.c, currentMatrix.d, currentMatrix.e, currentMatrix.f];
                for (const id of ev.targetIds) kfTransforms.set(id, matArr);
                playlist.push({ kind: 'transform', targetIds: ev.targetIds, matrix: matArr });
                i = j;

            } else if (ev.type === 'HIDE' && ev.targetIds) {
                for (const id of ev.targetIds) kfHiddenIds.add(id);
                playlist.push({ kind: 'hide', targetIds: ev.targetIds });
                i++;

            } else {
                i++;
            }
        }

        return { playlist, drawCount, seekKeyframes };
    }

    private async _preloadAll(events: TimelineEvent[]): Promise<Map<string, ArrayBuffer>> {
        const dataMap = new Map<string, ArrayBuffer>();
        const idsNeeded: string[] = [];

        for (const ev of events) {
            if (ev.type === 'DUPLICATE_GROUP' && ev.clonePayloads) {
                for (const payload of ev.clonePayloads) {
                    if (payload.data) dataMap.set(payload.id, payload.data);
                }
            } else if (ev.data) {
                dataMap.set(ev.id, ev.data);
            } else {
                idsNeeded.push(ev.id);
            }
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