// src/core/render/physics/PaintPhysics.ts
import type { IBrushProfile } from '../profiles/IBrushProfile';
import { ValueNoise2D } from '../../math/ValueNoise2D';

interface Bristle {
    localX: number;
    localY: number;
    thickness: number;
    inkCapacity: number;
    lag: number;
}

export class PaintPhysics {
    private bristles: Bristle[] = [];
    private brushSeed: number = 0;

    // Estado del trazo (Reservorio)
    private globalReservoir: number = 1.0;
    private strokeConsumed: number = 0.0;
    private stampIndex: number = 0;

    // Estado de Velocidad (EMA)
    private smoothVelocity = { x: 0, y: 0 };
    private lastPos = { x: 0, y: 0 };
    private lastStrokeDir = { x: 1, y: 0 };

    public beginStroke(profile: IBrushProfile, color: string, startX: number, startY: number) {
        this.brushSeed = Math.random() * 1000;
        this.globalReservoir = 1.0; // Pincel recién mojado en pintura
        this.strokeConsumed = 0.0;
        this.stampIndex = 0;
        this.smoothVelocity = { x: 0, y: 0 };
        this.lastPos = { x: startX, y: startY };
        this.lastStrokeDir = { x: 1, y: 0 };

        this.generateBristles(profile);
    }

    private generateBristles(profile: IBrushProfile) {
        this.bristles = [];
        const count = profile.physics?.bristleCount ?? 80;
        const radius = profile.baseSize / 2;

        for (let i = 0; i < count; i++) {
            // Distribución radial natural (más denso en el centro)
            const r = radius * Math.sqrt(Math.random());
            const theta = Math.random() * Math.PI * 2;

            const distFromCenter = r / radius;

            // Cerdas centrales más gruesas y con más tinta
            const thickness = 2.0 - (distFromCenter * 1.6); // 0.4 a 2.0
            const inkCapacity = 1.0 - (distFromCenter * 0.5); // 0.5 a 1.0
            const lag = distFromCenter * 0.4; // Las de afuera se arrastran más

            this.bristles.push({
                localX: r * Math.cos(theta),
                localY: r * Math.sin(theta),
                thickness,
                inkCapacity,
                lag
            });
        }
    }

    private updateVelocity(x: number, y: number): number {
        const dx = x - this.lastPos.x;
        const dy = y - this.lastPos.y;

        // Asumimos un dt constante ya que la interpolación espacial de drawMove nos da pasos regulares.
        // La "velocidad" aquí es proporcional a la distancia del paso.
        const rawVelX = dx;
        const rawVelY = dy;

        const emaAlpha = 0.15;
        this.smoothVelocity.x += (rawVelX - this.smoothVelocity.x) * emaAlpha;
        this.smoothVelocity.y += (rawVelY - this.smoothVelocity.y) * emaAlpha;

        this.lastPos = { x, y };

        return Math.sqrt(this.smoothVelocity.x ** 2 + this.smoothVelocity.y ** 2);
    }

    public getAdaptiveStep(profile: IBrushProfile, baseStep: number, pressure: number, dx: number, dy: number): number {
        const speed = Math.sqrt(dx * dx + dy * dy);
        const vk = profile.physics?.velocityK ?? 0.3;
        const velComp = 1.0 + (speed * vk * 0.1);
        const pressComp = 1.0 - (pressure * 0.3);

        const adaptive = baseStep * velComp * pressComp;
        return Math.max(1.0, Math.min(adaptive, baseStep * 3.0));
    }

    private generateBristlePath(bx: number, by: number, thickness: number, dir: { x: number, y: number }, length: number): Path2D {
        const path = new Path2D();
        const perp = { x: -dir.y, y: dir.x };
        const halfW = thickness / 2;

        const x0 = bx - perp.x * halfW;
        const y0 = by - perp.y * halfW;
        const x1 = bx + perp.x * halfW;
        const y1 = by + perp.y * halfW;

        const jitter = (Math.random() - 0.5) * thickness * 0.4;
        const tipX = bx + dir.x * length + perp.x * jitter;
        const tipY = by + dir.y * length + perp.y * jitter;

        const cpX = bx + dir.x * length * 0.5 + perp.x * jitter * 0.5;
        const cpY = by + dir.y * length * 0.5 + perp.y * jitter * 0.5;

        path.moveTo(x0, y0);
        path.lineTo(x1, y1);
        path.quadraticCurveTo(cpX + perp.x * halfW, cpY + perp.y * halfW, tipX, tipY);
        path.quadraticCurveTo(cpX - perp.x * halfW, cpY - perp.y * halfW, x0, y0);
        path.closePath();

        return path;
    }

    public stamp(ctx: CanvasRenderingContext2D, profile: IBrushProfile, color: string, x: number, y: number, pressure: number) {
        const speed = this.updateVelocity(x, y);
        let dir = { x: 1, y: 0 };

        if (speed > 0.1) {
            dir = { x: this.smoothVelocity.x / speed, y: this.smoothVelocity.y / speed };
            this.lastStrokeDir = dir;
        } else {
            dir = this.lastStrokeDir;
        }

        // 1. Dinámica del Reservorio (Se seca al pintar)
        const depletionRate = profile.physics?.depletionRate ?? 0.003;
        const stepDistance = Math.sqrt((x - this.lastPos.x) ** 2 + (y - this.lastPos.y) ** 2) || 1;
        const consumed = pressure * depletionRate * stepDistance;

        this.strokeConsumed += consumed;
        this.globalReservoir = Math.max(0, this.globalReservoir - consumed);
        const localInk = Math.max(0, Math.min(1, this.globalReservoir * (1 - this.strokeConsumed * 0.3)));

        // 2. Acumulación (Saturación)
        const satK = profile.physics?.saturationK ?? 0.15;
        const baseDeposit = pressure * localInk;
        // Simulamos el layerCount (cuánta pintura hay aquí) basándonos en la baja velocidad
        const layerCount = speed < 1 ? 5 : 1;
        let finalDeposit = baseDeposit * Math.exp(-satK * layerCount);
        finalDeposit = Math.max(finalDeposit, localInk * 0.02);

        // 3. Separación de cerdas por velocidad
        const sepFactor = profile.physics?.separationFactor ?? 0.2;
        const bristleRadius = profile.baseSize / 2;
        const maxSeparation = bristleRadius * 0.4;
        const separationMag = Math.min(speed * sepFactor, maxSeparation);

        const freq = profile.physics?.grainFrequency ?? 0.12;

        ctx.fillStyle = color;

        for (const bristle of this.bristles) {
            const edgeBias = Math.sqrt(bristle.localX ** 2 + bristle.localY ** 2) / bristleRadius;
            const laggedSep = separationMag * edgeBias * bristle.lag;

            // Posición final de la cerda (con arrastre hacia atrás)
            const wx = x + bristle.localX - (dir.x * laggedSep);
            const wy = y + bristle.localY - (dir.y * laggedSep);

            // Grano (Value Noise) coherente en el espacio
            const grain = ValueNoise2D.get(wx, wy, freq, this.brushSeed);
            const grainFactor = 0.75 + (grain * 0.25);

            // Borde Húmedo (Wet Edge)
            const distFromCenter = Math.sqrt((wx - x) ** 2 + (wy - y) ** 2);
            const t = distFromCenter / bristleRadius;
            let edgeBoost = 0;
            if (localInk > 0.3) {
                if (t >= 0.65 && t <= 0.85) edgeBoost = localInk * Math.pow((t - 0.65) / 0.2, 2);
                else if (t > 0.85) edgeBoost = localInk * (1.0 - (t - 0.85) / 0.15);
            }

            // Render final
            let opacity = grainFactor * bristle.inkCapacity * (finalDeposit + edgeBoost * 0.15);
            opacity *= profile.baseOpacity; // Opacidad maestra del usuario

            if (opacity > 0.01) {
                ctx.globalAlpha = Math.min(1, Math.max(0, opacity));
                const path = this.generateBristlePath(wx, wy, bristle.thickness, dir, bristleRadius * 0.5);
                ctx.fill(path);
            }
        }
        this.stampIndex++;
    }
}