declare module "@cornerstonejs/codec-openjpeg" {
    export function initialize(config?: {
        wasmModuleURL?: string;
    }): Promise<void>;
}

declare module "@cornerstonejs/codec-openjpeg/dist/openjpegwasm_decode" {
    interface EmscriptenModule {
        [key: string]: unknown;
    }

    type EmscriptenModuleFactory<T = EmscriptenModule> = (
        moduleOverrides?: Partial<T>
    ) => Promise<T>;

    export class J2KDecoder {
        decode: () => unknown;
        getBlockDimensions: () => unknown;
        getColorSpace: () => unknown;
        getDecodedBuffer: () => unknown;
        getEncodedBuffer: (length: number) => unknown;
        getFrameInfo: () => unknown;
        getImageOffset: () => unknown;
        getIsReversible: () => unknown;
        getNumDecompositions: () => unknown;
        getNumLayers: () => unknown;
        getProgressionOrder: () => number;
        getTileOffset: () => unknown;
        getTileSize: () => unknown;
    }
    export interface OpenJpegModule extends EmscriptenModule {
        J2KDecoder: typeof J2KDecoder;
    }
    declare const Module: EmscriptenModuleFactory<OpenJpegModule>;
    export { Module };
}
