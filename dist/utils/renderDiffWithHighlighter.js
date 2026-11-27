import "../constants.js";
import { getHighlighterThemeStyles } from "./getHighlighterThemeStyles.js";
import { DiffRowCursor } from "./DiffRowCursor.js";
import { cleanLastNewline } from "./cleanLastNewline.js";
import { getFiletypeFromFileName } from "./getFiletypeFromFileName.js";
import { appendItems } from "./appendItems.js";
import { getTokenOptions } from "./getTokenOptions.js";
import { setDeferredArrayItem } from "./setDeferredArrayItem.js";
import { renderTokenLines } from "./renderTokenLines.js";
//#region src/utils/renderDiffWithHighlighter.ts
const DEFAULT_PLAIN_TEXT_OPTIONS = { forcePlainText: false };
function renderDiffWithHighlighter(diff, highlighter, options, { forcePlainText, lazyLineAST = false, startingLine, totalLines, expandedHunks, collapsedContextThreshold = 1 } = DEFAULT_PLAIN_TEXT_OPTIONS) {
	if (forcePlainText) {
		startingLine ??= 0;
		totalLines ??= Infinity;
	} else {
		startingLine = 0;
		totalLines = Infinity;
	}
	const isWindowedHighlight = startingLine > 0 || totalLines < Infinity;
	lazyLineAST &&= !forcePlainText && !options.useTokenTransformer;
	const baseThemeType = typeof options.theme === "string" ? highlighter.getTheme(options.theme).type : void 0;
	const themeStyles = getHighlighterThemeStyles({
		theme: options.theme,
		highlighter
	});
	const code = {
		deletionLines: [],
		additionLines: []
	};
	const shouldGroupAll = !forcePlainText && !diff.isPartial;
	const expandedHunksForIteration = forcePlainText ? expandedHunks : void 0;
	const buckets = /* @__PURE__ */ new Map();
	function getBucketForHunk(hunkIndex) {
		const index = shouldGroupAll ? 0 : hunkIndex;
		const bucket = buckets.get(index) ?? createBucket();
		buckets.set(index, bucket);
		return bucket;
	}
	function appendContent(lineContent, lineIndex, segments, contentWrapper) {
		if (isWindowedHighlight) {
			let segment = segments.at(-1);
			if (segment == null || segment.targetIndex + segment.count !== lineIndex) {
				segment = {
					targetIndex: lineIndex,
					originalOffset: contentWrapper.length,
					count: 0
				};
				segments.push(segment);
			}
			segment.count++;
		}
		contentWrapper.push(lineContent);
	}
	const rows = new DiffRowCursor({
		diff,
		diffStyle: "both",
		startingLine,
		totalLines,
		expandedHunks: isWindowedHighlight ? expandedHunksForIteration : true,
		collapsedContextThreshold
	});
	while (rows.next()) {
		const { hunkIndex, type, splitLineIndex } = rows;
		const bucket = getBucketForHunk(hunkIndex);
		if (rows.hasDeletion) {
			const { deletionLineIndex, deletionLineNumber, deletionUnifiedLineIndex } = rows;
			appendContent(diff.deletionLines[deletionLineIndex], deletionLineIndex, bucket.deletionSegments, bucket.deletionContent);
			bucket.deletionInfo.push({
				type: type === "change" ? "change-deletion" : type,
				lineNumber: deletionLineNumber,
				altLineNumber: type === "change" ? void 0 : rows.additionLineNumber,
				lineIndex: `${deletionUnifiedLineIndex},${splitLineIndex}`
			});
		}
		if (rows.hasAddition) {
			const { additionLineIndex, additionLineNumber, additionUnifiedLineIndex } = rows;
			appendContent(diff.additionLines[additionLineIndex], additionLineIndex, bucket.additionSegments, bucket.additionContent);
			bucket.additionInfo.push({
				type: type === "change" ? "change-addition" : type,
				lineNumber: additionLineNumber,
				altLineNumber: type === "change" ? void 0 : rows.deletionLineNumber,
				lineIndex: `${additionUnifiedLineIndex},${splitLineIndex}`
			});
		}
	}
	for (const bucket of buckets.values()) {
		if (bucket.deletionContent.length === 0 && bucket.additionContent.length === 0) continue;
		const deletionFile = {
			name: diff.prevName ?? diff.name,
			contents: bucket.deletionContent.value
		};
		const additionFile = {
			name: diff.name,
			contents: bucket.additionContent.value
		};
		const { deletionLines, additionLines } = renderTwoFiles({
			deletionFile,
			deletionInfo: bucket.deletionInfo,
			additionFile,
			additionInfo: bucket.additionInfo,
			highlighter,
			options,
			languageOverride: forcePlainText ? "text" : diff.lang,
			lazyLineAST
		});
		if (shouldGroupAll) {
			code.deletionLines = deletionLines;
			code.additionLines = additionLines;
			continue;
		}
		for (const [target, lines, segments] of [[
			code.deletionLines,
			deletionLines,
			bucket.deletionSegments
		], [
			code.additionLines,
			additionLines,
			bucket.additionSegments
		]]) if (segments.length > 0) for (const segment of segments) for (let index = 0; index < segment.count; index++) target[segment.targetIndex + index] = lines[segment.originalOffset + index];
		else if (lazyLineAST) {
			const offset = target.length;
			for (let index = 0; index < lines.length; index++) setDeferredArrayItem(target, offset + index, () => lines[index]);
		} else appendItems(target, lines);
	}
	return {
		code,
		themeStyles,
		baseThemeType
	};
}
function createBucket() {
	return {
		deletionContent: {
			push(value) {
				this.value += value;
				this.length++;
			},
			value: "",
			length: 0
		},
		additionContent: {
			push(value) {
				this.value += value;
				this.length++;
			},
			value: "",
			length: 0
		},
		deletionInfo: [],
		additionInfo: [],
		deletionSegments: [],
		additionSegments: []
	};
}
function renderTwoFiles({ lazyLineAST, deletionFile, additionFile, deletionInfo, additionInfo, highlighter, languageOverride, options: { theme, useTokenTransformer, tokenizeMaxLineLength } }) {
	const renderFile = (file, lineInfo) => {
		if (file.contents === "") return [];
		return renderTokenLines(highlighter.codeToTokens(cleanLastNewline(file.contents), getTokenOptions(languageOverride ?? getFiletypeFromFileName(file.name), theme, tokenizeMaxLineLength)).tokens, {
			state: { lineInfo },
			useTokenTransformer,
			lazyLineAST,
			cacheHtmlStyles: highlighter.name === "highlights"
		});
	};
	return {
		deletionLines: renderFile(deletionFile, deletionInfo),
		additionLines: renderFile(additionFile, additionInfo)
	};
}
//#endregion
export { renderDiffWithHighlighter };

//# sourceMappingURL=renderDiffWithHighlighter.js.map