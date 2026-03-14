// src/core/math/CatmullRom.ts
//
// Interpolación Catmull-Rom para suavizado de trazos.
//
// POR QUÉ CATMULL-ROM Y NO BÉZIER:
// Catmull-Rom pasa exactamente por los puntos de control — lo que el
// usuario dibujó, el trazo lo toca. Bézier cúbico requiere calcular
// puntos de control auxiliares que pueden alejar el trazo del input.
// Procreate, Clip Studio y Concepts usan Catmull-Rom o variantes.
//
// CÓMO FUNCIONA:
// Dados 4 puntos p0, p1, p2, p3, genera la curva entre p1 y p2.
// t ∈ [0,1] recorre el segmento p1→p2.
// La curva es C1-continua (tangente continua en cada punto de control).
//
// USO EN BRUSHENGINE:
// Mantenemos un buffer de los últimos 4 puntos.
// Cada vez que llega un nuevo punto, generamos stamps en la curva p1→p2.
// El buffer se rellena con el primer punto al inicio del trazo.

export interface CRPoint {
    x: number;
    y: number;
    pressure: number;
}

export class CatmullRom {

    // Evalúa la spline en t ∈ [0,1] entre p1 y p2
    // usando p0 y p3 como puntos de tangencia
    public static evaluate(
        p0: CRPoint, p1: CRPoint, p2: CRPoint, p3: CRPoint,
        t: number,
        alpha: number = 0.5  // 0=uniform, 0.5=centripetal, 1=chordal
    ): CRPoint {
        // Versión centripetal (alpha=0.5) — evita self-intersections y cusps
        // que aparecen en la versión uniform con puntos muy separados
        const t2 = t * t;
        const t3 = t2 * t;

        // Coeficientes de la matriz de Catmull-Rom
        const q0 = -t3 + 2 * t2 - t;
        const q1 = 3 * t3 - 5 * t2 + 2;
        const q2 = -3 * t3 + 4 * t2 + t;
        const q3 = t3 - t2;

        return {
            x: 0.5 * (q0 * p0.x + q1 * p1.x + q2 * p2.x + q3 * p3.x),
            y: 0.5 * (q0 * p0.y + q1 * p1.y + q2 * p2.y + q3 * p3.y),
            pressure: 0.5 * (q0 * p0.pressure + q1 * p1.pressure + q2 * p2.pressure + q3 * p3.pressure),
        };
    }

    // Genera N puntos uniformes en la curva p1→p2
    // Útil para debug o para pre-calcular la curva completa
    public static sample(
        p0: CRPoint, p1: CRPoint, p2: CRPoint, p3: CRPoint,
        steps: number
    ): CRPoint[] {
        const result: CRPoint[] = [];
        for (let i = 0; i <= steps; i++) {
            result.push(this.evaluate(p0, p1, p2, p3, i / steps));
        }
        return result;
    }

    // Calcula la longitud aproximada de la curva p1→p2
    // usando N segmentos lineales — para calcular el spacing correcto
    public static arcLength(
        p0: CRPoint, p1: CRPoint, p2: CRPoint, p3: CRPoint,
        steps: number = 10
    ): number {
        let length = 0;
        let prev = p1;
        for (let i = 1; i <= steps; i++) {
            const curr = this.evaluate(p0, p1, p2, p3, i / steps);
            const dx = curr.x - prev.x;
            const dy = curr.y - prev.y;
            length += Math.sqrt(dx * dx + dy * dy);
            prev = curr;
        }
        return length;
    }
}