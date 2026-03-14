// src/core/math/OneEuroFilter.ts
//
// One Euro Filter — versión corregida y estable.
//
// CAMBIOS vs versión con velocity prediction:
// - Sin velocity prediction: causaba saltos fantasma al inicio de cada trazo
//   porque velX/velY del objeto anterior se propagaba al nuevo objeto creado
//   en _updateCutoff(). El primer punto recibía una predicción de velocidad
//   residual que lo desplazaba cientos de píxeles.
// - Sin recreación del filtro en caliente: también causaba saltos.
//   Ahora el minCutoff se actualiza directamente en el objeto existente.
//
// FIX PRINCIPAL (vs versión original del proyecto):
// La derivada se calcula sobre valores RAW, no sobre el valor filtrado.
// dx = (x_raw_actual - x_raw_anterior) / dt   ← CORRECTO
// dx = (x - xFilt.last()) / dt               ← INCORRECTO (bucle de retroalimentación)

class LowPassFilter {
    private prev: number = 0;
    private initialized = false;

    public filter(value: number, alpha: number): number {
        if (!this.initialized) {
            this.prev = value;
            this.initialized = true;
            return value;
        }
        const result = alpha * value + (1 - alpha) * this.prev;
        this.prev = result;
        return result;
    }

    public last(): number { return this.prev; }

    public reset(): void {
        this.initialized = false;
        this.prev = 0;
    }
}

export class OneEuroFilter {

    private minCutoff: number;
    private beta: number;
    private dCutoff: number;

    private xFilt = new LowPassFilter();
    private yFilt = new LowPassFilter();
    private dxFilt = new LowPassFilter();
    private dyFilt = new LowPassFilter();

    private lastTime = -1;

    // RAW anteriores — para calcular derivada correctamente
    private lastRawX = 0;
    private lastRawY = 0;

    constructor(minCutoff = 0.5, beta = 0.007, dCutoff = 1.0) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
    }

    // Permite cambiar minCutoff sin recrear el objeto ni perder el estado
    public setMinCutoff(value: number): void {
        this.minCutoff = value;
    }

    public reset(): void {
        this.xFilt.reset();
        this.yFilt.reset();
        this.dxFilt.reset();
        this.dyFilt.reset();
        this.lastTime = -1;
        this.lastRawX = 0;
        this.lastRawY = 0;
    }

    private alpha(cutoff: number, dt: number): number {
        const tau = 1.0 / (2.0 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau / dt);
    }

    public filter(x: number, y: number, timestamp: number): { x: number; y: number } {

        // Primer punto: sin filtrado, solo inicializar
        if (this.lastTime === -1) {
            this.lastTime = timestamp;
            this.lastRawX = x;
            this.lastRawY = y;
            return {
                x: this.xFilt.filter(x, 1),
                y: this.yFilt.filter(y, 1)
            };
        }

        let dt = (timestamp - this.lastTime) / 1000;
        // Clamp: evitar dt=0 y dt muy grande (pausa > 100ms)
        if (dt <= 0.0001) dt = 1 / 120;
        if (dt > 0.1) dt = 1 / 60;

        this.lastTime = timestamp;

        // Derivada sobre RAW — no sobre filtrado
        const dx = (x - this.lastRawX) / dt;
        const dy = (y - this.lastRawY) / dt;
        this.lastRawX = x;
        this.lastRawY = y;

        // Filtrar velocidad
        const alphaD = this.alpha(this.dCutoff, dt);
        const edx = this.dxFilt.filter(dx, alphaD);
        const edy = this.dyFilt.filter(dy, alphaD);

        // Cutoff adaptativo: a más velocidad, menos suavizado (menos lag)
        const cutoffX = this.minCutoff + this.beta * Math.abs(edx);
        const cutoffY = this.minCutoff + this.beta * Math.abs(edy);

        const filteredX = this.xFilt.filter(x, this.alpha(cutoffX, dt));
        const filteredY = this.yFilt.filter(y, this.alpha(cutoffY, dt));

        return { x: filteredX, y: filteredY };
    }
}