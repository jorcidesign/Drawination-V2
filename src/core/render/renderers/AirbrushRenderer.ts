// src/core/render/renderers/AirbrushRenderer.ts
import type { IBrushRenderer } from './IBrushRenderer';
import type { IBrushProfile } from '../profiles/IBrushProfile';
import type { BasePoint } from '../../../input/InputManager';
import type { StrokePoint } from '../../io/BinarySerializer';
import { BezierEasing } from '../../math/BezierEasing';
// ─── PRNG ─────────────────────────────────────────────────────────────────────
// Usamos el mismo generador determinista del PaintRenderer.
class SimplePRNG {
    private s: number;
    constructor(seed: number) {
        this.s = seed === 0 ? 1 : seed;
    }
    next(): number {
        const x = Math.sin(this.s++) * 10000;
        return x - Math.floor(x);
    }
}

export class AirbrushRenderer implements IBrushRenderer {

    private tipCanvas: HTMLCanvasElement;
    private tipCtx: CanvasRenderingContext2D;

    private lastColor: string = '';
    private lastSize: number = 0;

    // === PRNG dedicado para la rotación del trazo ===
    private strokeRng: SimplePRNG;

    // ── DEBUG ─────────────────────────────────────────────────────────────
    private _debugStrokeId: string = '';
    private _debugIsFirst: boolean = true;
    private _debugSamples: Array<{
        pressure: number;
        flow: number;
        baseOpacity: number;
        pressureCurve: number;
        finalOpacity: number;
        ctxAlphaBefore: number;
        ctxAlphaAfter: number;
        ctxComposite: string;
    }> = [];

    constructor() {
        this.tipCanvas = document.createElement('canvas');
        this.tipCtx = this.tipCanvas.getContext('2d')!;
        this.strokeRng = new SimplePRNG(1); // Inicialización segura
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

        const rgb = this.hexToRgb(color);
        const rng = new SimplePRNG(parseInt(color.replace('#', ''), 16) ^ (size * 1337));

        // ── 1. BASE VOLUMÉTRICA SUAVE ──────────────────────────────────────
        // Esto le da el cuerpo central al aerógrafo para que no quede hueco
        const baseGrad = this.tipCtx.createRadialGradient(cx, cx, 0, cx, cx, cx);
        baseGrad.addColorStop(0.0, `rgba(${rgb}, 0.55)`);
        baseGrad.addColorStop(0.4, `rgba(${rgb}, 0.20)`);
        baseGrad.addColorStop(0.7, `rgba(${rgb}, 0.05)`);
        baseGrad.addColorStop(1.0, `rgba(${rgb}, 0.00)`);

        this.tipCtx.fillStyle = baseGrad;
        this.tipCtx.fillRect(0, 0, size, size);

        // ── 2. TEXTURA NUBOSA (SMOKE PUFFS) ───────────────────────────────
        // En lugar de pixeles duros, creamos esferas suaves superpuestas.
        // Al rotar esto de forma estocástica en el stamp, se ve como humo.
        const puffCount = Math.floor(size * 1.5);
        this.tipCtx.fillStyle = `rgb(${rgb})`;

        for (let i = 0; i < puffCount; i++) {
            const angle = rng.next() * Math.PI * 2;

            // Distribución un poco más junta hacia el centro
            const radiusFactor = rng.next();
            const r = cx * Math.pow(radiusFactor, 1.2);

            const px = cx + Math.cos(angle) * r;
            const py = cx + Math.sin(angle) * r;

            // Los "puffs" son más grandes, simulando pequeñas nubes, no arena
            const puffSize = (1 - radiusFactor) * (size * 0.15) + (size * 0.05);

            // Opacidad microscópica. La acumulación crea la textura.
            const puffAlpha = (1 - radiusFactor) * 0.1 * rng.next() + 0.02;

            this.tipCtx.globalAlpha = puffAlpha;

            this.tipCtx.beginPath();
            this.tipCtx.arc(px, py, puffSize, 0, Math.PI * 2);
            this.tipCtx.fill();
        }

        this.tipCtx.globalAlpha = 1; // Restauramos para no afectar a futuros renderizados
    }

    public beginStroke(_profile: IBrushProfile, _color: string, startPt: BasePoint): void {
        // === LA MAGIA DEL DETERMINISMO ===
        const qx = Math.round(startPt.x * 100);
        const qy = Math.round(startPt.y * 100);
        const qp = Math.round(startPt.pressure * 1023);
        const seed = qx * 73 + qy * 19 + qp * 11;

        this.strokeRng = new SimplePRNG(seed);

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
        rawPressure: number
    ): void {
        const p1y = profile.physics?.pressureCurve?.p1y ?? 0.333;
        const p2y = profile.physics?.pressureCurve?.p2y ?? 0.667;

        // 1. Curva de presión
        const mappedPressure = BezierEasing.evaluate(rawPressure, p1y, p2y);

        // 2. INTERPOLACIÓN DE TAMAÑO (Constante para Aerógrafo)
        const sizeMin = profile.pressureSizeMin ?? 1.0;
        const sizeMax = profile.pressureSizeMax ?? 1.0;
        const currentSizeMultiplier = sizeMin + (sizeMax - sizeMin) * mappedPressure;
        const finalSize = Math.max(0.5, profile.baseSize * currentSizeMultiplier);

        // 3. INTERPOLACIÓN DE OPACIDAD (Constante para Aerógrafo)
        const opMin = profile.pressureOpacityMin ?? 1.0;
        const opMax = profile.pressureOpacityMax ?? 1.0;
        const currentOpacityMultiplier = opMin + (opMax - opMin) * mappedPressure;

        // 4. INTERPOLACIÓN DE FLUJO (0% a 100%)
        const flowMin = profile.pressureFlowMin ?? 0.0;
        const flowMax = profile.pressureFlowMax ?? 1.0;
        const baseFlow = profile.baseFlow ?? profile.physics?.flow ?? 0.60;
        const currentFlowMultiplier = flowMin + (flowMax - flowMin) * mappedPressure;
        const dynamicFlow = baseFlow * currentFlowMultiplier;

        // 5. OPACIDAD FINAL
        let rawOpacity = profile.baseOpacity * currentOpacityMultiplier * dynamicFlow;

        // ── CAPTURA DEBUG ─────────────────────────────────────────────────
        const ctxAlphaBefore = ctx.globalAlpha;
        const ctxComposite = ctx.globalCompositeOperation;

        if (this._debugSamples.length < 5) {
            this._debugSamples.push({
                pressure: +rawPressure.toFixed(4),
                flow: +dynamicFlow.toFixed(4),
                baseOpacity: +profile.baseOpacity.toFixed(4),
                pressureCurve: +mappedPressure.toFixed(4),
                finalOpacity: +rawOpacity.toFixed(4),
                ctxAlphaBefore: +ctxAlphaBefore.toFixed(4),
                ctxAlphaAfter: 0,
                ctxComposite,
            });
        }

        // === EL ESCUDO ANTI-SOLARIZACIÓN DE 8-BITS ===
        // 1. Evitamos basura matemática
        if (rawOpacity < 0.005) return;

        // 2. Piso seguro del 2.5%
        const stampOpacity = Math.max(0.025, Math.min(1, rawOpacity));

        ctx.globalAlpha = stampOpacity;

        if (this._debugSamples.length > 0) {
            this._debugSamples[this._debugSamples.length - 1].ctxAlphaAfter = +ctx.globalAlpha.toFixed(4);
        }

        const halfSize = finalSize / 2;

        // === ROTACIÓN NATURAL Y DETERMINISTA ===
        const angle = this.strokeRng.next() * Math.PI * 2;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        // Dibujamos el "cono" del aerógrafo generado procedimentalmente
        ctx.drawImage(
            this.tipCanvas,
            -halfSize,
            -halfSize,
            finalSize,
            finalSize
        );

        ctx.restore();

        // ── LOG DEBUG (Mantenemos tu log intacto adaptado a las nuevas variables) ──
        if (this._debugIsFirst) {
            this._debugIsFirst = false;
            (window as any).__airbrushDebug = (window as any).__airbrushDebug || [];
            (window as any).__airbrushDebug.push({
                strokeId: this._debugStrokeId,
                firstStamp: {
                    pressure: +rawPressure.toFixed(4),
                    flow: +dynamicFlow.toFixed(4),
                    baseOpacity: +profile.baseOpacity.toFixed(4),
                    pressureCurve: +mappedPressure.toFixed(4),
                    finalOpacity: +stampOpacity.toFixed(4),
                    ctxAlphaBefore: +ctxAlphaBefore.toFixed(4),
                    ctxComposite,
                }
            });

            console.groupCollapsed(
                `%c🎨 Airbrush stamp [${this._debugStrokeId}]` +
                ` | opacity final: ${stampOpacity.toFixed(4)}` +
                ` | ctx.alpha antes: ${ctxAlphaBefore.toFixed(4)}`,
                `color: ${Math.abs(ctxAlphaBefore - 1.0) > 0.01 ? '#e74c3c' : '#2ecc71'}; font-weight: bold`
            );
            console.log('  dynamicFlow    :', dynamicFlow.toFixed(4));
            console.log('  baseOpacity    :', profile.baseOpacity.toFixed(4));
            console.log('  rawPressure    :', rawPressure.toFixed(4));
            console.log('  mappedPressure :', mappedPressure.toFixed(4));
            console.log('  stampOpacity   :', stampOpacity.toFixed(4));
            console.log('  ctx.globalAlpha ANTES stamp:', ctxAlphaBefore.toFixed(4),
                Math.abs(ctxAlphaBefore - 1.0) > 0.01 ? '⚠️  CONTAMINADO' : '✅ limpio');
            console.log('  ctx.globalCompositeOp:', ctxComposite,
                ctxComposite !== 'source-over' ? '⚠️  NO es source-over' : '✅');
            console.groupEnd();
        }
    }

    public endStroke(): void {
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