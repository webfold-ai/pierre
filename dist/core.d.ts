import { AnsiOptions, Frontmatter, HtmlSessionOptions, HtmlUpdate, RenderOptions } from "./types.js";
import { HtmlFormat } from "./internal.js";
//#region lib/core.d.ts
type Input = string | Uint8Array | ArrayBuffer;
type Options = AnsiOptions & RenderOptions & {
  boundary?: boolean;
  format?: HtmlFormat;
};
declare class Renderer {
  memory: WebAssembly.Memory;
  wasmRender: () => void;
  buffer: Uint8Array<ArrayBuffer>;
  dv: DataView<ArrayBuffer>;
  pages: number;
  idPrefix: string;
  idPrefixLength: number;
  inlineNames: string;
  constructor(wasmModule: WebAssembly.Module);
  render(input: Input, mode: number, options?: Options): {
    output: Uint8Array;
    meta?: Uint8Array;
  };
  grow(len: number): void;
  bindMemory(): void;
}
type RenderToHtml = {
  (input: Input): Uint8Array;
  <T = Frontmatter>(input: Input, options: RenderOptions & {
    frontmatter: true;
  }): [T | null, Uint8Array];
  (input: Input, options?: RenderOptions & {
    frontmatter?: false;
  }): Uint8Array;
  <T = Frontmatter>(input: Input, options: RenderOptions): Uint8Array | [T | null, Uint8Array];
};
type HtmlSession = {
  render(input: string, options?: HtmlSessionOptions): HtmlUpdate;
};
type Words = {
  /** Replace the Wasm module of this entry. */
  init(module: WebAssembly.Module): Renderer;
  renderToHtml: RenderToHtml;
  renderToAnsi(input: Input, options?: AnsiOptions): Uint8Array;
  /**
   * Render a growing string to HTML. A session keeps completed HTML and
   * reparses only the unfinished end.
   */
  createHtmlSession(): HtmlSession;
  /**
   * Whether this engine can run Words' Wasm, which needs SIMD. Use it to pick a
   * fallback renderer. It compiles the Wasm once and keeps it for rendering.
   */
  canUseWASM(): boolean;
};
/**
 * Build the public API around one renderer. Each entry (`@pierre/words`,
 * `/no-math`, ...) owns one, so entries loaded together keep their own Wasm
 * build. `load` runs on the first render, so an engine without Wasm SIMD
 * fails there, not at import. Without `load`, rendering throws until `init()`
 * is called.
 */
declare function createWords(load?: () => WebAssembly.Module): Words;
declare const init: (module: WebAssembly.Module) => Renderer, renderToHtml: RenderToHtml, renderToAnsi: (input: Input, options?: AnsiOptions) => Uint8Array, createHtmlSession: () => HtmlSession, canUseWASM: () => boolean;
//#endregion
export { type AnsiOptions, type Frontmatter, HtmlSession, type HtmlSessionOptions, type HtmlUpdate, Input, type RenderOptions, RenderToHtml, Renderer, Words, canUseWASM, createHtmlSession, createWords, init, renderToAnsi, renderToHtml };
//# sourceMappingURL=core.d.ts.map