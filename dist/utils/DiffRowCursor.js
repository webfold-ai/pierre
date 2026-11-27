import "../constants.js";
import { getHunkSideStartBoundary } from "./getHunkSideBoundaries.js";
import { endsWithNewline } from "./endsWithNewline.js";
import { getExpandedRegion, getTrailingExpandedRegion } from "./virtualDiffLayout.js";
//#region src/utils/DiffRowCursor.ts
function throwMissingSide(side) {
	throw new Error(`DiffRowCursor: row has no ${side} line`);
}
const ENTER_HUNK = 0;
const LEADING_START = 1;
const LEADING_END = 2;
const CONTENT = 3;
const CHANGE_REST = 4;
const TRAILING = 5;
const TRAILING_NEWLINE = 6;
const DONE = 7;
var DiffRowCursor = class {
	diff;
	diffStyle;
	expandedHunks;
	collapsedContextThreshold;
	includeTrailingNewline;
	startingLine;
	windowEnd;
	unifiedCount = 0;
	splitCount = 0;
	rowType = "context";
	rowHunkIndex = 0;
	rowHunk = void 0;
	rowHasDeletion = false;
	rowHasAddition = false;
	index = -1;
	end = 0;
	secondStretchFirst = 0;
	secondStretchEnd = 0;
	deletionIndexStart = 0;
	deletionNumberStart = 0;
	deletionUnifiedStart = 0;
	additionIndexStart = 0;
	additionNumberStart = 0;
	additionUnifiedStart = 0;
	splitStart = 0;
	firstRowCollapsedBefore = 0;
	collapsedAfterValue = 0;
	collapsedAfterRow = -1;
	deletionNoEOFCRRow = -1;
	additionNoEOFCRRow = -1;
	part = ENTER_HUNK;
	walkHunkIndex = 0;
	walkHunk = void 0;
	contentIndex = 0;
	pendingCollapsed = 0;
	leadingStartRows = 0;
	leadingEndRows = 0;
	leadingRangeSize = 0;
	trailingRows = -1;
	trailingCollapsed = 0;
	unifiedAt = 0;
	splitAt = 0;
	deletionIndexAt = 0;
	additionIndexAt = 0;
	deletionNumberAt = 0;
	additionNumberAt = 0;
	collapsedAfterAt = -1;
	constructor({ diff, diffStyle, startingLine = 0, totalLines = Infinity, expandedHunks, collapsedContextThreshold = 1, includeTrailingNewline = false }) {
		this.diff = diff;
		this.diffStyle = diffStyle;
		this.startingLine = startingLine;
		this.windowEnd = startingLine + totalLines;
		this.expandedHunks = expandedHunks;
		this.collapsedContextThreshold = collapsedContextThreshold;
		this.includeTrailingNewline = includeTrailingNewline;
		if (totalLines === 0) this.part = DONE;
		else if (startingLine > 0) this.findStartingHunk();
	}
	next() {
		const { index, end } = this;
		const next = index + 1;
		if (next < end) {
			this.index = next;
			return true;
		}
		return this.nextRun();
	}
	get type() {
		return this.rowType;
	}
	get hunkIndex() {
		return this.rowHunkIndex;
	}
	get hunk() {
		return this.rowHunk;
	}
	get hasDeletion() {
		return this.rowHasDeletion;
	}
	get hasAddition() {
		return this.rowHasAddition;
	}
	get deletionLineIndex() {
		const { rowHasDeletion, deletionIndexStart, index } = this;
		if (!rowHasDeletion) throwMissingSide("deletion");
		return deletionIndexStart + index;
	}
	get deletionLineNumber() {
		const { rowHasDeletion, deletionNumberStart, index } = this;
		if (!rowHasDeletion) throwMissingSide("deletion");
		return deletionNumberStart + index;
	}
	get deletionUnifiedLineIndex() {
		const { rowHasDeletion, deletionUnifiedStart, index } = this;
		if (!rowHasDeletion) throwMissingSide("deletion");
		return deletionUnifiedStart + index;
	}
	get deletionNoEOFCR() {
		const { rowHasDeletion, deletionNoEOFCRRow, index } = this;
		if (!rowHasDeletion) throwMissingSide("deletion");
		return index === deletionNoEOFCRRow;
	}
	get additionLineIndex() {
		const { rowHasAddition, additionIndexStart, index } = this;
		if (!rowHasAddition) throwMissingSide("addition");
		return additionIndexStart + index;
	}
	get additionLineNumber() {
		const { rowHasAddition, additionNumberStart, index } = this;
		if (!rowHasAddition) throwMissingSide("addition");
		return additionNumberStart + index;
	}
	get additionUnifiedLineIndex() {
		const { rowHasAddition, additionUnifiedStart, index } = this;
		if (!rowHasAddition) throwMissingSide("addition");
		return additionUnifiedStart + index;
	}
	get additionNoEOFCR() {
		const { rowHasAddition, additionNoEOFCRRow, index } = this;
		if (!rowHasAddition) throwMissingSide("addition");
		return index === additionNoEOFCRRow;
	}
	get unifiedLineIndex() {
		const { rowHasAddition, additionUnifiedStart, deletionUnifiedStart, index } = this;
		return (rowHasAddition ? additionUnifiedStart : deletionUnifiedStart) + index;
	}
	get splitLineIndex() {
		const { splitStart, index } = this;
		return splitStart + index;
	}
	get collapsedBefore() {
		const { index, firstRowCollapsedBefore } = this;
		return index === 0 ? firstRowCollapsedBefore : 0;
	}
	get collapsedAfter() {
		const { index, collapsedAfterRow, collapsedAfterValue } = this;
		return index === collapsedAfterRow ? collapsedAfterValue : 0;
	}
	findStartingHunk() {
		const { diff, diffStyle, startingLine } = this;
		const lastHunkIndex = diff.hunks.length - 1;
		let hunkIndex = 0;
		for (const hunk of diff.hunks) {
			const leading = this.getLeadingRegion(hunk, hunkIndex);
			let contextRows = leading.fromStart + leading.fromEnd;
			if (hunkIndex === lastHunkIndex) {
				const trailing = this.getTrailingRegion();
				contextRows += (trailing?.fromStart ?? 0) + (trailing?.fromEnd ?? 0);
				if (this.hasTrailingNewlineRow(trailing?.collapsedLines ?? 0)) contextRows++;
			}
			const unifiedRows = contextRows + hunk.unifiedLineCount;
			const splitRows = contextRows + hunk.splitLineCount;
			const { unifiedCount, splitCount } = this;
			if ((diffStyle !== "split" ? unifiedCount + unifiedRows : splitCount + splitRows) > startingLine) break;
			this.unifiedCount += unifiedRows;
			this.splitCount += splitRows;
			hunkIndex++;
		}
		this.walkHunkIndex = hunkIndex;
	}
	getLeadingRegion(hunk, hunkIndex) {
		const { diff, expandedHunks, collapsedContextThreshold } = this;
		return getExpandedRegion({
			isPartial: diff.isPartial,
			rangeSize: hunk.collapsedBefore,
			expandedHunks,
			hunkIndex,
			collapsedContextThreshold
		});
	}
	getTrailingRegion() {
		const { diff, expandedHunks, collapsedContextThreshold } = this;
		return getTrailingExpandedRegion({
			fileDiff: diff,
			hunkIndex: diff.hunks.length - 1,
			expandedHunks,
			collapsedContextThreshold,
			errorPrefix: "DiffRowCursor"
		});
	}
	hasTrailingNewlineRow(trailingCollapsed) {
		const { diff, includeTrailingNewline } = this;
		return includeTrailingNewline && trailingCollapsed === 0 && endsWithNewline(diff, "additions");
	}
	clipRun(count, unifiedStart, splitStart, unifiedAdditionStart) {
		const { diffStyle, startingLine, windowEnd } = this;
		if (startingLine === 0 && windowEnd === Infinity) {
			this.index = 0;
			this.end = count;
			return count > 0;
		}
		if (diffStyle !== "both") {
			const start = diffStyle === "unified" ? unifiedStart : splitStart;
			this.index = Math.max(0, startingLine - start);
			this.end = Math.min(count, windowEnd - start);
			return this.index < this.end;
		}
		let first = Math.max(0, startingLine - unifiedStart);
		let end = Math.min(count, windowEnd - unifiedStart);
		const splitFirst = Math.max(0, startingLine - splitStart);
		const splitEnd = Math.min(count, windowEnd - splitStart);
		let secondFirst = 0;
		let secondEnd = 0;
		if (splitFirst < splitEnd) {
			if (first < end) {
				if (splitFirst <= end) end = Math.max(end, splitEnd);
				else {
					secondFirst = splitFirst;
					secondEnd = splitEnd;
				}
			} else {
				first = splitFirst;
				end = splitEnd;
			}
		}
		if (unifiedAdditionStart != null) {
			const additionFirst = Math.max(0, startingLine - unifiedAdditionStart);
			const additionEnd = Math.min(count, windowEnd - unifiedAdditionStart);
			if (additionFirst < additionEnd) {
				if (first < end) {
					if (additionEnd >= first) first = additionFirst;
					else {
						secondFirst = first;
						secondEnd = end;
						first = additionFirst;
						end = additionEnd;
					}
				} else {
					first = additionFirst;
					end = additionEnd;
				}
			}
		}
		if (first >= end) return false;
		this.index = first;
		this.end = end;
		if (secondFirst < secondEnd) {
			this.secondStretchFirst = secondFirst;
			this.secondStretchEnd = secondEnd;
		}
		return true;
	}
	isPastWindow() {
		const { diffStyle, unifiedCount, splitCount, windowEnd } = this;
		return diffStyle === "unified" ? unifiedCount >= windowEnd : diffStyle === "split" ? splitCount >= windowEnd : unifiedCount >= windowEnd && splitCount >= windowEnd;
	}
	nextRun() {
		const { diff, secondStretchFirst, secondStretchEnd } = this;
		if (secondStretchFirst < secondStretchEnd) {
			this.index = secondStretchFirst;
			this.end = secondStretchEnd;
			this.secondStretchFirst = 0;
			this.secondStretchEnd = 0;
			return true;
		}
		for (;;) {
			if (this.part === DONE || this.isPastWindow()) {
				this.part = DONE;
				return false;
			}
			switch (this.part) {
				case ENTER_HUNK: {
					const hunk = diff.hunks[this.walkHunkIndex];
					if (hunk == null) {
						this.part = DONE;
						return false;
					}
					this.enterHunk(hunk);
					this.part = LEADING_START;
					break;
				}
				case LEADING_START:
					this.part = LEADING_END;
					if (this.leadingStartRows > 0 && this.startExpandedRun(this.leadingStartRows, this.leadingRangeSize, 0)) return true;
					break;
				case LEADING_END:
					this.part = CONTENT;
					if (this.leadingEndRows > 0 && this.startExpandedRun(this.leadingEndRows, this.leadingEndRows, this.takePendingCollapsed())) return true;
					if (this.startingLine > 0) this.skipBlocksBeforeWindow();
					break;
				case CONTENT: {
					const { walkHunk: hunk } = this;
					if (hunk == null) throw new Error("DiffRowCursor: missing hunk");
					const content = hunk.hunkContent[this.contentIndex];
					if (content == null) {
						this.part = TRAILING;
						break;
					}
					const isLast = this.contentIndex === hunk.hunkContent.length - 1;
					if (content.type === "context") {
						this.contentIndex++;
						if (this.startContextRun(hunk, content, isLast)) return true;
						break;
					}
					this.part = CHANGE_REST;
					if (this.startChangeRun(hunk, content, isLast, false)) return true;
					break;
				}
				case CHANGE_REST: {
					const { walkHunk: hunk } = this;
					if (hunk == null) throw new Error("DiffRowCursor: missing hunk");
					const content = hunk.hunkContent[this.contentIndex];
					if (content == null || content.type !== "change") throw new Error("DiffRowCursor: missing change content");
					const isLast = this.contentIndex === hunk.hunkContent.length - 1;
					this.part = CONTENT;
					this.contentIndex++;
					const started = this.startChangeRun(hunk, content, isLast, true);
					const { deletions, additions } = content;
					this.unifiedCount += deletions + additions;
					this.splitCount += Math.max(deletions, additions);
					this.unifiedAt += deletions + additions;
					this.splitAt += Math.max(deletions, additions);
					this.deletionIndexAt += deletions;
					this.additionIndexAt += additions;
					this.deletionNumberAt += deletions;
					this.additionNumberAt += additions;
					if (started) return true;
					break;
				}
				case TRAILING:
					this.part = TRAILING_NEWLINE;
					if (this.trailingRows > 0 && this.startTrailingRun()) return true;
					break;
				case TRAILING_NEWLINE: {
					const isLastHunk = this.walkHunkIndex === diff.hunks.length - 1;
					this.walkHunkIndex++;
					this.part = ENTER_HUNK;
					if (isLastHunk && this.hasTrailingNewlineRow(this.trailingCollapsed) && this.startTrailingNewlineRun()) return true;
					break;
				}
			}
		}
	}
	skipBlocksBeforeWindow() {
		const { walkHunk, diffStyle, startingLine, unifiedCount } = this;
		if (walkHunk == null) throw new Error("DiffRowCursor: missing hunk");
		while (this.contentIndex < walkHunk.hunkContent.length) {
			const content = walkHunk.hunkContent[this.contentIndex];
			const deletions = content.type === "context" ? content.lines : content.deletions;
			const additions = content.type === "context" ? content.lines : content.additions;
			const unifiedRows = content.type === "context" ? content.lines : deletions + additions;
			const splitRows = Math.max(deletions, additions);
			const { unifiedCount, splitCount } = this;
			if ((diffStyle === "split" ? splitCount + splitRows : unifiedCount + unifiedRows) > startingLine) break;
			this.unifiedCount += unifiedRows;
			this.splitCount += splitRows;
			this.unifiedAt += unifiedRows;
			this.splitAt += splitRows;
			this.deletionIndexAt += deletions;
			this.additionIndexAt += additions;
			this.deletionNumberAt += deletions;
			this.additionNumberAt += additions;
			this.contentIndex++;
		}
		if (this.unifiedCount > unifiedCount) this.pendingCollapsed = 0;
	}
	enterHunk(hunk) {
		const { diff, diffStyle, walkHunkIndex } = this;
		const deletionBoundary = getHunkSideStartBoundary(hunk.deletionStart, hunk.deletionCount);
		const additionBoundary = getHunkSideStartBoundary(hunk.additionStart, hunk.additionCount);
		const leading = this.getLeadingRegion(hunk, walkHunkIndex);
		const trailing = walkHunkIndex === diff.hunks.length - 1 ? this.getTrailingRegion() : void 0;
		this.walkHunk = hunk;
		this.contentIndex = 0;
		this.leadingStartRows = leading.fromStart;
		this.leadingEndRows = leading.fromEnd;
		this.leadingRangeSize = leading.rangeSize;
		this.pendingCollapsed = leading.collapsedLines;
		this.trailingRows = trailing != null ? trailing.fromStart + trailing.fromEnd : -1;
		this.trailingCollapsed = trailing?.collapsedLines ?? 0;
		this.unifiedAt = hunk.unifiedLineStart;
		this.splitAt = hunk.splitLineStart;
		this.deletionIndexAt = !diff.isPartial && hunk.deletionCount === 0 ? deletionBoundary : hunk.deletionLineIndex;
		this.additionIndexAt = !diff.isPartial && hunk.additionCount === 0 ? additionBoundary : hunk.additionLineIndex;
		this.deletionNumberAt = deletionBoundary + 1;
		this.additionNumberAt = additionBoundary + 1;
		this.collapsedAfterAt = trailing != null && trailing.collapsedLines > 0 && trailing.fromStart + trailing.fromEnd === 0 ? diffStyle === "unified" ? hunk.unifiedLineStart + hunk.unifiedLineCount - 1 : hunk.splitLineStart + hunk.splitLineCount - 1 : -1;
	}
	takePendingCollapsed() {
		const { pendingCollapsed } = this;
		this.pendingCollapsed = 0;
		return pendingCollapsed;
	}
	startExpandedRun(count, back, collapsedBefore) {
		const { unifiedCount, splitCount, walkHunkIndex, walkHunk, deletionIndexAt, deletionNumberAt, additionIndexAt, additionNumberAt, unifiedAt, splitAt } = this;
		this.rowType = "context-expanded";
		this.rowHunkIndex = walkHunkIndex;
		this.rowHunk = walkHunk;
		this.rowHasDeletion = true;
		this.rowHasAddition = true;
		this.deletionIndexStart = deletionIndexAt - back;
		this.deletionNumberStart = deletionNumberAt - back;
		this.deletionUnifiedStart = unifiedAt - back;
		this.additionIndexStart = additionIndexAt - back;
		this.additionNumberStart = additionNumberAt - back;
		this.additionUnifiedStart = unifiedAt - back;
		this.splitStart = splitAt - back;
		this.firstRowCollapsedBefore = collapsedBefore;
		this.collapsedAfterRow = -1;
		this.deletionNoEOFCRRow = -1;
		this.additionNoEOFCRRow = -1;
		this.unifiedCount += count;
		this.splitCount += count;
		return this.clipRun(count, unifiedCount, splitCount);
	}
	startContextRun(hunk, content, isLast) {
		const { lines } = content;
		const { diffStyle, unifiedCount, splitCount, walkHunkIndex, deletionIndexAt, deletionNumberAt, additionIndexAt, additionNumberAt, unifiedAt, splitAt } = this;
		const started = lines > 0;
		if (started) {
			this.rowType = "context";
			this.rowHunkIndex = walkHunkIndex;
			this.rowHunk = hunk;
			this.rowHasDeletion = true;
			this.rowHasAddition = true;
			this.deletionIndexStart = deletionIndexAt;
			this.deletionNumberStart = deletionNumberAt;
			this.deletionUnifiedStart = unifiedAt;
			this.additionIndexStart = additionIndexAt;
			this.additionNumberStart = additionNumberAt;
			this.additionUnifiedStart = unifiedAt;
			this.splitStart = splitAt;
			this.firstRowCollapsedBefore = this.takePendingCollapsed();
			this.setCollapsedAfterRow(diffStyle === "unified" ? unifiedAt : splitAt);
			this.deletionNoEOFCRRow = isLast && hunk.noEOFCRDeletions ? lines - 1 : -1;
			this.additionNoEOFCRRow = isLast && hunk.noEOFCRAdditions ? lines - 1 : -1;
		}
		this.unifiedCount += lines;
		this.splitCount += lines;
		this.unifiedAt += lines;
		this.splitAt += lines;
		this.deletionIndexAt += lines;
		this.additionIndexAt += lines;
		this.deletionNumberAt += lines;
		this.additionNumberAt += lines;
		return started && this.clipRun(lines, unifiedCount, splitCount);
	}
	startChangeRun(hunk, content, isLast, rest) {
		const { deletions, additions } = content;
		const { diffStyle, unifiedCount, splitCount, walkHunkIndex, deletionIndexAt, deletionNumberAt, additionIndexAt, additionNumberAt, unifiedAt, splitAt } = this;
		const unified = diffStyle === "unified";
		const paired = Math.min(deletions, additions);
		const skipped = unified ? rest ? deletions : 0 : rest ? paired : 0;
		const count = unified ? rest ? additions : deletions : rest ? Math.max(deletions, additions) - paired : paired;
		if (count <= 0) return false;
		const hasDeletion = unified ? !rest : !rest || deletions > additions;
		const hasAddition = unified ? rest : !rest || additions > deletions;
		this.rowType = "change";
		this.rowHunkIndex = walkHunkIndex;
		this.rowHunk = hunk;
		this.rowHasDeletion = hasDeletion;
		this.rowHasAddition = hasAddition;
		const sideOffset = unified ? 0 : skipped;
		this.deletionIndexStart = deletionIndexAt + sideOffset;
		this.deletionNumberStart = deletionNumberAt + sideOffset;
		this.deletionUnifiedStart = unifiedAt + sideOffset;
		this.additionIndexStart = additionIndexAt + sideOffset;
		this.additionNumberStart = additionNumberAt + sideOffset;
		this.additionUnifiedStart = unifiedAt + deletions + sideOffset;
		this.splitStart = splitAt + sideOffset;
		this.firstRowCollapsedBefore = this.takePendingCollapsed();
		this.setCollapsedAfterRow(unified ? unifiedAt + skipped : splitAt + skipped);
		const endsBlock = unified || rest || deletions === additions;
		this.deletionNoEOFCRRow = isLast && hasDeletion && endsBlock && hunk.noEOFCRDeletions ? count - 1 : -1;
		this.additionNoEOFCRRow = isLast && hasAddition && endsBlock && hunk.noEOFCRAdditions ? count - 1 : -1;
		const unifiedDeletionStart = unifiedCount + skipped;
		const unifiedAdditionStart = unifiedCount + deletions + sideOffset;
		return this.clipRun(count, hasDeletion ? unifiedDeletionStart : unifiedAdditionStart, splitCount + skipped, hasDeletion && hasAddition ? unifiedAdditionStart : void 0);
	}
	startTrailingRun() {
		const { diff, trailingRows: count, trailingCollapsed, unifiedCount, splitCount, deletionIndexAt, deletionNumberAt, additionIndexAt, additionNumberAt, unifiedAt, splitAt } = this;
		this.rowType = "context-expanded";
		this.rowHunkIndex = diff.hunks.length;
		this.rowHunk = void 0;
		this.rowHasDeletion = true;
		this.rowHasAddition = true;
		this.deletionIndexStart = deletionIndexAt;
		this.deletionNumberStart = deletionNumberAt;
		this.deletionUnifiedStart = unifiedAt;
		this.additionIndexStart = additionIndexAt;
		this.additionNumberStart = additionNumberAt;
		this.additionUnifiedStart = unifiedAt;
		this.splitStart = splitAt;
		this.firstRowCollapsedBefore = 0;
		this.collapsedAfterValue = trailingCollapsed;
		this.collapsedAfterRow = count - 1;
		this.deletionNoEOFCRRow = -1;
		this.additionNoEOFCRRow = -1;
		this.unifiedCount += count;
		this.splitCount += count;
		return this.clipRun(count, unifiedCount, splitCount);
	}
	startTrailingNewlineRun() {
		const { diff, trailingRows, unifiedCount, splitCount, deletionIndexAt, deletionNumberAt, additionIndexAt, additionNumberAt, unifiedAt, splitAt } = this;
		const offset = Math.max(trailingRows, 0);
		const context = endsWithNewline(diff, "deletions");
		const additionLineIndex = additionIndexAt + offset;
		const deletionLineIndex = deletionIndexAt + offset;
		this.rowType = context ? "context" : "change";
		this.rowHunkIndex = diff.hunks.length;
		this.rowHunk = void 0;
		this.rowHasDeletion = context;
		this.rowHasAddition = true;
		this.deletionIndexStart = deletionLineIndex;
		this.deletionNumberStart = deletionNumberAt + offset;
		this.deletionUnifiedStart = unifiedAt + offset;
		this.additionIndexStart = additionLineIndex;
		this.additionNumberStart = additionNumberAt + offset;
		this.additionUnifiedStart = unifiedAt + offset;
		this.splitStart = splitAt + offset;
		this.firstRowCollapsedBefore = 0;
		this.collapsedAfterRow = -1;
		this.deletionNoEOFCRRow = -1;
		this.additionNoEOFCRRow = -1;
		this.unifiedCount++;
		this.splitCount++;
		return this.clipRun(1, unifiedCount, splitCount);
	}
	setCollapsedAfterRow(runStart) {
		const { collapsedAfterAt, trailingCollapsed } = this;
		if (collapsedAfterAt === -1) {
			this.collapsedAfterRow = -1;
			return;
		}
		this.collapsedAfterValue = trailingCollapsed;
		this.collapsedAfterRow = collapsedAfterAt - runStart;
	}
};
//#endregion
export { DiffRowCursor };

//# sourceMappingURL=DiffRowCursor.js.map