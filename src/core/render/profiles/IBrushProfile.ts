// src/core/render/profiles/IBrushProfile.ts
export interface IBrushProfile {
    id: string;
    name: string;

    // === NUEVO: Límites absolutos de la herramienta ===
    minSize: number;
    maxSize: number;

    baseSize: number;
    baseOpacity: number;
    blendMode: GlobalCompositeOperation;

    renderer: 'basic' | 'fill' | 'paint' | 'hard-round' | 'ink' | 'airbrush' | 'charcoal';

    spacing: number;
    angle: number;
    aspectRatio: number;
    pressureSizeSensitivity: number;
    pressureOpacitySensitivity: number;
    smoothing: number;

    textureType?: 'solid' | 'pencil-grain' | 'bristle-paint';

    physics?: {
        bristleCount?: number;
        depletionRate?: number;
        saturationK?: number;
        separationFactor?: number;
        velocityK?: number;
        grainFrequency?: number;
        flow?: number;
        stabilizerWindow?: number;
        pressureCurve?: { p1y: number, p2y: number };
        charcoalAspect?: number;
    };
}