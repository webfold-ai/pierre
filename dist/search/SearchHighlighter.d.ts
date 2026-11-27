import { SelectionSide } from "../types.js";
//#region src/search/SearchHighlighter.d.ts
interface SearchHighlightRange {
  startCharacter: number;
  endCharacter: number;
  current: boolean;
}
declare class SearchHighlighter {
  private readonly highlights;
  static create(document: Document): SearchHighlighter | undefined;
  static getLineNumber(row: HTMLElement): number;
  static getLineSide(row: HTMLElement): SelectionSide;
  private ranges;
  private readonly markedButtons;
  private currentRange;
  private constructor();
  clear(): void;
  /** The painted range of the current match, while one is mounted. */
  get currentMatchRange(): Range | undefined;
  getMatchStartAtPoint(row: HTMLElement, clientX: number, clientY: number): number | undefined;
  paint(root: ParentNode, getMatches: (lineNumber: number, side: SelectionSide) => readonly SearchHighlightRange[] | undefined): void;
  private paintLine;
}
//#endregion
export { SearchHighlightRange, SearchHighlighter };
//# sourceMappingURL=SearchHighlighter.d.ts.map