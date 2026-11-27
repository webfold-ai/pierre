import { ExpandedHunksMap, FileDiffMetadata, Hunk } from "../types.js";
//#region src/utils/DiffRowCursor.d.ts
interface DiffRowCursorOptions {
  diff: FileDiffMetadata;
  diffStyle: 'unified' | 'split' | 'both';
  startingLine?: number;
  totalLines?: number;
  expandedHunks?: ExpandedHunksMap | true;
  collapsedContextThreshold?: number;
  /**
   * Also emit a row for the empty line after the new file's final line
   * break, right after the last hunk. The parsed diff has no line for it;
   * an edit session shows it so the caret has a row there.
   */
  includeTrailingNewline?: boolean;
}
declare class DiffRowCursor {
  private readonly diff;
  private readonly diffStyle;
  private readonly expandedHunks;
  private readonly collapsedContextThreshold;
  private readonly includeTrailingNewline;
  private readonly startingLine;
  private readonly windowEnd;
  private unifiedCount;
  private splitCount;
  private rowType;
  private rowHunkIndex;
  private rowHunk;
  private rowHasDeletion;
  private rowHasAddition;
  private index;
  private end;
  private secondStretchFirst;
  private secondStretchEnd;
  private deletionIndexStart;
  private deletionNumberStart;
  private deletionUnifiedStart;
  private additionIndexStart;
  private additionNumberStart;
  private additionUnifiedStart;
  private splitStart;
  private firstRowCollapsedBefore;
  private collapsedAfterValue;
  private collapsedAfterRow;
  private deletionNoEOFCRRow;
  private additionNoEOFCRRow;
  private part;
  private walkHunkIndex;
  private walkHunk;
  private contentIndex;
  private pendingCollapsed;
  private leadingStartRows;
  private leadingEndRows;
  private leadingRangeSize;
  private trailingRows;
  private trailingCollapsed;
  private unifiedAt;
  private splitAt;
  private deletionIndexAt;
  private additionIndexAt;
  private deletionNumberAt;
  private additionNumberAt;
  private collapsedAfterAt;
  constructor({ diff, diffStyle, startingLine, totalLines, expandedHunks, collapsedContextThreshold, includeTrailingNewline }: DiffRowCursorOptions);
  next(): boolean;
  get type(): 'context' | 'context-expanded' | 'change';
  get hunkIndex(): number;
  get hunk(): Hunk | undefined;
  get hasDeletion(): boolean;
  get hasAddition(): boolean;
  get deletionLineIndex(): number;
  get deletionLineNumber(): number;
  get deletionUnifiedLineIndex(): number;
  get deletionNoEOFCR(): boolean;
  get additionLineIndex(): number;
  get additionLineNumber(): number;
  get additionUnifiedLineIndex(): number;
  get additionNoEOFCR(): boolean;
  get unifiedLineIndex(): number;
  get splitLineIndex(): number;
  get collapsedBefore(): number;
  get collapsedAfter(): number;
  private findStartingHunk;
  private getLeadingRegion;
  private getTrailingRegion;
  private hasTrailingNewlineRow;
  private clipRun;
  private isPastWindow;
  private nextRun;
  private skipBlocksBeforeWindow;
  private enterHunk;
  private takePendingCollapsed;
  private startExpandedRun;
  private startContextRun;
  private startChangeRun;
  private startTrailingRun;
  private startTrailingNewlineRun;
  private setCollapsedAfterRow;
}
//#endregion
export { DiffRowCursor, DiffRowCursorOptions };
//# sourceMappingURL=DiffRowCursor.d.ts.map