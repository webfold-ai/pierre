import { Element, ElementContent } from "../node_modules/.pnpm/@types_hast@3.0.4/node_modules/@types/hast/index.js";
import { DiffsHighlighter } from "../highlighter/DiffsHighlighter.js";
import { AnnotationSpan, BaseCodeOptions, BaseDiffOptions, BaseDiffOptionsWithDefaults, CustomPreProperties, DiffLineAnnotation, ExpandedHunksMap, ExpansionDirections, FileDiffMetadata, FileHeaderRenderMode, HighlightedToken, HunkData, HunkExpansionRegion, RenderDiffOptions, RenderRange, SupportedLanguages, ThemedDiffResult } from "../types.js";
import { DiffModelChange, DocumentLineChange, DocumentLines } from "../model/types.js";
import { StartSessionOptions } from "../model/DiffModel.js";
import { LineCuts, LineExpansion } from "../rows/LineCuts.js";
import { InjectedRow, LayoutColumns, LineDecoration, LineKey, RenderedLineContext, RowKey, SplitInjectedRow, SplitInjectedRowPlacement, SplitLineDecorationProps, UnifiedInjectedRowPlacement, UnifiedLineDecorationProps } from "../layout/RowSpec.js";
import { WorkerPoolManager } from "../worker/WorkerPoolManager.js";
import "../worker/index.js";
//#region src/renderers/DiffHunksRenderer.d.ts
interface DiffHunksRendererOptions extends BaseDiffOptions {
  headerRenderMode?: FileHeaderRenderMode;
}
interface DiffHunksRendererOptionsWithDefaults extends Omit<BaseDiffOptionsWithDefaults, 'themeType'> {
  headerRenderMode: FileHeaderRenderMode;
}
interface HunksRenderResult {
  fileDiff: FileDiffMetadata;
  /** The rows of each column, keyed, for patching the DOM by row. */
  columns: LayoutColumns;
  /**
   * True when every row was built anew, as after a new highlight result, so
   * writing the columns whole beats patching rows one by one.
   */
  allRowsChanged: boolean;
  /**
   * The rows that differ from the last result, per column, when an edit's
   * lines were the only change since it: the DOM patches these by key
   * instead of walking `columns`. Undefined when the window was laid out
   * anew.
   */
  patched: LayoutColumns | undefined;
  hunkData: HunkData[];
  preNode: Element;
  headerElement: Element | undefined;
  totalLines: number;
  themeStyles: string;
  baseThemeType: 'light' | 'dark' | undefined;
  rowCount: number;
  bufferBefore: number;
  bufferAfter: number;
}
interface CollapsedDiffRenderResult {
  headerElement: Element | undefined;
  themeStyles: string;
  baseThemeType: 'light' | 'dark' | undefined;
}
declare class DiffHunksRenderer<LAnnotation = undefined> {
  options: DiffHunksRendererOptions;
  private annotationSlotName;
  private onRenderUpdate?;
  private workerManager?;
  readonly __id: string;
  private diff;
  readonly lineCuts: LineCuts;
  private expandedHunks;
  private annotationList;
  private deletionAnnotations;
  private additionAnnotations;
  private computedLangs;
  private renderCache;
  private pendingHighlightResult;
  private layout;
  private rowSource;
  private model;
  private editSessionActive;
  constructor(options?: DiffHunksRendererOptions, annotationSlotName?: (annotation: DiffLineAnnotation<LAnnotation>) => string, onRenderUpdate?: (() => unknown) | undefined, workerManager?: WorkerPoolManager | undefined);
  cleanUp(): void;
  recycle(): void;
  /**
   * Starts editing `inputDiff`'s new file and returns the diff being edited,
   * a copy that edits change in place. Rows come from the input diff's
   * highlighted rows while a line is unchanged, and from the editor's tokens
   * once it has sent some.
   */
  startEditSession(inputDiff: FileDiffMetadata, options?: Omit<StartSessionOptions, 'parseDiffOptions'>): FileDiffMetadata;
  private promoteReadyResult;
  /**
   * Applies one change of the editor's document to the diff being edited,
   * with the tokens the editor produced for it. Returns what changed besides
   * the text: the line delta and whether collapsed regions moved.
   */
  applyChange(change: DocumentLineChange, document: DocumentLines, tokens?: ReadonlyMap<number, HighlightedToken[]>): DiffModelChange;
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
   * The document line where editing continues from an old-file line number
   * (a read-only row's `data-line`), or undefined outside every hunk.
   */
  editLineFor(deletionLineNumber: number): number | undefined;
  /**
   * Called when the editor detaches. Recomputes the hunks as a fresh diff of
   * the final text would, keeping context the user expanded, then leaves
   * edit mode. The rows stay until another diff renders. Returns whether the
   * hunks changed.
   */
  endEditSession(): boolean;
  private requireSession;
  private editSessionRows;
  /**
   * Whether the rows on screen are ones the editor can update in place: laid
   * out from a highlighted result that carries the token spans it reads.
   */
  editorRenderReady(): boolean;
  includesTrailingNewline(): boolean;
  hasTrailingNewlineRow(diff: FileDiffMetadata): boolean;
  showsNoNewlineMarkers(): boolean;
  /**
   * Re-highlights the current diff in the background and stages the fresh
   * result for the next render. Needed after an edit session's exit recompute:
   * session passes plain-fill shifted lines in the cached result, and the
   * recompute mutates the keyless session diff in place, so object identity
   * alone would otherwise treat the stale highlight as current forever. The
   * current result — content-correct, mostly highlighted — keeps rendering
   * until the fresh one is promoted, so no interim paint drops highlighting.
   */
  refreshHighlightedResult(): Promise<void>;
  private applyRefreshedResult;
  get diffCache(): FileDiffMetadata | undefined;
  private waitForLocalTheme;
  clearRenderCache(): void;
  expandLine(target: LineExpansion): void;
  setOptions(options: DiffHunksRendererOptions): void;
  mergeOptions(options: Partial<DiffHunksRendererOptions>): void;
  expandHunk(index: number, direction: ExpansionDirections, expansionLineCount?: number): void;
  private handleExpansionChange;
  getExpandedHunk(hunkIndex: number): HunkExpansionRegion;
  getExpandedHunksMap(): ExpandedHunksMap;
  /** Replace the whole expansion state, such as with a pending one. */
  setExpandedHunksMap(expandedHunks: ExpandedHunksMap): void;
  setLineAnnotations(lineAnnotations: DiffLineAnnotation<LAnnotation>[]): void;
  getUnifiedLineDecoration({ lineType }: UnifiedLineDecorationProps): LineDecoration;
  getSplitLineDecoration({ side, type }: SplitLineDecorationProps): LineDecoration;
  createAnnotationElement(span: AnnotationSpan): Element;
  getUnifiedInjectedRowsForLine?(ctx: RenderedLineContext): UnifiedInjectedRowPlacement | undefined;
  getSplitInjectedRowsForLine?(ctx: RenderedLineContext): SplitInjectedRowPlacement | undefined;
  protected getOptionsWithDefaults(): DiffHunksRendererOptionsWithDefaults;
  initializeHighlighter(langs?: SupportedLanguages[]): Promise<DiffsHighlighter>;
  hydrate(diff: FileDiffMetadata | undefined): void;
  /**
   * Whether a session started now would throw away a pool highlight that is
   * still on its way: the pool highlights `diff` with the token spans the
   * editor reads, and that result is neither rendered nor ready to render.
   * The pool task is joined through the diff's cache key, so a diff without
   * one is never waited on, and neither is one the pool already refused: a
   * session highlights that diff locally, as a read-only render of it stays
   * plain.
   */
  awaitsPoolHighlight(diff: FileDiffMetadata): boolean;
  private getHighlightWorkerManager;
  private cacheHighlightResult;
  private getLocalHighlightTheme;
  getLineCutLength(options?: BaseCodeOptions): number;
  getEffectiveCodeOptions(options?: BaseCodeOptions): Pick<BaseCodeOptions, 'theme' | 'tokenizeMaxLineLength'>;
  private getRenderOptions;
  /**
   * Returns the diff that the next synchronous render can commit without
   * changing the renderer's current diff or render cache. Components use this
   * to prepare state that must match the following DOM render.
   */
  getDiffForNextRender(diff: FileDiffMetadata): FileDiffMetadata;
  private canRenderDiff;
  renderCollapsed(diff: FileDiffMetadata): CollapsedDiffRenderResult | undefined;
  renderDiff(diff?: FileDiffMetadata | undefined, renderRange?: RenderRange): HunksRenderResult | undefined;
  asyncRender(diff: FileDiffMetadata, renderRange?: RenderRange): Promise<HunksRenderResult>;
  protected createPreElement(split: boolean, totalLines: number, customProperties?: CustomPreProperties): Element;
  private asyncHighlight;
  private renderDiffWithHighlighter;
  onHighlightSuccess(diff: FileDiffMetadata, result: ThemedDiffResult, options: RenderDiffOptions, highlighted?: boolean): void;
  private applyHighlightResult;
  private getMatchingWorkerResultCache;
  private getReadyRenderResult;
  private hasHighlightedRenderCache;
  onHighlightError(error: unknown): void;
  onLocalFallback(): void;
  private getTokenizeMaxLength;
  private layoutWithOptions;
  /**
   * The editor works in new-file lines, while a window is a range of rows
   * (separators and old-side rows included). This is the range of new-file
   * lines the window's rows show, so the editor can finish coloring exactly
   * those lines before a render.
   */
  editorRenderRange(diff: FileDiffMetadata | undefined, renderRange: RenderRange | undefined): RenderRange | undefined;
  private layoutInput;
  private layoutResult;
  private lineSnapshot;
  private getRowSource;
  renderCodeAST(type: 'unified' | 'deletions' | 'additions', result: HunksRenderResult): ElementContent[] | undefined;
  renderFullAST(result: HunksRenderResult, children?: ElementContent[]): Element;
  renderFullHTML(result: HunksRenderResult, tempChildren?: ElementContent[]): string;
  renderPartialHTML(children: ElementContent[], columnType?: 'unified' | 'deletions' | 'additions'): string;
  private renderHeader;
}
//#endregion
export { CollapsedDiffRenderResult, DiffHunksRenderer, DiffHunksRendererOptions, DiffHunksRendererOptionsWithDefaults, HunksRenderResult, type InjectedRow, type LineDecoration, type RenderedLineContext, type SplitInjectedRow, type SplitInjectedRowPlacement, type SplitLineDecorationProps, type UnifiedInjectedRowPlacement, type UnifiedLineDecorationProps };
//# sourceMappingURL=DiffHunksRenderer.d.ts.map