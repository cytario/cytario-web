import openjpegWasmUrl from '@cornerstonejs/codec-openjpeg/decodewasm?url'
import openJpegFactory from '@cornerstonejs/codec-openjpeg/decodewasmjs';

const local = {
  codec: undefined,
  decoder: undefined,
  decodeConfig: {},
  isLoading: false,
  loadPromise: null,
};

/**
 * Loads the JPEG2000 decoder WASM module
 * @param {Object} decodeConfig - Optional decoder configuration
 * @returns {Promise<void>}
 */
export function loadJp2KDecoder(decodeConfig) {
  local.decodeConfig = decodeConfig;
  
  // Return existing codec or loading promise
  if (local.codec) {
    return Promise.resolve();
  }
  if (local.loadPromise) {
    return local.loadPromise;
  }

  local.isLoading = true;
  local.loadPromise = openJpegFactory({
    locateFile: (f) => {
      if (typeof f === 'string' && f.endsWith('.wasm')) {
        return openjpegWasmUrl;
      }
      return f;
    },
    print: () => {}, // Suppress console.log output
    printErr: () => {}, // Suppress console.error output
  })
    .then((instance) => {
      local.codec = instance;
      local.decoder = new instance.J2KDecoder();
      local.isLoading = false;
    })
    .catch((error) => {
      local.isLoading = false;
      local.loadPromise = null;
      throw new Error(`Failed to load JPEG2000 decoder: ${error.message}`);
    });

  return local.loadPromise;
}

/**
 * Decodes a JPEG2000 compressed image frame
 * @param {Uint8Array} compressedImageFrame - The compressed image data
 * @returns {Promise<{info: Object, pixels: Uint8Array}>} Decoded image data
 */
export async function decodeJPEG2000(compressedImageFrame) {
  if (!compressedImageFrame || compressedImageFrame.length === 0) {
    throw new Error('Invalid compressed image frame: empty or null');
  }

  await loadJp2KDecoder();
  
  if (!local.decoder) {
    throw new Error('JPEG2000 decoder not initialized');
  }

  const decoder = local.decoder;
  
  // Get encoded buffer and copy data
  const encodedBufferInWASM = decoder.getEncodedBuffer(compressedImageFrame.length);
  encodedBufferInWASM.set(compressedImageFrame);
  
  // Decode the image
  decoder.decode();
  
  // Extract decoded data
  const frameInfo = decoder.getFrameInfo();
  const decodedBufferInWASM = decoder.getDecodedBuffer();
  const imageFrame = new Uint8Array(decodedBufferInWASM.length);
  imageFrame.set(decodedBufferInWASM);
  
  return {
    info: frameInfo,
    pixels: imageFrame,
  };
}

/**
 * Cleanup function to release decoder resources
 */
export function cleanupJp2KDecoder() {
  if (local.decoder) {
    // Cleanup decoder if it has a cleanup method
    local.decoder = undefined;
  }
  if (local.codec) {
    local.codec = undefined;
  }
  local.loadPromise = null;
  local.isLoading = false;
}
