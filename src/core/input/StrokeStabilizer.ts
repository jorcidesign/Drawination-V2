// src/core/input/StrokeStabilizer.ts
//
// Estabilizador de coordenadas con ajuste dinámico por zoom.
//
// CAMBIOS vs versión anterior:
// - Sin velocity prediction (causaba saltos fantasma)
// - Sin recreación del filtro al cambiar zoom (causaba saltos)
//   Ahora usa setMinCutoff() para actualizar en caliente
// - minCutoff base bajado de 0.8 a 0.5 para reducir patrón cuadrado
// - beta bajado de 0.015 a 0.007 para tableta

import { OneEuroFilter } from '../math/OneEuroFilter';

export class StrokeStabilizer {

    private filter: OneEuroFilter;
    private lastCutoff: number = -1;

    // BASE_MIN_CUTOFF: cuánto suavizado a velocidad baja con zoom=1
    // 0.5 = balance entre suavizado y fidelidad para tableta
    // Bajar a 0.3 para más suavizado (más lag), subir a 0.8 para menos
    private readonly BASE_MIN_CUTOFF = 0.5;

    // BETA: reduce el lag a alta velocidad
    // 0.007 para tableta, 0.02 para mouse
    private readonly BETA = 0.007;

    constructor() {
        this.filter = new OneEuroFilter(this.BASE_MIN_CUTOFF, this.BETA, 1.0);
    }

    public reset(): void {
        this.filter.reset();
        this.lastCutoff = -1;
    }

    public filter2D(
        x: number,
        y: number,
        zoom: number,
        timestamp: number
    ): { x: number; y: number } {

        // Cutoff adaptativo por zoom:
        // zoom=0.25 → cutoff=1.0  (lejos, más suavizado)
        // zoom=1.0  → cutoff=0.5  (normal)
        // zoom=4.0  → cutoff=0.25 (cerca, menos suavizado)
        const adjustedCutoff = Math.max(0.15, Math.min(2.0,
            this.BASE_MIN_CUTOFF / Math.sqrt(Math.max(0.05, zoom))
        ));

        // Actualizar minCutoff en caliente — sin recrear el filtro
        if (Math.abs(adjustedCutoff - this.lastCutoff) > 0.05) {
            this.lastCutoff = adjustedCutoff;
            this.filter.setMinCutoff(adjustedCutoff);
        }

        return this.filter.filter(x, y, timestamp);
    }
}