import type { BoundingBox } from '../../core/math/BoundingBox';
import type { StorageManager } from '../../storage/StorageManager';

export interface ICommand {
    readonly id: string;
    readonly type: string;
    readonly bbox?: BoundingBox;

    // VARIABLES PARA LA TRANSFORMACIÓN NO DESTRUCTIVA
    dx?: number;
    dy?: number;

    loadDataIfNeeded(storage: StorageManager): Promise<void>;
    execute(ctx: CanvasRenderingContext2D): void;
    getRawData(): ArrayBuffer | null;
}