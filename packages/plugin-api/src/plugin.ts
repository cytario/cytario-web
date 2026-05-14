import type { FormatRegistry } from "./format";

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export interface PluginContext {
  formats: FormatRegistry;
  logger: Logger;
}

export interface CytarioPlugin {
  name: string;
  apiVersion: string;
  register(ctx: PluginContext): void | Promise<void>;
}
