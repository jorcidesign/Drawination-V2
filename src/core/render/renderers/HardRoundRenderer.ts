// src/core/render/renderers/HardRoundRenderer.ts
import type { IBrushRenderer } from './IBrushRenderer';
import type { IBrushProfile } from '../profiles/IBrushProfile';
import type { BasePoint } from '../../../input/InputManager';
import { BezierEasing } from '../../math/BezierEasing';
import type { StrokePoint } from '../../io/BinarySerializer';

export class HardRoundRenderer implements IBrushRenderer {
    // Buffer para la estabilización del trazo
    private inputBuffer: BasePoint[] = [];

    public beginStroke(_profile: IBrushProfile, _color: string, startPt: BasePoint): void {
        this.inputBuffer = [startPt];
    }

    // === EL ESTABILIZADOR PONDERADO ===
    public transformInput(profile: IBrushProfile, data: BasePoint): BasePoint {
        const windowSize = profile.physics?.stabilizerWindow ?? 2;

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

    // === EL STAMP PROCEDURAL ===
    // === EL STAMP PROCEDURAL ===
    // === EL STAMP PROCEDURAL ===
    public stamp(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, x: number, y: number, rawPressure: number): void {
        const p1y = profile.physics?.pressureCurve?.p1y ?? 0.333;
        const p2y = profile.physics?.pressureCurve?.p2y ?? 0.667;

        // 1. Curva Bezier (Diagonal lineal = respuesta 1 a 1)
        const mappedPressure = BezierEasing.evaluate(rawPressure, p1y, p2y);

        // 2. LÍMITES DE FLUJO 
        const flowMin = profile.pressureFlowMin ?? 0.0;
        const flowMax = profile.pressureFlowMax ?? 1.0;
        const baseFlow = profile.baseFlow ?? profile.physics?.flow ?? 1.0;

        // 3. INTERPOLACIÓN DE FLUJO
        const currentFlowMultiplier = flowMin + (flowMax - flowMin) * mappedPressure;
        const dynamicFlow = baseFlow * currentFlowMultiplier;

        // 4. OPACIDAD FINAL
        let rawOpacity = dynamicFlow * profile.baseOpacity;

        // === FIX: EL ESCUDO ANTI-SOLARIZACIÓN (Bug de 8-Bits del Canvas) ===
        // Si el cálculo da una opacidad absurdamente baja (ej. < 0.5%), la descartamos
        // para no procesar basura matemática.
        if (rawOpacity < 0.005) return;

        // Forzamos un "piso seguro" del 2.5%. 
        // 0.025 * 255 = 6.375. Esto le da al navegador un número lo suficientemente 
        // grande para redondear correctamente y mantener tu Azul 100% Azul.
        const stampOpacity = Math.max(0.025, Math.min(1, rawOpacity));

        ctx.globalAlpha = stampOpacity;
        ctx.fillStyle = color;

        const radius = profile.baseSize / 2;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    public endStroke() {
        this.inputBuffer = [];
    }

    // Reconstrucción Two-Pass (Aísla la superposición de opacidades)
    public rebuildStroke(ctx: CanvasRenderingContext2D, _profile: IBrushProfile, _color: string, _points: StrokePoint[], helpers: any): void {
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