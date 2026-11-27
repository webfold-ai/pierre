import { i18n } from "../i18n/I18n.js";
import { createGutterGap } from "../utils/hast_utils.js";
import { getTrailingContextRangeSize } from "../utils/virtualDiffLayout.js";
import { DiffRowCursor } from "../utils/DiffRowCursor.js";
import { getFileAnnotations, shouldRenderFileAnnotations } from "../utils/includesFileAnnotations.js";
import { areRenderRangesEqual } from "../utils/areRenderRangesEqual.js";
import { RowCells, createColumn, pushRow, readOnly } from "./RowCells.js";
import { LineDiffRangeCache, lineDiffRangesFor } from "../rows/lineDiffRanges.js";
import { markRow } from "../rows/markRow.js";
import { createEmptyRowBuffer } from "../utils/createEmptyRowBuffer.js";
import { createNoNewlineElement } from "../utils/createNoNewlineElement.js";
import { createSeparator } from "../utils/createSeparator.js";
import { getHunkSeparatorSlotName } from "../utils/getHunkSeparatorSlotName.js";
import { getTotalLineCountFromHunks } from "../utils/getTotalLineCountFromHunks.js";
//#region src/layout/DiffLayout.ts
function readDiffRowLines(rows) {
	const { splitLineIndex } = rows;
	let deletionLine;
	let additionLine;
	if (rows.hasDeletion) {
		const { deletionLineIndex, deletionLineNumber, deletionUnifiedLineIndex, deletionNoEOFCR } = rows;
		deletionLine = {
			lineIndex: deletionLineIndex,
			lineNumber: deletionLineNumber,
			unifiedLineIndex: deletionUnifiedLineIndex,
			splitLineIndex,
			noEOFCR: deletionNoEOFCR
		};
	}
	if (rows.hasAddition) {
		const { additionLineIndex, additionLineNumber, additionUnifiedLineIndex, additionNoEOFCR } = rows;
		additionLine = {
			lineIndex: additionLineIndex,
			lineNumber: additionLineNumber,
			unifiedLineIndex: additionUnifiedLineIndex,
			splitLineIndex,
			noEOFCR: additionNoEOFCR
		};
	}
	if (deletionLine != null) return additionLine != null ? {
		deletionLine,
		additionLine
	} : { deletionLine };
	if (additionLine != null) return { additionLine };
	throw new Error("DiffLayout: row has no lines");
}
function sameInputs(last, next) {
	return last.host === next.host && last.model === next.model && last.rows === next.rows && last.expandedHunks === next.expandedHunks && last.deletionAnnotations === next.deletionAnnotations && last.additionAnnotations === next.additionAnnotations && last.annotationSlotName === next.annotationSlotName && last.includeTrailingNewline === next.includeTrailingNewline && last.showNoNewlineMarkers === next.showNoNewlineMarkers && areRenderRangesEqual(last.renderRange, next.renderRange);
}
const NO_RANGES = Object.freeze([]);
/**
* Places the rows of a diff for one render: which lines show, in which
* column, with which separators, annotation rows, filler rows and "no
* newline" markers between them. Each row's content is its base row from
* the row source with the word diff marks of its current pair, stamped with
* its line attributes. Rows are memoized on their inputs, so a row that did
* not change is the same object as last time. When an edit marked lines and
* nothing else changed since the last walk, the layout rebuilds those lines'
* rows and their pairs' into the last result instead of walking again.
*/
var DiffLayout = class {
	options;
	lineCuts;
	#ranges;
	#cells = new RowCells();
	#markedRows = /* @__PURE__ */ new WeakMap();
	#lineRows = /* @__PURE__ */ new Map();
	#positions = /* @__PURE__ */ new Map();
	#last;
	#marked;
	constructor(options, lineCuts) {
		this.options = options;
		this.lineCuts = lineCuts;
		this.#ranges = new LineDiffRangeCache(options.lineDiffType, options.maxLineDiffLength, options.preferredDiffLib);
	}
	setOptions(options) {
		const previous = this.options;
		if (options.lineDiffType !== previous.lineDiffType || options.maxLineDiffLength !== previous.maxLineDiffLength || options.preferredDiffLib !== previous.preferredDiffLib) this.#ranges = new LineDiffRangeCache(options.lineDiffType, options.maxLineDiffLength, options.preferredDiffLib);
		if (options.diffStyle !== previous.diffStyle || options.expandUnchanged !== previous.expandUnchanged || options.expansionLineCount !== previous.expansionLineCount || options.collapsedContextThreshold !== previous.collapsedContextThreshold || options.hunkSeparators !== previous.hunkSeparators || options.lineDiffType !== previous.lineDiffType || options.maxLineDiffLength !== previous.maxLineDiffLength || options.preferredDiffLib !== previous.preferredDiffLib || options.canHydrateContext !== previous.canHydrateContext) this.invalidateLines();
		this.options = options;
	}
	/** Lines whose text or tokens changed; the next layout rebuilds their rows. */
	markLines(lines) {
		const marked = this.#marked ??= /* @__PURE__ */ new Set();
		for (const line of lines) marked.add(line);
	}
	/** Drops the rows kept for lines an edit removed. */
	forgetLines(ids) {
		this.#cells.forgetLines(ids);
		for (const id of ids) this.#lineRows.delete(`a${id}`);
	}
	/**
	* After a change that moved rows: the rows of the last walk no longer
	* stand, so the next `layout` walks the window.
	*/
	invalidateLines() {
		this.#lineRows.clear();
		this.#positions.clear();
		this.#last = void 0;
		this.#marked = void 0;
	}
	/**
	* The first and last new-file line numbers with a row in the window of
	* `input`, or undefined when no row shows one. Read off the last walk while
	* a layout of `input` would patch it rather than walk again; otherwise
	* found the way the walk finds them, without building rows.
	*/
	newFileLines(input) {
		const last = this.#last;
		if (last != null && sameInputs(last.input, input)) return last.result.newFileLines;
		const { diffStyle, expandUnchanged, collapsedContextThreshold } = this.options;
		let first;
		let lastLine;
		const rows = new DiffRowCursor({
			diff: input.model.diff,
			diffStyle,
			startingLine: input.renderRange.startingLine,
			totalLines: input.renderRange.totalLines,
			expandedHunks: expandUnchanged ? true : input.expandedHunks,
			collapsedContextThreshold,
			includeTrailingNewline: input.includeTrailingNewline
		});
		while (rows.next()) if (rows.hasAddition) {
			const { additionLineNumber } = rows;
			first ??= additionLineNumber;
			lastLine = additionLineNumber;
		}
		return first == null || lastLine == null ? void 0 : {
			first,
			last: lastLine
		};
	}
	layout(input) {
		const marked = this.#marked;
		this.#marked = void 0;
		const last = this.#last;
		if (marked != null && last != null && sameInputs(last.input, input)) return this.#patch(last, marked, input);
		this.lineCuts.startLayout();
		const { host, model, renderRange, expandedHunks, includeTrailingNewline, showNoNewlineMarkers } = input;
		const { diff } = model;
		const { diffStyle, expandUnchanged, expansionLineCount, collapsedContextThreshold, hunkSeparators, canHydrateContext } = this.options;
		const unified = diffStyle === "unified";
		const isExpandableDiff = !diff.isPartial || canHydrateContext;
		const marks = this.options.lineDiffType !== "none";
		this.#lineRows.clear();
		this.#positions.clear();
		const columns = {
			unified: createColumn(),
			deletions: createColumn(),
			additions: createColumn()
		};
		const hunkData = [];
		let rowCount = 0;
		let firstNewFileLine;
		let lastNewFileLine;
		const pendingBuffer = {
			size: 0,
			side: void 0
		};
		const flushBuffer = () => {
			if (unified) return;
			const { size, side } = pendingBuffer;
			pendingBuffer.size = 0;
			pendingBuffer.side = void 0;
			if (size <= 0 || side == null) return;
			const column = columns[side];
			this.#cells.fixedRow(column, bufferKey(column), `${size}`, () => ({
				gutter: createGutterGap(void 0, "buffer", size),
				content: createEmptyRowBuffer(size)
			}));
		};
		const pushSeparators = (props) => {
			flushBuffer();
			const types = unified ? ["unified"] : ["deletions", "additions"];
			for (const type of types) if (this.#pushSeparator(columns[type], type, props, hunkSeparators, expansionLineCount, hunkData) && type !== "additions") rowCount++;
		};
		const pushAnnotationRow = (column, lineKey, span, lineType) => {
			this.#cells.fixedRow(column, `ann:${lineKey}`, `${lineType}|${span.hunkIndex},${span.lineIndex}|${span.annotations.join(",")}`, () => ({
				gutter: createGutterGap(lineType, "annotation", 1),
				content: readOnly(host.createAnnotationElement(span))
			}));
		};
		this.#pushFileAnnotations(input, columns, pushAnnotationRow, () => {
			rowCount++;
		});
		const trailingRangeSize = getTrailingContextRangeSize({
			fileDiff: diff,
			errorPrefix: "DiffLayout.layout"
		});
		const rows = new DiffRowCursor({
			diff,
			diffStyle,
			startingLine: renderRange.startingLine,
			totalLines: renderRange.totalLines,
			expandedHunks: expandUnchanged ? true : expandedHunks,
			collapsedContextThreshold,
			includeTrailingNewline
		});
		while (rows.next()) {
			const { deletionLine, additionLine } = readDiffRowLines(rows);
			const { hunkIndex, hunk, collapsedBefore, collapsedAfter, type, splitLineIndex, unifiedLineIndex } = rows;
			if (additionLine != null) {
				firstNewFileLine ??= additionLine.lineNumber;
				lastNewFileLine = additionLine.lineNumber;
			}
			if (!unified && type !== "change") flushBuffer();
			if (collapsedBefore > 0) pushSeparators({
				hunkIndex,
				collapsedLines: collapsedBefore,
				rangeSize: Math.max(hunk?.collapsedBefore ?? 0, 0),
				hunkSpecs: hunk?.hunkSpecs,
				isFirstHunk: hunkIndex === 0,
				isLastHunk: false,
				isExpandable: isExpandableDiff
			});
			const lineIndex = unified ? unifiedLineIndex : splitLineIndex;
			const lineContext = {
				type,
				hunkIndex,
				lineIndex,
				unifiedLineIndex,
				splitLineIndex,
				deletionLine,
				additionLine
			};
			const marked = marks && type === "change";
			const lineKey = additionLine != null ? `a${model.lineId(additionLine.lineIndex)}` : `d${deletionLine.lineIndex}`;
			const deletionsKey = deletionLine != null ? `d${deletionLine.lineIndex}` : lineKey;
			const additionsKey = lineKey;
			if (unified) {
				const injected = host.getUnifiedInjectedRowsForLine?.(lineContext);
				if (injected?.before != null) rowCount += pushUnifiedInjectedRows(columns.unified, injected.before, `${lineKey}:before`);
				const lineType = type === "change" ? additionLine != null ? "change-addition" : "change-deletion" : type;
				const decoration = host.getUnifiedLineDecoration({
					type,
					lineType,
					additionLineIndex: additionLine?.lineIndex,
					deletionLineIndex: deletionLine?.lineIndex
				});
				const lineIndexText = `${unifiedLineIndex},${splitLineIndex}`;
				this.#pushLineRow(input, columns.unified, additionLine != null ? {
					column: "unified",
					key: lineKey,
					side: "additions",
					lineIndex: additionLine.lineIndex,
					marked,
					contentProperties: decoration.contentProperties,
					lineNumber: additionLine.lineNumber,
					altLineNumber: type === "change" ? void 0 : deletionLine?.lineNumber,
					lineIndexText,
					gutterLineType: decoration.gutterLineType,
					gutterProperties: decoration.gutterProperties
				} : {
					column: "unified",
					key: lineKey,
					side: "deletions",
					lineIndex: deletionLine.lineIndex,
					marked,
					contentProperties: decoration.contentProperties,
					lineNumber: deletionLine.lineNumber,
					altLineNumber: void 0,
					lineIndexText,
					gutterLineType: decoration.gutterLineType,
					gutterProperties: decoration.gutterProperties
				});
				const span = getUnifiedAnnotationSpan(input, deletionLine?.lineNumber, additionLine?.lineNumber, hunkIndex, lineIndex);
				if (span != null) {
					pushAnnotationRow(columns.unified, lineKey, span, lineType);
					rowCount++;
				}
				if (injected?.after != null) rowCount += pushUnifiedInjectedRows(columns.unified, injected.after, `${lineKey}:after`);
			} else {
				const injected = host.getSplitInjectedRowsForLine?.(lineContext);
				if (injected?.before != null) rowCount += pushSplitInjectedRows(columns, injected.before, `${lineKey}:before`, pendingBuffer, flushBuffer);
				const deletionDecoration = host.getSplitLineDecoration({
					side: "deletions",
					type,
					lineIndex: deletionLine?.lineIndex
				});
				const additionDecoration = host.getSplitLineDecoration({
					side: "additions",
					type,
					lineIndex: additionLine?.lineIndex
				});
				const missingSide = type === "change" ? additionLine == null ? "additions" : deletionLine == null ? "deletions" : void 0 : void 0;
				if (missingSide != null) {
					if (pendingBuffer.side != null && pendingBuffer.side !== missingSide) flushBuffer();
					pendingBuffer.side = missingSide;
					pendingBuffer.size += 1;
				} else if (type === "change") flushBuffer();
				const spans = getSplitAnnotationSpans(input, deletionLine?.lineNumber, additionLine?.lineNumber, hunkIndex, lineIndex);
				if (spans != null && pendingBuffer.size > 0) flushBuffer();
				if (deletionLine != null) this.#pushLineRow(input, columns.deletions, {
					column: "deletions",
					key: deletionsKey,
					side: "deletions",
					lineIndex: deletionLine.lineIndex,
					marked,
					contentProperties: deletionDecoration.contentProperties,
					lineNumber: deletionLine.lineNumber,
					altLineNumber: type === "change" ? void 0 : additionLine?.lineNumber,
					lineIndexText: `${deletionLine.unifiedLineIndex},${splitLineIndex}`,
					gutterLineType: deletionDecoration.gutterLineType,
					gutterProperties: deletionDecoration.gutterProperties
				});
				if (additionLine != null) this.#pushLineRow(input, columns.additions, {
					column: "additions",
					key: additionsKey,
					side: "additions",
					lineIndex: additionLine.lineIndex,
					marked,
					contentProperties: additionDecoration.contentProperties,
					lineNumber: additionLine.lineNumber,
					altLineNumber: type === "change" ? void 0 : deletionLine?.lineNumber,
					lineIndexText: `${additionLine.unifiedLineIndex},${splitLineIndex}`,
					gutterLineType: additionDecoration.gutterLineType,
					gutterProperties: additionDecoration.gutterProperties
				});
				if (spans != null) {
					pushAnnotationRow(columns.deletions, deletionsKey, spans.deletionSpan, type === "change" ? deletionLine != null ? "change-deletion" : "context" : type);
					pushAnnotationRow(columns.additions, additionsKey, spans.additionSpan, type === "change" ? additionLine != null ? "change-addition" : "context" : type);
					rowCount++;
				}
				if (injected?.after != null) rowCount += pushSplitInjectedRows(columns, injected.after, `${lineKey}:after`, pendingBuffer, flushBuffer);
			}
			const isFinalSplitHunkRow = !unified && hunk != null && splitLineIndex === hunk.splitLineStart + hunk.splitLineCount - 1;
			const isFinalHunkRow = hunkIndex === diff.hunks.length - 1 && hunk != null && (unified ? unifiedLineIndex === hunk.unifiedLineStart + hunk.unifiedLineCount - 1 : splitLineIndex === hunk.splitLineStart + hunk.splitLineCount - 1);
			const noEOFCRDeletion = (deletionLine?.noEOFCR ?? false) || isFinalSplitHunkRow && hunk.noEOFCRDeletions;
			const noEOFCRAddition = (additionLine?.noEOFCR ?? false) || isFinalSplitHunkRow && hunk.noEOFCRAdditions;
			if (showNoNewlineMarkers && (noEOFCRAddition || noEOFCRDeletion)) {
				flushBuffer();
				if (noEOFCRDeletion) {
					const noEOFType = type === "context" || type === "context-expanded" ? type : "change-deletion";
					this.#cells.fixedRow(unified ? columns.unified : columns.deletions, "eof:d", noEOFType, () => {
						const marker = createNoNewlineElement(noEOFType);
						return {
							gutter: createGutterGap(noEOFType, "metadata", 1),
							content: noEOFType === "change-deletion" ? readOnly(marker) : marker
						};
					});
					if (!unified && !noEOFCRAddition) this.#cells.fixedRow(columns.additions, bufferKey(columns.additions), "1", () => ({
						gutter: createGutterGap(void 0, "buffer", 1),
						content: createEmptyRowBuffer(1)
					}));
				}
				if (noEOFCRAddition && !(unified && noEOFCRDeletion && type !== "change")) {
					const noEOFType = type === "context" || type === "context-expanded" ? type : "change-addition";
					this.#cells.fixedRow(unified ? columns.unified : columns.additions, "eof:a", noEOFType, () => ({
						gutter: createGutterGap(noEOFType, "metadata", 1),
						content: createNoNewlineElement(noEOFType)
					}));
					if (!unified && !noEOFCRDeletion) this.#cells.fixedRow(columns.deletions, bufferKey(columns.deletions), "1", () => ({
						gutter: createGutterGap(void 0, "buffer", 1),
						content: createEmptyRowBuffer(1)
					}));
				}
				rowCount++;
			}
			if (hunkSeparators !== "simple" && hunkSeparators !== "metadata" && (collapsedAfter > 0 || isFinalHunkRow && canHydrateContext)) pushSeparators({
				hunkIndex: type === "context-expanded" ? hunkIndex : hunkIndex + 1,
				collapsedLines: isFinalHunkRow && canHydrateContext ? "unknown" : collapsedAfter,
				rangeSize: trailingRangeSize,
				hunkSpecs: void 0,
				isFirstHunk: false,
				isLastHunk: true,
				isExpandable: isExpandableDiff
			});
			rowCount++;
		}
		flushBuffer();
		const totalLines = Math.max(getTotalLineCountFromHunks(diff.hunks), model.lineCount, diff.deletionLines.length);
		const hasBuffer = renderRange.bufferBefore > 0 || renderRange.bufferAfter > 0;
		const hasContent = rowCount > 0 || hasBuffer;
		const includeAdditions = !unified && diff.type !== "deleted";
		const includeDeletions = !unified && diff.type !== "new";
		const result = {
			columns: {
				unified: unified && hasContent ? columns.unified.specs : void 0,
				deletions: includeDeletions && hasContent ? columns.deletions.specs : void 0,
				additions: includeAdditions && hasContent ? columns.additions.specs : void 0
			},
			newFileLines: firstNewFileLine == null || lastNewFileLine == null ? void 0 : {
				first: firstNewFileLine,
				last: lastNewFileLine
			},
			patched: void 0,
			hunkData,
			rowCount,
			totalLines
		};
		this.#last = {
			input,
			result
		};
		return result;
	}
	#patch(last, marked, input) {
		const { model } = input;
		const columns = { ...last.result.columns };
		const copied = /* @__PURE__ */ new Set();
		const patched = {
			unified: columns.unified == null ? void 0 : [],
			deletions: columns.deletions == null ? void 0 : [],
			additions: columns.additions == null ? void 0 : []
		};
		const seen = /* @__PURE__ */ new Set();
		const rebuild = (key) => {
			const row = this.#lineRows.get(key);
			const position = this.#positions.get(key);
			if (row == null || position == null || seen.has(key)) return;
			seen.add(key);
			let target = columns[row.column];
			if (target == null) throw new Error("DiffLayout: a kept row is in a column that was not laid out");
			if (!copied.has(row.column)) {
				target = target.slice();
				columns[row.column] = target;
				copied.add(row.column);
			}
			const spec = this.#lineRow(input, row);
			target[position] = spec;
			patched[row.column]?.push(spec);
		};
		for (const line of marked) {
			if (line < 0 || line >= model.lineCount) continue;
			rebuild(`a${model.lineId(line)}`);
			const partner = model.pairFor("additions", line);
			if (partner != null) rebuild(`d${partner}`);
		}
		const result = {
			...last.result,
			columns,
			patched
		};
		this.#last = {
			input,
			result
		};
		return result;
	}
	#pushSeparator(column, type, { hunkIndex, collapsedLines, rangeSize, hunkSpecs, isFirstHunk, isLastHunk, isExpandable }, hunkSeparators, expansionLineCount, hunkData) {
		if (typeof collapsedLines === "number" && collapsedLines <= 0) return false;
		if (hunkSeparators === "metadata") {
			if (hunkSpecs == null) return false;
			const separator = () => createSeparator({
				type: "metadata",
				content: hunkSpecs,
				isFirstHunk,
				isLastHunk
			});
			this.#cells.fixedRow(column, `sep:${type}:${hunkIndex}`, `metadata|${hunkSpecs}|${isFirstHunk}|${isLastHunk}`, () => ({
				gutter: separator(),
				content: readOnly(separator())
			}));
			return true;
		}
		if (hunkSeparators === "simple") {
			if (hunkIndex <= 0) return false;
			const separator = () => createSeparator({
				type: "simple",
				isFirstHunk,
				isLastHunk: false
			});
			this.#cells.fixedRow(column, `sep:${type}:${hunkIndex}`, `simple|${isFirstHunk}`, () => ({
				gutter: separator(),
				content: readOnly(separator())
			}));
			return true;
		}
		const slotName = getHunkSeparatorSlotName(type, hunkIndex);
		const chunked = rangeSize > expansionLineCount;
		const expandIndex = isExpandable ? hunkIndex : void 0;
		const content = typeof collapsedLines === "number" ? i18n.t("unmodifiedLines", { count: collapsedLines }) : i18n.t("unknownUnmodifiedLines");
		const separator = () => createSeparator({
			type: hunkSeparators,
			content,
			expandIndex,
			chunked,
			slotName,
			isFirstHunk,
			isLastHunk
		});
		this.#cells.fixedRow(column, `sep:${slotName}`, `${hunkSeparators}|${content}|${expandIndex}|${chunked}|${isFirstHunk}|${isLastHunk}`, () => ({
			gutter: separator(),
			content: readOnly(separator())
		}));
		hunkData.push({
			slotName,
			hunkIndex,
			lines: typeof collapsedLines === "number" ? collapsedLines : 0,
			lineCountKnown: typeof collapsedLines === "number",
			type,
			expandable: isExpandable ? {
				up: !isFirstHunk,
				down: !isLastHunk,
				chunked
			} : void 0
		});
		return true;
	}
	#pushLineRow(input, column, row) {
		this.#lineRows.set(row.key, row);
		this.#positions.set(row.key, column.specs.length);
		pushRow(column, this.#lineRow(input, row));
	}
	#lineRow(input, row) {
		const { model, rows } = input;
		const base = row.side === "additions" ? rows.additionRow(model, row.lineIndex) : rows.deletionRow(model, row.lineIndex);
		const ranges = row.marked ? lineDiffRangesFor(model, row.side, row.lineIndex, this.#ranges) : NO_RANGES;
		const content = this.#line(base, ranges, row, input);
		return {
			key: row.key,
			gutter: this.#cells.gutter(row.key, row.gutterLineType, row.lineNumber, row.lineIndexText, row.gutterProperties),
			content
		};
	}
	#line(base, ranges, row, { model }) {
		const { side, lineIndex, lineNumber, altLineNumber, contentProperties, lineIndexText } = row;
		let marked = base;
		if (ranges.length > 0) {
			const cached = this.#markedRows.get(base);
			if (cached != null && areRangesEqual(cached.ranges, ranges)) marked = cached.row;
			else {
				marked = markRow(base, ranges);
				this.#markedRows.set(base, {
					ranges,
					row: marked
				});
			}
		}
		const { lineCuts } = this;
		const shown = side === "additions" ? lineCuts.additionRow(marked, model, lineIndex, lineNumber, altLineNumber) : lineCuts.deletionRow(marked, model, lineIndex, lineNumber, altLineNumber);
		return this.#cells.line(shown, contentProperties, lineNumber, altLineNumber, lineIndexText, row.column === "unified" && side === "deletions");
	}
	#pushFileAnnotations(input, columns, pushAnnotationRow, countRow) {
		const { model, renderRange, deletionAnnotations, additionAnnotations } = input;
		if (!shouldRenderFileAnnotations(renderRange)) return;
		const { diff } = model;
		const names = (annotations) => annotations?.map((annotation) => input.annotationSlotName(annotation)) ?? [];
		const deletionNames = diff.type !== "new" ? names(getFileAnnotations(deletionAnnotations)) : [];
		const additionNames = diff.type !== "deleted" ? names(getFileAnnotations(additionAnnotations)) : [];
		if (deletionNames.length === 0 && additionNames.length === 0) return;
		const hunkIndex = -1;
		const lineIndex = -1;
		if (this.options.diffStyle === "unified") pushAnnotationRow(columns.unified, "file", {
			type: "annotation",
			hunkIndex,
			lineIndex,
			annotations: deletionNames.concat(additionNames)
		}, "context");
		else {
			pushAnnotationRow(columns.deletions, "file", {
				type: "annotation",
				hunkIndex,
				lineIndex,
				annotations: deletionNames
			}, "context");
			pushAnnotationRow(columns.additions, "file", {
				type: "annotation",
				hunkIndex,
				lineIndex,
				annotations: additionNames
			}, "context");
		}
		countRow();
	}
};
function bufferKey(column) {
	return `buf:${column.lastKey ?? "top"}`;
}
function injectedRowKey(row, anchor, index) {
	return row.id != null ? `inj:${row.id}` : `inj:${anchor}:${index}`;
}
function pushUnifiedInjectedRows(column, rows, anchor) {
	for (const [index, row] of rows.entries()) pushRow(column, {
		key: injectedRowKey(row, anchor, index),
		gutter: row.gutter,
		content: row.content
	});
	return rows.length;
}
function pushSplitInjectedRows(columns, rows, anchor, pendingBuffer, flushBuffer) {
	let added = 0;
	for (const [index, { deletion, addition }] of rows.entries()) {
		if (deletion == null && addition == null) continue;
		const missingSide = deletion != null && addition != null ? void 0 : deletion == null ? "deletions" : "additions";
		if (missingSide == null || pendingBuffer.side !== missingSide) flushBuffer();
		if (deletion != null) pushRow(columns.deletions, {
			key: injectedRowKey(deletion, anchor, index),
			gutter: deletion.gutter,
			content: deletion.content
		});
		if (addition != null) pushRow(columns.additions, {
			key: injectedRowKey(addition, anchor, index),
			gutter: addition.gutter,
			content: addition.content
		});
		if (missingSide != null) {
			pendingBuffer.side = missingSide;
			pendingBuffer.size += 1;
		}
		added++;
	}
	return added;
}
function getUnifiedAnnotationSpan(input, deletionLineNumber, additionLineNumber, hunkIndex, lineIndex) {
	const annotations = [];
	if (deletionLineNumber != null) for (const annotation of input.deletionAnnotations[deletionLineNumber] ?? []) annotations.push(input.annotationSlotName(annotation));
	if (additionLineNumber != null) for (const annotation of input.additionAnnotations[additionLineNumber] ?? []) annotations.push(input.annotationSlotName(annotation));
	return annotations.length > 0 ? {
		type: "annotation",
		hunkIndex,
		lineIndex,
		annotations
	} : void 0;
}
function getSplitAnnotationSpans(input, deletionLineNumber, additionLineNumber, hunkIndex, lineIndex) {
	const deletionSpan = {
		type: "annotation",
		hunkIndex,
		lineIndex,
		annotations: []
	};
	const additionSpan = {
		type: "annotation",
		hunkIndex,
		lineIndex,
		annotations: []
	};
	if (deletionLineNumber != null) for (const annotation of input.deletionAnnotations[deletionLineNumber] ?? []) deletionSpan.annotations.push(input.annotationSlotName(annotation));
	if (additionLineNumber != null) for (const annotation of input.additionAnnotations[additionLineNumber] ?? []) additionSpan.annotations.push(input.annotationSlotName(annotation));
	if (deletionSpan.annotations.length === 0 && additionSpan.annotations.length === 0) return;
	return {
		deletionSpan,
		additionSpan
	};
}
function areRangesEqual(a, b) {
	return a === b || a.length === b.length && a.every((range, index) => range[0] === b[index][0] && range[1] === b[index][1]);
}
//#endregion
export { DiffLayout };

//# sourceMappingURL=DiffLayout.js.map