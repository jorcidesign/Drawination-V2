// src/core/render/renderers/InkRenderer.ts
//
// Pluma de tinta procedural — sin tipCanvas principal, sin drawImage.
// Las fibras del felt tip se renderizan en un canvas offscreen para
// evitar que destination-out interactúe con el canvas de dibujo.
//
// BUG CORREGIDO (gris a tamaños grandes):
// destination-out dentro de ctx.save/restore afecta al canvas completo
// del trazo, no solo al óvalo recién dibujado. Resultado: los huecos
// de las fibras se mezclaban con píxeles existentes → gris.
// Fix: se usa un OffscreenCanvas temporal por stamp donde se dibuja
// el óvalo + fibras, luego se vuelca sobre el ctx con source-over.
// Costo: ~1 drawImage por stamp — aceptable para un renderer de tinta.

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

export class InkRenderer implements IBrushRenderer {

    // Canvas offscreen reutilizable — se redimensiona solo si hace falta
    private offscreen: HTMLCanvasElement;
    private offCtx: CanvasRenderingContext2D;

    // Fibras normalizadas precalculadas — independientes del tamaño
    private fiberOffsets: Array<{
        nx: number;
        lengthRatio: number;
        fiberWidth: number;
        offsetY: number;
    }> = [];

    private lastColor: string = '';
    private lastAngle: number = -999;
    private lastAspect: number = -1;

    // === Buffer para la estabilización del trazo ===
    private inputBuffer: BasePoint[] = [];

    constructor() {
        this.offscreen = document.createElement('canvas');
        this.offscreen.width = 256;
        this.offscreen.height = 256;
        this.offCtx = this.offscreen.getContext('2d')!;
        // Precalcular fibras con seed por defecto
        this._buildFibers('#000000');
    }

    public forceInvalidateTip(): void {
        this.lastColor = '';
        this.lastAngle = -999;
        this.lastAspect = -1;
    }

    public updateTip(profile: IBrushProfile, color: string): void {
        if (
            color === this.lastColor &&
            profile.angle === this.lastAngle &&
            profile.aspectRatio === this.lastAspect
        ) return;

        this.lastColor = color;
        this.lastAngle = profile.angle;
        this.lastAspect = profile.aspectRatio;

        this._buildFibers(color);
    }

    private _buildFibers(color: string): void {
        // Seed basado en color — mismo color → mismas fibras siempre
        const colorNum = parseInt(color.replace('#', ''), 16) || 0;
        const rng = new SeededRNG(colorNum ^ 7919);

        const fiberCount = 5;
        this.fiberOffsets = [];

        for (let i = 0; i < fiberCount; i++) {
            const t = (i / fiberCount) * 2 - 1;
            const jitter = (rng.next() - 0.5) * (1 / fiberCount);
            const nx = (t + jitter) * 0.82; // normalizado ∈ [-0.82, 0.82]

            if (Math.abs(nx) >= 1) continue;

            this.fiberOffsets.push({
                nx,
                fiberWidth: 0.4 + rng.next() * 0.6 * (1 - Math.abs(t) * 0.4),
                lengthRatio: 0.55 + rng.next() * 0.35,
                offsetY: (rng.next() - 0.5) * 0.25,
            });
        }
    }

    // === Inicializamos el buffer al empezar a dibujar ===
    public beginStroke(_p: IBrushProfile, _c: string, startPt: BasePoint): void {
        this.inputBuffer = [startPt];
    }

    // === EL ESTABILIZADOR PONDERADO ===
    public transformInput(profile: IBrushProfile, data: BasePoint): BasePoint {
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

    public stamp(
        ctx: CanvasRenderingContext2D,
        profile: IBrushProfile,
        color: string,
        x: number,
        y: number,
        pressure: number
    ): void {
        const sizeMultiplier = 1 + (pressure - 0.5) * profile.pressureSizeSensitivity * 2;
        const finalSize = Math.max(0.5, profile.baseSize * sizeMultiplier);

        const radiusY = finalSize / 2;
        const radiusX = radiusY * profile.aspectRatio;

        const showFibers = radiusX > 2.0;

        if (!showFibers) {
            // Trazo pequeño: dibujar directamente sin offscreen — puro y rápido
            ctx.save();
            ctx.globalAlpha = profile.baseOpacity;
            ctx.fillStyle = color;
            ctx.translate(x, y);
            ctx.rotate((profile.angle * Math.PI) / 180);
            ctx.beginPath();
            ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
        }

        // Trazo grande: usar offscreen para aislar destination-out
        // El offscreen se trata como sprite temporal — dibujamos y volcamos

        // Tamaño del offscreen: diagonal del óvalo + margen
        const needed = Math.ceil(finalSize * 2) + 4;
        if (this.offscreen.width < needed || this.offscreen.height < needed) {
            this.offscreen.width = needed;
            this.offscreen.height = needed;
        }

        const cx = this.offscreen.width / 2;
        const cy = this.offscreen.height / 2;

        this.offCtx.clearRect(0, 0, this.offscreen.width, this.offscreen.height);

        // Aplicar rotación de la pluma en el offscreen
        this.offCtx.save();
        this.offCtx.translate(cx, cy);
        this.offCtx.rotate((profile.angle * Math.PI) / 180);

        // ── 1. Óvalo sólido ───────────────────────────────────────────────
        this.offCtx.fillStyle = color;
        this.offCtx.beginPath();
        this.offCtx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
        this.offCtx.fill();

        // ── 2. Fibras del felt tip ─────────────────────────────────────────
        // destination-out sobre el offscreen → solo afecta al óvalo recién dibujado
        // No toca nada del canvas principal
        this.offCtx.globalCompositeOperation = 'destination-out';
        this.offCtx.fillStyle = 'rgba(0,0,0,1)';

        for (const fiber of this.fiberOffsets) {
            const fiberX = fiber.nx * radiusX;
            const normalizedX = fiber.nx;
            if (Math.abs(normalizedX) >= 1) continue;

            const halfHeight = radiusY * Math.sqrt(1 - normalizedX * normalizedX);
            const fiberH = halfHeight * fiber.lengthRatio;
            const fiberOffY = fiber.offsetY * halfHeight;

            this.offCtx.fillRect(
                fiberX - fiber.fiberWidth / 2,
                fiberOffY - fiberH,
                fiber.fiberWidth,
                fiberH * 2
            );
        }

        this.offCtx.globalCompositeOperation = 'source-over';
        this.offCtx.restore();

        // ── 3. Volcar el offscreen sobre el canvas principal ──────────────
        // source-over garantiza que el negro puro del óvalo quede negro puro
        // sin interactuar con lo que hay debajo
        ctx.save();
        ctx.globalAlpha = profile.baseOpacity;
        ctx.drawImage(
            this.offscreen,
            0, 0, this.offscreen.width, this.offscreen.height,
            x - cx, y - cy, this.offscreen.width, this.offscreen.height
        );
        ctx.restore();
    }

    // === Limpiamos el buffer al levantar el lápiz ===
    public endStroke(): void {
        this.inputBuffer = [];
    }

    // InkRenderer ya usa un offscreen interno por stamp, por lo que su rebuild es One-Pass directo
    public rebuildStroke(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, points: StrokePoint[], helpers: any): void {
        ctx.save();
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
        helpers.simulateDrawing(ctx);
        ctx.restore();
    }
}