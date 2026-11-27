//#region src/layout/RowSpec.ts
/** Whether a key is a line's: every other kind of row carries a `:` prefix. */
function isLineKey(key) {
	return !key.includes(":");
}
/** The gutter and content cells of a column's rows, in order. */
function columnCells(specs) {
	return {
		gutter: specs.map((spec) => spec.gutter),
		content: specs.map((spec) => spec.content)
	};
}
//#endregion
export { columnCells, isLineKey };

//# sourceMappingURL=RowSpec.js.map