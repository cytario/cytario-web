import openjpegWasmUrl from '@cornerstonejs/codec-openjpeg/decodewasm?url'
import openJpegFactory from '@cornerstonejs/codec-openjpeg/decodewasmjs';

const local = {
  codec: undefined,
  decoder: undefined,
  decodeConfig: {},
};

export function loadJp2KDecoder(decodeConfig) {
  local.decodeConfig = decodeConfig;
  if (local.codec) {
    return Promise.resolve();
  }
  const openJpegModule = openJpegFactory({
    locateFile: (f) => {
      if (typeof f === 'string' && f.endsWith('.wasm')) {
        return openjpegWasmUrl;
      }
      return f;
    },
  });
  return new Promise((resolve, reject) => {
    openJpegModule.then((instance) => {
      local.codec = instance;
      local.decoder = new instance.J2KDecoder();
      resolve();
    }, reject);
  });
}

export async function decodeJPEG2000(compressedImageFrame) {
  await loadJp2KDecoder();
  const decoder = local.decoder;
  const encodedBufferInWASM = decoder.getEncodedBuffer(
    compressedImageFrame.length
  );
  encodedBufferInWASM.set(compressedImageFrame);
  decoder.decode();
  const frameInfo = decoder.getFrameInfo();
  const decodedBufferInWASM = decoder.getDecodedBuffer();
  const imageFrame = new Uint8Array(decodedBufferInWASM.length);
  imageFrame.set(decodedBufferInWASM);
  return {
    'info': frameInfo,
    'pixels': imageFrame,
  };
}
