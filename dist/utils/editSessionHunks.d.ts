import { ExpandedHunksMap, FileDiffMetadata, ParseDiffOptions } from "../types.js";
//#region src/utils/editSessionHunks.d.ts
interface DivergenceCore {
  start: number;
  deletionEnd: number;
  additionEnd: number;
}
interface PreviousRegionSpan {
  firstIndex: number;
  lastIndex: number;
}
/** Maps rebuilt regions back to the previous skeleton for expansion remapping. */
interface SessionRegionChange {
  regions: Array<PreviousRegionSpan | undefined>;
}
/**
 * Find the complete old/current divergence core. The old side is immutable
 * during an edit session, so this result needs no prior-pass snapshot.
 */
declare function findDivergenceCore(deletionLines: string[], additionLines: string[]): DivergenceCore | undefined;
/**
 * Rebuild session regions from old/current lines and the previous change blocks.
 * A full parse supplies changes, preserving existing blank positions while
 * sliding new or edited blank changes up for the live editor. Previous line text
 * distinguishes edits to an insertion from untouched blocks of the same size.
 */
declare function rebuildSessionHunks(diff: FileDiffMetadata, parseDiffOptions?: ParseDiffOptions, getPreviousAdditionLine?: (index: number) => string | undefined): SessionRegionChange | undefined;
/**
 * Keep a cheap content-only path when a same-line-count pass cannot alter the
 * canonical blocks. Gap, ambiguous, or multi-region edits rebuild statelessly.
 */
declare function applySessionChangedLines(diff: FileDiffMetadata, changedAdditionLineIndexes: Iterable<number>, parseDiffOptions?: ParseDiffOptions, previousAdditionLines?: ReadonlyMap<number, string>): SessionRegionChange | undefined;
/** Preserve expansion at the surviving outer edges of rebuilt old-side gaps. */
declare function remapExpandedHunksForRegionChange(expandedHunks: ExpandedHunksMap, change: SessionRegionChange): ExpandedHunksMap;
/**
 * An expanded gap-edge slice in old-side (deletion-line) coordinates as a
 * `[start, end)` range. Old-side coordinates survive the exit recompute
 * unchanged — edits only touch the new side — so these anchor best-effort
 * expansion preservation across the recompute.
 */
type ExpansionAnchorRange = [start: number, end: number];
/** Snapshot the expanded gap-edge slices before the exit recompute. */
declare function captureExpansionAnchors(diff: FileDiffMetadata, expandedHunks: ExpandedHunksMap, collapsedContextThreshold: number): ExpansionAnchorRange[];
/**
 * Rebuild gap expansion state against the recomputed hunks: for each new
 * gap, an anchor touching the gap's start edge restores `fromStart`, one
 * touching its end edge restores `fromEnd`, and anchors for gaps that no
 * longer exist drop.
 */
declare function rebuildExpansionFromAnchors(diff: FileDiffMetadata, anchors: ExpansionAnchorRange[]): ExpandedHunksMap;
/**
 * While editing, hunk updates keep a lightweight session-specific shape and
 * mark the diff with `editSessionDirty`. Called at session end, this
 * recomputes the hunks in full from the diff's current lines — the same
 * hunks a non-session edit would have produced — and clears the flag.
 * Returns true when a recompute ran.
 */
declare function finishEditSessionForDiff(diff: FileDiffMetadata, parseDiffOptions?: ParseDiffOptions): boolean;
//#endregion
export { DivergenceCore, ExpansionAnchorRange, SessionRegionChange, applySessionChangedLines, captureExpansionAnchors, findDivergenceCore, finishEditSessionForDiff, rebuildExpansionFromAnchors, rebuildSessionHunks, remapExpandedHunksForRegionChange };
//# sourceMappingURL=editSessionHunks.d.ts.map