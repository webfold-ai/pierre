import { DiffsEditorTokenizerOptions } from "./tokenizer-types.js";
import { LineWindow } from "./DiffsEditorTokenizer.js";
import { DiffsHighlighter } from "./DiffsHighlighter.js";
import "./types.js";
import { HighlightedToken } from "../types.js";
import { TextDocumentChange } from "../editor/textDocument.js";
import { HighlighterCore } from "shiki/core";
//#region src/highlighter/shiki-editor.d.ts
/**
 * Colors an editable document with a TextMate grammar, a line at a time.
 *
 * Every line has a record with the grammar state at its start, moved with
 * the line when lines are added or removed above it. The state in a record
 * is the state the line was last colored from. Edits mark lines dirty;
 * `advance` colors dirty lines in order, delivers them, and stops once a
 * line's end state matches the state the next line was colored from, since
 * everything below is then unaffected. Lines that have never been colored
 * show the highlight result, which is right for their text, so reaching one
 * of them only needs its state.
 */
declare class ShikiEditorTokenizer {
  #private;
  private readonly backend?;
  constructor(highlighter: HighlighterCore, options: DiffsEditorTokenizerOptions, backend?: Pick<DiffsHighlighter, 'getTheme' | 'loadLanguages'> | undefined);
  /**
   * Takes an edit: marks its lines dirty, moves the states and dirty lines
   * below it, and colors from the first dirty line for up to a millisecond.
   * Returns every line colored, in and above `window`. The rest continues
   * in the background.
   */
  applyChange(change: TextDocumentChange, window?: LineWindow): Map<number, HighlightedToken[]>;
  /**
   * Colors every dirty line before `end` now and returns them. A pause stays
   * in force: the rest waits for `resume`.
   */
  flush(end: number): Map<number, HighlightedToken[]>;
  /**
   * Builds the states of the lines up to the attach window's end in the
   * background, so the first edit there starts from a known state. The rows
   * keep what they show until an edit colors them.
   */
  prime(window: LineWindow): void;
  /**
   * The string, comment and regexp ranges of a line, from its last coloring,
   * or lexed now for a line never colored. Null without a grammar.
   */
  bracketIgnoredRanges(line: number): [number, number][] | null;
  setTheme(themeName: string): void;
  pause(): void;
  resume(): void;
  dispose(): void;
  /**
   * Colors dirty lines in order until they settle, `until` is reached, or
   * the budget runs out, and returns what it colored. A dirty range settles
   * once a line past its end ends in the state the next line was colored
   * from; a range whose start state is unknown first builds the states of
   * the lines leading to it.
   */
  advance(until: number, budgetMs?: number): Map<number, HighlightedToken[]>;
}
//#endregion
export { ShikiEditorTokenizer };
//# sourceMappingURL=shiki-editor.d.ts.map