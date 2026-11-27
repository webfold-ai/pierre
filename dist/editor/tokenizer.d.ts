import { DiffsHighlighter } from "../highlighter/DiffsHighlighter.js";
import { BaseCodeOptions, HighlightedToken, RenderRange } from "../types.js";
import { TextDocument, TextDocumentChange } from "./textDocument.js";
//#region src/editor/tokenizer.d.ts
interface EditorTokenizerProps {
  highlighter: DiffsHighlighter;
  textDocument: TextDocument;
  codeOptions: BaseCodeOptions;
  matchBrackets?: boolean;
  setStyle: (style: string) => void;
  onDeferTokenize: (lines: Map<number, Array<HighlightedToken>>, themeType: 'dark' | 'light') => void;
  onThemeChange?: () => void;
  __debug?: boolean;
}
/** Applies editor theme CSS and delegates tokenization to the selected backend. */
declare class EditorTokenizer {
  #private;
  get themeType(): 'light' | 'dark';
  get highlighter(): DiffsHighlighter;
  constructor({ codeOptions, highlighter, textDocument, matchBrackets, setStyle, onDeferTokenize, onThemeChange, __debug }: EditorTokenizerProps);
  syncTheme(codeOptions: BaseCodeOptions): void;
  applyStyle(): void;
  cleanUp(): void;
  tokenize(change: TextDocumentChange, renderRange?: RenderRange): Map<number, HighlightedToken[]>;
  getStringCommentRegexpRangesInLine(lineIndex: number): [number, number][] | null;
  prebuildStateStack(renderRange?: RenderRange, domCurrent?: boolean): void;
  flush(renderRange?: RenderRange): Map<number, HighlightedToken[]>;
  pauseBackgroundTokenize(): void;
  resumeBackgroundTokenize(): void;
}
//#endregion
export { EditorTokenizer, EditorTokenizerProps };
//# sourceMappingURL=tokenizer.d.ts.map