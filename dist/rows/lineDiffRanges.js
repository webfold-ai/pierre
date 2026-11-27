import { computeLineDiffRanges } from "../utils/computeLineDiffRanges.js";
//#region src/rows/lineDiffRanges.ts
const NO_SIDE_RANGES = Object.freeze([]);
/**
* Word diff ranges for each line pair, remembered by old line index. Old
* lines never change, so an entry stays valid while the new line's text does.
*/
var LineDiffRangeCache = class {
	lineDiffType;
	maxLineDiffLength;
	preferredDiffLib;
	#pairs = /* @__PURE__ */ new Map();
	constructor(lineDiffType, maxLineDiffLength, preferredDiffLib = "jsdiff") {
		this.lineDiffType = lineDiffType;
		this.maxLineDiffLength = maxLineDiffLength;
		this.preferredDiffLib = preferredDiffLib;
	}
	get(deletionIndex, deletionText, additionText) {
		const cached = this.#pairs.get(deletionIndex);
		if (cached != null && cached.deletionText === deletionText && cached.additionText === additionText) return cached.ranges;
		let ranges;
		try {
			ranges = computeLineDiffRanges(deletionText, additionText, this.lineDiffType, this.maxLineDiffLength, this.preferredDiffLib);
		} catch (error) {
			if (this.preferredDiffLib === "jsdiff") throw error;
			console.error(error);
			this.preferredDiffLib = "jsdiff";
			ranges = computeLineDiffRanges(deletionText, additionText, this.lineDiffType, this.maxLineDiffLength, this.preferredDiffLib);
		}
		this.#pairs.set(deletionIndex, {
			deletionText,
			additionText,
			ranges
		});
		return ranges;
	}
};
/**
* The word diff marks on one side of a changed line: the ranges of its text
* that differ from its partner's, or none when the line has no partner.
* `ranges` remembers each pair's answer, so asking again for a line costs
* nothing while its texts stand. `markRow` turns the ranges into spans.
*/
function lineDiffRangesFor(model, side, lineIndex, ranges) {
	const partner = model.pairFor(side, lineIndex);
	if (partner == null) return NO_SIDE_RANGES;
	const { deletionLines, additionLines } = model.diff;
	const pair = side === "deletions" ? ranges.get(lineIndex, deletionLines[lineIndex], additionLines[partner]) : ranges.get(partner, deletionLines[partner], additionLines[lineIndex]);
	return side === "deletions" ? pair.deletion : pair.addition;
}
//#endregion
export { LineDiffRangeCache, lineDiffRangesFor };

//# sourceMappingURL=lineDiffRanges.js.map