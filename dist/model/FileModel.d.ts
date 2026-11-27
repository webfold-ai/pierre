import { FileContents } from "../types.js";
import { DocumentLineChange, DocumentLines } from "./types.js";
//#region src/model/FileModel.d.ts
/** What one applied change did to the file beyond its text. */
interface FileModelChange {
  /** Line indexes whose text changed, after the edit. */
  readonly changedLines: readonly number[];
  /** Ids of the lines the edit deleted, so nothing is kept for them. */
  readonly removedLineIds: readonly number[];
  readonly lineDelta: number;
}
/**
 * The lines of a plain file and, while it is edited, a stable id for each
 * line, so rows are keyed by line rather than by position. The one-sided
 * twin of DiffModel.
 */
declare class FileModel {
  #private;
  readonly file: FileContents;
  /** A model of the file as given, for rendering it read-only. */
  static fromFile(file: FileContents): FileModel;
  /**
   * Starts editing a file. The session's file is a copy without the input's
   * cache key; `retained` supplies the name, language and contents of a
   * document the editor kept from an earlier session.
   */
  static startEditSession(file: FileContents, retained?: FileContents): FileModel;
  private constructor();
  /** Whether the file is being edited. */
  get live(): boolean;
  get lineCount(): number;
  /** Every line with its line break, in order. */
  get lines(): readonly string[];
  /** The text of a line, with its line break. */
  lineText(line: number): string;
  /** The stable id of a line: its index until edits move it. */
  lineId(line: number): number;
  /** The line that currently has this id, or undefined once it was deleted. */
  lineOf(id: number): number | undefined;
  /** The id of every line, in line order. */
  lineIds(): number[];
  /** Applies one change of the editor's document; `file` stays current. */
  applyChange(change: DocumentLineChange, document: DocumentLines): FileModelChange;
}
//#endregion
export { FileModel, FileModelChange };
//# sourceMappingURL=FileModel.d.ts.map