import { DiffsTheme } from "../highlighter/themes/types.js";
import { DiffLib, DiffsThemeNames, ExtensionFormatMap, FileContents, FileDiffMetadata, HighlighterTypes, LineDiffTypes, RenderDiffOptions, RenderFileOptions, SupportedLanguages, ThemedDiffResult, ThemedFileResult, ThemesType } from "../types.js";
import { LanguageRegistration } from "shiki";
import { Language } from "@pierre/highlights";
//#region src/worker/types.d.ts
type WorkerRequestId = string;
interface WorkerRenderingOptions {
  theme: DiffsThemeNames | ThemesType;
  useTokenTransformer: boolean;
  tokenizeMaxLineLength: number;
  lineDiffType: LineDiffTypes;
  preferredDiffLib?: DiffLib;
  maxLineDiffLength: number;
}
interface FileRendererInstance {
  readonly __id: string;
  onHighlightSuccess(file: FileContents, result: ThemedFileResult, options: RenderFileOptions): unknown;
  onHighlightError(error: unknown): unknown;
  /** The pool dropped this renderer's queued work. Rerender using the local
   * highlighter. */
  onLocalFallback(): unknown;
}
interface DiffRendererInstance {
  readonly __id: string;
  onHighlightSuccess(diff: FileDiffMetadata, result: ThemedDiffResult, options: RenderDiffOptions): unknown;
  onHighlightError(error: unknown): unknown;
  /** The pool dropped this renderer's queued work. Rerender using the local
   * highlighter. */
  onLocalFallback(): unknown;
}
interface RenderFileRequest {
  type: 'file';
  id: WorkerRequestId;
  file: FileContents;
  resolvedLanguages?: ResolvedLanguage[];
  customExtensionsVersion?: number;
  customExtensionMap?: ExtensionFormatMap;
}
interface RenderDiffRequest {
  type: 'diff';
  id: WorkerRequestId;
  diff: FileDiffMetadata;
  resolvedLanguages?: ResolvedLanguage[];
  customExtensionsVersion?: number;
  customExtensionMap?: ExtensionFormatMap;
}
interface InitializeWorkerRequest {
  type: 'initialize';
  id: WorkerRequestId;
  renderOptions: WorkerRenderingOptions;
  preferredHighlighter: HighlighterTypes;
  resolvedThemes: DiffsTheme[];
  resolvedLanguages?: ResolvedLanguage[];
  customExtensionsVersion?: number;
  customExtensionMap?: ExtensionFormatMap;
}
interface ResolvedLanguage {
  name: Exclude<SupportedLanguages, 'text'>;
  data: LanguageRegistration[];
  /** A lexer from `registerCustomLanguage(name, loader, files, 'highlights')`. */
  highlights?: Language;
}
interface SetRenderOptionsWorkerRequest {
  type: 'set-render-options';
  id: WorkerRequestId;
  renderOptions: WorkerRenderingOptions;
  resolvedThemes: DiffsTheme[];
}
type SubmitRequest = Omit<RenderFileRequest, 'id'> | Omit<RenderDiffRequest, 'id'>;
type WorkerRequest = RenderFileRequest | RenderDiffRequest | InitializeWorkerRequest | SetRenderOptionsWorkerRequest;
interface RenderFileSuccessResponse {
  type: 'success';
  requestType: 'file';
  id: WorkerRequestId;
  result: ThemedFileResult;
  options: RenderFileOptions;
  sentAt: number;
}
interface RenderDiffSuccessResponse {
  type: 'success';
  requestType: 'diff';
  id: WorkerRequestId;
  result: ThemedDiffResult;
  options: RenderDiffOptions;
  sentAt: number;
}
interface InitializeSuccessResponse {
  type: 'success';
  requestType: 'initialize';
  id: WorkerRequestId;
  sentAt: number;
}
interface RegisterThemeSuccessResponse {
  type: 'success';
  requestType: 'set-render-options';
  id: WorkerRequestId;
  sentAt: number;
}
interface RenderErrorResponse {
  type: 'error';
  id: WorkerRequestId;
  error: string;
  stack?: string;
}
type RenderSuccessResponse = RenderFileSuccessResponse | RenderDiffSuccessResponse;
type WorkerResponse = RenderSuccessResponse | RenderErrorResponse | InitializeSuccessResponse | RegisterThemeSuccessResponse;
interface WorkerPoolOptions {
  /**
   * Factory function that creates a new Web Worker instance for the pool.
   * Called for the initial workers and their replacements. Do not perform any
   * additional side effects in this function other than creating a worker
   * instance.
   */
  workerFactory: () => Worker;
  /**
   * Number of workers to create in the pool.
   * Defaults to one fewer than the reported logical processor count,
   * with a minimum of 1 and a maximum of 3. Uses 1 if the count is unavailable.
   */
  poolSize?: number;
  /**
   * Timeout in milliseconds for initializing a worker.
   * @default 5000
   */
  workerInitializationTimeout?: number;
  /**
   * Called for each worker error instead of logging it with console.error.
   * Call event.preventDefault() to prevent the browser from also reporting it
   * as an uncaught error.
   *
   * Script load failures may provide a plain Event without message or error;
   * uncaught exceptions provide an ErrorEvent. Components highlight on the
   * main thread if every worker slot fails to start.
   *
   * Several workers can report the same script load failure. Track errors in
   * this callback if your application should report that failure only once.
   */
  onWorkerError?: (event: ErrorEvent | Event, worker: Worker) => void;
  totalASTLRUCacheSize?: number;
  /**
   * Files and diffs with at most this many characters highlight on the main
   * thread instead of a worker. Small highlights finish faster than a worker
   * round trip, so they render highlighted without a plain-text pass. Files
   * count `contents`; diffs count both sides of the diff. Main-thread results
   * share the pool's highlight cache, and priming the cache follows the same
   * rule.
   *
   * When unset, every highlight uses a worker.
   */
  mainThreadMaxCharacters?: number;
}
interface WorkerInitializationRenderOptions extends Partial<WorkerRenderingOptions> {
  langs?: SupportedLanguages[];
  preferredHighlighter?: HighlighterTypes;
}
interface InitializeWorkerTask {
  type: 'initialize';
  id: WorkerRequestId;
  request: InitializeWorkerRequest;
  resolve(value?: undefined): void;
  reject(error: Error): void;
  requestStart: number;
}
interface SetRenderOptionsWorkerTask {
  type: 'set-render-options';
  id: WorkerRequestId;
  request: SetRenderOptionsWorkerRequest;
  resolve(value?: undefined): void;
  reject(error: Error): void;
  requestStart: number;
}
interface RenderTaskCallbacks {
  resolve(): void;
  reject(error: Error): void;
}
interface RenderFileTask {
  type: 'file';
  id: WorkerRequestId;
  request: RenderFileRequest;
  /** Cache key included in the payload when it was dispatched to the worker. */
  cacheKeyAtDispatch?: string;
  instances: Set<FileRendererInstance>;
  primeCache: boolean;
  highlightKey?: string;
  callbacks: Set<RenderTaskCallbacks>;
  renderOptionsVersion: number;
  requestStart: number;
}
interface RenderDiffTask {
  type: 'diff';
  id: WorkerRequestId;
  request: RenderDiffRequest;
  /** Cache key included in the payload when it was dispatched to the worker. */
  cacheKeyAtDispatch?: string;
  instances: Set<DiffRendererInstance>;
  primeCache: boolean;
  highlightKey?: string;
  callbacks: Set<RenderTaskCallbacks>;
  renderOptionsVersion: number;
  requestStart: number;
}
type AllWorkerTasks = InitializeWorkerTask | SetRenderOptionsWorkerTask | RenderFileTask | RenderDiffTask;
interface WorkerStats {
  managerState: 'waiting' | 'initializing' | 'initialized';
  /** The pool fell back to local highlighting after all worker slots failed. */
  workersFailed: boolean;
  configuredWorkers: number;
  totalWorkers: number;
  readyWorkers: number;
  retryingWorkerSlots: number;
  failedWorkerSlots: number;
  busyWorkers: number;
  queuedTasks: number;
  activeTasks: number;
  themeSubscribers: number;
  fileCacheSize: number;
  diffCacheSize: number;
}
//#endregion
export { AllWorkerTasks, DiffRendererInstance, FileRendererInstance, InitializeSuccessResponse, InitializeWorkerRequest, InitializeWorkerTask, RegisterThemeSuccessResponse, RenderDiffRequest, RenderDiffSuccessResponse, RenderDiffTask, RenderErrorResponse, RenderFileRequest, RenderFileSuccessResponse, RenderFileTask, RenderSuccessResponse, RenderTaskCallbacks, ResolvedLanguage, SetRenderOptionsWorkerRequest, SetRenderOptionsWorkerTask, SubmitRequest, WorkerInitializationRenderOptions, WorkerPoolOptions, WorkerRenderingOptions, WorkerRequest, WorkerRequestId, WorkerResponse, WorkerStats };
//# sourceMappingURL=types.d.ts.map