import { linesFromFileContents } from "../utils/computeFileOffsets.js";
//#region src/model/documentLines.ts
function readChangedLines(document, change) {
	const ranges = change.changedLineChanges?.some(([, , lineDelta]) => lineDelta !== 0) === true ? [[change.startLine, change.endLine]] : change.changedLineRanges;
	const lines = /* @__PURE__ */ new Map();
	for (const [start, end] of ranges) {
		const last = Math.min(end, document.lineCount - 1);
		if (last < start) continue;
		if (last === start) {
			lines.set(start, document.getLineText(start, true));
			continue;
		}
		const endPosition = last + 1 < document.lineCount ? {
			line: last + 1,
			character: 0
		} : {
			line: last,
			character: document.getLineText(last).length
		};
		const contents = document.getText({
			start: {
				line: start,
				character: 0
			},
			end: endPosition
		});
		const rangeLines = linesFromFileContents(contents);
		for (let line = start; line <= last; line++) lines.set(line, rangeLines[line - start]);
	}
	return lines;
}
function readAllLines(document) {
	const lines = [];
	let characterCount = 0;
	for (let line = 0; line < document.lineCount; line++) {
		const text = document.getLineText(line, true);
		lines.push(text);
		characterCount += text.length;
	}
	return {
		lines,
		characterCount
	};
}
//#endregion
export { readAllLines, readChangedLines };

//# sourceMappingURL=documentLines.js.map