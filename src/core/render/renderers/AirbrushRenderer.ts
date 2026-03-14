// src/core/render/renderers/AirbrushRenderer.ts
//
// Aerógrafo vectorial de alta calidad — física de Procreate/Concepts.
//
// FÍSICA:
// Un aerógrafo real dispersa pigmento en nube gaussiana:
//   - Centro opaco, borde completamente transparente (falloff suave)
//   - Acumulación natural: pasar varias veces oscurece la zona
//   - Sensible a presión en OPACIDAD (no tamaño) — como el aerógrafo real
//   - Flow bajo: cada stamp deposita poco, se acumula con el tiempo
//
// IMPLEMENTACIÓN VECTORIAL — sin loops de partículas:
// El stamp es un gradiente radial aplicado una sola vez via CanvasGradient.
// Costo por stamp: O(1) — igual que dibujar un círculo.
// El falloff gaussiano se aproxima con una secuencia de ColorStops
// que discretizan la curva e^(-r²) — visualmente indistinguible.
//
// DETERMINISMO:
// No hay Math.random() en el stamp — mismo input → mismo output.
// El tipCanvas contiene el gradiente pre-renderizado y se regenera
// solo cuando cambia color/tamaño. Ctrl+Z reproduce idéntico.
//
// PARTÍCULAS DE BORDE (opcionales, para textura):
// Unos pocos puntos estáticos en la zona exterior del gradiente
// generados con PRNG seeded — aportan organicidad sin coste.

import type { IBrushRenderer } from './IBrushRenderer';
import type { IBrushProfile } from '../profiles/IBrushProfile';
import type { BasePoint } from '../../../input/InputManager';

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

export class AirbrushRenderer implements IBrushRenderer {

    private tipCanvas: HTMLCanvasElement;
    private tipCtx: CanvasRenderingContext2D;

    private lastColor: string = '';
    private lastSize: number = 0;

    constructor() {
        this.tipCanvas = document.createElement('canvas');
        this.tipCtx = this.tipCanvas.getContext('2d')!;
    }

    // ── updateTip ─────────────────────────────────────────────────────────
    // Renderiza el gradiente gaussiano UNA vez. Stamp = drawImage.
    // Sin updateTip → sin regeneración innecesaria.
    public updateTip(profile: IBrushProfile, color: string): void {
        if (color === this.lastColor && profile.baseSize === this.lastSize) return;
        this.lastColor = color;
        this.lastSize = profile.baseSize;

        // El tipCanvas es 2x el radio para tener margen de falloff completo
        const size = Math.max(64, profile.baseSize * 2);
        this.tipCanvas.width = size;
        this.tipCanvas.height = size;
        const cx = size / 2;

        this.tipCtx.clearRect(0, 0, size, size);

        // ── Gradiente gaussiano ───────────────────────────────────────────
        // Aproximamos e^(-r²) con 6 color stops.
        // La curva gaussiana real: opacidad = e^(-(r/σ)²) con σ ≈ 0.4
        // Discretizada en stops para que el browser la interpole suave.
        const grad = this.tipCtx.createRadialGradient(cx, cx, 0, cx, cx, cx);
        const rgb = this.hexToRgb(color);

        // Stops calibrados para simular e^(-r²/0.32) — gaussiana estándar aerógrafo
        // r=0.00 → alpha 1.00  (centro opaco)
        // r=0.30 → alpha 0.78  (gaussiana: e^(-0.09/0.32) ≈ 0.75)
        // r=0.50 → alpha 0.46  (gaussiana: e^(-0.25/0.32) ≈ 0.46)
        // r=0.70 → alpha 0.15  (gaussiana: e^(-0.49/0.32) ≈ 0.22)
        // r=0.85 → alpha 0.04  (gaussiana: e^(-0.72/0.32) ≈ 0.10)
        // r=1.00 → alpha 0.00  (borde completamente transparente)
        grad.addColorStop(0.00, `rgba(${rgb}, 1.00)`);
        grad.addColorStop(0.30, `rgba(${rgb}, 0.78)`);
        grad.addColorStop(0.50, `rgba(${rgb}, 0.46)`);
        grad.addColorStop(0.70, `rgba(${rgb}, 0.15)`);
        grad.addColorStop(0.85, `rgba(${rgb}, 0.04)`);
        grad.addColorStop(1.00, `rgba(${rgb}, 0.00)`);

        this.tipCtx.fillStyle = grad;
        this.tipCtx.beginPath();
        this.tipCtx.arc(cx, cx, cx, 0, Math.PI * 2);
        this.tipCtx.fill();

        // ── Partículas de borde ───────────────────────────────────────────
        // ~20 puntos en la zona exterior (r ∈ [0.5, 0.95]) generados con
        // PRNG seeded para que sean siempre los mismos (determinismo).
        // Aportan la textura "spray" sin loops costosos en stamp().
        const rng = new SeededRNG(parseInt(color.replace('#', ''), 16) ^ (size * 1337));
        const particleCount = Math.max(12, Math.floor(cx * 0.6));

        this.tipCtx.globalCompositeOperation = 'source-atop';

        for (let i = 0; i < particleCount; i++) {
            const angle = rng.next() * Math.PI * 2;
            // Distribución radial sesgada hacia el borde exterior
            const r = cx * (0.5 + rng.next() * 0.45);
            const px = cx + Math.cos(angle) * r;
            const py = cx + Math.sin(angle) * r;

            // Tamaño de partícula: micro (0.4–1.2px) — no puntos grandes
            const pSize = 0.4 + rng.next() * 0.8;
            // Opacidad: muy baja, proporcional a la distancia del centro
            // Las partículas más exteriores son casi invisibles
            const pAlpha = (1 - r / cx) * 0.35 * rng.next();

            this.tipCtx.globalAlpha = pAlpha;
            this.tipCtx.fillStyle = `rgb(${rgb})`;
            this.tipCtx.beginPath();
            this.tipCtx.arc(px, py, pSize, 0, Math.PI * 2);
            this.tipCtx.fill();
        }

        this.tipCtx.globalCompositeOperation = 'source-over';
        this.tipCtx.globalAlpha = 1;
    }

    private hexToRgb(hex: string): string {
        const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return r
            ? `${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}`
            : '0, 0, 0';
    }

    public beginStroke(_profile: IBrushProfile, _color: string, _startPt: BasePoint): void { }

    // ── stamp ─────────────────────────────────────────────────────────────
    // Una sola llamada a drawImage — costo O(1) independiente del tamaño.
    // La opacidad responde a la presión (no el tamaño) — física de aerógrafo.
    // El flow bajo (0.15) asegura acumulación gradual y natural.
    public stamp(
        ctx: CanvasRenderingContext2D,
        profile: IBrushProfile,
        color: string,
        x: number,
        y: number,
        pressure: number
    ): void {
        const flow = profile.physics?.flow ?? 0.15;

        // Presión modula la cantidad de pintura que sale
        // Curva levemente cuadrática para más control en presiones bajas
        const pressureCurve = pressure * pressure * 0.4 + pressure * 0.6;
        const finalOpacity = Math.min(1, flow * pressureCurve * profile.baseOpacity * 3.5);

        if (finalOpacity < 0.001) return;

        ctx.globalAlpha = finalOpacity;

        const halfSize = profile.baseSize;  // tipCanvas es 2x el baseSize
        ctx.drawImage(this.tipCanvas, x - halfSize, y - halfSize, halfSize * 2, halfSize * 2);
    }

    public endStroke(): void { }
}