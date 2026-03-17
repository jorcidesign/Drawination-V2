// src/core/render/renderers/BasicRenderer.ts
import type { IBrushRenderer } from './IBrushRenderer';
import type { IBrushProfile } from '../profiles/IBrushProfile';
import type { BasePoint } from '../../../input/InputManager';
import type { StrokePoint } from '../../io/BinarySerializer';
import { BezierEasing } from '../../math/BezierEasing';
// [FIX] PRNG determinista para el grano del lápiz. 
// Elimina la dependencia de Math.random() para que el Ctrl+Z sea fiel 1:1.
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

export class BasicRenderer implements IBrushRenderer {
    private tipCanvas: HTMLCanvasElement;
    private tipCtx: CanvasRenderingContext2D;
    private readonly TEXTURE_THRESHOLD = 3.0;

    // [FIX] Cache del último estado para no machacar la CPU en el Undo/Redo
    private lastColor: string = '';
    private lastSize: number = 0;
    private lastAngle: number = 0;
    private lastAspect: number = 0;

    // === Buffer para la estabilización del trazo (Adaptado de HardRound) ===
    private inputBuffer: BasePoint[] = [];

    constructor() {
        this.tipCanvas = document.createElement('canvas');
        this.tipCtx = this.tipCanvas.getContext('2d', { willReadFrequently: true })!;
    }

    public updateTip(profile: IBrushProfile, color: string): void {
        // Early exit si no hubo cambios reales
        if (
            color === this.lastColor &&
            profile.baseSize === this.lastSize &&
            profile.angle === this.lastAngle &&
            profile.aspectRatio === this.lastAspect
        ) return;

        this.lastColor = color;
        this.lastSize = profile.baseSize;
        this.lastAngle = profile.angle;
        this.lastAspect = profile.aspectRatio;

        const size = Math.max(64, profile.baseSize * 2);
        this.tipCanvas.width = size;
        this.tipCanvas.height = size;
        const cx = size / 2;
        const cy = size / 2;

        this.tipCtx.clearRect(0, 0, size, size);
        this.tipCtx.save();
        this.tipCtx.translate(cx, cy);
        this.tipCtx.rotate((profile.angle * Math.PI) / 180);

        if (profile.textureType === 'pencil-grain') {
            const grad = this.tipCtx.createRadialGradient(0, 0, 0, 0, 0, cx);
            const colorRGB = this.hexToRgb(color);
            grad.addColorStop(0, `rgba(${colorRGB}, 1)`);
            grad.addColorStop(0.5, `rgba(${colorRGB}, 0.5)`);
            grad.addColorStop(1, `rgba(${colorRGB}, 0)`);
            this.tipCtx.fillStyle = grad;
            this.tipCtx.beginPath();
            this.tipCtx.ellipse(0, 0, cx * profile.aspectRatio, cx, 0, 0, Math.PI * 2);
            this.tipCtx.fill();

            // Usar Seed en lugar de Math.random()
            const colorNum = parseInt(color.replace('#', ''), 16) || 0;
            const rng = new SeededRNG(colorNum ^ (Math.round(size) * 7919));

            const imgData = this.tipCtx.getImageData(0, 0, size, size);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                if (rng.next() > 0.6) data[i + 3] *= 0.2;
            }
            this.tipCtx.putImageData(imgData, 0, 0);
        } else {
            this.tipCtx.fillStyle = color;
            this.tipCtx.beginPath();
            this.tipCtx.ellipse(0, 0, cx * profile.aspectRatio, cx, 0, 0, Math.PI * 2);
            this.tipCtx.fill();
        }
        this.tipCtx.restore();
    }

    private hexToRgb(hex: string): string {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0, 0, 0';
    }

    // === Inicializamos el buffer al empezar a dibujar ===
    public beginStroke(profile: IBrushProfile, color: string, startPt: BasePoint): void {
        this.inputBuffer = [startPt];
    }

    // === EL ESTABILIZADOR PONDERADO ===
    public transformInput(profile: IBrushProfile, data: BasePoint): BasePoint {
        // Asignamos un default de 8 (como HardRound) por si el perfil (Lápiz) no tiene 'stabilizerWindow' definido
        const windowSize = profile.physics?.stabilizerWindow ?? 8;

        if (windowSize <= 1) return data; // Fast path sin lag

        this.inputBuffer.push(data);
        if (this.inputBuffer.length > windowSize) {
            this.inputBuffer.shift();
        }

        // Promedio ponderado (puntos recientes pesan exponencialmente más)
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

    public stamp(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, x: number, y: number, rawPressure: number): void {
        const p1y = profile.physics?.pressureCurve?.p1y ?? 0.333;
        const p2y = profile.physics?.pressureCurve?.p2y ?? 0.667;

        // 1. Mapear presión
        const mappedPressure = BezierEasing.evaluate(rawPressure, p1y, p2y);

        // 2. INTERPOLACIÓN DE TAMAÑO (Ej: 11% a 100%)
        const sizeMin = profile.pressureSizeMin ?? 0.0;
        const sizeMax = profile.pressureSizeMax ?? 1.0;
        const currentSizeMultiplier = sizeMin + (sizeMax - sizeMin) * mappedPressure;
        const finalSize = Math.max(0.5, profile.baseSize * currentSizeMultiplier);

        // 3. INTERPOLACIÓN DE OPACIDAD
        const opMin = profile.pressureOpacityMin ?? 0.0;
        const opMax = profile.pressureOpacityMax ?? 1.0;
        const currentOpacityMultiplier = opMin + (opMax - opMin) * mappedPressure;

        // 4. INTERPOLACIÓN DE FLUJO
        const flowMin = profile.pressureFlowMin ?? 1.0;
        const flowMax = profile.pressureFlowMax ?? 1.0;
        const baseFlow = profile.baseFlow ?? profile.physics?.flow ?? 1.0;
        const currentFlowMultiplier = flowMin + (flowMax - flowMin) * mappedPressure;
        const dynamicFlow = baseFlow * currentFlowMultiplier;

        // 5. OPACIDAD FINAL Y ESCUDO ANTI-SOLARIZACIÓN
        // Límite maestro de opacidad de Procreate para el lápiz (92%)
        const maxOpacityLimit = 0.92;

        let rawOpacity = profile.baseOpacity * maxOpacityLimit * currentOpacityMultiplier * dynamicFlow;

        // Escudo 8-bits: Descartar basura matemática ultra-baja (< 0.5%)
        if (rawOpacity < 0.005) return;

        // Piso seguro del 2.5% para mantener el color puro (gris es gris, azul es azul)
        const stampOpacity = Math.max(0.025, Math.min(1, rawOpacity));

        ctx.globalAlpha = stampOpacity;

        if (finalSize < this.TEXTURE_THRESHOLD && profile.textureType === 'solid') {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.ellipse(x, y, (finalSize / 2) * profile.aspectRatio, finalSize / 2, (profile.angle * Math.PI) / 180, 0, Math.PI * 2);
            ctx.fill();
            return;
        }

        const halfSize = finalSize / 2;
        ctx.drawImage(this.tipCanvas, x - halfSize, y - halfSize, finalSize, finalSize);
    }

    // === Limpiamos el buffer al levantar el lápiz ===
    public endStroke() {
        this.inputBuffer = [];
    }

    public rebuildStroke(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, points: StrokePoint[], helpers: any): void {
        if (profile.blendMode === 'destination-out') {
            // El borrador debe ir directo al contexto real para "comerse" los píxeles
            ctx.save();
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'source-over';
            helpers.simulateDrawing(ctx);
            ctx.restore();
        } else {
            // El lápiz normal usa Two-Pass para acumular opacidad limpiamente
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
}