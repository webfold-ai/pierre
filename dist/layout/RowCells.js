import { i18n } from "../i18n/I18n.js";
import { createGutterItem } from "../utils/hast_utils.js";
//#region src/layout/RowCells.ts
/**
* Builds the gutter and content cells of rows, and caches them. A cell built
* from the same inputs as last render is returned as the same object, which
* is how the reconciler knows it can leave the row's DOM alone.
*/
var RowCells = class {
	#stamped = /* @__PURE__ */ new WeakMap();
	#gutters = /* @__PURE__ */ new Map();
	#fixedRows = /* @__PURE__ */ new Map();
	/**
	* The content cell of a line: `row` with its line attributes. Reuses the
	* last cell while the attributes match. `readOnly` marks a line the caret
	* must not enter.
	*/
	line(row, contentProperties, lineNumber, altLineNumber, lineIndexText, readOnly = false) {
		const cached = this.#stamped.get(row);
		if (cached != null && cached.lineNumber === lineNumber && cached.altLineNumber === altLineNumber && cached.lineIndexText === lineIndexText && cached.readOnly === readOnly && arePropertiesEqual(cached.contentProperties, contentProperties)) return cached.row;
		const properties = {
			...row.properties,
			"data-line": lineNumber,
			"data-alt-line": altLineNumber,
			"data-line-type": contentProperties?.["data-line-type"] ?? row.properties["data-line-type"],
			"data-line-index": lineIndexText,
			...contentProperties
		};
		if (readOnly) properties.contenteditable = "false";
		const stamped = {
			...row,
			properties
		};
		this.#stamped.set(row, {
			contentProperties,
			lineNumber,
			altLineNumber,
			lineIndexText,
			readOnly,
			row: stamped
		});
		return stamped;
	}
	/**
	* The gutter cell of the line with `key`, reused while its number, type
	* and properties match, whatever happened to the line's text.
	*/
	gutter(key, lineType, lineNumber, lineIndexText, properties = {}) {
		const cached = this.#gutters.get(key);
		if (cached != null && cached.lineType === lineType && cached.lineNumber === lineNumber && cached.lineIndexText === lineIndexText && arePropertiesEqual(cached.properties, properties)) return cached.cell;
		const cell = createGutterItem(lineType, lineNumber, lineIndexText, properties);
		if (cached != null && cached.lineNumber === lineNumber) cell.children = cached.cell.children;
		this.#gutters.set(key, {
			lineType,
			lineNumber,
			lineIndexText,
			properties,
			cell
		});
		return cell;
	}
	/** Pushes a row that is not built from a line, reusing it while its signature matches. */
	fixedRow(column, key, signature, create) {
		let fixed = this.#fixedRows.get(key);
		const messagesVersion = i18n.version;
		if (fixed == null || fixed.signature !== signature || fixed.messagesVersion !== messagesVersion) {
			fixed = {
				signature,
				messagesVersion,
				...create()
			};
			this.#fixedRows.set(key, fixed);
		}
		pushRow(column, {
			key,
			gutter: fixed.gutter,
			content: fixed.content
		});
	}
	/**
	* Drops the rows kept for lines an edit removed: their gutter cells, their
	* annotation rows and the buffers that followed them.
	*/
	forgetLines(ids) {
		for (const id of ids) {
			this.#gutters.delete(`a${id}`);
			this.#fixedRows.delete(`ann:a${id}`);
			this.#fixedRows.delete(`buf:a${id}`);
			this.#fixedRows.delete(`buf:ann:a${id}`);
		}
	}
};
function createColumn() {
	return {
		specs: [],
		lastKey: void 0
	};
}
function pushRow(column, spec) {
	column.specs.push(spec);
	column.lastKey = spec.key;
}
function readOnly(cell) {
	return {
		...cell,
		properties: {
			...cell.properties,
			contenteditable: "false"
		}
	};
}
function arePropertiesEqual(a, b) {
	if (a === b) return true;
	if (a == null || b == null) return false;
	let count = 0;
	for (const key in a) {
		if (a[key] !== b[key]) return false;
		count++;
	}
	for (const _key in b) count--;
	return count === 0;
}
//#endregion
export { RowCells, createColumn, pushRow, readOnly };

//# sourceMappingURL=RowCells.js.map