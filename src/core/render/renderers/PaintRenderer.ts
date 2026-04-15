// src/core/render/renderers/PaintRenderer.ts
import type { IBrushRenderer } from './IBrushRenderer';
import type { IBrushProfile } from '../profiles/IBrushProfile';
import type { BasePoint } from '../../../input/InputManager';
import { ValueNoise2D } from '../../math/ValueNoise2D';
import type { StrokePoint } from '../../io/BinarySerializer';
import { BezierEasing } from '../../math/BezierEasing';
// ─── Constantes internas del renderer ────────────────────────────────────────
// No van en IBrushProfile porque no son parámetros de usuario.
// Son decisiones de implementación del PaintRenderer.
const LOD_THRESHOLD_MEDIUM = 3;  // px/frame → stride 2 (cada 2 cerdas)
const LOD_THRESHOLD_LOW = 8;  // px/frame → stride 4 (cada 4 cerdas)
const OPACITY_BATCH_TOLERANCE = 0.05; // ±0.05 → misma opacidad → mismo grupo GPU
const NOISE_SIZE = 128;          // textura de ruido 128×128 Float32

// ─── PRNG ─────────────────────────────────────────────────────────────────────
// Idéntico al de Gemini — no tocamos para no romper determinismo existente
class SimplePRNG {
    private s: number;
    constructor(seed: number) {
        this.s = seed === 0 ? 1 : seed;
    }
    next(): number {
        const x = Math.sin(this.s++) * 10000;
        return x - Math.floor(x);
    }
}

// ─── Bristle ──────────────────────────────────────────────────────────────────
// AÑADIDOS: localDist, separationWeight, idx
// localDist         → sqrt(localX²+localY²)/radius, precalculado UNA vez
// separationWeight  → lag × localDist, elimina 2 multiplicaciones por stamp
// idx               → posición en el array, para el batching sin indexOf O(N)
interface Bristle {
    localX: number;
    localY: number;
    thickness: number;
    inkCapacity: number;
    lag: number;
    jitterMod: number;
    localDist: number;
    separationWeight: number;
    idx: number;
}

interface BristleGroup {
    opacity: number;
    lineWidth: number;
    indices: number[];   // índices en this.bristles — evita guardar referencias
}

export class PaintRenderer implements IBrushRenderer {

    private bristles: Bristle[] = [];
    private brushSeed: number = 0;

    private globalReservoir: number = 1.0;
    private strokeConsumed: number = 0.0;

    private smoothVelocity = { x: 0, y: 0 };
    private lastPos = { x: 0, y: 0 };
    private lastStrokeDir = { x: 1, y: 0 };

    // Noise texture precalculada — se genera UNA vez por stroke en beginStroke()
    // En stamp() es un array lookup O(1) en lugar de ValueNoise2D.get() (10 ops)
    private noiseTexture: Float32Array | null = null;

    // ── generateBristles ──────────────────────────────────────────────────
    // Extraído de beginStroke() para que sea reusable.
    // Calcula localDist y separationWeight UNA sola vez aquí.
    private generateBristles(rng: SimplePRNG, count: number, radius: number): Bristle[] {
        const out: Bristle[] = [];
        for (let i = 0; i < count; i++) {
            const r = radius * Math.sqrt(rng.next());
            const theta = rng.next() * Math.PI * 2;
            const lx = r * Math.cos(theta);
            const ly = r * Math.sin(theta);

            const localDist = r / radius;                   // ∈ [0,1]
            const lag = localDist * 0.4;

            out.push({
                localX: lx,
                localY: ly,
                thickness: 2.5 - localDist * 1.5,
                inkCapacity: 1.0 - localDist * 0.5,
                lag,
                jitterMod: rng.next() - 0.5,
                localDist,
                separationWeight: lag * localDist,          // precalculado
                idx: i,
            });
        }
        return out;
    }

    // ── generateNoiseTexture ──────────────────────────────────────────────
    // Value Noise 2D en Float32Array 128×128.
    // Se genera UNA vez por stroke. En stamp() es un array[iy*128+ix] lookup.
    // Usa ValueNoise2D.get() del proyecto para coherencia — solo lo precachea.
    private generateNoiseTexture(frequency: number, seed: number): Float32Array {
        const tex = new Float32Array(NOISE_SIZE * NOISE_SIZE);
        for (let py = 0; py < NOISE_SIZE; py++) {
            for (let px = 0; px < NOISE_SIZE; px++) {
                // Coordenadas de mundo arbitrarias — el seed diferencia brushes
                tex[py * NOISE_SIZE + px] = ValueNoise2D.get(
                    px / frequency,
                    py / frequency,
                    frequency,
                    seed
                );
            }
        }
        return tex;
    }

    // ── sampleNoise ───────────────────────────────────────────────────────
    // Lookup O(1) con wrapping. Reemplaza la llamada a ValueNoise2D.get()
    // dentro del loop de stamps (que hacía 10 operaciones matemáticas cada vez).
    private sampleNoise(worldX: number, worldY: number, frequency: number): number {
        if (!this.noiseTexture) return 0.875;
        const ix = ((Math.floor(worldX * frequency) % NOISE_SIZE) + NOISE_SIZE) % NOISE_SIZE;
        const iy = ((Math.floor(worldY * frequency) % NOISE_SIZE) + NOISE_SIZE) % NOISE_SIZE;
        return this.noiseTexture[iy * NOISE_SIZE + ix];
    }

    // ── beginStroke ───────────────────────────────────────────────────────
    // Idéntico a Gemini en lógica de seed y reservorio.
    // AÑADIDO: generación de noiseTexture UNA vez por stroke.
    public beginStroke(profile: IBrushProfile, _color: string, startPt: BasePoint): void {
        // FIX DETERMINISMO — igual que Gemini: cuantizar como el BinarySerializer
        const qx = Math.round(startPt.x * 100);
        const qy = Math.round(startPt.y * 100);
        const qp = Math.round(startPt.pressure * 1023);
        const seed = qx * 73 + qy * 19 + qp * 11;
        const rng = new SimplePRNG(seed);

        this.brushSeed = Math.floor(rng.next() * 100000);
        this.globalReservoir = 1.0;
        this.strokeConsumed = 0.0;
        this.smoothVelocity = { x: 0, y: 0 };
        this.lastPos = { x: startPt.x, y: startPt.y };
        this.lastStrokeDir = { x: 1, y: 0 };

        const count = profile.physics?.bristleCount ?? 30;
        const radius = profile.baseSize / 2;
        this.bristles = this.generateBristles(rng, count, radius);

        // Generar noise UNA vez — usada por todos los stamps de este stroke
        const freq = profile.physics?.grainFrequency ?? 0.12;
        this.noiseTexture = this.generateNoiseTexture(freq, this.brushSeed);
    }

    // ── getStep ───────────────────────────────────────────────────────────
    // Sin cambios vs Gemini — ya era correcto
    public getStep(profile: IBrushProfile, baseStep: number, pressure: number, dx: number, dy: number): number {
        const speed = Math.sqrt(dx * dx + dy * dy);
        const vk = profile.physics?.velocityK ?? 0.3;
        const velComp = 1.0 + speed * vk * 0.1;
        const pressComp = 1.0 - pressure * 0.3;
        return Math.max(1.0, Math.min(baseStep * velComp * pressComp, baseStep * 3.0));
    }

    // ── updateVelocity ────────────────────────────────────────────────────
    // Sin cambios vs Gemini — EMA ya estaba bien
    private updateVelocity(x: number, y: number): number {
        const dx = x - this.lastPos.x;
        const dy = y - this.lastPos.y;
        const emaAlpha = 0.15;
        this.smoothVelocity.x += (dx - this.smoothVelocity.x) * emaAlpha;
        this.smoothVelocity.y += (dy - this.smoothVelocity.y) * emaAlpha;
        this.lastPos = { x, y };
        return Math.sqrt(this.smoothVelocity.x ** 2 + this.smoothVelocity.y ** 2);
    }

    // ── stamp ─────────────────────────────────────────────────────────────
    // OPTIMIZACIONES aplicadas respecto a Gemini:
    //   1. sampleNoise()       → O(1) lookup vs 10 ops matemáticas
    //   2. localDist lookup    → elimina sqrt por cerda
    //   3. separationWeight    → elimina 2× por cerda
    //   4. sepX/sepY precalc   → fuera del loop de cerdas
    //   5. LOD stride          → reduce cerdas activas según velocidad
    //   6. Batching por opacidad → N grupos × 1 ctx.stroke() vs 1 por cerda
    public stamp(
        ctx: CanvasRenderingContext2D,
        profile: IBrushProfile,
        color: string,
        x: number,
        y: number,
        rawPressure: number
    ): void {
        const speed = this.updateVelocity(x, y);

        // 1. EVALUAR CURVA DE PRESIÓN Y MULTIPLICADORES
        const p1y = profile.physics?.pressureCurve?.p1y ?? 0.25;
        const p2y = profile.physics?.pressureCurve?.p2y ?? 0.65;
        const mappedPressure = BezierEasing.evaluate(rawPressure, p1y, p2y);

        // Tamaño
        const sizeMin = profile.pressureSizeMin ?? 0.60;
        const sizeMax = profile.pressureSizeMax ?? 0.63;
        const currentSizeMultiplier = sizeMin + (sizeMax - sizeMin) * mappedPressure;
        const finalSize = Math.max(0.5, profile.baseSize * currentSizeMultiplier);
        const sizeRatio = finalSize / profile.baseSize;

        // Opacidad
        const opMin = profile.pressureOpacityMin ?? 0.0;
        const opMax = profile.pressureOpacityMax ?? 1.0;
        const currentOpacityMultiplier = opMin + (opMax - opMin) * mappedPressure;

        // Flujo Dinámico
        const flowMin = profile.pressureFlowMin ?? 0.08;
        const flowMax = profile.pressureFlowMax ?? 0.24;
        const baseFlow = profile.baseFlow ?? 0.95;
        const currentFlowMultiplier = flowMin + (flowMax - flowMin) * mappedPressure;
        const dynamicFlow = baseFlow * currentFlowMultiplier;

        // Dirección del trazo
        let dir = { x: 1, y: 0 };
        if (speed > 0.1) {
            dir = { x: this.smoothVelocity.x / speed, y: this.smoothVelocity.y / speed };
            this.lastStrokeDir = dir;
        } else {
            dir = this.lastStrokeDir;
        }

        // Físicas del depósito y la separación de cerdas
        const depletionRate = profile.physics?.depletionRate ?? 0.003;
        const stepDist = Math.max(1, Math.sqrt((x - this.lastPos.x) ** 2 + (y - this.lastPos.y) ** 2));
        const consumed = rawPressure * depletionRate * stepDist;

        this.strokeConsumed += consumed;
        this.globalReservoir = Math.max(0, this.globalReservoir - consumed);
        const localInk = Math.max(0, Math.min(1, this.globalReservoir * (1 - this.strokeConsumed * 0.3)));

        const satK = profile.physics?.saturationK ?? 0.15;
        const baseDeposit = rawPressure * localInk;
        const layerCount = speed < 1 ? 5 : 1;
        let finalDeposit = baseDeposit * Math.exp(-satK * layerCount);
        finalDeposit = Math.max(finalDeposit, localInk * 0.02);

        // Dinámica escalar para las cerdas
        const sepFactor = profile.physics?.separationFactor ?? 0.2;
        const bristleRadius = finalSize / 2; // El radio ahora depende del finalSize (escalado)
        const maxSeparation = bristleRadius * 0.4;
        const separationMag = Math.min(speed * sepFactor, maxSeparation);

        const sepX = -dir.x * separationMag;
        const sepY = -dir.y * separationMag;

        const freq = profile.physics?.grainFrequency ?? 0.12;
        const grain = this.sampleNoise(x, y, freq);
        const grainFactor = 0.75 + grain * 0.25;

        const perp = { x: -dir.y, y: dir.x };
        const bristleLength = bristleRadius * 0.5;

        const stride = speed > LOD_THRESHOLD_LOW ? 4 : speed > LOD_THRESHOLD_MEDIUM ? 2 : 1;
        const count = this.bristles.length;

        const wxArr = new Float32Array(count);
        const wyArr = new Float32Array(count);
        const opArr = new Float32Array(count);

        for (let i = 0; i < count; i += stride) {
            const bristle = this.bristles[i];

            // Escalamos las posiciones relativas de cada cerda
            const scaledLocalX = bristle.localX * sizeRatio;
            const scaledLocalY = bristle.localY * sizeRatio;

            wxArr[i] = x + scaledLocalX + sepX * bristle.separationWeight;
            wyArr[i] = y + scaledLocalY + sepY * bristle.separationWeight;

            const t = bristle.localDist;
            let edgeBoost = 0;
            if (localInk > 0.3) {
                if (t >= 0.65 && t <= 0.85) {
                    const et = (t - 0.65) / 0.2;
                    edgeBoost = localInk * et * et;
                } else if (t > 0.85) {
                    edgeBoost = localInk * (1.0 - (t - 0.85) / 0.15);
                }
            }

            // Opacidad de esta cerda en particular
            let rawOpacity = grainFactor * bristle.inkCapacity * (finalDeposit + edgeBoost * 0.15);

            // La magia final: Techo (baseOpacity) * Opacidad por Presión * Flujo Dinámico
            rawOpacity *= profile.baseOpacity * currentOpacityMultiplier * dynamicFlow;

            // === EL ESCUDO DE 8-BITS ===
            if (rawOpacity < 0.005) {
                opArr[i] = 0;
                continue;
            }

            // Piso de 2.5% de opacidad para proteger el color original
            opArr[i] = Math.max(0.025, Math.min(1, rawOpacity));
        }

        // BATCHING por cerdas de opacidad similar
        const groups: BristleGroup[] = [];

        for (let i = 0; i < count; i += stride) {
            const op = opArr[i];
            if (op <= 0) continue;

            let found = false;
            for (const g of groups) {
                if (Math.abs(g.opacity - op) <= OPACITY_BATCH_TOLERANCE) {
                    g.indices.push(i);
                    found = true;
                    break;
                }
            }
            if (!found) {
                groups.push({
                    opacity: op,
                    lineWidth: this.bristles[i].thickness * sizeRatio, // Escalamos el grosor de la cerda
                    indices: [i],
                });
            }
        }

        ctx.strokeStyle = color;
        ctx.lineCap = 'round';

        for (const group of groups) {
            ctx.globalAlpha = group.opacity;
            ctx.lineWidth = group.lineWidth;
            ctx.beginPath();

            for (const i of group.indices) {
                const bristle = this.bristles[i];
                const wx = wxArr[i];
                const wy = wyArr[i];

                const scaledThickness = bristle.thickness * sizeRatio;
                const jitter = bristle.jitterMod * scaledThickness * 0.4;

                const tipX = wx + dir.x * bristleLength + perp.x * jitter;
                const tipY = wy + dir.y * bristleLength + perp.y * jitter;
                const cpX = wx + dir.x * bristleLength * 0.5 + perp.x * jitter * 0.5;
                const cpY = wy + dir.y * bristleLength * 0.5 + perp.y * jitter * 0.5;

                ctx.moveTo(wx, wy);
                ctx.quadraticCurveTo(cpX, cpY, tipX, tipY);
            }
            ctx.stroke();
        }
    }

    // ── endStroke ────────────────────────────────────────────────────────
    // Liberar la noise texture para no acumular memoria entre strokes
    public endStroke(): void {
        this.noiseTexture = null;
    }

    // Reconstrucción Two-Pass: evita que la opacidad del trazo se contamine con los píxeles del lienzo
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