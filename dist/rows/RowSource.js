import { createPlainRow, createTokenRow } from "../utils/hast_utils.js";
import { cleanLastNewline } from "../utils/cleanLastNewline.js";
//#region src/rows/RowSource.ts
/**
* Base rows for the rows the layout places: token spans and text, with no
* marks and no line attributes. Deletion rows come from the highlight result.
* Addition rows come from the editor's tokens when it has sent some for the
* line, else from the highlight result while the line's text is unchanged,
* else as plain text until tokens arrive. Rows are memoized on their inputs,
* so an unchanged line gives the same object back.
*/
var RowSource = class {
	#deletionRows = [];
	#additionRows = [];
	#additionLines = [];
	#rowsById;
	#tokens = /* @__PURE__ */ new Map();
	#tokenRows = /* @__PURE__ */ new WeakMap();
	#plainRows = /* @__PURE__ */ new Map();
	#plainDeletionRows = /* @__PURE__ */ new Map();
	constructor(rows) {
		this.setHighlightRows(rows);
	}
	/** Binds the rows of a highlight result, keeping the editor's tokens. */
	setHighlightRows({ deletionRows, additionRows, additionLines, lineIds }) {
		this.#deletionRows = deletionRows;
		if (lineIds != null) {
			const rowsById = /* @__PURE__ */ new Map();
			for (let line = 0; line < additionLines.length; line++) {
				const row = additionRows[line];
				if (row?.type === "element") rowsById.set(lineIds[line], {
					row,
					text: additionLines[line]
				});
			}
			this.#rowsById = rowsById;
			this.#additionRows = [];
			this.#additionLines = [];
		} else {
			this.#rowsById = void 0;
			this.#additionRows = additionRows;
			this.#additionLines = additionLines;
		}
	}
	/**
	* Records the editor's tokens for a line. Returns false when they render
	* the same as the tokens already held, so callers can skip the row.
	*/
	setTokens(lineId, tokens) {
		const previous = this.#tokens.get(lineId);
		if (previous != null && areTokensEqual(previous.tokens, tokens)) return false;
		let text = "";
		for (const token of tokens) text += token[2];
		this.#tokens.set(lineId, {
			tokens,
			text
		});
		this.#plainRows.delete(lineId);
		return true;
	}
	/** Whether the editor has sent tokens for a line. */
	hasTokens(lineId) {
		return this.#tokens.has(lineId);
	}
	/** Drops the editor's tokens for every line. */
	forgetTokens() {
		this.#tokens.clear();
	}
	/** Drops what is held for lines an edit deleted. */
	forgetLines(lineIds) {
		for (const lineId of lineIds) {
			this.#tokens.delete(lineId);
			this.#plainRows.delete(lineId);
			this.#rowsById?.delete(lineId);
		}
	}
	/**
	* The row for an old line. A highlight result has rows only for lines in
	* hunks, so a diff with none (a pure rename) edited into one shows its old
	* lines as plain text until it is highlighted again.
	*/
	deletionRow(model, lineIndex) {
		const row = this.#deletionRows[lineIndex];
		if (row?.type === "element") return row;
		const text = cleanLastNewline(model.diff.deletionLines[lineIndex] ?? "");
		const plain = this.#plainDeletionRows.get(lineIndex);
		if (plain != null && plain.text === text) return plain.row;
		const created = createPlainRow(text);
		this.#plainDeletionRows.set(lineIndex, {
			text,
			row: created
		});
		return created;
	}
	additionRow(model, lineIndex) {
		const lineId = model.lineId(lineIndex);
		const text = model.lineText(lineIndex);
		const lineText = cleanLastNewline(text);
		const held = this.#tokens.get(lineId);
		if (held != null && held.text === lineText) {
			let row = this.#tokenRows.get(held.tokens);
			if (row == null) {
				row = createTokenRow(held.tokens);
				this.#tokenRows.set(held.tokens, row);
			}
			return row;
		}
		const rowsById = this.#rowsById;
		if (rowsById != null) {
			const original = rowsById.get(lineId);
			if (original != null && original.text === text) return original.row;
		} else {
			const row = this.#additionRows[lineIndex];
			if (row?.type === "element" && this.#additionLines[lineIndex] === text) return row;
		}
		const plain = this.#plainRows.get(lineId);
		if (plain != null && plain.text === lineText) return plain.row;
		const row = createPlainRow(lineText);
		this.#plainRows.set(lineId, {
			text: lineText,
			row
		});
		return row;
	}
};
function areTokensEqual(a, b) {
	if (a === b) return true;
	if (a.length !== b.length) return false;
	for (let index = 0; index < a.length; index++) {
		const [aChar, aColor, aText] = a[index];
		const [bChar, bColor, bText] = b[index];
		if (aChar !== bChar || aColor !== bColor || aText !== bText) return false;
	}
	return true;
}
//#endregion
export { RowSource };

//# sourceMappingURL=RowSource.js.map