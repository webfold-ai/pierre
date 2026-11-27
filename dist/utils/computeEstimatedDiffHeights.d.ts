import { ExpandedHunksMap, FileDiffMetadata, HunkSeparators, VirtualFileMetrics } from "../types.js";
//#region src/utils/computeEstimatedDiffHeights.d.ts
interface ComputeEstimatedDiffHeightsOptions {
  fileDiff: FileDiffMetadata;
  metrics: VirtualFileMetrics;
  disableFileHeader: boolean;
  hunkSeparators: HunkSeparators;
  expandUnchanged: boolean;
  expandedHunks: ExpandedHunksMap | true | undefined;
  collapsedContextThreshold: number;
  canHydratePartialDiff: boolean;
  includeTrailingNewline?: boolean;
  showNoNewlineMarkers?: boolean;
}
interface EstimatedDiffHeights {
  splitHeight: number;
  unifiedHeight: number;
}
declare function computeEstimatedDiffHeights({ fileDiff, metrics, disableFileHeader, hunkSeparators, expandUnchanged, expandedHunks: configuredExpandedHunks, collapsedContextThreshold, canHydratePartialDiff, includeTrailingNewline, showNoNewlineMarkers }: ComputeEstimatedDiffHeightsOptions): EstimatedDiffHeights;
//#endregion
export { ComputeEstimatedDiffHeightsOptions, EstimatedDiffHeights, computeEstimatedDiffHeights };
//# sourceMappingURL=computeEstimatedDiffHeights.d.ts.map