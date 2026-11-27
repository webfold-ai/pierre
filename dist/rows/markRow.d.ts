import { Element } from "../node_modules/.pnpm/@types_hast@3.0.4/node_modules/@types/hast/index.js";
import { LineDiffRange } from "../utils/computeLineDiffRanges.js";
//#region src/rows/markRow.d.ts
/**
 * Returns a copy of a base row with the changed text in `ranges` wrapped in
 * `data-diff-span` spans. The base row is never changed, and it is returned
 * as is when there is nothing to mark.
 *
 * A base row has no marks yet: its children are token spans (optionally with
 * `data-char`), plain text, or the single `<br>` or newline of an empty row.
 * Anything else is a row this package did not build, and throws.
 */
declare function markRow(row: Element, ranges: readonly LineDiffRange[]): Element;
//#endregion
export { markRow };
//# sourceMappingURL=markRow.d.ts.map