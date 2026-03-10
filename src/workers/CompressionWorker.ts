/// <reference lib="webworker" />

// src/workers/CompressionWorker.ts
import { RDPSimplifier } from '../core/math/RDPSimplifier';
import { BinarySerializer } from '../core/io/BinarySerializer';
import { BBoxUtils } from '../core/math/BoundingBox';

// Ahora TypeScript reconoce perfectamente qué es un DedicatedWorkerGlobalScope
const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent) => {
    const { id, rawPoints, brushSize } = e.data;

    // 1. Matemática pesada: RDP Simplification
    const simplified = RDPSimplifier.simplify(rawPoints, brushSize);

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

    // El error de "postMessage" desaparece porque ctx ya es del tipo correcto
    ctx.postMessage({
        id,
        binaryData,
        compressedData,
        bbox
    }, [binaryData, compressedData]);
};