import { i18n } from "../i18n/I18n.js";
import { createIconElement } from "../utils/hast_utils.js";
//#region src/rows/LineCuts.ts
function cutLineLength(text, limit) {
	if (text.length <= limit) return;
	if (text.length - lineBreakLength(text) <= limit) return;
	const last = text.charCodeAt(limit - 1);
	return last >= 55296 && last <= 56319 ? limit - 1 : limit;
}
function lineBreakLength(text) {
	const end = text.length;
	if (text.charCodeAt(end - 1) !== 10) return 0;
	return text.charCodeAt(end - 2) === 13 ? 2 : 1;
}
function copyPrefix(row, target, remaining) {
	for (const child of row.children) {
		if (remaining === 0) break;
		if (child.type === "text") {
			if (child.value.length <= remaining) {
				target.children.push(child);
				remaining -= child.value.length;
			} else {
				target.children.push({
					type: "text",
					value: child.value.slice(0, remaining)
				});
				return 0;
			}
		} else if (child.type === "element") {
			const span = {
				...child,
				children: []
			};
			remaining = copyPrefix(child, span, remaining);
			target.children.push(span);
		}
	}
	return remaining;
}
var LineCuts = class {
	#limit = Infinity;
	#rows = /* @__PURE__ */ new WeakMap();
	#expanded = {
		additions: /* @__PURE__ */ new Set(),
		deletions: /* @__PURE__ */ new Set()
	};
	#hasCutRows = false;
	get expandedLines() {
		return this.#expanded;
	}
	get hasCutRows() {
		return this.#hasCutRows;
	}
	startLayout() {
		this.#hasCutRows = false;
	}
	setLimit(limit) {
		if (limit !== this.#limit) {
			this.#limit = limit;
			this.#rows = /* @__PURE__ */ new WeakMap();
		}
	}
	expand({ additionLineNumber, deletionLineNumber }) {
		const { additions, deletions } = this.#expanded;
		if (additionLineNumber != null) additions.add(additionLineNumber);
		if (deletionLineNumber != null) deletions.add(deletionLineNumber);
	}
	clear() {
		const { additions, deletions } = this.#expanded;
		additions.clear();
		deletions.clear();
	}
	additionRow(base, model, lineIndex, lineNumber, deletionLineNumber) {
		return this.#row(base, model.lineText(lineIndex), "additions", lineNumber, deletionLineNumber);
	}
	deletionRow(base, model, lineIndex, lineNumber, additionLineNumber) {
		return this.#row(base, model.diff.deletionLines[lineIndex] ?? "", "deletions", lineNumber, additionLineNumber);
	}
	#row(base, text, side, lineNumber, altLineNumber) {
		const length = cutLineLength(text, this.#limit);
		if (length == null || this.#expanded[side].has(lineNumber)) return base;
		this.#hasCutRows = true;
		const additionLineNumber = side === "additions" ? lineNumber : altLineNumber;
		const deletionLineNumber = side === "deletions" ? lineNumber : altLineNumber;
		const messagesVersion = i18n.version;
		const cached = this.#rows.get(base);
		if (cached != null && cached.messagesVersion === messagesVersion && cached.additionLineNumber === additionLineNumber && cached.deletionLineNumber === deletionLineNumber) return cached.row;
		const row = {
			...base,
			children: []
		};
		copyPrefix(base, row, length);
		row.children.push({
			type: "element",
			tagName: "button",
			children: [createIconElement({ name: "diffs-icon-ellipsis" })],
			properties: {
				type: "button",
				"data-expand-line": "",
				"data-addition-line-number": additionLineNumber,
				"data-deletion-line-number": deletionLineNumber,
				"aria-label": i18n.t("expandLine")
			}
		});
		this.#rows.set(base, {
			row,
			additionLineNumber,
			deletionLineNumber,
			messagesVersion
		});
		return row;
	}
};
//#endregion
export { LineCuts, cutLineLength };

//# sourceMappingURL=LineCuts.js.map