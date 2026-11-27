//#region src/utils/lineChanges.d.ts
/**
 * One edit's effect on a document's lines: the lines it changed, numbered as
 * they are after the edit, and how many lines it added or removed.
 */
type LineChange = readonly [start: number, end: number, lineDelta: number, ...unknown[]];
/**
 * The line changes of a document change. A change made of edits always
 * carries them; a change with no edits moves no lines.
 */
declare function lineChangesOf(change: {
  readonly changes: readonly unknown[];
  readonly changedLineChanges?: readonly LineChange[];
}): readonly LineChange[];
/**
 * Moves one-entry-per-line data through an edit's line changes so every
 * entry stays with its line, in one pass over the list. The changes come in
 * document order, each numbered as if the changes before it were already
 * applied. Within a change the lines that remain keep their entries, first
 * for first; a line the edit added gets `blank()`; the entries of lines the
 * edit removed are returned. A list may stop short of the document's last
 * line; lines added past its end are not added to it.
 */
declare function moveLineEntries<T>(entries: T[], lineChanges: readonly LineChange[], blank: () => T): {
  entries: T[];
  removed: T[];
};
//#endregion
export { LineChange, lineChangesOf, moveLineEntries };
//# sourceMappingURL=lineChanges.d.ts.map