//#region src/utils/areGhostTextRowsEqual.ts
/**
* Whether two ghost text row maps (zero-based line -> row count) show the
* same rows under the same lines. The editor replaces its map on every
* change, so a different map is not by itself a change in height.
*/
function areGhostTextRowsEqual(a, b) {
	if (a === b) return true;
	if (a.size !== b.size) return false;
	for (const [line, rows] of a) if (b.get(line) !== rows) return false;
	return true;
}
//#endregion
export { areGhostTextRowsEqual };

//# sourceMappingURL=areGhostTextRowsEqual.js.map