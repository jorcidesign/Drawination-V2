// src/core/math/ValueNoise2D.ts
export class ValueNoise2D {
    private static hash(x: number, y: number, seed: number): number {
        const n = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453123;
        return n - Math.floor(n);
    }

    private static lerp(a: number, b: number, t: number): number {
        return a + (b - a) * t;
    }

    public static get(x: number, y: number, frequency: number, seed: number): number {
        const px = x * frequency;
        const py = y * frequency;

        const ix = Math.floor(px);
        const iy = Math.floor(py);

        const fx = px - ix;
        const fy = py - iy;

        const ux = fx * fx * (3 - 2 * fx);
        const uy = fy * fy * (3 - 2 * fy);

        const v00 = this.hash(ix, iy, seed);
        const v10 = this.hash(ix + 1, iy, seed);
        const v01 = this.hash(ix, iy + 1, seed);
        const v11 = this.hash(ix + 1, iy + 1, seed);

        const r1 = this.lerp(v00, v10, ux);
        const r2 = this.lerp(v01, v11, ux);

        return this.lerp(r1, r2, uy);
    }
}