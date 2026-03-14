// src/core/render/renderers/HardRoundRenderer.ts
import type { IBrushRenderer } from './IBrushRenderer';
import type { IBrushProfile } from '../profiles/IBrushProfile';
import type { BasePoint } from '../../../input/InputManager';
import { BezierEasing } from '../../math/BezierEasing';

export class HardRoundRenderer implements IBrushRenderer {
    // Buffer para la estabilización del trazo
    private inputBuffer: BasePoint[] = [];

    public beginStroke(profile: IBrushProfile, color: string, startPt: BasePoint): void {
        this.inputBuffer = [startPt];
    }

    // === EL ESTABILIZADOR PONDERADO ===
    public transformInput(profile: IBrushProfile, data: BasePoint): BasePoint {
        const windowSize = profile.physics?.stabilizerWindow ?? 1;

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

    // === EL STAMP PROCEDURAL Y LA PRESIÓN BEZIER ===
    public stamp(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, x: number, y: number, rawPressure: number): void {
        const flow = profile.physics?.flow ?? 1.0;
        const p1y = profile.physics?.pressureCurve?.p1y ?? 0.2;
        const p2y = profile.physics?.pressureCurve?.p2y ?? 0.8;

        // 1. Mapeamos la presión a través de la curva Bezier profesional
        const mappedPressure = BezierEasing.evaluate(rawPressure, p1y, p2y);

        // === FIX: ACUMULACIÓN Y SOL VIOLETA ===
        // El slider de la UI dicta profile.baseOpacity.
        // El flow es un parámetro interno del pincel (cuánta pintura suelta).
        // Evitamos que caiga por debajo de 0.03 para evitar errores de redondeo de 8-bits.
        let rawOpacity = flow * mappedPressure * profile.baseOpacity;
        const stampOpacity = Math.max(0.03, Math.min(1, rawOpacity));

        // Si la presión mapeada es literalmente cero (por la curva Bezier), no dibujamos.
        // Esto preserva la sensación de "inicio suave" sin manchar.
        if (mappedPressure <= 0.01) return;

        ctx.globalAlpha = stampOpacity;
        ctx.fillStyle = color;

        // 3. Dibujo Vectorial Puro (El navegador aplica AA sub-pixel gratis)
        const radius = profile.baseSize / 2;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    public endStroke() {
        this.inputBuffer = [];
    }
}