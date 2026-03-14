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
                // fBm: 3 Octavas para un papel orgánico y profundo (mejor que la propuesta de IA)
                // Se precalcula para rendimiento ultra rápido.
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

                // 1. Diente del papel (fBm precalculado)
                const paper = this.samplePaper(px - cx, py - cy);

                // 2. Grano de madera del carbón (Ruido estirado direccionalmente)
                // Frecuencia X muy baja, Y muy alta = vetas horizontales naturales y rotas
                const fiber = ValueNoise2D.get((px - cx) * 0.015, (py - cy) * 0.8, 1.0, fiberSeed);

                // 3. Polvo de carbón (Ruido blanco de altísima frecuencia)
                const dust = rng.next();

                // Normalizamos la opacidad base (0 a 1) para usarla como "probabilidad" o máscara
                const mask = baseAlpha / 255;

                // === EL UMBRAL ESTOCÁSTICO ===
                // En el centro (mask=1), el umbral es bajo -> mucho polvo se pega.
                // En los bordes (mask cerca de 0), el umbral es alto -> solo las montañas más 
                // altas del papel logran arrancar polvo (borde quebradizo real).
                const threshold = 1.0 - (mask * 0.85);

                // Estructura combinada: 50% Papel, 35% Polvo, 15% Fibra
                const structure = (paper * 0.50) + (dust * 0.35) + (fiber * 0.15);

                if (structure > threshold) {
                    // Erosión profunda: Cuánto superamos el umbral dicta la densidad del pigmento
                    // Esto da un antialiasing sub-pixel orgánico para el polvo.
                    const intensity = Math.min(1.0, (structure - threshold) * 2.5);
                    data[idx + 3] = Math.floor(baseAlpha * intensity);
                } else {
                    // El pigmento cae en el valle del papel y NO pinta
                    data[idx + 3] = 0;
                }
            }
        }

        this.tipCtx.globalAlpha = 1;
        this.tipCtx.globalCompositeOperation = 'source-over';
        this.tipCtx.putImageData(imgData, 0, 0);
    }

    // === Inicializamos el buffer al empezar a dibujar ===
    public beginStroke(_profile: IBrushProfile, _color: string, startPt: BasePoint): void {
        this.inputBuffer = [startPt];
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
        pressure: number
    ): void {
        const sizeMult = 1 + (pressure - 0.5) * profile.pressureSizeSensitivity * 2;
        const finalSize = Math.max(1, profile.baseSize * sizeMult);

        const pressureCurve = pressure * pressure * 0.4 + pressure * 0.6;
        const opaMult = 1 + (pressure - 0.5) * profile.pressureOpacitySensitivity * 2;
        const finalOpacity = Math.min(1, profile.baseOpacity * opaMult * pressureCurve * 1.2);

        if (finalOpacity < 0.004) return;

        const tipSize = this.tipCanvas.width;
        const half = tipSize / 2;

        const sizeRatio = finalSize / profile.baseSize;

        ctx.save();
        ctx.globalAlpha = finalOpacity;

        const widthScale = 1 + (pressure - 0.5) * 0.3;
        ctx.translate(x, y);
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

    // === Limpiamos el buffer al levantar el lápiz ===
    public endStroke(): void {
        this.inputBuffer = [];
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
}