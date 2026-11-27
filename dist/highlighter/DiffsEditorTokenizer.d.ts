import { DiffsEditorTokenizerOptions } from "./tokenizer-types.js";
import { HighlightsEditorTokenizer } from "./highlights-editor.js";
import { ShikiEditorTokenizer } from "./shiki-editor.js";
import { HighlightedToken, RenderRange } from "../types.js";
import { TextDocumentChange } from "../editor/textDocument.js";
//#region src/highlighter/DiffsEditorTokenizer.d.ts
/** The lines `[start, end)` a render shows. */
type LineWindow = readonly [start: number, end: number];
/** A backend's tokenizer for an editable document. */
type EditorTokenizerBackend = HighlightsEditorTokenizer | ShikiEditorTokenizer;
/**
 * The editor's side of a backend tokenizer. Every line a backend colors reaches
 * the editor with the edit that caused it, or through the background
 * delivery, never both: lines a bracket read colored wait until the read's
 * caller returns, then ride with the next edit or are delivered on their own.
 */
declare class DiffsEditorTokenizer {
  #private;
  constructor(backend: EditorTokenizerBackend, options: DiffsEditorTokenizerOptions);
  /**
   * Applies an edit and returns every line whose tokens changed with it,
   * in and above `renderRange`. Lines a bracket read colored before the
   * edit come along, renumbered; lines the edit rewrote are colored again.
   */
  tokenize(change: TextDocumentChange, renderRange?: RenderRange): Map<number, HighlightedToken[]>;
  /**
   * Gets the attach window ready before the first edit. With `domCurrent`
   * the rows on screen already match the document, so a backend that
   * delivers what it lexes keeps the window's lines to itself.
   */
  prebuildStateStack(renderRange?: RenderRange, domCurrent?: boolean): void;
  /** Finishes every line up to the end of `renderRange` and returns them. */
  flush(renderRange?: RenderRange): Map<number, HighlightedToken[]>;
  /**
   * The string, comment and regexp ranges of a line, for bracket matching.
   * Runs inside the editor's own event handling, so the lines it colors on
   * the way are delivered once the caller returns.
   */
  getStringCommentRegexpRangesInLine(lineIndex: number): [number, number][] | null;
  setTheme(themeName: string): void;
  pauseBackgroundTokenize(): void;
  resumeBackgroundTokenize(): void;
  dispose(): void;
}
//#endregion
export { DiffsEditorTokenizer, EditorTokenizerBackend, LineWindow };
//# sourceMappingURL=DiffsEditorTokenizer.d.ts.map