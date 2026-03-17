// src/core/render/renderers/AirbrushRenderer.ts
import type { IBrushRenderer } from './IBrushRenderer';
import type { IBrushProfile } from '../profiles/IBrushProfile';
import type { BasePoint } from '../../../input/InputManager';
import type { StrokePoint } from '../../io/BinarySerializer';

class SeededRNG {
    private s: number;
    constructor(seed: number) { this.s = (seed | 0) || 1; }
    next(): number {
        let x = this.s;
        x ^= x << 13; x ^= x >> 17; x ^= x << 5;
        this.s = x;
        return (x >>> 0) / 0xFFFFFFFF;
    }
}

export class AirbrushRenderer implements IBrushRenderer {

    private tipCanvas: HTMLCanvasElement;
    private tipCtx: CanvasRenderingContext2D;

    private lastColor: string = '';
    private lastSize: number = 0;

    // ── DEBUG ─────────────────────────────────────────────────────────────
    // Contadores para saber exactamente qué valores entran a stamp()
    // en cada contexto (live vs rebuild).
    private _debugStrokeId: string = '';
    private _debugIsFirst: boolean = true;
    private _debugSamples: Array<{
        pressure: number;
        flow: number;
        baseOpacity: number;
        pressureCurve: number;
        finalOpacity: number;
        ctxAlphaBefore: number;   // globalAlpha del ctx ANTES de tocarla
        ctxAlphaAfter: number;    // globalAlpha del ctx DESPUÉS de setearla
        ctxComposite: string;     // globalCompositeOperation en el momento del stamp
    }> = [];

    constructor() {
        this.tipCanvas = document.createElement('canvas');
        this.tipCtx = this.tipCanvas.getContext('2d')!;
    }

    public updateTip(profile: IBrushProfile, color: string): void {
        if (color === this.lastColor && profile.baseSize === this.lastSize) return;
        this.lastColor = color;
        this.lastSize = profile.baseSize;

        const size = Math.max(64, profile.baseSize * 2);
        this.tipCanvas.width = size;
        this.tipCanvas.height = size;
        const cx = size / 2;

        this.tipCtx.clearRect(0, 0, size, size);

        const grad = this.tipCtx.createRadialGradient(cx, cx, 0, cx, cx, cx);
        const rgb = this.hexToRgb(color);

        grad.addColorStop(0.00, `rgba(${rgb}, 1.00)`);
        grad.addColorStop(0.30, `rgba(${rgb}, 0.78)`);
        grad.addColorStop(0.50, `rgba(${rgb}, 0.46)`);
        grad.addColorStop(0.70, `rgba(${rgb}, 0.15)`);
        grad.addColorStop(0.85, `rgba(${rgb}, 0.04)`);
        grad.addColorStop(1.00, `rgba(${rgb}, 0.00)`);

        this.tipCtx.fillStyle = grad;
        this.tipCtx.beginPath();
        this.tipCtx.arc(cx, cx, cx, 0, Math.PI * 2);
        this.tipCtx.fill();

        const rng = new SeededRNG(parseInt(color.replace('#', ''), 16) ^ (size * 1337));
        const particleCount = Math.max(12, Math.floor(cx * 0.6));

        this.tipCtx.globalCompositeOperation = 'source-atop';

        for (let i = 0; i < particleCount; i++) {
            const angle = rng.next() * Math.PI * 2;
            const r = cx * (0.5 + rng.next() * 0.45);
            const px = cx + Math.cos(angle) * r;
            const py = cx + Math.sin(angle) * r;
            const pSize = 0.4 + rng.next() * 0.8;
            const pAlpha = (1 - r / cx) * 0.35 * rng.next();

            this.tipCtx.globalAlpha = pAlpha;
            this.tipCtx.fillStyle = `rgb(${rgb})`;
            this.tipCtx.beginPath();
            this.tipCtx.arc(px, py, pSize, 0, Math.PI * 2);
            this.tipCtx.fill();
        }

        this.tipCtx.globalCompositeOperation = 'source-over';
        this.tipCtx.globalAlpha = 1;
    }

    public beginStroke(_profile: IBrushProfile, _color: string, _startPt: BasePoint): void {
        // Nuevo trazo: resetear debug
        this._debugStrokeId = Math.random().toString(36).slice(2, 7);
        this._debugIsFirst = true;
        this._debugSamples = [];
    }

    public stamp(
        ctx: CanvasRenderingContext2D,
        profile: IBrushProfile,
        color: string,
        x: number,
        y: number,
        pressure: number
    ): void {
        const flow = profile.physics?.flow ?? 0.15;
        const pressureCurve = pressure * pressure * 0.4 + pressure * 0.6;
        const finalOpacity = Math.min(1, flow * pressureCurve * profile.baseOpacity * 3.5);

        // ── CAPTURA DEBUG ─────────────────────────────────────────────────
        const ctxAlphaBefore = ctx.globalAlpha;
        const ctxComposite = ctx.globalCompositeOperation;

        if (this._debugSamples.length < 5) {
            // Capturamos los primeros 5 stamps de cada trazo
            this._debugSamples.push({
                pressure: +pressure.toFixed(4),
                flow: +flow.toFixed(4),
                baseOpacity: +profile.baseOpacity.toFixed(4),
                pressureCurve: +pressureCurve.toFixed(4),
                finalOpacity: +finalOpacity.toFixed(4),
                ctxAlphaBefore: +ctxAlphaBefore.toFixed(4),
                ctxAlphaAfter: 0, // se rellena después
                ctxComposite,
            });
        }

        if (finalOpacity < 0.001) return;

        ctx.globalAlpha = finalOpacity;

        // Rellenar ctxAlphaAfter en la última muestra
        if (this._debugSamples.length > 0) {
            this._debugSamples[this._debugSamples.length - 1].ctxAlphaAfter = +ctx.globalAlpha.toFixed(4);
        }

        const halfSize = profile.baseSize;
        ctx.drawImage(this.tipCanvas, x - halfSize, y - halfSize, halfSize * 2, halfSize * 2);

        // ── LOG solo en el primer stamp de cada trazo ─────────────────────
        // (para no inundar la consola con miles de líneas)
        if (this._debugIsFirst) {
            this._debugIsFirst = false;
            // Guardamos en window para inspeccionarlo después si hace falta
            (window as any).__airbrushDebug = (window as any).__airbrushDebug || [];
            (window as any).__airbrushDebug.push({
                strokeId: this._debugStrokeId,
                firstStamp: {
                    pressure: +pressure.toFixed(4),
                    flow: +flow.toFixed(4),
                    baseOpacity: +profile.baseOpacity.toFixed(4),
                    pressureCurve: +pressureCurve.toFixed(4),
                    finalOpacity: +finalOpacity.toFixed(4),
                    ctxAlphaBefore: +ctxAlphaBefore.toFixed(4),
                    ctxComposite,
                }
            });

            console.groupCollapsed(
                `%c🎨 Airbrush stamp [${this._debugStrokeId}]` +
                ` | opacity final: ${finalOpacity.toFixed(4)}` +
                ` | ctx.alpha antes: ${ctxAlphaBefore.toFixed(4)}`,
                `color: ${Math.abs(ctxAlphaBefore - 1.0) > 0.01 ? '#e74c3c' : '#2ecc71'}; font-weight: bold`
            );
            console.log('  flow           :', flow.toFixed(4));
            console.log('  profile.baseOpacity:', profile.baseOpacity.toFixed(4));
            console.log('  pressure       :', pressure.toFixed(4));
            console.log('  pressureCurve  :', pressureCurve.toFixed(4));
            console.log('  finalOpacity   :', finalOpacity.toFixed(4));
            console.log('  ctx.globalAlpha ANTES stamp:', ctxAlphaBefore.toFixed(4),
                Math.abs(ctxAlphaBefore - 1.0) > 0.01 ? '⚠️  CONTAMINADO' : '✅ limpio');
            console.log('  ctx.globalCompositeOp:', ctxComposite,
                ctxComposite !== 'source-over' ? '⚠️  NO es source-over' : '✅');
            console.groupEnd();
        }
    }

    public endStroke(): void {
        // Volcar resumen del trazo completo al final
        if (this._debugSamples.length > 0) {
            const alphasBefore = this._debugSamples.map(s => s.ctxAlphaBefore);
            const contaminated = alphasBefore.filter(a => Math.abs(a - 1.0) > 0.01);

            if (contaminated.length > 0) {
                console.warn(
                    `%c⚠️  Airbrush [${this._debugStrokeId}] — ctx.globalAlpha contaminado en ${contaminated.length}/${this._debugSamples.length} stamps`,
                    'color:#e74c3c;font-weight:bold',
                    '\nValores:', contaminated
                );
            }
        }
        this._debugSamples = [];
    }

    private hexToRgb(hex: string): string {
        const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return r
            ? `${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}`
            : '0, 0, 0';
    }

    // Reconstrucción Two-Pass: evita que la opacidad del trazo se contamine con los píxeles del lienzo
    public rebuildStroke(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, points: StrokePoint[], helpers: any): void {
        const offCtx = helpers.getOffscreenCanvas(ctx.canvas.width, ctx.canvas.height);

        helpers.simulateDrawing(offCtx);

        ctx.save();
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(offCtx.canvas, 0, 0);
        ctx.restore();

        offCtx.clearRect(0, 0, offCtx.canvas.width, offCtx.canvas.height);
    }
}