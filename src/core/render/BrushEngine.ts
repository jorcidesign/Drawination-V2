// src/core/render/BrushEngine.ts
import type { BasePoint } from '../../input/InputManager';
import type { StrokePoint } from '../io/BinarySerializer';
import type { IBrushProfile } from './profiles/IBrushProfile';
import type { IBrushRenderer } from './renderers/IBrushRenderer';

import { BasicRenderer } from './renderers/BasicRenderer';
import { FillRenderer } from './renderers/FillRenderer';
import { PaintRenderer } from './renderers/PaintRenderer';
import { HardRoundRenderer } from './renderers/HardRoundRenderer';
import { InkRenderer } from './renderers/InkRenderer';
import { AirbrushRenderer } from './renderers/AirbrushRenderer';
import { CharcoalRenderer } from './renderers/CharcoalRenderer';
import { StylizedRenderer } from './renderers/StylizedRenderer';

export class BrushEngine {
    public color: string = '#2c3e50';
    public profile: IBrushProfile;
    public lastDrawingProfile: IBrushProfile;

    private toolStates: Map<string, IBrushProfile> = new Map();
    private toolColors: Map<string, string> = new Map();

    private lastPoint: BasePoint | null = null;
    private leftoverDistance: number = 0;
    private points: BasePoint[] = [];

    private renderers: Map<string, IBrushRenderer> = new Map();

    // Canvas offscreen reutilizable para reproduceStroke two-pass.
    // Se redimensiona solo si hace falta — evita allocaciones por trazo.
    private _offscreen: HTMLCanvasElement | null = null;
    private _offscreenCtx: CanvasRenderingContext2D | null = null;

    constructor(initialProfile: IBrushProfile) {
        this.profile = { ...initialProfile };
        this.lastDrawingProfile = { ...initialProfile };

        this.renderers.set('basic', new BasicRenderer());
        this.renderers.set('fill', new FillRenderer());
        this.renderers.set('paint', new PaintRenderer());
        this.renderers.set('hard-round', new HardRoundRenderer());
        this.renderers.set('ink', new InkRenderer());
        this.renderers.set('airbrush', new AirbrushRenderer());
        this.renderers.set('charcoal', new CharcoalRenderer());
        this.renderers.set('stylized', new StylizedRenderer());

        this.getRenderer().updateTip?.(this.profile, this.color);
    }

    private getRenderer(): IBrushRenderer {
        const renderer = this.renderers.get(this.profile.renderer);
        if (!renderer) throw new Error(`Renderer ${this.profile.renderer} no encontrado`);
        return renderer;
    }

    // Pinceles que necesitan two-pass en el rebuild (igual que en live drawing).
    // En live usan paintingCanvas → commit. En rebuild necesitan su propio
    // offscreen temporal para que los stamps no interactúen con píxeles
    // ya existentes de otros trazos en el activeLayerContext.
    // private _needsTwoPass(): boolean {
    //     const r = this.profile.renderer;

    //     // El eraser usa blendMode='destination-out'. En two-pass, los stamps
    //     // van al offscreen (fondo transparente) y el drawImage final no borra
    //     // nada del layer real — destination-out sobre transparente es no-op.
    //     // Debe ir directo al ctx, igual que 'ink'.
    //     if (this.profile.blendMode === 'destination-out') return false;

    //     return r === 'airbrush' || r === 'hard-round' || r === 'basic' || r === 'charcoal' || r === 'paint';
    // }

    private _getOffscreen(width: number, height: number): CanvasRenderingContext2D {
        if (!this._offscreen) {
            this._offscreen = document.createElement('canvas');
            this._offscreen.width = width;
            this._offscreen.height = height;
            this._offscreenCtx = this._offscreen.getContext('2d')!;
        } else if (this._offscreen.width !== width || this._offscreen.height !== height) {
            this._offscreen.width = width;
            this._offscreen.height = height;
        } else {
            this._offscreenCtx!.clearRect(0, 0, width, height);
        }
        return this._offscreenCtx!;
    }

    public useProfile(baseProfile: IBrushProfile) {
        if (!this.toolStates.has(baseProfile.id)) {
            this.toolStates.set(baseProfile.id, { ...baseProfile });
            this.toolColors.set(baseProfile.id, this.color);
        }
        this.profile = this.toolStates.get(baseProfile.id)!;
        this.color = this.toolColors.get(baseProfile.id)!;

        if (this.profile.id !== 'eraser-hard') {
            this.lastDrawingProfile = this.profile;
        }

        this._refreshTip();
    }

    public setProfile(profile: IBrushProfile) {
        this.useProfile(profile);
    }

    public updateCurrentSize(size: number) {
        this.profile.baseSize = size;
        if (this.lastDrawingProfile.id === this.profile.id) {
            this.lastDrawingProfile = this.profile;
        }
        this._refreshTip();
    }

    public updateCurrentOpacity(opacity: number) {
        this.profile.baseOpacity = opacity;
        if (this.lastDrawingProfile.id === this.profile.id) {
            this.lastDrawingProfile = this.profile;
        }
        this._refreshTip();
    }

    public setColor(color: string) {
        this.color = color;
        this.toolColors.set(this.profile.id, color);
        this._refreshTip();
    }

    private _refreshTip(): void {
        const renderer = this.getRenderer();
        renderer.forceInvalidateTip?.();
        renderer.updateTip?.(this.profile, this.color);
    }

    public beginStroke(ctx: CanvasRenderingContext2D, data: BasePoint): void {
        this.lastPoint = { ...data };
        this.points = [data];
        this.leftoverDistance = 0;

        const renderer = this.getRenderer();
        renderer.beginStroke(this.profile, this.color, data);

        if (this.profile.renderer === 'fill') return;

        ctx.save();
        ctx.globalCompositeOperation = this.profile.blendMode;
        renderer.stamp(ctx, this.profile, this.color, data.x, data.y, data.pressure);
        ctx.restore();
    }

    public drawMove(ctx: CanvasRenderingContext2D, rawData: BasePoint, isLivePreview: boolean = false): void {
        if (!this.lastPoint) return;

        const renderer = this.getRenderer();
        const data = renderer.transformInput ? renderer.transformInput(this.profile, rawData) : rawData;

        this.points.push(data);
        if (renderer.drawMoveLive && isLivePreview) {
            renderer.drawMoveLive(ctx, this.profile, this.color, this.points);
            return;
        }

        const smoothFactor = 1 - this.profile.smoothing;
        const currentPressure = smoothFactor * data.pressure + (1 - smoothFactor) * this.lastPoint.pressure;
        const dx = data.x - this.lastPoint.x;
        const dy = data.y - this.lastPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const baseStep = Math.max(1.0, this.profile.baseSize * this.profile.spacing);
        const step = renderer.getStep
            ? renderer.getStep(this.profile, baseStep, currentPressure, dx, dy)
            : baseStep;

        let traveled = step - this.leftoverDistance;

        if (traveled <= distance) {
            ctx.save();
            ctx.globalCompositeOperation = this.profile.blendMode;
            while (traveled <= distance) {
                const t = distance > 0 ? traveled / distance : 0;
                const stampX = this.lastPoint.x + dx * t;
                const stampY = this.lastPoint.y + dy * t;
                const stampP = this.lastPoint.pressure + (currentPressure - this.lastPoint.pressure) * t;
                renderer.stamp(ctx, this.profile, this.color, stampX, stampY, stampP);
                traveled += step;
            }
            ctx.restore();
        }

        this.leftoverDistance = distance - (traveled - step);
        this.lastPoint = { ...data, pressure: currentPressure };
    }

    public endStroke(ctx?: CanvasRenderingContext2D): void {
        const renderer = this.getRenderer();
        if (ctx) renderer.endStroke(ctx, this.profile, this.color, this.points);
        this.lastPoint = null;
        this.points = [];
        this.leftoverDistance = 0;
    }

    public reproduceStroke(
        ctx: CanvasRenderingContext2D,
        actionProfile: IBrushProfile,
        actionColor: string,
        actionSize: number,
        actionOpacity: number,
        decodedPoints: StrokePoint[]
    ): void {
        if (decodedPoints.length === 0) return;

        const prevColor = this.color;
        const prevProfile = this.profile;

        this.profile = { ...actionProfile, baseSize: actionSize, baseOpacity: actionOpacity };
        this.color = actionColor;

        const renderer = this.getRenderer();
        renderer.forceInvalidateTip?.();
        renderer.updateTip?.(this.profile, this.color);

        // ── INVERSIÓN DE CONTROL ─────────────────────────────────────────────
        // Le pasamos las herramientas al renderer para que él decida cómo redibujar.
        const helpers = {
            getOffscreenCanvas: (w: number, h: number) => this._getOffscreen(w, h),
            simulateDrawing: (targetCtx: CanvasRenderingContext2D) => {
                this.beginStroke(targetCtx, decodedPoints[0]);
                for (let i = 1; i < decodedPoints.length; i++) {
                    this.drawMove(targetCtx, decodedPoints[i], false);
                }
                this.endStroke(targetCtx);
            }
        };

        if (renderer.rebuildStroke) {
            renderer.rebuildStroke(ctx, this.profile, this.color, decodedPoints, helpers);
        } else {
            // Fallback por defecto (One-Pass puro) si un renderer no define estrategia
            ctx.save();
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'source-over';
            helpers.simulateDrawing(ctx);
            ctx.restore();
        }
        // ─────────────────────────────────────────────────────────────────────

        this.profile = prevProfile;
        this.color = prevColor;

        renderer.forceInvalidateTip?.();
        this.getRenderer().updateTip?.(this.profile, this.color);
    }
}