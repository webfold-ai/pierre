import { ExpandedHunksMap, FileContents, FileDiffMetadata, ParseDiffOptions } from "../types.js";
import { DiffModelChange, DiffSide, DocumentLineChange, DocumentLines, HunkBlock, RetainedDiffSessionSnapshot } from "./types.js";
//#region src/model/DiffModel.d.ts
/** What the renderer hands the model with each change and when editing ends. */
interface ModelSessionState {
  /** Options for recomputing hunks. */
  parseDiffOptions?: ParseDiffOptions;
  /** How far each hunk's collapsed context is expanded, by hunk index. */
  expandedHunks?: ExpandedHunksMap;
}
interface StartSessionOptions {
  /** Options for the recompute an empty or renamed new file needs at the start. */
  parseDiffOptions?: ParseDiffOptions;
  /**
   * The editor's document when it is not the input's new file: a retained
   * draft from an earlier session, split like the parsed diff (no entry for
   * the empty line a final line break implies).
   */
  document?: FileContents;
  /** The hunks and old file the retained draft was diffed against. */
  snapshot?: RetainedDiffSessionSnapshot;
}
/**
 * The diff a component renders: the old lines, the new lines, and the hunks
 * that pair them. A static model wraps a `FileDiffMetadata` and never changes
 * it. A live model owns its diff for an edit session: `applyChange` keeps the
 * new lines and hunks current as the editor's document changes, using the
 * session rules (regions keep their old-side bounds, a reverted region stays
 * as context until `finish`), and `LineMap` gives every document line a
 * stable id.
 *
 * The diff's new lines are the document's lines without the empty line after
 * a final line break, so they always have the shape a parse gives them. That
 * line is still a document line with an id; it renders as an extra row with
 * no text.
 */
declare class DiffModel {
  #private;
  /** A read-only model over a diff the caller owns. Nothing is copied. */
  static fromDiff(diff: FileDiffMetadata): DiffModel;
  /**
   * A live model for editing `inputDiff`'s new file. The diff is a shallow
   * copy without a cache key; its arrays are shared with the input until an
   * edit replaces them, and the input is never written to.
   */
  static startEditSession(inputDiff: FileDiffMetadata, options?: StartSessionOptions): DiffModel;
  readonly diff: FileDiffMetadata;
  private constructor();
  /** Whether this model follows an editor's document. */
  get live(): boolean;
  /**
   * The number of new-file lines: the editor document's while editing,
   * otherwise the diff's.
   */
  get lineCount(): number;
  /** A stable id for a new-file line while editing; the index otherwise. */
  lineId(line: number): number;
  /**
   * The text of a new-file line, with its line break. Empty for the line
   * after a final line break, which has no entry.
   */
  lineText(line: number): string;
  /** The new-file line that has this id, or undefined once it was deleted. */
  lineOf(id: number): number | undefined;
  /** The hunk block containing a line, or undefined between hunks. */
  blockAt(side: DiffSide, lineIndex: number): HunkBlock | undefined;
  /**
   * The line on the other side that a changed line is paired with, by
   * position inside its change block, for word diff highlights. Undefined for
   * context and for unpaired lines.
   */
  pairFor(side: DiffSide, lineIndex: number): number | undefined;
  /**
   * The new-file line where editing continues from an old-file line number:
   * the same line for context, the block's first added line for a deleted
   * one, or the line after the block when it adds nothing (the line count
   * when the deletion ends the file). Undefined outside every hunk.
   */
  editLineFor(deletionLineNumber: number): number | undefined;
  /**
   * Brings the diff up to date with one change to the editor's document.
   * Same-line-count edits copy the changed lines in and keep the hunks when
   * the session rules allow; line-count edits reread the document and
   * rebuild the session regions.
   */
  applyChange(change: DocumentLineChange, document: DocumentLines, session?: ModelSessionState): DiffModelChange;
  /** The id of every line, in line order. */
  lineIds(): number[];
  /** The state another session needs to resume this one's draft. */
  snapshot(): RetainedDiffSessionSnapshot;
  /** Whether an edit has changed the diff since the session started. */
  get hasChanges(): boolean;
  /**
   * Ends the session: recomputes the hunks the way a plain diff of the final
   * text would, and keeps expansion at the gap edges that survive. Returns
   * whether a recompute ran, and the expansion to use from now on.
   */
  finish(collapsedContextThreshold: number, session?: ModelSessionState): {
    changed: boolean;
    expandedHunks: ExpandedHunksMap;
  };
}
//#endregion
export { DiffModel, ModelSessionState, StartSessionOptions };
//# sourceMappingURL=DiffModel.d.ts.map