import { DiffsEditorTokenizerOptions } from "./tokenizer-types.js";
import { LineWindow } from "./DiffsEditorTokenizer.js";
import { CodeToTokensOptions } from "./types.js";
import { HighlightedToken } from "../types.js";
import { TextDocumentChange } from "../editor/textDocument.js";
import { LiveTokenizerOptions } from "@pierre/highlights";
//#region src/highlighter/highlights-editor.d.ts
/**
 * Colors an editable document with the highlights lexer, which keeps its
 * own copy of the text and its own dirty lines: it is told the edits,
 * colors from them, delivers every line it colors, and stops once a line's
 * state matches what it was. This class keeps that copy in step with the
 * document and returns what the lexer finishes during a call.
 */
declare class HighlightsEditorTokenizer {
  #private;
  private readonly options;
  private readonly resolveOptions;
  constructor(options: DiffsEditorTokenizerOptions, resolveOptions: (options: CodeToTokensOptions) => LiveTokenizerOptions);
  /**
   * Gives the lexer an edit and returns every line it finishes with it, in
   * and above `window`: the edited lines, the lines below them until the
   * state matches again, and lines it had left for later.
   */
  applyChange(change: TextDocumentChange, window?: LineWindow): Map<number, HighlightedToken[]>;
  /** Finishes every line before `end` now and returns the ones it colored. */
  flush(end: number): Map<number, HighlightedToken[]>;
  /**
   * Lexes the attach window once so later edits compare against known
   * states and report only the lines they changed. With `domCurrent` the
   * rows already show these tokens, so nothing is delivered; otherwise the
   * lines are delivered as the background pass reaches them.
   */
  prime(window: LineWindow, domCurrent: boolean): void;
  /** The string, comment and regexp ranges of a line. */
  bracketIgnoredRanges(line: number): [number, number][] | null;
  setTheme(themeName: string): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}
//#endregion
export { HighlightsEditorTokenizer };
//# sourceMappingURL=highlights-editor.d.ts.map