import { cutLineLength } from "../rows/LineCuts.js";
import { DiffRowCursor } from "../utils/DiffRowCursor.js";
import { compileSearchQuery, matchSearchLine } from "./lineSearch.js";
//#region src/search/codeViewSearch.ts
const CODE_VIEW_SEARCH_CLOCK_CHECK_CHARACTERS = 65536;
const CODE_VIEW_SEARCH_CARRIAGE_RETURN_LOOKAHEAD = 65536;
var CodeViewSearchTextCursor = class {
	contents;
	side;
	offsets = [0];
	ended = false;
	lineFeed;
	carriageReturn = -1;
	checkedTo = 0;
	nextLine = 0;
	constructor(contents, side) {
		this.contents = contents;
		this.side = side;
	}
	readLine(lineIndex) {
		const { contents, offsets } = this;
		while (lineIndex >= offsets.length && !this.ended) this.readNewLine();
		const start = offsets[lineIndex];
		if (start == null) throw new Error(`CodeViewSearchTextCursor.readLine: line index ${lineIndex} is out of range`);
		if (lineIndex === offsets.length - 1 && !this.ended) return this.readNewLine();
		let end = offsets[lineIndex + 1] ?? contents.length;
		while (end > start) {
			const charCode = contents.charCodeAt(end - 1);
			if (charCode !== 10 && charCode !== 13) break;
			end--;
		}
		return contents.slice(start, end);
	}
	walk(visitLine) {
		const { offsets, side } = this;
		while (this.nextLine < offsets.length) {
			const lineIndex = this.nextLine++;
			if (visitLine(lineIndex === offsets.length - 1 && !this.ended ? this.readNewLine() : this.readLine(lineIndex), side, lineIndex + 1, lineIndex)) return false;
		}
		return true;
	}
	readNewLine() {
		const { contents, offsets } = this;
		const start = offsets[offsets.length - 1];
		let { lineFeed } = this;
		if (lineFeed == null || lineFeed !== -1 && lineFeed < start) {
			lineFeed = contents.indexOf("\n", start);
			this.lineFeed = lineFeed;
		}
		const end = lineFeed === -1 ? contents.length : lineFeed;
		const carriageReturn = this.findCarriageReturn(start, end);
		if (carriageReturn === -1) {
			if (lineFeed === -1) this.ended = true;
			else offsets.push(lineFeed + 1);
			return contents.slice(start, end);
		}
		offsets.push(lineFeed !== -1 && carriageReturn === end - 1 ? lineFeed + 1 : carriageReturn + 1);
		return contents.slice(start, carriageReturn);
	}
	findCarriageReturn(start, end) {
		const { contents, checkedTo } = this;
		if (this.carriageReturn < start && checkedTo < end) {
			const from = Math.max(checkedTo, start);
			const to = Math.min(contents.length, Math.max(end, from + CODE_VIEW_SEARCH_CARRIAGE_RETURN_LOOKAHEAD));
			const index = contents.slice(from, to).indexOf("\r");
			this.carriageReturn = index === -1 ? -1 : from + index;
			this.checkedTo = index === -1 ? to : from + index + 1;
		}
		const { carriageReturn } = this;
		return carriageReturn >= start && carriageReturn < end ? carriageReturn : -1;
	}
};
var CodeViewSearchDiffCursor = class {
	regex;
	diff;
	additions;
	diffStyle;
	additionsOnly;
	rows;
	nextSide = "deletions";
	constructor(item, regex) {
		this.regex = regex;
		const { fileDiff, additionContents, diffStyle, additionsOnly } = item;
		this.diff = fileDiff;
		this.additions = additionContents != null ? new CodeViewSearchTextCursor(additionContents, "additions") : void 0;
		this.diffStyle = diffStyle;
		this.additionsOnly = additionsOnly;
		this.rows = new DiffRowCursor({
			diff: fileDiff,
			diffStyle,
			expandedHunks: true
		});
	}
	walk(visitLine) {
		const { diff, additions, diffStyle, additionsOnly, rows } = this;
		if (this.nextSide === "additions") {
			this.nextSide = "deletions";
			if (this.visitAddition(visitLine)) return false;
		}
		if (additionsOnly) {
			while (rows.next()) if (this.visitAddition(visitLine)) return false;
			return true;
		}
		if (diffStyle === "unified") {
			const { additionLines } = diff;
			while (rows.next()) if (rows.hasAddition && additionLines[rows.additionLineIndex] != null ? this.visitAddition(visitLine) : this.visitDeletion(visitLine)) return false;
			return true;
		}
		while (rows.next()) {
			if (additions == null && rows.type !== "change") {
				if (this.visitUnchanged(visitLine)) return false;
				continue;
			}
			this.nextSide = "additions";
			if (this.visitDeletion(visitLine)) return false;
			this.nextSide = "deletions";
			if (this.visitAddition(visitLine)) return false;
		}
		return true;
	}
	visitUnchanged(visitLine) {
		const { diff, rows, regex } = this;
		const { deletionLineIndex, additionLineIndex } = rows;
		const text = diff.deletionLines[deletionLineIndex];
		if (text == null || text !== diff.additionLines[additionLineIndex]) {
			this.nextSide = "additions";
			if (this.visitDeletion(visitLine)) return true;
			this.nextSide = "deletions";
			return this.visitAddition(visitLine);
		}
		return visitLine(regex ? trimLineEnding(text) : text, "deletions", rows.deletionLineNumber, deletionLineIndex, rows.additionLineNumber, additionLineIndex);
	}
	visitDeletion(visitLine) {
		const { diff, rows, regex } = this;
		if (!rows.hasDeletion) return false;
		const lineIndex = rows.deletionLineIndex;
		const text = diff.deletionLines[lineIndex];
		return text != null ? visitLine(regex ? trimLineEnding(text) : text, "deletions", rows.deletionLineNumber, lineIndex) : false;
	}
	visitAddition(visitLine) {
		const { diff, additions, rows, regex } = this;
		if (!rows.hasAddition) return false;
		const { additionLineIndex: lineIndex, additionLineNumber } = rows;
		if (additions != null) return visitLine(additions.readLine(lineIndex), "additions", additionLineNumber, lineIndex);
		const text = diff.additionLines[lineIndex];
		return text != null ? visitLine(regex ? trimLineEnding(text) : text, "additions", additionLineNumber, lineIndex) : false;
	}
};
var CodeViewSearchScan = class CodeViewSearchScan {
	itemCount;
	getItem;
	limit;
	startingItemIndex;
	static findEntryIndex(entries, position) {
		const last = entries.at(-1);
		if (last == null || last.position < position) return entries.length;
		let start = 0;
		let end = entries.length;
		while (start < end) {
			const middle = Math.floor((start + end) / 2);
			if (entries[middle].position < position) start = middle + 1;
			else end = middle;
		}
		return start;
	}
	pattern;
	wholeWord;
	regex;
	beforeStart = [];
	afterStart = [];
	progress = /* @__PURE__ */ new Map();
	unsearched;
	matchCount = 0;
	scannedCharacters = 0;
	deadline;
	matches;
	constructor(searchParams, itemCount, getItem, limit, startingItemIndex = 0) {
		this.itemCount = itemCount;
		this.getItem = getItem;
		this.limit = limit;
		this.startingItemIndex = startingItemIndex;
		this.pattern = compileSearchQuery(searchParams);
		this.wholeWord = searchParams.wholeWord;
		this.regex = searchParams.regex;
		this.unsearched = itemCount > 0 ? [{
			start: 0,
			end: itemCount
		}] : [];
	}
	get atLimit() {
		const { matchCount, limit } = this;
		return matchCount >= limit;
	}
	get finished() {
		const { pattern, atLimit, unsearched } = this;
		return pattern == null || atLimit || unsearched.length === 0;
	}
	rescanItem(position) {
		this.dropItemProgress(position);
		this.dropItemMatches(position);
		this.markUnsearched(position);
	}
	addItems(count) {
		const { itemCount, unsearched } = this;
		const last = unsearched.at(-1);
		if (last?.end === itemCount) last.end += count;
		else if (count > 0) unsearched.push({
			start: itemCount,
			end: itemCount + count
		});
		this.itemCount = itemCount + count;
	}
	removeItem(position) {
		this.dropItemMatches(position);
		this.dropItemProgress(position);
		const { progress, beforeStart, afterStart, unsearched, startingItemIndex, itemCount } = this;
		const shiftedProgress = /* @__PURE__ */ new Map();
		for (const [pendingPosition, itemProgress] of progress) {
			const nextPosition = pendingPosition > position ? pendingPosition - 1 : pendingPosition;
			itemProgress.position = nextPosition;
			shiftedProgress.set(nextPosition, itemProgress);
		}
		this.progress = shiftedProgress;
		for (const entries of [beforeStart, afterStart]) {
			const first = CodeViewSearchScan.findEntryIndex(entries, position + 1);
			for (let index = first; index < entries.length; index++) entries[index].position--;
		}
		const firstRange = this.findUnsearchedRangeIndex(position);
		for (let index = firstRange; index < unsearched.length; index++) {
			const range = unsearched[index];
			if (range.start > position) range.start--;
			range.end--;
		}
		const range = unsearched[firstRange];
		if (range != null && range.start === range.end) unsearched.splice(firstRange, 1);
		if (position < startingItemIndex) this.startingItemIndex = startingItemIndex - 1;
		this.itemCount = itemCount - 1;
	}
	advance(budgetMs, from = this.startingItemIndex) {
		const { pattern, progress } = this;
		if (this.finished || pattern == null) return false;
		let changed = false;
		this.deadline = budgetMs == null ? void 0 : performance.now() + budgetMs;
		this.scannedCharacters = 0;
		while (!this.finished) {
			const position = this.getNextPosition(from);
			let itemProgress = progress.get(position);
			if (itemProgress == null) {
				if (this.dropItemMatches(position)) changed = true;
				itemProgress = this.prepareItem(pattern, position);
			}
			const { cursor, visitLine } = itemProgress;
			const completed = cursor.walk(visitLine);
			const { atLimit } = this;
			if (completed || atLimit) {
				if (this.recordItemMatches(itemProgress)) changed = true;
				progress.delete(position);
				if (completed) this.markSearched(position);
				if (atLimit) {
					let { matchCount } = this;
					for (const pending of progress.values()) matchCount -= pending.matches.length;
					this.matchCount = matchCount;
					progress.clear();
				}
			} else {
				progress.set(position, itemProgress);
				return changed;
			}
		}
		return true;
	}
	getMatches() {
		const { beforeStart, afterStart, matches: cachedMatches } = this;
		if (cachedMatches != null) return cachedMatches;
		const matches = [];
		for (const entries of [afterStart, beforeStart]) for (const entry of entries) {
			entry.startIndex = matches.length;
			for (const match of entry.matches) matches.push(match);
		}
		this.matches = matches;
		return matches;
	}
	getMatchIndex(position, match) {
		this.getMatches();
		const entry = this.getEntry(position);
		if (entry == null) return void 0;
		const { matches, startIndex } = entry;
		const index = this.findItemMatchIndex(entry, match.lineNumber, match.startCharacter, match.side ?? "additions");
		if (index == null || !areCodeViewSearchMatchesEqual(matches[index], match)) return void 0;
		return startIndex + index;
	}
	getFirstMatchedEntryAtOrAfter(position) {
		const { beforeStart, afterStart, startingItemIndex } = this;
		const entries = position < startingItemIndex ? beforeStart : afterStart;
		return entries[CodeViewSearchScan.findEntryIndex(entries, position)] ?? (position < startingItemIndex ? afterStart[0] : void 0);
	}
	hasPendingItems(start, end) {
		const { finished, unsearched } = this;
		const range = unsearched[this.findUnsearchedRangeIndex(start)];
		return !finished && range != null && Math.max(start, range.start) < end;
	}
	isItemPending(position) {
		return !this.finished && this.isUnsearched(position);
	}
	getItemMatches(position) {
		return this.getEntry(position)?.matches;
	}
	getLineMatches(position, lineNumber, side = "additions") {
		const entry = this.getEntry(position);
		const lines = side === "deletions" ? entry?.deletionLines : entry?.additionLines;
		if (lines == null) return void 0;
		const line = lines[this.findLineIndex(lines, lineNumber)];
		return line?.lineNumber === lineNumber ? line : void 0;
	}
	getFirstMatchAtOrAfter(position, lineNumber, character, side = "additions") {
		const entry = this.getEntry(position);
		if (entry == null) return void 0;
		const index = this.findItemMatchIndex(entry, lineNumber, character, side);
		return index != null ? entry.matches[index] : void 0;
	}
	findLineIndex(lines, lineNumber) {
		let start = 0;
		let end = lines.length;
		while (start < end) {
			const middle = Math.floor((start + end) / 2);
			if (lines[middle].lineNumber < lineNumber) start = middle + 1;
			else end = middle;
		}
		return start;
	}
	findItemMatchIndex(entry, lineNumber, character, side) {
		const { matches, additionLines, deletionLines } = entry;
		const lines = side === "deletions" ? deletionLines : additionLines;
		if (lines == null) return void 0;
		const lineIndex = this.findLineIndex(lines, lineNumber);
		const line = lines[lineIndex];
		if (line == null) return void 0;
		if (line.lineNumber > lineNumber) return line.startIndex;
		let start = line.startIndex;
		let end = line.endIndex;
		while (start < end) {
			const middle = Math.floor((start + end) / 2);
			if (matches[middle].startCharacter < character) start = middle + 1;
			else end = middle;
		}
		return start < line.endIndex ? start : lines[lineIndex + 1]?.startIndex;
	}
	isUnsearched(position) {
		const range = this.unsearched[this.findUnsearchedRangeIndex(position)];
		return range != null && range.start <= position;
	}
	findUnsearchedRangeIndex(position) {
		const { unsearched } = this;
		let start = 0;
		let end = unsearched.length;
		while (start < end) {
			const middle = Math.floor((start + end) / 2);
			if (unsearched[middle].end <= position) start = middle + 1;
			else end = middle;
		}
		return start;
	}
	getNextPosition(from) {
		const { unsearched } = this;
		const index = this.findUnsearchedRangeIndex(from);
		return index < unsearched.length ? Math.max(unsearched[index].start, from) : unsearched[0].start;
	}
	markUnsearched(position) {
		const { unsearched } = this;
		const index = this.findUnsearchedRangeIndex(position);
		const next = unsearched[index];
		if (next != null && next.start <= position) return;
		const previous = unsearched[index - 1];
		if (previous != null && previous.end === position) {
			previous.end++;
			if (next != null && next.start === previous.end) {
				previous.end = next.end;
				unsearched.splice(index, 1);
			}
		} else if (next != null && next.start === position + 1) next.start--;
		else unsearched.splice(index, 0, {
			start: position,
			end: position + 1
		});
	}
	markSearched(position) {
		const { unsearched } = this;
		const index = this.findUnsearchedRangeIndex(position);
		const range = unsearched[index];
		if (position === range.start) {
			range.start++;
			if (range.start === range.end) unsearched.splice(index, 1);
		} else if (position + 1 === range.end) range.end--;
		else unsearched.splice(index, 1, {
			start: range.start,
			end: position
		}, {
			start: position + 1,
			end: range.end
		});
	}
	dropItemProgress(position) {
		const { progress, matchCount } = this;
		const itemProgress = progress.get(position);
		if (itemProgress != null) {
			this.matchCount = matchCount - itemProgress.matches.length;
			progress.delete(position);
		}
	}
	getEntry(position) {
		const { beforeStart, afterStart, startingItemIndex } = this;
		const entries = position < startingItemIndex ? beforeStart : afterStart;
		const entry = entries[CodeViewSearchScan.findEntryIndex(entries, position)];
		return entry?.position === position ? entry : void 0;
	}
	dropItemMatches(position) {
		const { beforeStart, afterStart, startingItemIndex, matchCount } = this;
		const entries = position < startingItemIndex ? beforeStart : afterStart;
		const index = CodeViewSearchScan.findEntryIndex(entries, position);
		const entry = entries[index];
		if (entry?.position !== position) return false;
		this.matchCount = matchCount - entry.matches.length;
		entries.splice(index, 1);
		this.matches = void 0;
		return true;
	}
	recordItemMatches(progress) {
		const { position, matches, additionLines, deletionLines } = progress;
		if (matches.length === 0) return false;
		const { beforeStart, afterStart, startingItemIndex } = this;
		const entries = position < startingItemIndex ? beforeStart : afterStart;
		const index = CodeViewSearchScan.findEntryIndex(entries, position);
		entries.splice(index, 0, {
			position,
			startIndex: 0,
			matches,
			additionLines,
			deletionLines
		});
		this.matches = void 0;
		return true;
	}
	prepareItem(pattern, position) {
		const { getItem, wholeWord, regex, limit } = this;
		const item = getItem(position);
		const { type, itemId } = item;
		const { lineCuts } = item;
		const cutLength = lineCuts?.cutLength ?? Infinity;
		const cursor = type === "file" ? new CodeViewSearchTextCursor(item.contents) : item.additionContents != null && item.additionsOnly ? new CodeViewSearchTextCursor(item.additionContents, "additions") : new CodeViewSearchDiffCursor(item, regex);
		const matches = [];
		let side;
		let lineNumber = 0;
		let lineIndex = 0;
		const visitMatch = (startCharacter, endCharacter, cutOff) => {
			matches.push({
				itemId,
				itemType: type,
				side,
				lineNumber,
				lineIndex,
				startCharacter,
				endCharacter,
				cutOff
			});
			return ++this.matchCount >= limit;
		};
		const searchLongLine = (text) => {
			const visible = cutLineLength(text, cutLength);
			if (visible == null || lineCuts?.expandedLines[side ?? "additions"].has(lineNumber) === true) {
				matchSearchLine(pattern, text, wholeWord, visitMatch);
				return;
			}
			matchSearchLine(pattern, text, wholeWord, (start, end) => {
				if (end <= visible) return visitMatch(start, end);
				visitMatch(start, end, true);
				return true;
			});
		};
		const recordLineMatches = (startIndex, additionLineNumber, additionLineIndex) => {
			const endIndex = matches.length;
			(side === "deletions" ? progress.deletionLines ??= [] : progress.additionLines ??= []).push({
				lineNumber,
				startIndex,
				endIndex
			});
			const { atLimit } = this;
			if (atLimit || additionLineNumber == null || additionLineIndex == null) return atLimit;
			side = "additions";
			lineNumber = additionLineNumber;
			lineIndex = additionLineIndex;
			let reachedLimit = false;
			for (let index = startIndex; index < endIndex; index++) {
				const { startCharacter, endCharacter, cutOff } = matches[index];
				if (visitMatch(startCharacter, endCharacter, cutOff)) {
					reachedLimit = true;
					break;
				}
			}
			(progress.additionLines ??= []).push({
				lineNumber: additionLineNumber,
				startIndex: endIndex,
				endIndex: matches.length
			});
			return reachedLimit;
		};
		const visitLine = (text, nextSide, nextLineNumber, nextLineIndex, additionLineNumber, additionLineIndex) => {
			side = nextSide;
			lineNumber = nextLineNumber;
			lineIndex = nextLineIndex;
			const startIndex = matches.length;
			if (text.length <= cutLength) matchSearchLine(pattern, text, wholeWord, visitMatch);
			else searchLongLine(text);
			const capped = matches.length > startIndex && recordLineMatches(startIndex, additionLineNumber, additionLineIndex);
			const { deadline } = this;
			if (deadline == null) return capped;
			this.scannedCharacters += text.length + 1;
			if (this.scannedCharacters < 65536) return capped;
			this.scannedCharacters = 0;
			return capped || performance.now() >= deadline;
		};
		const progress = {
			position,
			cursor,
			matches,
			additionLines: void 0,
			deletionLines: void 0,
			visitLine
		};
		return progress;
	}
};
function trimLineEnding(text) {
	let end = text.length;
	while (end > 0) {
		const charCode = text.charCodeAt(end - 1);
		if (charCode !== 10 && charCode !== 13) break;
		end--;
	}
	return end === text.length ? text : text.slice(0, end);
}
function areCodeViewSearchMatchesEqual(a, b) {
	return a.itemId === b.itemId && a.itemType === b.itemType && a.side === b.side && a.lineNumber === b.lineNumber && a.lineIndex === b.lineIndex && a.startCharacter === b.startCharacter && a.endCharacter === b.endCharacter;
}
function areOptionalCodeViewSearchMatchesEqual(a, b) {
	if (a === void 0 || b === void 0) return a === b;
	return areCodeViewSearchMatchesEqual(a, b);
}
//#endregion
export { CODE_VIEW_SEARCH_CARRIAGE_RETURN_LOOKAHEAD, CODE_VIEW_SEARCH_CLOCK_CHECK_CHARACTERS, CodeViewSearchDiffCursor, CodeViewSearchScan, CodeViewSearchTextCursor, areCodeViewSearchMatchesEqual, areOptionalCodeViewSearchMatchesEqual };

//# sourceMappingURL=codeViewSearch.js.map