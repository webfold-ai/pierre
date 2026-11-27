import { ExpandedHunksMap, ExpansionDirections, FileDiffMetadata, Hunk, HunkExpansionRegion, HunkSeparators, SelectionSide, VirtualFileMetrics } from "../types.js";
//#region src/utils/virtualDiffLayout.d.ts
interface ExpandedRegionResult {
  fromStart: number;
  fromEnd: number;
  rangeSize: number;
  collapsedLines: number;
  renderAll: boolean;
}
interface GetExpandedRegionProps {
  isPartial: boolean;
  rangeSize: number;
  expandedHunks: ExpandedHunksMap | true | undefined;
  hunkIndex: number;
  collapsedContextThreshold: number;
}
interface GetTrailingContextRangeSizeProps {
  fileDiff: FileDiffMetadata;
  errorPrefix: string;
}
interface GetTrailingExpandedRegionProps extends GetTrailingContextRangeSizeProps {
  hunkIndex: number;
  expandedHunks: GetExpandedRegionProps['expandedHunks'];
  collapsedContextThreshold: number;
}
/** One-based new-file line range covered by a hunk, as `[start, end)`. */
declare function getHunkAdditionLineRange(hunk: Hunk): [number, number];
/** One-based old-file line range covered by a hunk, as `[start, end)`. */
declare function getHunkDeletionLineRange(hunk: Hunk): [number, number];
/** One-based line range a hunk covers on one side, as `[start, end)`. */
declare function getHunkLineRange(hunk: Hunk, side: SelectionSide): [number, number];
interface HunkSeparatorLayout {
  height: number;
  gapBefore: number;
  gapAfter: number;
  totalHeight: number;
}
interface HunkSeparatorBaseProps {
  type: HunkSeparators;
  metrics: VirtualFileMetrics;
}
interface LeadingHunkSeparatorLayoutProps extends HunkSeparatorBaseProps {
  hunkIndex: number;
  hunkSpecs: string | undefined;
}
declare function growExpandedRegion(region: HunkExpansionRegion | undefined, direction: ExpansionDirections, lineCount: number): HunkExpansionRegion;
declare function getExpandedRegion({ isPartial, rangeSize, expandedHunks, hunkIndex, collapsedContextThreshold }: GetExpandedRegionProps): ExpandedRegionResult;
declare function hasTrailingContext(fileDiff: FileDiffMetadata): boolean;
declare function hasTrailingContextMismatch(fileDiff: FileDiffMetadata): boolean;
declare function getTrailingContextRangeSize({ fileDiff, errorPrefix }: GetTrailingContextRangeSizeProps): number;
declare function getTrailingExpandedRegion({ fileDiff, hunkIndex, expandedHunks, collapsedContextThreshold, errorPrefix }: GetTrailingExpandedRegionProps): ExpandedRegionResult | undefined;
interface IsDiffLineInCollapsedContextProps {
  fileDiff: FileDiffMetadata;
  /** One-based line number in the file `side` names. */
  lineNumber: number;
  /** `'additions'` for the new file, `'deletions'` for the old one. */
  side: SelectionSide;
  expandedHunks: ExpandedHunksMap | true | undefined;
  collapsedContextThreshold: number;
}
/**
 * Whether a one-based line of one side is hidden inside collapsed unchanged
 * context under the given expansion state, so it has no row. False for every
 * other line, including lines outside the diff's modeled range, which leaves
 * callers their existing missing-row handling. Computed from the same inputs
 * as `DiffRowCursor` so layout math and this check cannot diverge.
 */
declare function isDiffLineInCollapsedContext({ fileDiff, lineNumber, side, expandedHunks, collapsedContextThreshold }: IsDiffLineInCollapsedContextProps): boolean;
interface GetNearestRenderableAdditionLineProps extends Omit<IsDiffLineInCollapsedContextProps, 'side'> {
  direction: 'up' | 'down';
}
/**
 * The nearest renderable new-file line at or beyond `lineNumber` in the
 * given direction (one-based), or undefined when every line that way is
 * hidden inside collapsed regions. Sequential caret motion uses this to skip
 * over collapsed regions like code folds; it walks the hunk metadata once
 * instead of probing line by line across a gap.
 */
declare function getNearestRenderableAdditionLine({ fileDiff, lineNumber, direction, expandedHunks, collapsedContextThreshold }: GetNearestRenderableAdditionLineProps): number | undefined;
declare function getHunkSeparatorHeight({ type, metrics }: HunkSeparatorBaseProps): number;
declare function getHunkSeparatorGap({ type, metrics }: HunkSeparatorBaseProps): number;
declare function hasLeadingHunkSeparator({ type, hunkIndex, hunkSpecs }: Omit<LeadingHunkSeparatorLayoutProps, 'metrics'>): boolean;
declare function hasTrailingHunkSeparator(type: HunkSeparators): boolean;
declare function getLeadingHunkSeparatorLayout({ type, metrics, hunkIndex, hunkSpecs }: LeadingHunkSeparatorLayoutProps): HunkSeparatorLayout | undefined;
declare function getTrailingHunkSeparatorLayout({ type, metrics }: HunkSeparatorBaseProps): HunkSeparatorLayout | undefined;
//#endregion
export { ExpandedRegionResult, GetExpandedRegionProps, GetNearestRenderableAdditionLineProps, GetTrailingContextRangeSizeProps, GetTrailingExpandedRegionProps, HunkSeparatorLayout, IsDiffLineInCollapsedContextProps, getExpandedRegion, getHunkAdditionLineRange, getHunkDeletionLineRange, getHunkLineRange, getHunkSeparatorGap, getHunkSeparatorHeight, getLeadingHunkSeparatorLayout, getNearestRenderableAdditionLine, getTrailingContextRangeSize, getTrailingExpandedRegion, getTrailingHunkSeparatorLayout, growExpandedRegion, hasLeadingHunkSeparator, hasTrailingContext, hasTrailingContextMismatch, hasTrailingHunkSeparator, isDiffLineInCollapsedContext };
//# sourceMappingURL=virtualDiffLayout.d.ts.map