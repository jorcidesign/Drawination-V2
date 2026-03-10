/// <reference lib="webworker" />
// src/workers/CompressionWorker.ts
import { BinarySerializer } from '../core/io/BinarySerializer';
import { BBoxUtils } from '../core/math/BoundingBox';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent) => {
    const { id, rawPoints, brushSize } = e.data;

    // === FIDELIDAD 1:1 ===
    // Ya NO eliminamos vértices con el RDP. Lo que la mano dibuja, es lo que se guarda.
    const simplified = rawPoints;

    // 2. Calcular la Región Sucia (BBox)
    const bbox = BBoxUtils.computeFromPoints(simplified, brushSize);

    // 3. Serialización Binaria Extrema
    const binaryData = BinarySerializer.encode(simplified);

    // 4. Compresión Zip (Deflate) nativa
    const stream = new CompressionStream('deflate-raw');
    const writer = stream.writable.getWriter();
    writer.write(binaryData);
    writer.close();

    const compressedData = await new Response(stream.readable).arrayBuffer();

    ctx.postMessage({
        id,
        binaryData,
        compressedData,
        bbox
    }, [binaryData, compressedData]);
};