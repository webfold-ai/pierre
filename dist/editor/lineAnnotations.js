import { getLineAnnotationSource, recordLineAnnotationSource } from "../utils/lineAnnotationIdentity.js";
//#region src/editor/lineAnnotations.ts
function applyDocumentChangeToLineAnnotations(change, lineAnnotations) {
	const annotationChanges = getLineAnnotationChanges(change);
	if (annotationChanges.length === 0) return;
	const nextLineAnnotations = [];
	let changed = false;
	for (const annotation of lineAnnotations) {
		if ("side" in annotation && annotation.side === "deletions" || annotation.lineNumber <= 0) {
			nextLineAnnotations.push(annotation);
			continue;
		}
		let line = annotation.lineNumber - 1;
		let lineCount = change.previousLineCount;
		let annotationChanged = false;
		for (const lineChange of annotationChanges) {
			const nextLineCount = Math.max(1, lineCount + lineChange.lineDelta);
			const nextLine = mapLineThroughLineChange(line, lineChange, nextLineCount);
			if (nextLine === void 0) {
				annotationChanged = true;
				line = void 0;
				break;
			}
			if (nextLine !== line || lineChangeTouchesAnnotationLine(line, lineChange)) annotationChanged = true;
			line = nextLine;
			lineCount = nextLineCount;
		}
		if (line === void 0) {
			changed = true;
			continue;
		}
		const lineNumber = line + 1;
		if (annotationChanged) {
			if (lineNumber === annotation.lineNumber) nextLineAnnotations.push(annotation);
			else {
				const moved = {
					...annotation,
					lineNumber
				};
				recordLineAnnotationSource(moved, getLineAnnotationSource(annotation));
				nextLineAnnotations.push(moved);
			}
			changed = true;
			continue;
		}
		nextLineAnnotations.push(annotation);
	}
	return changed ? nextLineAnnotations : void 0;
}
function getLineAnnotationChanges(change) {
	if (change.changedLineChanges !== void 0) return change.changedLineChanges.flatMap(([startLine, changedEndLine, lineDelta, startCharacter = 0, _endCharacter = 0, endedAtDocumentEnd = false]) => {
		if (lineDelta === 0) return [];
		const insertedLineBreaks = Math.max(0, changedEndLine - startLine);
		return [{
			startLine,
			startCharacter,
			endLine: startLine + Math.max(0, insertedLineBreaks - lineDelta),
			deletesEndLine: lineDelta < 0 && endedAtDocumentEnd,
			insertedLineBreaks,
			lineDelta
		}];
	});
	if (change.lineDelta === 0) return change.changedLineRanges.flatMap(([startLine, endLine]) => {
		const insertedLineBreaks = endLine - startLine;
		if (insertedLineBreaks <= 0) return [];
		return [{
			startLine,
			startCharacter: 0,
			endLine: startLine,
			deletesEndLine: false,
			insertedLineBreaks,
			lineDelta: insertedLineBreaks
		}];
	});
	const removedLineCount = Math.max(0, -change.lineDelta);
	const deletedToDocumentEnd = change.endedAtDocumentEnd && change.startLine + removedLineCount === change.previousLineCount - 1;
	return [{
		startLine: change.startLine,
		startCharacter: change.startCharacter,
		endLine: change.startLine + removedLineCount,
		deletesEndLine: deletedToDocumentEnd,
		insertedLineBreaks: Math.max(0, change.lineDelta),
		lineDelta: change.lineDelta
	}];
}
function mapLineThroughLineChange(line, lineChange, nextLineCount) {
	if (line < lineChange.startLine) return line;
	if (line > lineChange.endLine || lineChange.endLine > lineChange.startLine && line === lineChange.endLine && !lineChange.deletesEndLine) return line + lineChange.lineDelta;
	if (lineChange.startLine === lineChange.endLine) {
		if (lineChange.startCharacter === 0) return line + lineChange.insertedLineBreaks;
		return line;
	}
	if (lineChangeDeletesAnnotationLine(line, lineChange)) return;
	const replacementLineOffset = Math.min(Math.max(0, line - lineChange.startLine), lineChange.insertedLineBreaks);
	return clampLine(lineChange.startLine + replacementLineOffset, nextLineCount);
}
function lineChangeDeletesAnnotationLine(line, lineChange) {
	if (lineChange.lineDelta >= 0 || line < lineChange.startLine || line > lineChange.endLine) return false;
	if (line === lineChange.startLine && lineChange.startCharacter > 0) return false;
	if (line === lineChange.endLine && !lineChange.deletesEndLine) return false;
	return true;
}
function lineChangeTouchesAnnotationLine(line, lineChange) {
	if (lineChange.lineDelta === 0 || line < lineChange.startLine || line > lineChange.endLine) return false;
	return !(lineChange.endLine > lineChange.startLine && line === lineChange.endLine && !lineChange.deletesEndLine);
}
function clampLine(line, lineCount) {
	return Math.max(0, Math.min(line, Math.max(0, lineCount - 1)));
}
//#endregion
export { applyDocumentChangeToLineAnnotations };

//# sourceMappingURL=lineAnnotations.js.map