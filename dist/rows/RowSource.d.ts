import { Element, ElementContent } from "../node_modules/.pnpm/@types_hast@3.0.4/node_modules/@types/hast/index.js";
import { HighlightedToken } from "../types.js";
import { DiffModel } from "../model/DiffModel.js";
import { FileModel } from "../model/FileModel.js";
//#region src/rows/RowSource.d.ts
interface HighlightRows {
  /** Old-file rows from the highlight result, by old line index, unmarked. */
  deletionRows: readonly ElementContent[];
  /** New-file rows from the highlight result, by line index, unmarked. */
  additionRows: readonly ElementContent[];
  /** The new-file lines those rows were rendered from. */
  additionLines: readonly string[];
  /**
   * The id of the line each addition row was highlighted for. Given for a
   * diff being edited, so rows follow their lines through later edits.
   */
  lineIds?: readonly number[];
}
/**
 * Base rows for the rows the layout places: token spans and text, with no
 * marks and no line attributes. Deletion rows come from the highlight result.
 * Addition rows come from the editor's tokens when it has sent some for the
 * line, else from the highlight result while the line's text is unchanged,
 * else as plain text until tokens arrive. Rows are memoized on their inputs,
 * so an unchanged line gives the same object back.
 */
declare class RowSource {
  #private;
  constructor(rows: HighlightRows);
  /** Binds the rows of a highlight result, keeping the editor's tokens. */
  setHighlightRows({ deletionRows, additionRows, additionLines, lineIds }: HighlightRows): void;
  /**
   * Records the editor's tokens for a line. Returns false when they render
   * the same as the tokens already held, so callers can skip the row.
   */
  setTokens(lineId: number, tokens: HighlightedToken[]): boolean;
  /** Whether the editor has sent tokens for a line. */
  hasTokens(lineId: number): boolean;
  /** Drops the editor's tokens for every line. */
  forgetTokens(): void;
  /** Drops what is held for lines an edit deleted. */
  forgetLines(lineIds: readonly number[]): void;
  /**
   * The row for an old line. A highlight result has rows only for lines in
   * hunks, so a diff with none (a pure rename) edited into one shows its old
   * lines as plain text until it is highlighted again.
   */
  deletionRow(model: DiffModel, lineIndex: number): Element;
  additionRow(model: DiffModel | FileModel, lineIndex: number): Element;
}
//#endregion
export { HighlightRows, RowSource };
//# sourceMappingURL=RowSource.d.ts.map