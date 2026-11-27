import { DiffLib, LineDiffTypes } from "../types.js";
//#region src/utils/computeLineDiffRanges.d.ts
/** Start and end column of changed text in a line. The end is exclusive. */
type LineDiffRange = readonly [start: number, end: number];
interface LineDiffRanges {
  readonly deletion: readonly LineDiffRange[];
  readonly addition: readonly LineDiffRange[];
}
/**
 * Compares an old line with its new version and returns which parts of each
 * one changed, as column ranges. Returns no ranges when `lineDiffType` is
 * 'none' or when either line is longer than `maxLineDiffLength`.
 */
declare function computeLineDiffRanges(deletionLine: string, additionLine: string, lineDiffType: LineDiffTypes, maxLineDiffLength: number, preferredDiffLib?: DiffLib): LineDiffRanges;
//#endregion
export { LineDiffRange, LineDiffRanges, computeLineDiffRanges };
//# sourceMappingURL=computeLineDiffRanges.d.ts.map