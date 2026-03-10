// src/core/OneEuroFilter.ts

class LowPassFilter {
    private prev: number = 0;
    private hasPrev: boolean = false;

    public filter(val: number, alpha: number): number {
        if (!this.hasPrev) {
            this.prev = val;
            this.hasPrev = true;
            return val;
        }
        this.prev = alpha * val + (1 - alpha) * this.prev;
        return this.prev;
    }

    public last(): number {
        return this.prev;
    }

    public reset(): void {
        this.hasPrev = false;
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

    private lastTime: number = -1;

    /**
     * @param minCutoff Frecuencia mínima de corte (Hz). Menor = más suave a baja velocidad, pero más lag. (Ej. 1.0)
     * @param beta Factor de compensación de velocidad. Mayor = menos lag a alta velocidad, pero más ruido. (Ej. 0.02)
     * @param dCutoff Frecuencia de corte para la derivada (velocidad). (Ej. 1.0)
     */
    constructor(minCutoff = 1.0, beta = 0.02, dCutoff = 1.0) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
    }

    public reset(): void {
        this.xFilt.reset();
        this.yFilt.reset();
        this.dxFilt.reset();
        this.dyFilt.reset();
        this.lastTime = -1;
    }

    private alpha(cutoff: number, dt: number): number {
        const tau = 1.0 / (2.0 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau / dt);
    }

    public filter(x: number, y: number, timestamp: number): { x: number, y: number } {
        if (this.lastTime === -1) {
            this.lastTime = timestamp;
            return {
                x: this.xFilt.filter(x, 1),
                y: this.yFilt.filter(y, 1)
            };
        }

        const dt = (timestamp - this.lastTime) / 1000.0; // Segundos
        if (dt <= 0) return { x: this.xFilt.last(), y: this.yFilt.last() };

        this.lastTime = timestamp;

        // Estimar la velocidad (Derivada)
        const dx = (x - this.xFilt.last()) / dt;
        const dy = (y - this.yFilt.last()) / dt;

        // Filtrar la velocidad
        const edx = this.dxFilt.filter(dx, this.alpha(this.dCutoff, dt));
        const edy = this.dyFilt.filter(dy, this.alpha(this.dCutoff, dt));

        // Calcular la frecuencia de corte basada en la velocidad
        const cutoffX = this.minCutoff + this.beta * Math.abs(edx);
        const cutoffY = this.minCutoff + this.beta * Math.abs(edy);

        // Filtrar finalmente las coordenadas (x, y)
        const filteredX = this.xFilt.filter(x, this.alpha(cutoffX, dt));
        const filteredY = this.yFilt.filter(y, this.alpha(cutoffY, dt));

        return { x: filteredX, y: filteredY };
    }
}