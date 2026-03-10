// src/core/BinarySerializer.ts
import type { BasePoint } from '../../input/InputManager';

export interface StrokePoint extends BasePoint {
    t: number; // milisegundos
}

function zigzagEncode(n: number): number {
    return ((n << 1) ^ (n >> 31)) >>> 0;
}

function zigzagDecode(n: number): number {
    return ((n >>> 1) ^ -(n & 1)) | 0;
}

function writeVarInt(view: DataView, offset: number, value: number): number {
    value = value >>> 0;
    while (value > 0x7F) {
        view.setUint8(offset++, (value & 0x7F) | 0x80);
        value >>>= 7;
    }
    view.setUint8(offset++, value & 0x7F);
    return offset;
}

function readVarInt(view: DataView, offset: number): { value: number; offset: number } {
    let result = 0, shift = 0, byte: number;
    do {
        byte = view.getUint8(offset++);
        result |= (byte & 0x7F) << shift;
        shift += 7;
    } while (byte & 0x80);
    return { value: result >>> 0, offset };
}

const COORD_SCALE = 100;
const PRESSURE_SCALE = 1023;

export class BinarySerializer {
    private static readonly BYTES_PER_POINT_WORST = 20;

    static encode(points: StrokePoint[]): ArrayBuffer {
        if (points.length === 0) return new ArrayBuffer(0);
        const maxBytes = 4 + points.length * BinarySerializer.BYTES_PER_POINT_WORST;
        const buf = new ArrayBuffer(maxBytes);
        const view = new DataView(buf);
        view.setUint32(0, points.length, true);

        let offset = 4, prevX = 0, prevY = 0, prevP = 0, prevT = 0;

        for (const p of points) {
            const qx = Math.round(p.x * COORD_SCALE) | 0;
            const qy = Math.round(p.y * COORD_SCALE) | 0;
            const qp = Math.round(p.pressure * PRESSURE_SCALE) | 0;
            const qt = (p.t | 0) >>> 0;

            const dx = qx - prevX, dy = qy - prevY, dp = qp - prevP, dt = qt - prevT;
            prevX = qx; prevY = qy; prevP = qp; prevT = qt;

            offset = writeVarInt(view, offset, zigzagEncode(dx));
            offset = writeVarInt(view, offset, zigzagEncode(dy));
            offset = writeVarInt(view, offset, zigzagEncode(dp));
            offset = writeVarInt(view, offset, dt); // dt siempre es positivo
        }
        return buf.slice(0, offset);
    }

    static decode(buffer: ArrayBuffer): StrokePoint[] {
        const view = new DataView(buffer);
        const count = view.getUint32(0, true);
        const points: StrokePoint[] = new Array(count);

        let offset = 4, prevX = 0, prevY = 0, prevP = 0, prevT = 0;

        for (let i = 0; i < count; i++) {
            let r = readVarInt(view, offset);
            const ezx = r.value; offset = r.offset;
            r = readVarInt(view, offset);
            const ezy = r.value; offset = r.offset;
            r = readVarInt(view, offset);
            const ezp = r.value; offset = r.offset;
            r = readVarInt(view, offset);
            const dt = r.value; offset = r.offset;

            prevX += zigzagDecode(ezx);
            prevY += zigzagDecode(ezy);
            prevP += zigzagDecode(ezp);
            prevT += dt;

            points[i] = {
                x: prevX / COORD_SCALE,
                y: prevY / COORD_SCALE,
                pressure: prevP / PRESSURE_SCALE,
                t: prevT,
            };
        }
        return points;
    }
}