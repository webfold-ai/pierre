//#region src/search/findRangeAtPoint.d.ts
declare function findRangeAtPoint<TEntry extends {
  range: Range;
  row: HTMLElement;
}>(entries: readonly TEntry[], row: HTMLElement, clientX: number, clientY: number): TEntry | undefined;
//#endregion
export { findRangeAtPoint };
//# sourceMappingURL=findRangeAtPoint.d.ts.map