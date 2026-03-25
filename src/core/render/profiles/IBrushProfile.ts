// src/core/render/profiles/IBrushProfile.ts
export interface IBrushProfile {
    id: string;
    name: string;

    minSize: number;
    maxSize: number;

    baseSize: number;
    baseOpacity: number;
    baseFlow?: number;
    blendMode: GlobalCompositeOperation;

    // === FIX: Añadimos 'stylized' ===
    renderer: 'basic' | 'fill' | 'paint' | 'hard-round' | 'ink' | 'airbrush' | 'charcoal' | 'stylized';

    spacing: number;
    angle: number;
    aspectRatio: number;

    pressureSizeSensitivity: number;
    pressureOpacitySensitivity: number;

    pressureSizeMin?: number;
    pressureSizeMax?: number;

    pressureOpacityMin?: number;
    pressureOpacityMax?: number;

    pressureFlowMin?: number;
    pressureFlowMax?: number;

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