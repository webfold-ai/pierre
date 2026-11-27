import { LineAnnotation, RenderRange } from "../types.js";
import { FileModel } from "../model/FileModel.js";
import { LineCuts } from "../rows/LineCuts.js";
import { RowSpec } from "./RowSpec.js";
import { RowSource } from "../rows/RowSource.js";
//#region src/layout/FileLayout.d.ts
interface FileLayoutInput<LAnnotation> {
  model: FileModel;
  rows: RowSource;
  renderRange: RenderRange;
  /** Annotations by line number; line 0 holds the file-level ones. */
  annotations: Record<number, LineAnnotation<LAnnotation>[] | undefined>;
  annotationSlotName(annotation: LineAnnotation<LAnnotation>): string;
}
interface FileLayoutResult {
  /** The one column a file renders: a gutter cell and a content cell per row. */
  column: RowSpec[];
  /**
   * The rows that differ from the last layout, when lines marked by an edit
   * were the only change since it; undefined when the window was walked.
   */
  patched: RowSpec[] | undefined;
  rowCount: number;
  totalLines: number;
}
/**
 * Places the rows of a plain file for one render: the file-level annotation
 * row, then one row per line in the render range with its line number, each
 * followed by its annotation row. One column, no marks. Rows are memoized on
 * their inputs, so a row that did not change is the same object as last
 * time. When an edit marked lines and nothing else changed since the last
 * walk, the layout rebuilds those lines' rows into the last result instead
 * of walking the window again.
 */
declare class FileLayout<LAnnotation = undefined> {
  #private;
  private readonly lineCuts;
  constructor(lineCuts: LineCuts);
  /** Lines whose text or tokens changed; the next layout rebuilds their rows. */
  markLines(lines: Iterable<number>): void;
  layout(input: FileLayoutInput<LAnnotation>): FileLayoutResult;
  /** Drops the rows kept for lines an edit removed. */
  forgetLines(ids: readonly number[]): void;
  /**
   * After a change that moved rows: the rows of the last walk no longer
   * stand, so the next `layout` walks the window.
   */
  invalidateLines(): void;
}
//#endregion
export { FileLayout, FileLayoutInput, FileLayoutResult };
//# sourceMappingURL=FileLayout.d.ts.map