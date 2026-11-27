import { createGutterGap } from "../utils/hast_utils.js";
import { getFileAnnotations, shouldRenderFileAnnotations } from "../utils/includesFileAnnotations.js";
import { areRenderRangesEqual } from "../utils/areRenderRangesEqual.js";
import { createAnnotationElement } from "../utils/createAnnotationElement.js";
import { RowCells, createColumn, pushRow, readOnly } from "./RowCells.js";
//#region src/layout/FileLayout.ts
function sameInputs(last, next) {
	return last.model === next.model && last.rows === next.rows && last.annotations === next.annotations && last.annotationSlotName === next.annotationSlotName && areRenderRangesEqual(last.renderRange, next.renderRange);
}
/**
* Places the rows of a plain file for one render: the file-level annotation
* row, then one row per line in the render range with its line number, each
* followed by its annotation row. One column, no marks. Rows are memoized on
* their inputs, so a row that did not change is the same object as last
* time. When an edit marked lines and nothing else changed since the last
* walk, the layout rebuilds those lines' rows into the last result instead
* of walking the window again.
*/
var FileLayout = class {
	lineCuts;
	#cells = new RowCells();
	#last;
	#marked;
	constructor(lineCuts) {
		this.lineCuts = lineCuts;
	}
	/** Lines whose text or tokens changed; the next layout rebuilds their rows. */
	markLines(lines) {
		const marked = this.#marked ??= /* @__PURE__ */ new Set();
		for (const line of lines) marked.add(line);
	}
	layout(input) {
		const marked = this.#marked;
		this.#marked = void 0;
		const last = this.#last;
		if (marked != null && last != null && sameInputs(last.input, input)) return this.#patch(last, marked, input);
		const { model, renderRange, annotations } = input;
		const column = createColumn();
		const positions = /* @__PURE__ */ new Map();
		let rowCount = 0;
		this.lineCuts.startLayout();
		const names = (list) => list.map((annotation) => input.annotationSlotName(annotation));
		const pushAnnotationRow = (lineKey, span) => {
			this.#cells.fixedRow(column, `ann:${lineKey}`, `context|${span.hunkIndex},${span.lineIndex}|${span.annotations.join(",")}`, () => ({
				gutter: createGutterGap("context", "annotation", 1),
				content: readOnly(createAnnotationElement(span))
			}));
			rowCount++;
		};
		const fileAnnotations = shouldRenderFileAnnotations(renderRange) ? getFileAnnotations(annotations) : void 0;
		if (fileAnnotations != null) pushAnnotationRow("file", {
			type: "annotation",
			hunkIndex: -1,
			lineIndex: -1,
			annotations: names(fileAnnotations)
		});
		const totalLines = model.lineCount;
		const end = Math.min(renderRange.startingLine + renderRange.totalLines, totalLines);
		for (let line = renderRange.startingLine; line < end; line++) {
			const lineNumber = line + 1;
			const key = `a${model.lineId(line)}`;
			positions.set(key, column.specs.length);
			pushRow(column, this.#lineRow(input, line, key));
			rowCount++;
			const lineAnnotations = annotations[lineNumber];
			if (lineAnnotations != null && lineAnnotations.length > 0) pushAnnotationRow(key, {
				type: "annotation",
				hunkIndex: 0,
				lineIndex: lineNumber,
				annotations: names(lineAnnotations)
			});
		}
		const result = {
			column: column.specs,
			patched: void 0,
			rowCount,
			totalLines
		};
		this.#last = {
			input,
			result,
			positions
		};
		return result;
	}
	#patch(last, marked, input) {
		const { model } = input;
		const column = last.result.column.slice();
		const patched = [];
		for (const line of marked) {
			if (line < 0 || line >= model.lineCount) continue;
			const key = `a${model.lineId(line)}`;
			const position = last.positions.get(key);
			if (position == null) continue;
			const spec = this.#lineRow(input, line, key);
			column[position] = spec;
			patched.push(spec);
		}
		const result = {
			...last.result,
			column,
			patched
		};
		this.#last = {
			input,
			result,
			positions: last.positions
		};
		return result;
	}
	#lineRow({ model, rows }, line, key) {
		const lineNumber = line + 1;
		const lineIndexText = `${line}`;
		const base = rows.additionRow(model, line);
		const content = this.#cells.line(this.lineCuts.additionRow(base, model, line, lineNumber), { "data-line-type": "context" }, lineNumber, void 0, lineIndexText);
		return {
			key,
			gutter: this.#cells.gutter(key, "context", lineNumber, lineIndexText),
			content
		};
	}
	/** Drops the rows kept for lines an edit removed. */
	forgetLines(ids) {
		this.#cells.forgetLines(ids);
	}
	/**
	* After a change that moved rows: the rows of the last walk no longer
	* stand, so the next `layout` walks the window.
	*/
	invalidateLines() {
		this.#last = void 0;
		this.#marked = void 0;
	}
};
//#endregion
export { FileLayout };

//# sourceMappingURL=FileLayout.js.map