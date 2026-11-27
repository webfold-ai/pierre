import { Element, Properties } from "../node_modules/.pnpm/@types_hast@3.0.4/node_modules/@types/hast/index.js";
import { LineTypes } from "../types.js";
import { LineKey, RowKey, RowSpec } from "./RowSpec.js";
//#region src/layout/RowCells.d.ts
interface Column {
  specs: RowSpec[];
  lastKey: RowKey | undefined;
}
/**
 * Builds the gutter and content cells of rows, and caches them. A cell built
 * from the same inputs as last render is returned as the same object, which
 * is how the reconciler knows it can leave the row's DOM alone.
 */
declare class RowCells {
  #private;
  /**
   * The content cell of a line: `row` with its line attributes. Reuses the
   * last cell while the attributes match. `readOnly` marks a line the caret
   * must not enter.
   */
  line(row: Element, contentProperties: Properties | undefined, lineNumber: number, altLineNumber: number | undefined, lineIndexText: string, readOnly?: boolean): Element;
  /**
   * The gutter cell of the line with `key`, reused while its number, type
   * and properties match, whatever happened to the line's text.
   */
  gutter(key: LineKey, lineType: LineTypes, lineNumber: number, lineIndexText: string, properties?: Properties): Element;
  /** Pushes a row that is not built from a line, reusing it while its signature matches. */
  fixedRow(column: Column, key: RowKey, signature: string, create: () => {
    gutter: Element;
    content: Element;
  }): void;
  /**
   * Drops the rows kept for lines an edit removed: their gutter cells, their
   * annotation rows and the buffers that followed them.
   */
  forgetLines(ids: readonly number[]): void;
}
declare function createColumn(): Column;
declare function pushRow(column: Column, spec: RowSpec): void;
declare function readOnly(cell: Element): Element;
//#endregion
export { Column, RowCells, createColumn, pushRow, readOnly };
//# sourceMappingURL=RowCells.d.ts.map