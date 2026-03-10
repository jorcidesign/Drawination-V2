// src/core/render/BrushEngine.ts
import type { BasePoint } from '../../input/InputManager';
import type { StrokePoint } from '../io/BinarySerializer';
import type { IBrushProfile } from './profiles/IBrushProfile';

export class BrushEngine {
    public color: string = '#2c3e50';
    public profile: IBrushProfile;

    private tipCanvas: HTMLCanvasElement;
    private tipCtx: CanvasRenderingContext2D;

    // Estado del trazo actual para la interpolación
    private lastPoint: BasePoint | null = null;
    private leftoverDistance: number = 0;
    points: any;

    constructor(profile: IBrushProfile) {
        this.profile = profile;
        this.tipCanvas = document.createElement('canvas');
        this.tipCtx = this.tipCanvas.getContext('2d', { willReadFrequently: true })!;
        this.generateBrushTip();
    }

    public setProfile(profile: IBrushProfile) {
        this.profile = profile;
        this.generateBrushTip();
    }

    // =========================================================
    // 1. GENERADOR DEL SELLO (BRUSH TIP)
    // Generamos la punta del pincel una sola vez en memoria
    // =========================================================
    private generateBrushTip() {
        // Aumentamos la resolución interna si la punta es muy grande
        const size = Math.max(64, this.profile.baseSize * 2);
        this.tipCanvas.width = size;
        this.tipCanvas.height = size;
        const cx = size / 2;
        const cy = size / 2;

        this.tipCtx.clearRect(0, 0, size, size);

        // Aplicamos la rotación
        this.tipCtx.save();
        this.tipCtx.translate(cx, cy);
        this.tipCtx.rotate((this.profile.angle * Math.PI) / 180);

        if (this.profile.textureType === 'pencil-grain') {
            const grad = this.tipCtx.createRadialGradient(0, 0, 0, 0, 0, cx);

            // Usamos this.color para que el lápiz por fin pinte del color que elijas
            // Convertimos el hex a rgba para los gradientes
            const colorRGB = this.hexToRgb(this.color);

            grad.addColorStop(0, `rgba(${colorRGB}, 1)`);
            grad.addColorStop(0.5, `rgba(${colorRGB}, 0.5)`);
            grad.addColorStop(1, `rgba(${colorRGB}, 0)`);

            this.tipCtx.fillStyle = grad;
            this.tipCtx.beginPath();
            // Dibujamos la elipse usando el aspectRatio
            this.tipCtx.ellipse(0, 0, cx * this.profile.aspectRatio, cx, 0, 0, Math.PI * 2);
            this.tipCtx.fill();

            const imgData = this.tipCtx.getImageData(0, 0, size, size);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                if (Math.random() > 0.6) {
                    data[i + 3] *= 0.2;
                }
            }
            this.tipCtx.putImageData(imgData, 0, 0);

        } else {
            // Tinta Sólida
            this.tipCtx.fillStyle = this.color;
            this.tipCtx.beginPath();
            // Dibujamos la elipse inclinada
            this.tipCtx.ellipse(0, 0, cx * this.profile.aspectRatio, cx, 0, 0, Math.PI * 2);
            this.tipCtx.fill();
        }

        this.tipCtx.restore();
    }

    private hexToRgb(hex: string): string {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ?
            `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` :
            '0, 0, 0';
    }

    public setColor(color: string) {
        this.color = color;
        this.generateBrushTip();
    }
    // =========================================================
    // 2. MOTOR DE ESTAMPADO INTERPOLADO
    // =========================================================
    private stamp(ctx: CanvasRenderingContext2D, x: number, y: number, pressure: number) {
        ctx.save();

        // 1. Calcular tamaño final basado en presión
        const sizeMultiplier = 1 + (pressure - 0.5) * this.profile.pressureSizeSensitivity * 2;
        const finalSize = Math.max(1, this.profile.baseSize * sizeMultiplier);

        // 2. Calcular opacidad final basada en presión
        const opacityMultiplier = 1 + (pressure - 0.5) * this.profile.pressureOpacitySensitivity * 2;
        const finalOpacity = Math.max(0.01, Math.min(1, this.profile.baseOpacity * opacityMultiplier));

        ctx.globalCompositeOperation = this.profile.blendMode;
        ctx.globalAlpha = finalOpacity;

        // 3. Aplicar color (Usamos source-in para teñir la punta pregenerada negra al color actual)
        // Optimizaremos esto más adelante, por ahora teñimos con globalCompositeOperation si no es borrador
        if (this.profile.blendMode !== 'destination-out') {
            // (Para simplificar esta versión, el sello se dibujará negro. El color lo inyectaremos en la V2)
            // Solo concéntrate en la textura y la presión
        }

        // 4. Estampar en el centro
        const halfSize = finalSize / 2;
        ctx.drawImage(this.tipCanvas, x - halfSize, y - halfSize, finalSize, finalSize);

        ctx.restore();
    }
    public beginStroke(ctx: CanvasRenderingContext2D, data: BasePoint): void {
        this.lastPoint = { ...data };
        this.points = [data]; // Guardamos el primer punto
        this.leftoverDistance = 0;

        // Si es relleno, no estampamos nada inicial
        if (this.profile.renderMode === 'fill') return;

        this.stamp(ctx, data.x, data.y, data.pressure);
    }
    // Recibe el parámetro isLivePreview
    public drawMove(ctx: CanvasRenderingContext2D, data: BasePoint, isLivePreview: boolean = false): void {
        if (!this.lastPoint) return;

        this.points.push(data); // Almacenamos el punto para el polígono de relleno

        // === LÓGICA DE RELLENO ===
        if (this.profile.renderMode === 'fill') {
            if (isLivePreview) {
                // Borramos la capa temporal y dibujamos el polígono en vivo
                ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                ctx.fillStyle = this.color;
                ctx.globalAlpha = this.profile.baseOpacity;

                ctx.beginPath();
                ctx.moveTo(this.points[0].x, this.points[0].y);
                for (const pt of this.points) ctx.lineTo(pt.x, pt.y);
                ctx.fill();
            }
            return; // Detenemos aquí, no hacemos stamping
        }

        // === LÓGICA DE STAMPING NORMAL (Tinta/Lápiz) ===
        const smoothFactor = 1 - this.profile.smoothing;
        data.pressure = smoothFactor * data.pressure + (1 - smoothFactor) * this.lastPoint.pressure;

        const dx = data.x - this.lastPoint.x;
        const dy = data.y - this.lastPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const step = Math.max(0.5, this.profile.baseSize * this.profile.spacing);

        let totalDistance = this.leftoverDistance + distance;

        while (totalDistance >= step) {
            this.leftoverDistance += step;
            const t = this.leftoverDistance / distance;
            const stampX = this.lastPoint.x + dx * t;
            const stampY = this.lastPoint.y + dy * t;
            const stampP = this.lastPoint.pressure + (data.pressure - this.lastPoint.pressure) * t;

            this.stamp(ctx, stampX, stampY, stampP);
            totalDistance -= step;
        }

        this.leftoverDistance = totalDistance;
        this.lastPoint = { ...data };
    }
    public endStroke(ctx?: CanvasRenderingContext2D): void {
        // Si es relleno, lo plasmamos definitivamente en la capa activa al soltar el ratón
        if (ctx && this.points.length > 2 && this.profile.renderMode === 'fill') {
            ctx.fillStyle = this.color;
            ctx.globalAlpha = this.profile.baseOpacity;
            ctx.globalCompositeOperation = this.profile.blendMode;

            ctx.beginPath();
            ctx.moveTo(this.points[0].x, this.points[0].y);
            for (const pt of this.points) ctx.lineTo(pt.x, pt.y);
            ctx.fill();
        }

        this.lastPoint = null;
        this.points = [];
        this.leftoverDistance = 0;
    }

    public reproduceStroke(
        ctx: CanvasRenderingContext2D,
        actionColor: string,
        actionSize: number,
        actionOpacity: number,
        decodedPoints: StrokePoint[]
    ): void {
        if (decodedPoints.length === 0) return;

        const prevColor = this.color;
        const prevSize = this.profile.baseSize;
        const prevOpacity = this.profile.baseOpacity;

        this.setColor(actionColor);
        this.profile.baseSize = actionSize;
        this.profile.baseOpacity = actionOpacity;

        // === MAGIA DEL RELLENO EN EL TIMELAPSE ===
        if (this.profile.renderMode === 'fill') {
            this.points = decodedPoints; // Inyectamos todos los puntos
            this.endStroke(ctx);         // Ejecutamos un solo relleno (ultra rápido)
        } else {
            this.beginStroke(ctx, decodedPoints[0]);
            for (let i = 1; i < decodedPoints.length; i++) {
                this.drawMove(ctx, decodedPoints[i], false);
            }
            this.endStroke(ctx);
        }

        this.setColor(prevColor);
        this.profile.baseSize = prevSize;
        this.profile.baseOpacity = prevOpacity;
    }
}