// src/core/math/BezierEasing.ts
export class BezierEasing {
    /**
     * Evalúa una curva de Bezier Cúbica en 1D (para mapear la presión).
     * P0 siempre es (0,0) y P3 siempre es (1,1).
     * @param t La presión cruda (0 a 1)
     * @param p1y Altura del primer punto de control
     * @param p2y Altura del segundo punto de control
     */
    public static evaluate(t: number, p1y: number, p2y: number): number {
        // B(t) = (1-t)³*P0 + 3(1-t)²*t*P1 + 3(1-t)*t²*P2 + t³*P3
        // Sabiendo que P0 = 0 y P3 = 1, se simplifica:
        const u = 1 - t;
        const result = (3 * u * u * t * p1y) + (3 * u * t * t * p2y) + (t * t * t);

        return Math.max(0, Math.min(1, result));
    }
}