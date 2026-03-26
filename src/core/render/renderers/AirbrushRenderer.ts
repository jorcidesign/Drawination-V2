// src/core/render/renderers/AirbrushRenderer.ts
import type { IBrushRenderer, RebuildHelpers } from './IBrushRenderer';
import type { IBrushProfile } from '../profiles/IBrushProfile';
import type { BasePoint } from '../../../input/InputManager';
import type { StrokePoint } from '../../io/BinarySerializer';
import { BezierEasing } from '../../math/BezierEasing';

// ─── PRNG ─────────────────────────────────────────────────────────────────────
// Usamos el generador determinista para asegurar que el Ctrl+Z sea idéntico 1:1
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

    constructor() {
        this.tipCanvas = document.createElement('canvas');
        this.tipCtx = this.tipCanvas.getContext('2d')!;
        this.strokeRng = new SimplePRNG(1);
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
        const baseGrad = this.tipCtx.createRadialGradient(cx, cx, 0, cx, cx, cx);
        baseGrad.addColorStop(0.0, `rgba(${rgb}, 0.55)`);
        baseGrad.addColorStop(0.4, `rgba(${rgb}, 0.20)`);
        baseGrad.addColorStop(0.7, `rgba(${rgb}, 0.05)`);
        baseGrad.addColorStop(1.0, `rgba(${rgb}, 0.00)`);

        this.tipCtx.fillStyle = baseGrad;
        this.tipCtx.fillRect(0, 0, size, size);

        // ── 2. TEXTURA NUBOSA (SMOKE PUFFS) ───────────────────────────────
        const puffCount = Math.floor(size * 1.5);
        this.tipCtx.fillStyle = `rgb(${rgb})`;

        for (let i = 0; i < puffCount; i++) {
            const angle = rng.next() * Math.PI * 2;
            const radiusFactor = rng.next();
            const r = cx * Math.pow(radiusFactor, 1.2);
            const px = cx + Math.cos(angle) * r;
            const py = cx + Math.sin(angle) * r;
            const puffSize = (1 - radiusFactor) * (size * 0.15) + (size * 0.05);
            const puffAlpha = (1 - radiusFactor) * 0.1 * rng.next() + 0.02;

            this.tipCtx.globalAlpha = puffAlpha;
            this.tipCtx.beginPath();
            this.tipCtx.arc(px, py, puffSize, 0, Math.PI * 2);
            this.tipCtx.fill();
        }

        this.tipCtx.globalAlpha = 1;
    }

    public beginStroke(_profile: IBrushProfile, _color: string, startPt: BasePoint): void {
        const qx = Math.round(startPt.x * 100);
        const qy = Math.round(startPt.y * 100);
        const qp = Math.round(startPt.pressure * 1023);
        const seed = qx * 73 + qy * 19 + qp * 11;

        this.strokeRng = new SimplePRNG(seed);
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

        // 2. INTERPOLACIÓN DE TAMAÑO
        const sizeMin = profile.pressureSizeMin ?? 1.0;
        const sizeMax = profile.pressureSizeMax ?? 1.0;
        const currentSizeMultiplier = sizeMin + (sizeMax - sizeMin) * mappedPressure;
        const finalSize = Math.max(0.5, profile.baseSize * currentSizeMultiplier);

        // 3. INTERPOLACIÓN DE OPACIDAD
        const opMin = profile.pressureOpacityMin ?? 1.0;
        const opMax = profile.pressureOpacityMax ?? 1.0;
        const currentOpacityMultiplier = opMin + (opMax - opMin) * mappedPressure;

        // 4. INTERPOLACIÓN DE FLUJO
        const flowMin = profile.pressureFlowMin ?? 0.0;
        const flowMax = profile.pressureFlowMax ?? 1.0;
        const baseFlow = profile.baseFlow ?? profile.physics?.flow ?? 0.60;
        const currentFlowMultiplier = flowMin + (flowMax - flowMin) * mappedPressure;
        const dynamicFlow = baseFlow * currentFlowMultiplier;

        // 5. OPACIDAD FINAL
        let rawOpacity = profile.baseOpacity * currentOpacityMultiplier * dynamicFlow;

        // === EL ESCUDO ANTI-SOLARIZACIÓN DE 8-BITS ===
        if (rawOpacity < 0.005) return;
        const stampOpacity = Math.max(0.025, Math.min(1, rawOpacity));

        ctx.globalAlpha = stampOpacity;

        const halfSize = finalSize / 2;
        const angle = this.strokeRng.next() * Math.PI * 2;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        ctx.drawImage(
            this.tipCanvas,
            -halfSize,
            -halfSize,
            finalSize,
            finalSize
        );

        ctx.restore();
    }

    public endStroke(): void {
        // Renderizado puro, sin estado residual
    }

    public rebuildStroke(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, points: StrokePoint[], helpers: RebuildHelpers): void {
        const offCtx = helpers.getOffscreenCanvas(ctx.canvas.width, ctx.canvas.height);

        helpers.simulateDrawing(offCtx);

        ctx.save();
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(offCtx.canvas, 0, 0);
        ctx.restore();

        offCtx.clearRect(0, 0, offCtx.canvas.width, offCtx.canvas.height);
    }

    private hexToRgb(hex: string): string {
        const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return r
            ? `${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}`
            : '0, 0, 0';
    }
}