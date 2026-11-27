import { Element } from "../node_modules/.pnpm/@types_hast@3.0.4/node_modules/@types/hast/index.js";
import { DecorationItem } from "../highlighter/types.js";
import "../types.js";
//#region src/utils/DecoratedLineBuilder.d.ts
/** A decoration whose start and end are given as a line and a column. */
interface LineDecoration extends Omit<DecorationItem, 'start' | 'end'> {
  start: {
    line: number;
    character: number;
  };
  end: {
    line: number;
    character: number;
  };
}
/**
 * Builds the children of one line element and wraps each decorated range in
 * a <span> with that decoration's attributes.
 *
 * Add the line's text from left to right. Before adding text at a column,
 * call `moveTo(column)`, then add the text to `parent`. Text must be split at
 * `nextEdge`. After the last text, call `moveTo` with the line length.
 */
declare class DecoratedLineBuilder {
  #private;
  /** The element that text at the current column should be added to. */
  parent: Element;
  /**
   * The column where the next decoration starts or ends, or the line length
   * when there are no more. It is never Infinity, because that makes the
   * callers' text loops noticeably slower.
   */
  nextEdge: number;
  constructor(line: Element, spans: LineDecoration[], lineIndex: number, lineLength: number);
  /** Opens and closes decorations for text that starts at `column`. */
  moveTo(column: number): void;
}
//#endregion
export { DecoratedLineBuilder, LineDecoration };
//# sourceMappingURL=DecoratedLineBuilder.d.ts.map