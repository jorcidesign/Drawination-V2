// src/core/RDPSimplifier.ts
import type { StrokePoint } from '../io/BinarySerializer';

export class RDPSimplifier {

    private static perpendicularDistance(
        p: StrokePoint, a: StrokePoint, b: StrokePoint
    ): number {
        const abx = b.x - a.x, aby = b.y - a.y;
        const apx = p.x - a.x, apy = p.y - a.y;
        const abLen2 = abx * abx + aby * aby;
        if (abLen2 < 1e-10) return Math.sqrt(apx * apx + apy * apy);
        return Math.abs(abx * apy - aby * apx) / Math.sqrt(abLen2);
    }

    private static curvatureAt(
        prev: StrokePoint, curr: StrokePoint, next: StrokePoint
    ): number {
        const ax = curr.x - prev.x, ay = curr.y - prev.y;
        const bx = next.x - curr.x, by = next.y - curr.y;
        const lenA = Math.sqrt(ax * ax + ay * ay);
        const lenB = Math.sqrt(bx * bx + by * by);
        if (lenA < 1e-6 || lenB < 1e-6) return 0;
        const cosT = (ax * bx + ay * by) / (lenA * lenB);
        return (1 - cosT) * 0.5;
    }

    private static rdpAdaptive(
        points: StrokePoint[],
        curvatures: Float32Array,
        epsilonBase: number,
        start: number,
        end: number,
        keep: Uint8Array
    ): void {
        if (end <= start + 1) return;

        let maxDist = 0;
        let maxIdx = start;

        for (let i = start + 1; i < end; i++) {
            const d = this.perpendicularDistance(points[i], points[start], points[end]);
            if (d > maxDist) { maxDist = d; maxIdx = i; }
        }

        const curv = curvatures[maxIdx];
        const epsilonLocal = epsilonBase * Math.max(0.3, 3.0 - curv * 3.375);

        if (maxDist > epsilonLocal) {
            keep[maxIdx] = 1;
            this.rdpAdaptive(points, curvatures, epsilonBase, start, maxIdx, keep);
            this.rdpAdaptive(points, curvatures, epsilonBase, maxIdx, end, keep);
        }
    }

    static simplify(points: StrokePoint[], brushSize: number): StrokePoint[] {
        const n = points.length;
        if (n <= 3) return points;

        // Epsilon hiper-estricto: Tolerancia máxima de 0.15 a 1 pixel de desviación.
        const epsilon = Math.max(0.15, brushSize * 0.01);

        const curvatures = new Float32Array(n);
        for (let i = 1; i < n - 1; i++) {
            curvatures[i] = this.curvatureAt(points[i - 1], points[i], points[i + 1]);
        }

        const keep = new Uint8Array(n);
        keep[0] = 1;
        keep[n - 1] = 1;

        // Limitar la distancia máxima a 15px. Si dejamos huecos más grandes, 
        // la curva de Bézier se deforma inevitablemente.
        const maxGap = Math.min(15, Math.max(5, brushSize * 0.5));
        const curvThreshold = 0.25;

        let lastKeptIdx = 0;

        for (let i = 1; i < n - 1; i++) {
            const prev = points[lastKeptIdx];
            const curr = points[i];

            const dx = curr.x - prev.x;
            const dy = curr.y - prev.y;
            const d = Math.sqrt(dx * dx + dy * dy);

            // Sensibilidad de presión extrema (2.5% de cambio). 
            // Capta las desvanecidas sutiles de la Wacom/iPad.
            const pDiff = Math.abs(curr.pressure - points[i - 1].pressure);

            const isTurning = curvatures[i] > curvThreshold;

            if (d > maxGap || pDiff > 0.025 || isTurning) {
                keep[i] = 1;
                lastKeptIdx = i;
            }
        }

        // ============================================================
        //  LA REGLA SAGRADA: PROTECCIÓN DE LA COLA (TAIL PROTECTION)
        //  Nunca tocamos los últimos 5 puntos del trazo.
        // ============================================================
        const tailSize = Math.min(5, n);
        for (let i = n - tailSize; i < n; i++) {
            keep[i] = 1;
        }

        // Ejecutamos la limpieza espacial en el resto de la línea
        this.rdpAdaptive(points, curvatures, epsilon, 0, n - 1, keep);

        const result: StrokePoint[] = [];
        for (let i = 0; i < n; i++) {
            if (keep[i] === 1) result.push(points[i]);
        }

        return result;
    }
}