import { cleanLastNewline } from "./cleanLastNewline.js";
import { diffLibs, resolveDiffLib } from "./diffLibs.js";
import { pushOrJoinSpan } from "./parseDiffDecorations.js";
//#region src/utils/computeLineDiffRanges.ts
const NO_RANGES = Object.freeze({
	deletion: Object.freeze([]),
	addition: Object.freeze([])
});
/**
* Compares an old line with its new version and returns which parts of each
* one changed, as column ranges. Returns no ranges when `lineDiffType` is
* 'none' or when either line is longer than `maxLineDiffLength`.
*/
function computeLineDiffRanges(deletionLine, additionLine, lineDiffType, maxLineDiffLength, preferredDiffLib = "jsdiff") {
	if (lineDiffType === "none") return NO_RANGES;
	deletionLine = cleanLastNewline(deletionLine);
	additionLine = cleanLastNewline(additionLine);
	if (deletionLine.length > maxLineDiffLength || additionLine.length > maxLineDiffLength) return NO_RANGES;
	const { diffChars, diffWordsWithSpace } = diffLibs[resolveDiffLib(preferredDiffLib)];
	const lineDiff = lineDiffType === "char" ? diffChars(deletionLine, additionLine) : diffWordsWithSpace(deletionLine, additionLine);
	if (lineDiffType === "word-line") return getWordLineRanges(lineDiff);
	const deletionSpans = [];
	const additionSpans = [];
	const enableJoin = lineDiffType === "word-alt";
	const lastItem = lineDiff.at(-1);
	for (const item of lineDiff) {
		const isLastItem = item === lastItem;
		if (!item.added && !item.removed) {
			pushOrJoinSpan({
				item,
				arr: deletionSpans,
				enableJoin,
				isNeutral: true,
				isLastItem
			});
			pushOrJoinSpan({
				item,
				arr: additionSpans,
				enableJoin,
				isNeutral: true,
				isLastItem
			});
		} else if (item.removed) pushOrJoinSpan({
			item,
			arr: deletionSpans,
			enableJoin,
			isLastItem
		});
		else pushOrJoinSpan({
			item,
			arr: additionSpans,
			enableJoin,
			isLastItem
		});
	}
	return {
		deletion: getSpanRanges(deletionSpans),
		addition: getSpanRanges(additionSpans)
	};
}
function getSpanRanges(spans) {
	const ranges = [];
	let spanIndex = 0;
	for (const [changed, value] of spans) {
		if (changed === 1) ranges.push([spanIndex, spanIndex + value.length]);
		spanIndex += value.length;
	}
	return ranges;
}
function getWordLineRanges(lineDiff) {
	let deletionOffset = 0;
	let additionOffset = 0;
	let deletionStart = -1;
	let deletionEnd = 0;
	let additionStart = -1;
	let additionEnd = 0;
	for (const { value, added, removed } of lineDiff) if (removed) {
		if (deletionStart === -1) deletionStart = deletionOffset;
		deletionOffset += value.length;
		deletionEnd = deletionOffset;
	} else if (added) {
		if (additionStart === -1) additionStart = additionOffset;
		additionOffset += value.length;
		additionEnd = additionOffset;
	} else {
		deletionOffset += value.length;
		additionOffset += value.length;
	}
	return {
		deletion: deletionStart !== -1 ? [[deletionStart, deletionEnd]] : [],
		addition: additionStart !== -1 ? [[additionStart, additionEnd]] : []
	};
}
//#endregion
export { computeLineDiffRanges };

//# sourceMappingURL=computeLineDiffRanges.js.map