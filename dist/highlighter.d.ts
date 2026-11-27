import { CodeToHtmlOptions, CodeToTokensOptions, Highlighter, HighlighterOptions, Lang, Language, RegisteredHighlighter, Theme, ThemeFamily, ThemedToken, TokensResult } from "./core.js";
//#region lib/highlighter.d.ts
/**
 * Language names and Wasm IDs, sorted by ID and then name.
 */
declare const LANGS: Record<string, number>;
/** Resolve the Wasm language ID for a name or alias, or throw. */
declare function langIdOf(lang: string): number;
/**
 * Check whether a name or alias has a built-in lexer, including `plain`/`text`,
 * or is `ansi`. Names from `registerLanguages` are not built in; use
 * `isRegisteredLanguage` for them.
 */
declare function isSupportedLanguage(lang: string): lang is Lang;
/**
 * Check whether `registerLanguages` added a name or alias. The shared
 * `codeToHtml` and `codeToTokens` use its lexer. `StreamTokenizer` and
 * `LiveTokenizer` use it too, unless it is a built-in language module. Code
 * blocks in Markdown, MDX, and Org use it in all of them.
 */
declare function isRegisteredLanguage(lang: string): boolean;
declare class HighlightsHighlighter implements Highlighter<Theme | ThemeFamily, string> {
  #private;
  inputPtr: number;
  themePtr: number;
  wasmModule: WebAssembly.Module;
  instance: WebAssembly.Instance;
  memory: WebAssembly.Memory;
  buffer: Uint8Array;
  dv: DataView;
  pageN: number;
  constructor(wasmModule: WebAssembly.Module, beforeRun?: (langId: number, mode: number, inputLength: number, reset?: boolean) => void, imports?: Record<string, (...args: number[]) => number>, emitter?: boolean, languageIds?: ReadonlyMap<string, number>);
  /** Write input at a byte offset in the text buffer and return its byte length. */
  writeInput(input: string | Uint8Array | ArrayBuffer, offset?: number): number;
  /**
   * Return highlighted HTML bytes.
   * The bytes can reference Wasm memory that the next call overwrites.
   */
  codeToHtml(input: string | Uint8Array | ArrayBuffer, options: CodeToHtmlOptions<Theme | ThemeFamily, string>): Uint8Array;
  /**
   * Run record output and return the address of the records. Control word 10
   * holds their byte length. `reset` starts or continues a stream. Mode 5
   * makes the combined module return byte records, as a lexer module does.
   */
  lexRecords(langId: number, inputLength: number, reset?: boolean, mode?: number): number;
  /**
   * Lex this emitter's input with `lexer` and copy the records here. Only the
   * first record can be a leading gap (0xffff). The document root has no
   * previous token for it, so it becomes plain text.
   */
  lexWith(lexer: HighlightsHighlighter, langId: number, mode: number, length: number, reset?: boolean, lexerMode?: number): void;
  /** Copy lexer records to this emitter, after the input and the theme data. */
  writeRecords(mode: number, length: number, records: Uint8Array): void;
  /** Return UTF-16 token records; `reset` starts or continues a stream. */
  tokenizeLineRecords(langId: number, inputLength: number, reset?: boolean): Uint32Array;
  /**
   * Tokenize code into Shiki-compatible themed tokens, one array per line.
   */
  codeToTokens(input: string | Uint8Array | ArrayBuffer, options: CodeToTokensOptions<Theme | ThemeFamily, string>): TokensResult;
  /** Grow the Wasm memory to hold `end` bytes. */
  grow(end: number): void;
  /** Rebind views after growing wasm memory. */
  bindMemory(): void;
}
/** Set the module that the first call compiles when `init` has not run. */
declare function initLazy(load: () => WebAssembly.Module): void;
/** Whether `registerLanguages` has added any name. */
declare function hasRegisteredLanguages(): boolean;
/** The compiled Wasm module required by isolated tokenizers. */
declare function assertWasmModule(): WebAssembly.Module;
/**
 * Initialize the shared highlighter from a compiled WebAssembly module.
 */
declare function init(wasm: WebAssembly.Module): Highlighter;
/**
 * Supply a compiled emitter module. Use it where the runtime cannot compile
 * WebAssembly from bytes, such as Cloudflare Workers.
 */
declare function initEmitter(wasm: WebAssembly.Module): void;
/** Decode base64 Wasm. */
declare function wasmBytes(wasm: string): Uint8Array<ArrayBuffer>;
declare function createHighlighter(options: HighlighterOptions): Promise<RegisteredHighlighter>;
/**
 * The lexer that `StreamTokenizer` and `LiveTokenizer` use for a name from
 * `registerLanguages`. A lexer from `@pierre/wat-tools` has `module`. A
 * built-in language module has none, and `id` selects the built-in lexer:
 * its own lexer calls the host for embedded code and cannot save its state.
 * The built-in lexer runs the registered lexers in its fences; see
 * `fenceImports`.
 */
declare function registeredLexer(lang: string): {
  module?: WebAssembly.Module;
  id: number;
} | undefined;
/**
 * The `fence_language` and `fence_lex` imports of a combined-module instance
 * (`hl` returns it) that tokenizes a registered built-in language module.
 * They run the registered lexers for its Markdown, MDX, Org, and Wikitext
 * code blocks, as `codeToTokens` does. Each call makes its own lexer
 * instances. With `live`, the instance tokenizes one line at a time and can
 * start at any line: every lexer state gets an ID that the line state of the
 * instance keeps, and the lexer loads it again from that ID.
 */
declare function fenceImports(hl: () => HighlightsHighlighter, live: boolean): Record<string, (...args: number[]) => number>;
/**
 * Add lexers to `codeToHtml` and `codeToTokens`. Their names and aliases
 * override built-in names there. Call `init` first; the combined module emits
 * their HTML, so no other Wasm loads.
 */
declare function registerLanguages(langs: readonly Language[]): void;
/**
 * Return a `<pre class="highlights">` fragment with inline colors.
 * With `themes`, each span uses the default theme inline and CSS custom
 * properties for the other themes, as in `codeToTokens`'s `htmlStyle`.
 */
declare function codeToHtml(input: string | Uint8Array | ArrayBuffer, options: CodeToHtmlOptions<Theme | ThemeFamily, Lang | (string & {})>): Uint8Array;
/**
 * Return Shiki-compatible tokens, grouped by line.
 * WebAssembly lexes the input and splits lines. JavaScript converts the
 * style records to tokens.
 */
declare function codeToTokens(input: string | Uint8Array | ArrayBuffer, options: CodeToTokensOptions<Theme | ThemeFamily, Lang | (string & {})>): TokensResult;
/**
 * Convert UTF-8 chunks to themed token arrays, one per completed line.
 * Use synchronous `pushCode` and `end` calls for strings or UTF-8 bytes.
 * An isolated Wasm instance scans each completed chunk once and keeps
 * lexer state between chunks.
 */
declare class StreamTokenizer extends TransformStream<Uint8Array, ThemedToken[]> {
  #private;
  constructor(options: CodeToTokensOptions<Theme | ThemeFamily, Lang | (string & {})>);
  /**
   * Append text or UTF-8 bytes. Return tokens for each completed line,
   * with offsets relative to the full input.
   * Incomplete UTF-8 stays buffered between byte chunks. A nonempty
   * string flushes those bytes first. The final line stays buffered
   * until a newline or `end()`.
   */
  pushCode(chunk: string | Uint8Array): ThemedToken[][];
  /**
   * Finish UTF-8 decoding and return the remaining lines.
   * A trailing line terminator produces a final empty line, as in
   * `codeToTokens`.
   */
  end(): ThemedToken[][];
  /** Release the Wasm instance and discard buffered input; later calls throw. */
  dispose(): void;
}
//#endregion
export { HighlightsHighlighter, LANGS, StreamTokenizer, assertWasmModule, codeToHtml, codeToTokens, createHighlighter, fenceImports, hasRegisteredLanguages, init, initEmitter, initLazy, isRegisteredLanguage, isSupportedLanguage, langIdOf, registerLanguages, registeredLexer, wasmBytes };
//# sourceMappingURL=highlighter.d.ts.map