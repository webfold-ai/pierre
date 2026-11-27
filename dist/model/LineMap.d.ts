import { DocumentLineChange } from "./types.js";
//#region src/model/LineMap.d.ts
/**
 * Gives every line of an edited document a stable id.
 *
 * Ids are what rows are keyed by: inserting a line gives the new line a fresh
 * id while every line below keeps its id, so the rows below only change their
 * line numbers.
 */
declare class LineMap {
  #private;
  constructor(lineCount: number);
  get lineCount(): number;
  /** The id of every line, in line order. */
  ids(): number[];
  idAt(line: number): number;
  /** The line that currently has this id, or undefined when it was deleted. */
  lineOf(id: number): number | undefined;
  /**
   * Moves the ids through one document change. A line that stays keeps its
   * id, a line the change added gets a fresh one. Returns the ids of the
   * lines the change removed.
   */
  applyChange(change: DocumentLineChange): number[];
}
//#endregion
export { LineMap };
//# sourceMappingURL=LineMap.d.ts.map