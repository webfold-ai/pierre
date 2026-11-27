import { lineChangesOf } from "../utils/lineChanges.js";
//#region src/highlighter/linesAfterChange.ts
function lineAfterChange(line, change) {
	const ranges = lineRangesAfterChange([[line, line]], change);
	return ranges.length === 0 ? void 0 : ranges[0][0];
}
function lineRangesAfterChange(ranges, change) {
	const { changes } = change;
	const lineChanges = lineChangesOf(change);
	const result = [];
	for (const [first, last] of ranges) {
		let next = first;
		let shift = 0;
		for (const [index, { range }] of changes.entries()) {
			const delta = lineChanges[index][2];
			if (range.end.line < next) {
				shift += delta;
				continue;
			}
			if (range.start.line > last) break;
			if (next < range.start.line) result.push([next + shift, range.start.line - 1 + shift]);
			next = range.end.line + 1;
			shift += delta;
		}
		if (next <= last) result.push([next + shift, last + shift]);
	}
	return result;
}
//#endregion
export { lineAfterChange, lineRangesAfterChange };

//# sourceMappingURL=linesAfterChange.js.map