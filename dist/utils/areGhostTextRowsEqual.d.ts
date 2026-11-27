//#region src/utils/areGhostTextRowsEqual.d.ts
/**
 * Whether two ghost text row maps (zero-based line -> row count) show the
 * same rows under the same lines. The editor replaces its map on every
 * change, so a different map is not by itself a change in height.
 */
declare function areGhostTextRowsEqual(a: ReadonlyMap<number, number>, b: ReadonlyMap<number, number>): boolean;
//#endregion
export { areGhostTextRowsEqual };
//# sourceMappingURL=areGhostTextRowsEqual.d.ts.map