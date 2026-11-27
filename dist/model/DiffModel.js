import { countLineBreaks } from "../utils/computeFileOffsets.js";
import { uniformLineEndings } from "../utils/lineEndings.js";
import { readAllLines, readChangedLines } from "./documentLines.js";
import { LineMap } from "./LineMap.js";
import { cloneHunks } from "../utils/cloneFileDiffMetadata.js";
import { splitFileContents } from "../utils/splitFileContents.js";
import { recomputeDiffRenderLineCounts, recomputeEmptyDocumentDiff, recomputeTopAlignedAdditionDiff, shouldTopAlignAdditionRecompute } from "../utils/updateDiffHunks.js";
import { applySessionChangedLines, captureExpansionAnchors, finishEditSessionForDiff, rebuildExpansionFromAnchors, rebuildSessionHunks, remapExpandedHunksForRegionChange } from "../utils/editSessionHunks.js";
//#region src/model/DiffModel.ts
/**
* The diff a component renders: the old lines, the new lines, and the hunks
* that pair them. A static model wraps a `FileDiffMetadata` and never changes
* it. A live model owns its diff for an edit session: `applyChange` keeps the
* new lines and hunks current as the editor's document changes, using the
* session rules (regions keep their old-side bounds, a reverted region stays
* as context until `finish`), and `LineMap` gives every document line a
* stable id.
*
* The diff's new lines are the document's lines without the empty line after
* a final line break, so they always have the shape a parse gives them. That
* line is still a document line with an id; it renders as an extra row with
* no text.
*/
var DiffModel = class DiffModel {
	/** A read-only model over a diff the caller owns. Nothing is copied. */
	static fromDiff(diff) {
		return new DiffModel(diff, void 0);
	}
	/**
	* A live model for editing `inputDiff`'s new file. The diff is a shallow
	* copy without a cache key; its arrays are shared with the input until an
	* edit replaces them, and the input is never written to.
	*/
	static startEditSession(inputDiff, options = {}) {
		const { document, snapshot, parseDiffOptions } = options;
		if (inputDiff.isPartial) throw new Error("DiffModel.startEditSession: the diff must not be partial");
		const inputContents = uniformLineEndings(inputDiff.additionLines.join(""));
		const documentContents = document == null ? void 0 : uniformLineEndings(document.contents);
		const restoresSnapshot = snapshot != null && canRestoreSnapshot(snapshot, inputDiff);
		if (snapshot != null && !restoresSnapshot) throw new Error("DiffModel.startEditSession: the retained session was diffed against a different old file");
		if (documentContents != null && documentContents !== inputContents && !restoresSnapshot) throw new Error("DiffModel.startEditSession: retained edits are missing their diff session state");
		const diff = { ...inputDiff };
		delete diff.cacheKey;
		if (inputContents !== inputDiff.additionLines.join("")) {
			diff.additionLines = splitFileContents(inputContents);
			diff.additionCharacterCount = inputContents.length;
			rebuildSessionHunks(diff, parseDiffOptions);
			diff.editSessionDirty = true;
		}
		const usesInputDocument = document == null || document.name === inputDiff.name && document.lang === inputDiff.lang && documentContents === inputContents;
		if (document != null && !usesInputDocument) {
			diff.name = document.name;
			diff.lang = document.lang;
		}
		if (restoresSnapshot && snapshot != null && documentContents != null) {
			diff.additionLines = splitFileContents(documentContents);
			diff.additionCharacterCount = documentContents.length;
			diff.type = snapshot.type;
			diff.hunks = snapshot.hunks;
			diff.editSessionDirty = true;
			recomputeDiffRenderLineCounts(diff);
		}
		const model = new DiffModel(diff, new LineMap(countLineBreaks(diff.additionLines.join("")) + 1));
		if (diff.additionLines.length === 0) {
			Object.assign(diff, recomputeEmptyDocumentDiff(diff, parseDiffOptions));
			diff.editSessionDirty = true;
		}
		return model;
	}
	diff;
	#lines;
	#sharedAdditionLines;
	#blockIndex;
	constructor(diff, lines) {
		this.diff = diff;
		this.#lines = lines;
		this.#sharedAdditionLines = diff.additionLines;
	}
	/** Whether this model follows an editor's document. */
	get live() {
		return this.#lines != null;
	}
	/**
	* The number of new-file lines: the editor document's while editing,
	* otherwise the diff's.
	*/
	get lineCount() {
		return this.#lines?.lineCount ?? this.diff.additionLines.length;
	}
	/** A stable id for a new-file line while editing; the index otherwise. */
	lineId(line) {
		return this.#lines?.idAt(line) ?? line;
	}
	/**
	* The text of a new-file line, with its line break. Empty for the line
	* after a final line break, which has no entry.
	*/
	lineText(line) {
		return this.diff.additionLines[line] ?? "";
	}
	/** The new-file line that has this id, or undefined once it was deleted. */
	lineOf(id) {
		return this.#lines?.lineOf(id) ?? (id < this.diff.additionLines.length ? id : void 0);
	}
	/** The hunk block containing a line, or undefined between hunks. */
	blockAt(side, lineIndex) {
		const { starts, ends, blocks } = this.#getBlockIndex()[side];
		let low = 0;
		let high = blocks.length;
		while (low < high) {
			const middle = low + high >>> 1;
			if (ends[middle] <= lineIndex) low = middle + 1;
			else high = middle;
		}
		return low < blocks.length && starts[low] <= lineIndex ? blocks[low] : void 0;
	}
	/**
	* The line on the other side that a changed line is paired with, by
	* position inside its change block, for word diff highlights. Undefined for
	* context and for unpaired lines.
	*/
	pairFor(side, lineIndex) {
		const block = this.blockAt(side, lineIndex);
		if (block?.type !== "change") return;
		const offset = lineIndex - (side === "deletions" ? block.deletionLineIndex : block.additionLineIndex);
		if (offset >= Math.min(block.deletions, block.additions)) return;
		const deletionIndex = block.deletionLineIndex + offset;
		const additionIndex = block.additionLineIndex + offset;
		const { deletionLines, additionLines } = this.diff;
		if (deletionLines[deletionIndex] == null || additionLines[additionIndex] == null) return;
		return side === "deletions" ? additionIndex : deletionIndex;
	}
	/**
	* The new-file line where editing continues from an old-file line number:
	* the same line for context, the block's first added line for a deleted
	* one, or the line after the block when it adds nothing (the line count
	* when the deletion ends the file). Undefined outside every hunk.
	*/
	editLineFor(deletionLineNumber) {
		for (const hunk of this.diff.hunks) {
			const offset = deletionLineNumber - hunk.deletionStart;
			if (offset < 0 || offset >= hunk.deletionCount) continue;
			const lineIndex = hunk.deletionLineIndex + offset;
			const block = this.blockAt("deletions", lineIndex);
			if (block == null) throw new Error(`DiffModel.editLineFor: old line ${deletionLineNumber} is inside a hunk but outside its blocks`);
			return block.type === "context" ? block.additionLineIndex + (lineIndex - block.deletionLineIndex) : block.additionLineIndex;
		}
	}
	/**
	* Brings the diff up to date with one change to the editor's document.
	* Same-line-count edits copy the changed lines in and keep the hunks when
	* the session rules allow; line-count edits reread the document and
	* rebuild the session regions.
	*/
	applyChange(change, document, session = {}) {
		const lines = this.#lines;
		if (lines == null) throw new Error("DiffModel.applyChange: the model is not live");
		const removedLineIds = lines.applyChange(change);
		const { diff } = this;
		const { parseDiffOptions } = session;
		let expandedHunks = session.expandedHunks ?? /* @__PURE__ */ new Map();
		const keepsLineCount = change.lineDelta === 0;
		const { hunks: previousHunks } = diff;
		let changedLines;
		let regionsChanged = false;
		if (keepsLineCount) {
			changedLines = [];
			const previousTexts = /* @__PURE__ */ new Map();
			const lineCount = diff.additionLines.length;
			for (const [line, text] of readChangedLines(document, change)) {
				const isFinalEmptyLine = line > 0 && line === document.lineCount - 1 && text === "";
				if (line < 0 || line > lineCount || line === lineCount && (isFinalEmptyLine || document.lineCount !== lineCount + 1)) continue;
				const previous = diff.additionLines[line] ?? "";
				if (!isFinalEmptyLine && previous === text) continue;
				if (diff.additionLines === this.#sharedAdditionLines) diff.additionLines = diff.additionLines.slice();
				if (isFinalEmptyLine) diff.additionLines.pop();
				else diff.additionLines[line] = text;
				diff.additionCharacterCount += text.length - previous.length;
				changedLines.push(line);
				previousTexts.set(line, previous);
			}
			if (changedLines.length > 0) {
				if (isEmptyDocument(diff)) {
					this.#applyRecompute(recomputeEmptyDocumentDiff(diff, parseDiffOptions));
					regionsChanged = true;
				} else if (shouldTopAlignAdditionRecompute(diff, diff.additionLines)) {
					this.#applyRecompute(recomputeTopAlignedAdditionDiff(diff, diff.additionLines, diff.additionCharacterCount, parseDiffOptions));
					regionsChanged = true;
				} else if (diff.additionLines.length !== lineCount) {
					const regionChange = rebuildSessionHunks(diff, parseDiffOptions, (index) => previousTexts.has(index) ? previousTexts.get(index) : diff.additionLines[index]);
					expandedHunks = remapExpansion(expandedHunks, regionChange);
					regionsChanged = regionChange != null;
				} else {
					const regionChange = applySessionChangedLines(diff, changedLines, parseDiffOptions, previousTexts);
					expandedHunks = remapExpansion(expandedHunks, regionChange);
					regionsChanged = regionChange != null;
				}
			}
		} else {
			const previousLines = diff.additionLines;
			const { lines: nextLines, characterCount } = readAllLines(document);
			if (nextLines.length > 1 && nextLines.at(-1) === "") nextLines.pop();
			diff.additionLines = nextLines;
			diff.additionCharacterCount = characterCount;
			if (isEmptyDocument(diff)) this.#applyRecompute(recomputeEmptyDocumentDiff(diff, parseDiffOptions));
			else if (shouldTopAlignAdditionRecompute(diff, nextLines)) this.#applyRecompute(recomputeTopAlignedAdditionDiff(diff, nextLines, characterCount, parseDiffOptions));
			else expandedHunks = remapExpansion(expandedHunks, rebuildSessionHunks(diff, parseDiffOptions, (index) => previousLines[index]));
			regionsChanged = true;
			changedLines = [];
			for (const [start, end] of change.changedLineRanges) {
				const last = Math.min(end, diff.additionLines.length - 1);
				for (let line = start; line <= last; line++) changedLines.push(line);
			}
		}
		this.#blockIndex = void 0;
		return {
			changedLines,
			hunksChanged: diff.hunks !== previousHunks,
			removedLineIds,
			lineDelta: change.lineDelta,
			regionsChanged,
			expandedHunks
		};
	}
	/** The id of every line, in line order. */
	lineIds() {
		return this.#lines?.ids() ?? Array.from({ length: this.lineCount }, (_, line) => line);
	}
	/** The state another session needs to resume this one's draft. */
	snapshot() {
		const { diff } = this;
		return {
			oldFile: diff.type !== "new" ? {
				name: diff.prevName ?? diff.name,
				lines: [...diff.deletionLines]
			} : null,
			type: diff.type,
			hunks: cloneHunks(diff.hunks)
		};
	}
	/** Whether an edit has changed the diff since the session started. */
	get hasChanges() {
		return this.diff.editSessionDirty === true;
	}
	/**
	* Ends the session: recomputes the hunks the way a plain diff of the final
	* text would, and keeps expansion at the gap edges that survive. Returns
	* whether a recompute ran, and the expansion to use from now on.
	*/
	finish(collapsedContextThreshold, session = {}) {
		const { diff } = this;
		const { parseDiffOptions } = session;
		const expandedHunks = session.expandedHunks ?? /* @__PURE__ */ new Map();
		if (diff.editSessionDirty !== true) return {
			changed: false,
			expandedHunks
		};
		const anchors = captureExpansionAnchors(diff, expandedHunks, collapsedContextThreshold);
		finishEditSessionForDiff(diff, parseDiffOptions);
		this.#blockIndex = void 0;
		return {
			changed: true,
			expandedHunks: rebuildExpansionFromAnchors(diff, anchors)
		};
	}
	#applyRecompute(update) {
		const { diff } = this;
		const sessionType = diff.type;
		Object.assign(diff, update);
		diff.type = sessionType;
		diff.editSessionDirty = true;
		this.#blockIndex = void 0;
	}
	#getBlockIndex() {
		const { hunks } = this.diff;
		if (this.#blockIndex?.hunks === hunks) return this.#blockIndex;
		const deletions = {
			starts: [],
			ends: [],
			blocks: []
		};
		const additions = {
			starts: [],
			ends: [],
			blocks: []
		};
		for (const hunk of hunks) for (const block of hunk.hunkContent) {
			const deletionCount = block.type === "context" ? block.lines : block.deletions;
			const additionCount = block.type === "context" ? block.lines : block.additions;
			if (deletionCount > 0) {
				deletions.starts.push(block.deletionLineIndex);
				deletions.ends.push(block.deletionLineIndex + deletionCount);
				deletions.blocks.push(block);
			}
			if (additionCount > 0) {
				additions.starts.push(block.additionLineIndex);
				additions.ends.push(block.additionLineIndex + additionCount);
				additions.blocks.push(block);
			}
		}
		return this.#blockIndex = {
			hunks,
			deletions,
			additions
		};
	}
};
function canRestoreSnapshot(snapshot, inputDiff) {
	const { oldFile } = snapshot;
	if (oldFile == null) return inputDiff.type === "new";
	return inputDiff.type !== "new" && oldFile.name === (inputDiff.prevName ?? inputDiff.name) && oldFile.lines.length === inputDiff.deletionLines.length && oldFile.lines.every((line, index) => line === inputDiff.deletionLines[index]);
}
function isEmptyDocument(diff) {
	return diff.additionLines.length <= 1 && diff.additionLines.join("") === "";
}
function remapExpansion(expandedHunks, change) {
	return change == null ? expandedHunks : remapExpandedHunksForRegionChange(expandedHunks, change);
}
//#endregion
export { DiffModel };

//# sourceMappingURL=DiffModel.js.map