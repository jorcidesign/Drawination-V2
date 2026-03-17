// src/core/render/renderers/CharcoalRenderer.ts
//
// Carboncillo procedural — Modelo Avanzado de Depósito Granular.
//
// FÍSICA:
// 1. Papel fBm (Fractal Brownian Motion) precalculado.
// 2. Grano direccional: Simula las micro-fracturas de la madera carbonizada.
// 3. Depósito de polvo estocástico: El carbón no es transparente, deposita
//    micro-partículas sólidas en las cimas del papel.
// 4. Bordes quebradizos (Crumbly Edges): La máscara de presión dicta la 
//    probabilidad de que el pigmento agarre, no su opacidad lineal.

import type { IBrushRenderer } from './IBrushRenderer';
import type { IBrushProfile } from '../profiles/IBrushProfile';
import type { BasePoint } from '../../../input/InputManager';
import { ValueNoise2D } from '../../math/ValueNoise2D';
import type { StrokePoint } from '../../io/BinarySerializer';
import { BezierEasing } from '../../math/BezierEasing';
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

const PAPER_SIZE = 256;

export class CharcoalRenderer implements IBrushRenderer {

    private tipCanvas: HTMLCanvasElement;
    private tipCtx: CanvasRenderingContext2D;

    private paperTexture: Float32Array | null = null;
    private readonly paperSeed: number = 42;

    private lastColor: string = '';
    private lastSize: number = 0;
    private lastAspect: number = 0;

    // === Estado para la orientación del "Rodillo" ===
    private lastX: number | null = null;
    private lastY: number | null = null;
    private currentAngle: number = 0;

    // === Buffer para la estabilización del trazo ===
    private inputBuffer: BasePoint[] = [];

    constructor() {
        this.tipCanvas = document.createElement('canvas');
        this.tipCtx = this.tipCanvas.getContext('2d', { willReadFrequently: true })!;
        this.paperTexture = this.generatePaperTexture(this.paperSeed);
    }

    private generatePaperTexture(seed: number): Float32Array {
        const tex = new Float32Array(PAPER_SIZE * PAPER_SIZE);
        for (let py = 0; py < PAPER_SIZE; py++) {
            for (let px = 0; px < PAPER_SIZE; px++) {
                // fBm: 3 Octavas para un papel orgánico y profundo
                const n1 = ValueNoise2D.get(px, py, 0.04, seed);       // Forma topológica principal
                const n2 = ValueNoise2D.get(px, py, 0.12, seed + 1);   // Detalle medio
                const n3 = ValueNoise2D.get(px, py, 0.35, seed + 2);   // Micro-diente

                tex[py * PAPER_SIZE + px] = n1 * 0.55 + n2 * 0.30 + n3 * 0.15;
            }
        }
        return tex;
    }

    private samplePaper(worldX: number, worldY: number): number {
        if (!this.paperTexture) return 0.5;
        const ix = ((Math.floor(worldX) % PAPER_SIZE) + PAPER_SIZE) % PAPER_SIZE;
        const iy = ((Math.floor(worldY) % PAPER_SIZE) + PAPER_SIZE) % PAPER_SIZE;
        return this.paperTexture[iy * PAPER_SIZE + ix];
    }

    public updateTip(profile: IBrushProfile, color: string): void {
        const aspect = profile.physics?.charcoalAspect ?? profile.aspectRatio;

        if (
            color === this.lastColor &&
            profile.baseSize === this.lastSize &&
            aspect === this.lastAspect
        ) return;

        this.lastColor = color;
        this.lastSize = profile.baseSize;
        this.lastAspect = aspect;

        const rectH = profile.baseSize;
        const rectW = Math.max(2, profile.baseSize * aspect);
        const tipSize = Math.ceil(Math.sqrt(rectW * rectW + rectH * rectH)) + 8;
        const cx = tipSize / 2;
        const cy = tipSize / 2;
        const hw = rectW / 2;
        const hh = rectH / 2;
        const rx = Math.min(hw * 0.2, hh * 0.08, 2);

        this.tipCanvas.width = tipSize;
        this.tipCanvas.height = tipSize;
        this.tipCtx.clearRect(0, 0, tipSize, tipSize);

        const colorRGB = this.hexToRgb(color);

        // ── 1. Silueta base con degradado de smear ────────────────────────
        this.tipCtx.save();
        this.tipCtx.beginPath();
        this.roundRectPath(this.tipCtx, cx - hw, cy - hh, rectW, rectH, rx);
        this.tipCtx.clip();

        this.tipCtx.fillStyle = `rgb(${colorRGB})`;
        this.tipCtx.fillRect(cx - hw, cy - hh, rectW, rectH);

        // Smear en extremos verticales
        this.tipCtx.globalCompositeOperation = 'destination-in';
        const smear = this.tipCtx.createLinearGradient(cx, cy - hh, cx, cy + hh);
        smear.addColorStop(0.00, 'rgba(0,0,0,0.0)');
        smear.addColorStop(0.08, 'rgba(0,0,0,0.55)');
        smear.addColorStop(0.22, 'rgba(0,0,0,1.0)');
        smear.addColorStop(0.78, 'rgba(0,0,0,1.0)');
        smear.addColorStop(0.92, 'rgba(0,0,0,0.55)');
        smear.addColorStop(1.00, 'rgba(0,0,0,0.0)');
        this.tipCtx.fillStyle = smear;
        this.tipCtx.fillRect(cx - hw, cy - hh, rectW, rectH);

        this.tipCtx.restore();
        this.tipCtx.globalCompositeOperation = 'source-over';

        // ── 2. Simulación de Polvo Granular y Fibras ──────────────────────
        const imgData = this.tipCtx.getImageData(0, 0, tipSize, tipSize);
        const data = imgData.data;

        const rng = new SeededRNG(parseInt(color.replace('#', ''), 16) ^ (Math.round(rectH) * 7919));
        const fiberSeed = rng.next() * 1000;

        for (let py = 0; py < tipSize; py++) {
            for (let px = 0; px < tipSize; px++) {
                const idx = (py * tipSize + px) * 4;
                const baseAlpha = data[idx + 3];

                if (baseAlpha === 0) continue;

                // 1. Diente del papel
                const paper = this.samplePaper(px - cx, py - cy);

                // 2. Grano de madera del carbón
                const fiber = ValueNoise2D.get((px - cx) * 0.015, (py - cy) * 0.8, 1.0, fiberSeed);

                // 3. Polvo de carbón
                const dust = rng.next();

                const mask = baseAlpha / 255;
                const threshold = 1.0 - (mask * 0.85);

                const structure = (paper * 0.50) + (dust * 0.35) + (fiber * 0.15);

                if (structure > threshold) {
                    const intensity = Math.min(1.0, (structure - threshold) * 2.5);
                    data[idx + 3] = Math.floor(baseAlpha * intensity);
                } else {
                    data[idx + 3] = 0;
                }
            }
        }

        this.tipCtx.globalAlpha = 1;
        this.tipCtx.globalCompositeOperation = 'source-over';
        this.tipCtx.putImageData(imgData, 0, 0);
    }

    // === Inicializamos el buffer y el rodillo al empezar a dibujar ===
    public beginStroke(_profile: IBrushProfile, _color: string, startPt: BasePoint): void {
        this.inputBuffer = [startPt];
        this.lastX = startPt.x;
        this.lastY = startPt.y;
        this.currentAngle = 0;
    }

    // === EL ESTABILIZADOR PONDERADO ===
    public transformInput(profile: IBrushProfile, data: BasePoint): BasePoint {
        const windowSize = profile.physics?.stabilizerWindow ?? 8;

        if (windowSize <= 1) return data;

        this.inputBuffer.push(data);
        if (this.inputBuffer.length > windowSize) {
            this.inputBuffer.shift();
        }

        let totalWeight = 0;
        let weightedX = 0;
        let weightedY = 0;
        let weightedP = 0;

        for (let i = 0; i < this.inputBuffer.length; i++) {
            const weight = Math.pow(2, i);
            totalWeight += weight;
            weightedX += this.inputBuffer[i].x * weight;
            weightedY += this.inputBuffer[i].y * weight;
            weightedP += this.inputBuffer[i].pressure * weight;
        }

        return {
            x: weightedX / totalWeight,
            y: weightedY / totalWeight,
            pressure: weightedP / totalWeight
        };
    }

    public stamp(
        ctx: CanvasRenderingContext2D,
        profile: IBrushProfile,
        color: string,
        x: number,
        y: number,
        rawPressure: number // Cambiado a rawPressure por claridad
    ): void {
        const p1y = profile.physics?.pressureCurve?.p1y ?? 0.333;
        const p2y = profile.physics?.pressureCurve?.p2y ?? 0.667;

        // 1. Mapear presión
        const mappedPressure = BezierEasing.evaluate(rawPressure, p1y, p2y);

        // 2. INTERPOLACIÓN DE TAMAÑO (28% a 49%)
        const sizeMin = profile.pressureSizeMin ?? 0.28;
        const sizeMax = profile.pressureSizeMax ?? 0.49;
        const currentSizeMultiplier = sizeMin + (sizeMax - sizeMin) * mappedPressure;
        const finalSize = Math.max(1, profile.baseSize * currentSizeMultiplier);

        // 3. INTERPOLACIÓN DE OPACIDAD (19% a 100%)
        const opMin = profile.pressureOpacityMin ?? 0.19;
        const opMax = profile.pressureOpacityMax ?? 1.0;
        const currentOpacityMultiplier = opMin + (opMax - opMin) * mappedPressure;

        // 4. INTERPOLACIÓN DE FLUJO (4% a 100%)
        const flowMin = profile.pressureFlowMin ?? 0.04;
        const flowMax = profile.pressureFlowMax ?? 1.0;
        const baseFlow = profile.baseFlow ?? profile.physics?.flow ?? 1.0;
        const currentFlowMultiplier = flowMin + (flowMax - flowMin) * mappedPressure;
        const dynamicFlow = baseFlow * currentFlowMultiplier;

        // 5. OPACIDAD FINAL Y ESCUDO ANTI-SOLARIZACIÓN
        let rawOpacity = profile.baseOpacity * currentOpacityMultiplier * dynamicFlow;

        // Escudo 8-bits: Descartamos basura matemática (< 0.5%)
        if (rawOpacity < 0.005) return;

        // Piso seguro del 2.5% para mantener el color puro
        const stampOpacity = Math.max(0.025, Math.min(1, rawOpacity));

        // === Cálculo de orientación del "Rodillo" ===
        if (this.lastX !== null && this.lastY !== null) {
            const dx = x - this.lastX;
            const dy = y - this.lastY;

            // Solo actualizamos el ángulo si hay un movimiento perceptible
            if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
                this.currentAngle = Math.atan2(dy, dx);
            }
        }

        this.lastX = x;
        this.lastY = y;

        const tipSize = this.tipCanvas.width;
        const half = tipSize / 2;
        const sizeRatio = finalSize / profile.baseSize;

        ctx.save();
        ctx.globalAlpha = stampOpacity;

        // Simulamos la presión sobre la cara plana del carbón ensanchándolo ligeramente
        const widthScale = 1 + (rawPressure - 0.5) * 0.3;

        ctx.translate(x, y);
        ctx.rotate(this.currentAngle); // Giramos la punta hacia la dirección del trazo
        ctx.scale(widthScale, 1);

        ctx.drawImage(
            this.tipCanvas,
            -half * sizeRatio,
            -half * sizeRatio,
            tipSize * sizeRatio,
            tipSize * sizeRatio
        );

        ctx.restore();
    }
    // === Limpiamos el buffer y el rodillo al levantar el lápiz ===
    public endStroke(): void {
        this.inputBuffer = [];
        this.lastX = null;
        this.lastY = null;
    }

    private hexToRgb(hex: string): string {
        const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return r ? `${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}` : '0, 0, 0';
    }

    private roundRectPath(
        ctx: CanvasRenderingContext2D,
        x: number, y: number, w: number, h: number, r: number
    ): void {
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
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