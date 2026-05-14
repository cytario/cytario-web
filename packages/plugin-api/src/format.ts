import type { Image, Loader } from "./image";

export type SignedFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface LoadOptions {
  signedFetch: SignedFetch;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  offsets?: number[];
}

export interface FileTypeMeta {
  label?: string;
  icon?: string;
}

export interface FormatHandler {
  match?(url: string): boolean;
  load(url: string, opts: LoadOptions): Promise<{ data: Loader; metadata: Image }>;
  fileTypeMeta?: FileTypeMeta;
}

export interface FormatRegistry {
  register(extension: string, handler: FormatHandler): void;
}
