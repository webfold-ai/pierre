//#region src/search/findRangeAtPoint.ts
function findRangeAtPoint(entries, row, clientX, clientY) {
	let start = entries.findIndex((entry) => entry.row === row);
	if (start < 0) return void 0;
	let end = entries.length;
	while (start < end) {
		const middle = Math.floor((start + end) / 2);
		const entry = entries[middle];
		if (entry.row !== row) {
			end = middle;
			continue;
		}
		const rects = entry.range.getClientRects();
		if (rects.length === 0) return void 0;
		const first = rects[0];
		const last = rects[rects.length - 1];
		if (clientY >= last.bottom || clientY >= last.top && clientX >= last.right) start = middle + 1;
		else if (clientY < first.top || clientY < first.bottom && clientX < first.left) end = middle;
		else {
			for (const rect of rects) if (clientX >= rect.left && clientX < rect.right && clientY >= rect.top && clientY < rect.bottom) return entry;
			return;
		}
	}
}
//#endregion
export { findRangeAtPoint };

//# sourceMappingURL=findRangeAtPoint.js.map