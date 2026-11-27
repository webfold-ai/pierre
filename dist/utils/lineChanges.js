//#region src/utils/lineChanges.ts
/**
* The line changes of a document change. A change made of edits always
* carries them; a change with no edits moves no lines.
*/
function lineChangesOf(change) {
	const { changes, changedLineChanges } = change;
	if (changedLineChanges != null) return changedLineChanges;
	if (changes.length > 0) throw new Error("lineChangesOf: a change with edits has no line changes");
	return [];
}
/**
* Moves one-entry-per-line data through an edit's line changes so every
* entry stays with its line, in one pass over the list. The changes come in
* document order, each numbered as if the changes before it were already
* applied. Within a change the lines that remain keep their entries, first
* for first; a line the edit added gets `blank()`; the entries of lines the
* edit removed are returned. A list may stop short of the document's last
* line; lines added past its end are not added to it.
*/
function moveLineEntries(entries, lineChanges, blank) {
	const removed = [];
	if (lineChanges.every(([, , lineDelta]) => lineDelta === 0)) return {
		entries,
		removed
	};
	const moved = [];
	let read = 0;
	let shift = 0;
	for (const [, end, lineDelta] of lineChanges) {
		if (lineDelta === 0) continue;
		const at = (lineDelta > 0 ? end - lineDelta + 1 : end + 1) - shift;
		if (at < read) throw new Error("moveLineEntries: line changes are out of order");
		for (; read < at && read < entries.length; read++) moved.push(entries[read]);
		if (lineDelta > 0) {
			if (at <= entries.length) for (let count = 0; count < lineDelta; count++) moved.push(blank());
		} else {
			const stop = Math.min(at - lineDelta, entries.length);
			for (; read < stop; read++) removed.push(entries[read]);
		}
		shift += lineDelta;
	}
	for (; read < entries.length; read++) moved.push(entries[read]);
	return {
		entries: moved,
		removed
	};
}
//#endregion
export { lineChangesOf, moveLineEntries };

//# sourceMappingURL=lineChanges.js.map