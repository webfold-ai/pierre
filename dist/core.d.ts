//#region lib/core.d.ts
/** One entry of a diff result. */
interface ChangeObject {
  /** The concatenated tokens of this change. */
  value: string;
  /** Number of tokens: code points (`diffChars`), lines (`diffLines`), or words, spaces, and other characters (`diffWordsWithSpace`). */
  count: number;
  /** True when the tokens only exist in the new text. */
  added: boolean;
  /** True when the tokens only exist in the old text. */
  removed: boolean;
}
/** Options of `diffLines`, also accepted by the patch functions. */
interface DiffLinesOptions {
  /**
   * Compare lines without their leading and trailing whitespace (as
   * `String.prototype.trim`). A common line keeps the new text.
   * @default false
   */
  ignoreWhitespace?: boolean;
  /**
   * Remove the `\r` of each `\r\n` before the diff, like GNU diff
   * `--strip-trailing-cr`.
   * @default false
   */
  stripTrailingCr?: boolean;
}
/** Which header lines a patch has. A field left out is false. */
interface HeaderOptions {
  includeIndex?: boolean;
  includeUnderline?: boolean;
  includeFileHeaders?: boolean;
}
interface CreatePatchOptions extends DiffLinesOptions {
  /**
   * Unchanged lines around each change: a non-negative integer, or `Infinity`
   * for the whole file.
   * @default 4
   */
  context?: number;
  /** Which header lines to write. When left out, all are written (like jsdiff). */
  headerOptions?: HeaderOptions;
}
/**
 * Set the function that returns the compiled wasm module (the index and
 * workerd entries call it). The first diff call runs it, so importing the
 * package works where WebAssembly is unavailable. A new call drops the current
 * instance; the next diff call starts with empty wasm memory.
 */
declare function init(loadModule: () => WebAssembly.Module): void;
/**
 * Set how much wasm memory, in bytes, stays allocated between calls (default
 * 32 MB). Wasm memory cannot shrink, so when a call grows it past the limit,
 * a new wasm instance replaces it after the call, and the garbage collector
 * frees the old memory. `Infinity` keeps all memory for the next calls.
 */
declare function setMemoryLimit(bytes: number): void;
/** Diff two texts, treating each Unicode code point as a token. */
declare function diffChars(oldStr: string, newStr: string, options?: Record<string, never>): ChangeObject[];
/**
 * Diff two texts, treating each word, run of spaces, newline, and other
 * character as a token.
 */
declare function diffWordsWithSpace(oldStr: string, newStr: string, options?: Record<string, never>): ChangeObject[];
/**
 * Diff two texts, treating each line as a token. A line's trailing `\n` (or
 * `\r\n`) belongs to its token, as in jsdiff.
 */
declare function diffLines(oldStr: string, newStr: string, options?: DiffLinesOptions): ChangeObject[];
/** Create a unified diff of one file: `createTwoFilesPatch` with one name on both sides. */
declare function createPatch(fileName: string, oldStr: string, newStr: string, oldHeader?: string, newHeader?: string, options?: CreatePatchOptions): string;
/** Create a unified diff of two files, byte-identical to jsdiff. */
declare function createTwoFilesPatch(oldFileName: string | undefined, newFileName: string | undefined, oldStr: string, newStr: string, oldHeader?: string, newHeader?: string, options?: CreatePatchOptions): string;
//#endregion
export { ChangeObject, CreatePatchOptions, DiffLinesOptions, HeaderOptions, createPatch, createTwoFilesPatch, diffChars, diffLines, diffWordsWithSpace, init, setMemoryLimit };
//# sourceMappingURL=core.d.ts.map