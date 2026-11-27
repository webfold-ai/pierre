import { DecoratedLineBuilder } from "../utils/DecoratedLineBuilder.js";
import { wrapTokenFragments } from "../utils/wrapTokenFragments.js";
//#region src/rows/markRow.ts
/**
* Returns a copy of a base row with the changed text in `ranges` wrapped in
* `data-diff-span` spans. The base row is never changed, and it is returned
* as is when there is nothing to mark.
*
* A base row has no marks yet: its children are token spans (optionally with
* `data-char`), plain text, or the single `<br>` or newline of an empty row.
* Anything else is a row this package did not build, and throws.
*/
function markRow(row, ranges) {
	if (ranges.length === 0) return row;
	const pieces = [];
	collectTextPieces(row.children, pieces);
	if (pieces.length === 0) throw new Error("markRow: an empty row has no text to mark");
	const line = {
		type: "element",
		tagName: row.tagName,
		properties: { ...row.properties },
		children: []
	};
	const spans = ranges.map(([start, end]) => ({
		start: {
			line: 0,
			character: start
		},
		end: {
			line: 0,
			character: end
		},
		properties: { "data-diff-span": "" },
		alwaysWrap: true
	}));
	let lineLength = 0;
	for (const piece of pieces) lineLength += piece.text.length;
	const builder = new DecoratedLineBuilder(line, spans, 0, lineLength);
	let column = 0;
	for (const piece of pieces) {
		const { text } = piece;
		const start = column;
		const end = start + text.length;
		while (column < end) {
			builder.moveTo(column);
			const to = Math.min(end, builder.nextEdge);
			builder.parent.children.push(createPieceNode(piece, column === start && to === end ? text : text.slice(column - start, to - start)));
			column = to;
		}
	}
	builder.moveTo(column);
	if (pieces.some((piece) => piece.char != null)) wrapTokenFragments(line);
	return line;
}
function createPieceNode(piece, text) {
	if (piece.properties == null) return {
		type: "text",
		value: text
	};
	const properties = { ...piece.properties };
	if (piece.char != null) properties["data-char"] = piece.char;
	return {
		type: "element",
		tagName: "span",
		properties,
		children: [{
			type: "text",
			value: text
		}]
	};
}
function collectTextPieces(children, pieces) {
	for (const child of children) {
		if (child.type === "text") {
			if (child.value === "\n" && children.length === 1) continue;
			pieces.push({
				text: child.value,
				properties: void 0,
				char: void 0
			});
			continue;
		}
		if (child.type !== "element") continue;
		if (child.tagName === "br") continue;
		if (child.tagName !== "span") throw new Error(`markRow: unexpected <${child.tagName}> in a base row`);
		if (child.properties["data-diff-span"] != null || child.children.some((node) => node.type !== "text")) throw new Error("markRow: a base row has no wrapper spans");
		const properties = { ...child.properties };
		const char = properties["data-char"];
		delete properties["data-char"];
		let text = "";
		for (const node of child.children) if (node.type === "text") text += node.value;
		pieces.push({
			text,
			properties,
			char: typeof char === "number" ? char : void 0
		});
	}
}
//#endregion
export { markRow };

//# sourceMappingURL=markRow.js.map