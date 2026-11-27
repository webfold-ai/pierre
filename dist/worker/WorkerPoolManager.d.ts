import { DiffRendererInstance, FileRendererInstance, WorkerInitializationRenderOptions, WorkerPoolOptions, WorkerRenderingOptions, WorkerStats } from "./types.js";
import { ExpandedHunksMap, FileContents, FileDiffMetadata, HighlighterTypes, RenderDiffOptions, RenderDiffResult, RenderFileOptions, RenderFileResult, SupportedLanguages, ThemedDiffResult, ThemedFileResult } from "../types.js";
import { LRUMap } from "lru_map";
//#region src/worker/WorkerPoolManager.d.ts
interface GetCachesResult {
  fileCache: LRUMap<string, RenderFileResult>;
  diffCache: LRUMap<string, RenderDiffResult>;
}
interface ThemeSubscriber {
  onThemeChange(): void;
}
type RenderTaskInstance = FileRendererInstance | DiffRendererInstance;
type LocalThemeView = Pick<RenderTaskInstance, 'onHighlightError'>;
declare class WorkerPoolManager {
  private options;
  private readonly preferredHighlighter;
  private renderOptions;
  private renderOptionsRequestVersion;
  private renderOptionsVersion;
  private initialization;
  private readonly configuredWorkers;
  private workerSlots;
  private readyWorkerCount;
  private workerSlotsExhausted;
  private resolvedWorkerThemes;
  private resolvedWorkerLanguages;
  private queuedTasks;
  private queuedTaskByInstance;
  private taskByHighlightKey;
  private failedHighlightKeys;
  private activeTaskById;
  private activeRequestByInstance;
  private nextRequestId;
  private themeSubscribers;
  private pendingThemeRenders;
  private terminated;
  private statSubscribers;
  private fileCache;
  private diffCache;
  private _queuedBroadcast;
  private lifecycleGeneration;
  constructor(options: WorkerPoolOptions, { langs, theme, useTokenTransformer, lineDiffType, preferredDiffLib, maxLineDiffLength, tokenizeMaxLineLength, preferredHighlighter }: WorkerInitializationRenderOptions);
  isWorkingPool(): boolean;
  shouldUseLocalFallback(): boolean;
  /**
   * @internal Returns true if the view must wait for the local theme. When
   * the theme is ready, calls the latest callback registered for each view.
   * Optional grammars start loading alongside the theme.
   */
  renderWhenLocalThemeLoads(view: LocalThemeView, onRenderUpdate: () => void, langs?: SupportedLanguages[]): boolean;
  /** @internal Drops the render callback `view` registered, if any. */
  cancelLocalThemeRender(view: LocalThemeView): void;
  private loadLocalThemeForRender;
  private renderPendingThemeViews;
  /**
   * Whether a file or diff fits within `mainThreadMaxCharacters`, so it
   * highlights on the main thread instead of a worker. Files count `contents`;
   * diffs count both sides.
   */
  shouldHighlightOnMainThread(fileOrDiff: FileContents | FileDiffMetadata): boolean;
  /**
   * Whether the last highlight of a file or diff failed under the current
   * render options. Inputs without a cache key are never tracked.
   */
  didHighlightFail(fileOrDiff: FileContents | FileDiffMetadata): boolean;
  getFileResultCache(file: FileContents): RenderFileResult | undefined;
  getDiffResultCache(diff: FileDiffMetadata): RenderDiffResult | undefined;
  setFileResultCache(cacheKey: string | undefined, { result, options }: RenderFileResult): boolean;
  setDiffResultCache(cacheKey: string | undefined, { result, options }: RenderDiffResult): boolean;
  inspectCaches(): GetCachesResult;
  evictFileFromCache(cacheKey: string): boolean;
  evictDiffFromCache(cacheKey: string): boolean;
  setRenderOptions({ theme, useTokenTransformer, lineDiffType, preferredDiffLib, maxLineDiffLength, tokenizeMaxLineLength }: Partial<WorkerRenderingOptions>): Promise<void>;
  getPreferredHighlighter(): HighlighterTypes;
  getFileRenderOptions(): RenderFileOptions;
  getDiffRenderOptions(): RenderDiffOptions;
  private setRenderOptionsOnWorkers;
  private setRenderOptionsOnWorker;
  subscribeToThemeChanges(instance: ThemeSubscriber): () => void;
  unsubscribeToThemeChanges(instance: ThemeSubscriber): void;
  subscribeToStatChanges(callback: (stats: WorkerStats) => unknown): () => void;
  private queueBroadcastStateChanges;
  private _broadcastStateChanges;
  cleanUpTasks(instance: RenderTaskInstance): void;
  /** Whether a worker has joined since construction or the last termination. */
  isInitialized(): boolean;
  initialize(languages?: SupportedLanguages[]): Promise<void>;
  private startPool;
  private waitForWorkerThemes;
  private preloadLocalHighlighter;
  private loadSharedHighlighter;
  /**
   * Give currently failed slots one new attempt each. Resolve when these
   * attempts settle, including if termination cancels them.
   */
  retryFailedWorkers(): Promise<WorkerStats>;
  private startWorkerAttempts;
  private startWorkerAttempt;
  private postWorkerSetup;
  private cancelWorkerSetup;
  private retireWorker;
  private failWorkerAttempt;
  private failWorkerSlot;
  private settleWorkerStartup;
  private rejectInitialization;
  private rejectAllQueuedRenderTasks;
  /**
   * Pass browser errors to onWorkerError, or log them if no callback is set.
   * Only startup errors interrupt the current request. A ready worker can
   * still acknowledge its work after an unrelated error event.
   */
  private handleWorkerError;
  private drainQueue;
  highlightFileAST(instance: FileRendererInstance, file: FileContents): void;
  primeFileHighlightCache(file: FileContents): Promise<void>;
  private shouldPrimeFileHighlightCache;
  private getOrCreateFileHighlightCacheTask;
  getPlainFileAST(file: FileContents, startingLine: number, totalLines: number, lines?: readonly string[]): ThemedFileResult | undefined;
  highlightDiffAST(instance: DiffRendererInstance, diff: FileDiffMetadata): void;
  primeDiffHighlightCache(diff: FileDiffMetadata): Promise<void>;
  private shouldPrimeDiffHighlightCache;
  private primeHighlightCacheOnMainThread;
  private getOrCreateDiffHighlightCacheTask;
  getPlainDiffAST(diff: FileDiffMetadata, startingLine: number, totalLines: number, expandedHunks?: ExpandedHunksMap | true, collapsedContextThreshold?: number): ThemedDiffResult | undefined;
  terminate(): void;
  private isCurrentLifecycle;
  initializeIfNeeded(): void;
  private queueInitialization;
  private removeAllQueuedRenderTasks;
  getStats(): WorkerStats;
  private submitTask;
  private submitCacheTask;
  private enqueueRenderTask;
  private resolveWorkerLanguages;
  private resolveLanguagesAndExecuteTask;
  private handleWorkerMessage;
  private _queuedDrain;
  private queueDrain;
  private assignWorkerToTask;
  private cleanWorkerAndTask;
  private executeTask;
  private maybeAttachCustomExtensions;
  private syncCustomExtensionVersion;
  private getAvailableWorker;
  private getFileHighlightKey;
  private getDiffHighlightKey;
  private getHighlightKeyForRequest;
  private hasActiveRequest;
  private addInstanceToTask;
  private detachInstanceFromQueuedTasks;
  private detachInstanceFromRenderTask;
  private removeQueuedTask;
  private removeActiveTask;
  private createRenderTaskCallbacks;
  private resolveRenderTaskCallbacks;
  private rejectRenderTaskCallbacks;
  private invalidateRenderTasks;
  private clearQueuedInstanceRequests;
  private clearHighlightKey;
  private trackInstanceRequests;
  private clearInstanceRequests;
  private notifyFileInstances;
  private notifyDiffInstances;
  private notifyHighlightError;
  private hasMatchingFileInstanceTask;
  private hasMatchingDiffInstanceTask;
  private getTaskByHighlightKey;
  private isCurrentRenderTask;
  private iterateRenderTasks;
  private generateRequestId;
}
//#endregion
export { WorkerPoolManager };
//# sourceMappingURL=WorkerPoolManager.d.ts.map