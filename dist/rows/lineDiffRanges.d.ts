import { DiffLib, LineDiffTypes } from "../types.js";
import { DiffSide } from "../model/types.js";
import { DiffModel } from "../model/DiffModel.js";
import { LineDiffRange, LineDiffRanges } from "../utils/computeLineDiffRanges.js";
//#region src/rows/lineDiffRanges.d.ts
/**
 * Word diff ranges for each line pair, remembered by old line index. Old
 * lines never change, so an entry stays valid while the new line's text does.
 */
declare class LineDiffRangeCache {
  #private;
  readonly lineDiffType: LineDiffTypes;
  readonly maxLineDiffLength: number;
  private preferredDiffLib;
  constructor(lineDiffType: LineDiffTypes, maxLineDiffLength: number, preferredDiffLib?: DiffLib);
  get(deletionIndex: number, deletionText: string, additionText: string): LineDiffRanges;
}
/**
 * The word diff marks on one side of a changed line: the ranges of its text
 * that differ from its partner's, or none when the line has no partner.
 * `ranges` remembers each pair's answer, so asking again for a line costs
 * nothing while its texts stand. `markRow` turns the ranges into spans.
 */
declare function lineDiffRangesFor(model: DiffModel, side: DiffSide, lineIndex: number, ranges: LineDiffRangeCache): readonly LineDiffRange[];
//#endregion
export { LineDiffRangeCache, lineDiffRangesFor };
//# sourceMappingURL=lineDiffRanges.d.ts.map