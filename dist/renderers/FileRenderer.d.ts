import { Element, ElementContent } from "../node_modules/.pnpm/@types_hast@3.0.4/node_modules/@types/hast/index.js";
import { DiffsHighlighter } from "../highlighter/DiffsHighlighter.js";
import { BaseCodeOptions, FileContents, FileHeaderRenderMode, HighlightedToken, LineAnnotation, RenderFileOptions, RenderRange, SupportedLanguages, ThemedFileResult } from "../types.js";
import { DocumentLineChange, DocumentLines } from "../model/types.js";
import { FileModelChange } from "../model/FileModel.js";
import { LineCuts, LineExpansion } from "../rows/LineCuts.js";
import { LineKey, RowKey, RowSpec } from "../layout/RowSpec.js";
import { WorkerPoolManager } from "../worker/WorkerPoolManager.js";
import "../worker/index.js";
//#region src/renderers/FileRenderer.d.ts
interface FileRenderResult {
  file: FileContents;
  /** The rows of the window, one gutter cell and one content cell each. */
  column: RowSpec[];
  /** Every row is new: the result the rows come from changed. */
  allRowsChanged: boolean;
  /**
   * The rows that differ from the last result, when an edit's lines were the
   * only change since it: the DOM patches these by key instead of walking
   * `column`. Undefined when the window was laid out anew.
   */
  patched: RowSpec[] | undefined;
  preAST: Element;
  headerAST: Element | undefined;
  totalLines: number;
  themeStyles: string;
  baseThemeType: 'light' | 'dark' | undefined;
  rowCount: number;
  bufferBefore: number;
  bufferAfter: number;
}
interface CollapsedFileRenderResult {
  headerAST: Element | undefined;
  themeStyles: string;
  baseThemeType: 'light' | 'dark' | undefined;
}
interface FileRendererOptions extends BaseCodeOptions {
  headerRenderMode?: FileHeaderRenderMode;
}
declare class FileRenderer<LAnnotation = undefined> {
  options: FileRendererOptions;
  private annotationSlotName;
  private onRenderUpdate?;
  private workerManager?;
  readonly __id: string;
  private file;
  private renderCache;
  private pendingHighlightResult;
  private computedLang;
  private annotationList;
  private lineAnnotations;
  readonly lineCuts: LineCuts;
  private editSessionActive;
  private model;
  private rowSource;
  private layout;
  get fileCache(): FileContents | undefined;
  constructor(options?: FileRendererOptions, annotationSlotName?: (annotation: LineAnnotation<LAnnotation>) => string, onRenderUpdate?: (() => unknown) | undefined, workerManager?: WorkerPoolManager | undefined);
  expandLine(target: LineExpansion): void;
  setOptions(options: FileRendererOptions): void;
  mergeOptions(options: Partial<FileRendererOptions>): void;
  setLineAnnotations(lineAnnotations: LineAnnotation<LAnnotation>[]): void;
  cleanUp(): void;
  recycle(): void;
  /**
   * Starts editing `file` and returns the file being edited, a copy without
   * the input's cache key. Rows come from the input's highlighted rows while
   * a line is unchanged, and from the editor's tokens once it has sent some.
   * `retained` is a document the editor kept from an earlier session.
   */
  startEditSession(file: FileContents, retained?: FileContents): FileContents;
  private promoteReadyResult;
  /**
   * Applies one change of the editor's document to the file being edited,
   * with the tokens the editor produced for it.
   */
  applyChange(change: DocumentLineChange, document: DocumentLines, tokens?: ReadonlyMap<number, HighlightedToken[]>): FileModelChange;
  /**
   * Stores tokens the editor produced in the background. Returns the lines
   * whose rows changed.
   */
  setTokens(tokens: ReadonlyMap<number, HighlightedToken[]>): number[];
  /** The key of the row showing a line of the editor's document. */
  lineKey(line: number): LineKey | undefined;
  /** The document line a row key shows, or undefined for other rows. */
  lineOfKey(key: RowKey): number | undefined;
  /**
   * Called when the editor detaches. Leaves edit mode and returns the file as
   * edited, or undefined when no session was active. The rows stay until
   * another file renders.
   */
  endEditSession(): void;
  private requireSession;
  private editSessionRows;
  /**
   * Whether the rows on screen are ones the editor can update in place: laid
   * out from a highlighted result that carries the token spans it reads.
   */
  editorRenderReady(): boolean;
  private waitForLocalTheme;
  clearRenderCache(): void;
  hydrate(file: FileContents): void;
  /**
   * Whether a session started now would throw away a pool highlight that is
   * still on its way: the pool highlights `file` with the token spans the
   * editor reads, and that result is neither rendered nor ready to render.
   * The pool task is joined through the file's cache key, so a file without
   * one is never waited on, and neither is one the pool already refused: a
   * session highlights that file locally, as a read-only render of it stays
   * plain.
   */
  awaitsPoolHighlight(file: FileContents): boolean;
  private getHighlightWorkerManager;
  private cacheHighlightResult;
  private getLocalHighlightTheme;
  getLineCutLength(options?: BaseCodeOptions): number;
  getEffectiveCodeOptions(options?: BaseCodeOptions): Pick<BaseCodeOptions, 'theme' | 'tokenizeMaxLineLength'>;
  private getRenderOptions;
  /**
   * Returns the file that the next synchronous render can commit without
   * changing the current render cache. Virtualized layouts use this to stay
   * aligned with the DOM while a replacement highlight is still pending.
   */
  getFileForNextRender(file: FileContents): FileContents;
  private canRenderFile;
  /** The number of lines the file renders, counting an empty last line. */
  getLineCount(file: FileContents): number;
  private modelFor;
  renderCollapsed(file: FileContents): CollapsedFileRenderResult | undefined;
  renderFile(file?: FileContents | undefined, renderRange?: RenderRange): FileRenderResult | undefined;
  asyncRender(file: FileContents, renderRange?: RenderRange): Promise<FileRenderResult>;
  private asyncHighlight;
  private renderFileWithHighlighter;
  private lineSnapshot;
  private getRowSource;
  private layoutInput;
  private layoutResult;
  private renderHeader;
  renderFullHTML(result: FileRenderResult): string;
  renderFullAST(result: FileRenderResult, children?: ElementContent[]): Element;
  renderCodeAST(result: FileRenderResult): ElementContent[];
  initializeHighlighter(lang?: SupportedLanguages): Promise<DiffsHighlighter>;
  onHighlightSuccess(file: FileContents, result: ThemedFileResult, options: RenderFileOptions, highlighted?: boolean): void;
  private applyHighlightResult;
  private getMatchingWorkerResultCache;
  private getReadyRenderResult;
  private hasHighlightedRenderCache;
  onHighlightError(error: unknown): void;
  onLocalFallback(): void;
  private getTokenizeMaxLength;
  private createPreElement;
}
//#endregion
export { CollapsedFileRenderResult, FileRenderResult, FileRenderer, FileRendererOptions };
//# sourceMappingURL=FileRenderer.d.ts.map