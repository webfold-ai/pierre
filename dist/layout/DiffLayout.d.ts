import { AnnotationLineMap, DiffLib, DiffLineAnnotation, ExpandedHunksMap, HunkData, HunkSeparators, LineDiffTypes, RenderRange } from "../types.js";
import { DiffModel } from "../model/DiffModel.js";
import { LineCuts } from "../rows/LineCuts.js";
import { LayoutColumns } from "./RowSpec.js";
import { DiffHunksRenderer } from "../renderers/DiffHunksRenderer.js";
import { RowSource } from "../rows/RowSource.js";
//#region src/layout/DiffLayout.d.ts
interface DiffLayoutOptions {
  diffStyle: 'unified' | 'split';
  expandUnchanged: boolean;
  expansionLineCount: number;
  collapsedContextThreshold: number;
  hunkSeparators: HunkSeparators;
  lineDiffType: LineDiffTypes;
  maxLineDiffLength: number;
  preferredDiffLib?: DiffLib;
  /** Collapsed context can still be loaded, so every gap is expandable. */
  canHydrateContext: boolean;
}
interface DiffLayoutInput<LAnnotation> {
  host: DiffHunksRenderer<LAnnotation>;
  model: DiffModel;
  rows: RowSource;
  renderRange: RenderRange;
  expandedHunks: ExpandedHunksMap;
  deletionAnnotations: AnnotationLineMap<LAnnotation>;
  additionAnnotations: AnnotationLineMap<LAnnotation>;
  annotationSlotName(annotation: DiffLineAnnotation<LAnnotation>): string;
  /**
   * Give the empty line after the new file's final line break a row of its
   * own; see DiffRowCursorOptions.includeTrailingNewline.
   */
  includeTrailingNewline: boolean;
  /** Render the "No newline at end of file" marker rows. */
  showNoNewlineMarkers: boolean;
}
interface DiffLayoutResult {
  columns: LayoutColumns;
  /** The first and last new-file line numbers with a row in the window. */
  newFileLines: {
    first: number;
    last: number;
  } | undefined;
  /**
   * The rows that differ from the last layout, per column, when lines marked
   * by an edit were the only change since it; undefined when the window was
   * walked.
   */
  patched: LayoutColumns | undefined;
  hunkData: HunkData[];
  rowCount: number;
  totalLines: number;
}
/**
 * Places the rows of a diff for one render: which lines show, in which
 * column, with which separators, annotation rows, filler rows and "no
 * newline" markers between them. Each row's content is its base row from
 * the row source with the word diff marks of its current pair, stamped with
 * its line attributes. Rows are memoized on their inputs, so a row that did
 * not change is the same object as last time. When an edit marked lines and
 * nothing else changed since the last walk, the layout rebuilds those lines'
 * rows and their pairs' into the last result instead of walking again.
 */
declare class DiffLayout<LAnnotation = undefined> {
  #private;
  private options;
  private readonly lineCuts;
  constructor(options: DiffLayoutOptions, lineCuts: LineCuts);
  setOptions(options: DiffLayoutOptions): void;
  /** Lines whose text or tokens changed; the next layout rebuilds their rows. */
  markLines(lines: Iterable<number>): void;
  /** Drops the rows kept for lines an edit removed. */
  forgetLines(ids: readonly number[]): void;
  /**
   * After a change that moved rows: the rows of the last walk no longer
   * stand, so the next `layout` walks the window.
   */
  invalidateLines(): void;
  /**
   * The first and last new-file line numbers with a row in the window of
   * `input`, or undefined when no row shows one. Read off the last walk while
   * a layout of `input` would patch it rather than walk again; otherwise
   * found the way the walk finds them, without building rows.
   */
  newFileLines(input: DiffLayoutInput<LAnnotation>): {
    first: number;
    last: number;
  } | undefined;
  layout(input: DiffLayoutInput<LAnnotation>): DiffLayoutResult;
}
//#endregion
export { DiffLayout, DiffLayoutInput, DiffLayoutOptions, DiffLayoutResult };
//# sourceMappingURL=DiffLayout.d.ts.map