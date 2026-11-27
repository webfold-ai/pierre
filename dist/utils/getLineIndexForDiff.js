import { getHunkSideStartBoundary } from "./getHunkSideBoundaries.js";
//#region src/utils/getLineIndexForDiff.ts
function getLineIndexForDiff(fileDiff, lineNumber, side) {
	if (fileDiff == null) return;
	const lastHunk = fileDiff.hunks.at(-1);
	let targetUnifiedIndex;
	let targetSplitIndex;
	hunkIterator: for (const hunk of fileDiff.hunks) {
		const hunkStart = side === "deletions" ? hunk.deletionStart : hunk.additionStart;
		const hunkCount = side === "deletions" ? hunk.deletionCount : hunk.additionCount;
		let currentLineNumber = getHunkSideStartBoundary(hunkStart, hunkCount) + 1;
		let splitIndex = hunk.splitLineStart;
		let unifiedIndex = hunk.unifiedLineStart;
		if (lineNumber < currentLineNumber) {
			const difference = currentLineNumber - lineNumber;
			targetUnifiedIndex = Math.max(unifiedIndex - difference, 0);
			targetSplitIndex = Math.max(splitIndex - difference, 0);
			break hunkIterator;
		}
		if (lineNumber >= currentLineNumber + hunkCount) {
			if (hunk === lastHunk) {
				const difference = lineNumber - (currentLineNumber + hunkCount);
				targetUnifiedIndex = unifiedIndex + hunk.unifiedLineCount + difference;
				targetSplitIndex = splitIndex + hunk.splitLineCount + difference;
				break hunkIterator;
			}
			continue;
		}
		for (const content of hunk.hunkContent) if (content.type === "context") {
			if (lineNumber < currentLineNumber + content.lines) {
				const difference = lineNumber - currentLineNumber;
				targetSplitIndex = splitIndex + difference;
				targetUnifiedIndex = unifiedIndex + difference;
				break hunkIterator;
			} else {
				currentLineNumber += content.lines;
				splitIndex += content.lines;
				unifiedIndex += content.lines;
			}
		} else {
			const sideCount = side === "deletions" ? content.deletions : content.additions;
			if (lineNumber < currentLineNumber + sideCount) {
				const indexDifference = lineNumber - currentLineNumber;
				targetUnifiedIndex = unifiedIndex + (side === "additions" ? content.deletions : 0) + indexDifference;
				targetSplitIndex = splitIndex + indexDifference;
				break hunkIterator;
			} else {
				currentLineNumber += sideCount;
				splitIndex += Math.max(content.deletions, content.additions);
				unifiedIndex += content.deletions + content.additions;
			}
		}
		break hunkIterator;
	}
	if (targetUnifiedIndex == null || targetSplitIndex == null) return;
	return [targetUnifiedIndex, targetSplitIndex];
}
//#endregion
export { getLineIndexForDiff };

//# sourceMappingURL=getLineIndexForDiff.js.map