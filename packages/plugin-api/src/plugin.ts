import type { FormatRegistry } from "./format";
import type { GateRegistry } from "./gates";
import type { SlotRegistry } from "./slots";

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export interface PluginContext {
  formats: FormatRegistry;
  gates: GateRegistry; // live server-side; no-op sink client-side
  slots: SlotRegistry; // live client-side; no-op sink server-side
  logger: Logger;
  /** Lets a plugin branch its register() without import-time env sniffing. */
  env: "server" | "client";
}

export interface CytarioPlugin {
  name: string;
  apiVersion: string;
  register(ctx: PluginContext): void | Promise<void>;
}
