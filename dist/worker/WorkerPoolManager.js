import { DEFAULT_THEMES } from "../constants.js";
import { HighlighterDisposedError, resolveHighlighterType } from "../highlighter/highlighterType.js";
import { RegisteredHighlightsLanguages } from "../highlighter/languages/constants.js";
import { getThemes } from "../utils/getThemes.js";
import { getHighlighterIfLoaded, getSharedHighlighter } from "../highlighter/shared_highlighter.js";
import { areThemesEqual } from "../utils/areThemesEqual.js";
import { areLanguagesAttached } from "../highlighter/languages/areLanguagesAttached.js";
import { areFileRenderOptionsEqual } from "../utils/areFileRenderOptionsEqual.js";
import { getCustomExtensionsMap, getCustomExtensionsVersion, getFiletypeFromFileName } from "../utils/getFiletypeFromFileName.js";
import { isFilePlainText } from "../utils/isFilePlainText.js";
import { renderFileWithHighlighter } from "../utils/renderFileWithHighlighter.js";
import { WorkerPoolTaskCanceledError, WorkerPoolTerminatedError, WorkerPoolWorkerError, isHandledWorkerPoolError, markWorkerErrorReported } from "./errors.js";
import { areDiffTargetsEqual } from "../utils/areDiffTargetsEqual.js";
import { areFilesEqual } from "../utils/areFilesEqual.js";
import { areDiffRenderOptionsEqual } from "../utils/areDiffRenderOptionsEqual.js";
import { isDiffPlainText } from "../utils/isDiffPlainText.js";
import { renderDiffWithHighlighter } from "../utils/renderDiffWithHighlighter.js";
import { getResolvedLanguages } from "../highlighter/languages/getResolvedLanguages.js";
import { hasResolvedLanguages } from "../highlighter/languages/hasResolvedLanguages.js";
import { resolveLanguages } from "../highlighter/languages/resolveLanguages.js";
import { getResolvedThemes } from "../highlighter/themes/getResolvedThemes.js";
import { hasResolvedThemes } from "../highlighter/themes/hasResolvedThemes.js";
import { resolveThemes } from "../highlighter/themes/resolveThemes.js";
import { getDefaultWorkerPoolSize } from "../utils/getDefaultWorkerPoolSize.js";
import { resolveHighlightsLanguages } from "../highlighter/languages/resolveHighlightsLanguages.js";
import { decodeHastLines } from "./hastLinesTransport.js";
import LRUMapPkg from "lru_map";
//#region src/worker/WorkerPoolManager.ts
const IGNORE_RESPONSE = Symbol("IGNORE_RESPONSE");
const DEFAULT_WORKER_INITIALIZATION_TIMEOUT = 5e3;
var WorkerPoolManager = class {
	options;
	preferredHighlighter;
	renderOptions;
	renderOptionsRequestVersion = 0;
	renderOptionsVersion = 0;
	initialization;
	configuredWorkers;
	workerSlots = [];
	readyWorkerCount = 0;
	workerSlotsExhausted = false;
	resolvedWorkerThemes = [];
	resolvedWorkerLanguages = [];
	queuedTasks = [];
	queuedTaskByInstance = /* @__PURE__ */ new Map();
	taskByHighlightKey = /* @__PURE__ */ new Map();
	failedHighlightKeys;
	activeTaskById = /* @__PURE__ */ new Map();
	activeRequestByInstance = /* @__PURE__ */ new Map();
	nextRequestId = 0;
	themeSubscribers = /* @__PURE__ */ new Set();
	pendingThemeRenders = /* @__PURE__ */ new Map();
	terminated = false;
	statSubscribers = /* @__PURE__ */ new Set();
	fileCache;
	diffCache;
	_queuedBroadcast;
	lifecycleGeneration = 0;
	constructor(options, { langs, theme = DEFAULT_THEMES, useTokenTransformer = false, lineDiffType = "word-alt", preferredDiffLib, maxLineDiffLength = 1e3, tokenizeMaxLineLength = 1e3, preferredHighlighter }) {
		this.options = options;
		this.configuredWorkers = options.poolSize ?? getDefaultWorkerPoolSize();
		this.preferredHighlighter = resolveHighlighterType(preferredHighlighter);
		this.renderOptions = {
			theme,
			useTokenTransformer,
			lineDiffType,
			preferredDiffLib,
			maxLineDiffLength,
			tokenizeMaxLineLength
		};
		this.fileCache = new LRUMapPkg.LRUMap(options.totalASTLRUCacheSize ?? 100);
		this.diffCache = new LRUMapPkg.LRUMap(options.totalASTLRUCacheSize ?? 100);
		this.failedHighlightKeys = new LRUMapPkg.LRUMap(options.totalASTLRUCacheSize ?? 100);
		this.queueInitialization(langs);
	}
	isWorkingPool() {
		return !this.terminated && !this.shouldUseLocalFallback();
	}
	shouldUseLocalFallback() {
		const { initialization } = this;
		return initialization?.state === "failed" || initialization?.state === "succeeded" && this.readyWorkerCount === 0;
	}
	/**
	* @internal Returns true if the view must wait for the local theme. When
	* the theme is ready, calls the latest callback registered for each view.
	* Optional grammars start loading alongside the theme.
	*/
	renderWhenLocalThemeLoads(view, onRenderUpdate, langs = []) {
		if (getHighlighterIfLoaded({ theme: this.renderOptions.theme }) != null) {
			this.pendingThemeRenders.delete(view);
			return false;
		}
		this.pendingThemeRenders.set(view, onRenderUpdate);
		this.loadLocalThemeForRender(this.isWorkingPool() ? void 0 : view);
		if (langs.length > 0) this.loadSharedHighlighter([], langs).catch(() => {});
		return true;
	}
	/** @internal Drops the render callback `view` registered, if any. */
	cancelLocalThemeRender(view) {
		this.pendingThemeRenders.delete(view);
	}
	loadLocalThemeForRender(fallbackView) {
		const { theme } = this.renderOptions;
		const { lifecycleGeneration } = this;
		this.loadSharedHighlighter(getThemes(theme), ["text"]).then(() => {
			if (!this.terminated && !this.isCurrentLifecycle(lifecycleGeneration) || !areThemesEqual(theme, this.renderOptions.theme)) return;
			this.renderPendingThemeViews();
		}, (error) => fallbackView?.onHighlightError(error));
	}
	renderPendingThemeViews() {
		if (getHighlighterIfLoaded({ theme: this.renderOptions.theme }) == null) return;
		for (const view of [...this.pendingThemeRenders.keys()]) {
			const onRenderUpdate = this.pendingThemeRenders.get(view);
			if (onRenderUpdate == null) continue;
			this.pendingThemeRenders.delete(view);
			try {
				onRenderUpdate();
			} catch (error) {
				console.error(error);
			}
		}
	}
	/**
	* Whether a file or diff fits within `mainThreadMaxCharacters`, so it
	* highlights on the main thread instead of a worker. Files count `contents`;
	* diffs count both sides.
	*/
	shouldHighlightOnMainThread(fileOrDiff) {
		const { mainThreadMaxCharacters = -1 } = this.options;
		return ("contents" in fileOrDiff ? fileOrDiff.contents.length : fileOrDiff.deletionCharacterCount + fileOrDiff.additionCharacterCount) <= mainThreadMaxCharacters;
	}
	/**
	* Whether the last highlight of a file or diff failed under the current
	* render options. Inputs without a cache key are never tracked.
	*/
	didHighlightFail(fileOrDiff) {
		const highlightKey = "contents" in fileOrDiff ? this.getFileHighlightKey(fileOrDiff) : this.getDiffHighlightKey(fileOrDiff);
		return highlightKey != null && this.failedHighlightKeys.has(highlightKey);
	}
	getFileResultCache(file) {
		return file.cacheKey != null ? this.fileCache.get(file.cacheKey) : void 0;
	}
	getDiffResultCache(diff) {
		return diff.cacheKey != null ? this.diffCache.get(diff.cacheKey) : void 0;
	}
	setFileResultCache(cacheKey, { result, options }) {
		if (cacheKey == null || !areFileRenderOptionsEqual(options, this.getFileRenderOptions())) return false;
		this.fileCache.set(cacheKey, {
			result,
			options
		});
		this.queueBroadcastStateChanges();
		return true;
	}
	setDiffResultCache(cacheKey, { result, options }) {
		if (cacheKey == null || !areDiffRenderOptionsEqual(options, this.getDiffRenderOptions())) return false;
		this.diffCache.set(cacheKey, {
			result,
			options
		});
		this.queueBroadcastStateChanges();
		return true;
	}
	inspectCaches() {
		const { fileCache, diffCache } = this;
		return {
			fileCache,
			diffCache
		};
	}
	evictFileFromCache(cacheKey) {
		try {
			return this.fileCache.delete(cacheKey) !== void 0;
		} finally {
			this.queueBroadcastStateChanges();
		}
	}
	evictDiffFromCache(cacheKey) {
		try {
			return this.diffCache.delete(cacheKey) !== void 0;
		} finally {
			this.queueBroadcastStateChanges();
		}
	}
	async setRenderOptions({ theme = this.renderOptions.theme ?? DEFAULT_THEMES, useTokenTransformer = this.renderOptions.useTokenTransformer ?? false, lineDiffType = this.renderOptions.lineDiffType ?? "word-alt", preferredDiffLib = this.renderOptions.preferredDiffLib, maxLineDiffLength = this.renderOptions.maxLineDiffLength ?? 1e3, tokenizeMaxLineLength = this.renderOptions.tokenizeMaxLineLength ?? 1e3 }) {
		const { lifecycleGeneration } = this;
		const renderOptionsRequestVersion = ++this.renderOptionsRequestVersion;
		const isCurrentRequest = () => this.isCurrentLifecycle(lifecycleGeneration) && this.renderOptionsRequestVersion === renderOptionsRequestVersion;
		try {
			const newRenderOptions = {
				theme,
				useTokenTransformer,
				lineDiffType,
				preferredDiffLib,
				maxLineDiffLength,
				tokenizeMaxLineLength
			};
			if (this.terminated) this.queueInitialization();
			if (!isCurrentRequest() || areDiffRenderOptionsEqual(newRenderOptions, this.renderOptions)) return;
			const themeNames = getThemes(theme);
			const themeChanged = !areThemesEqual(theme, this.renderOptions.theme);
			const resolvedThemes = !themeChanged && this.resolvedWorkerThemes.length > 0 ? this.resolvedWorkerThemes : hasResolvedThemes(themeNames, this.preferredHighlighter) ? getResolvedThemes(themeNames, this.preferredHighlighter) : await resolveThemes(themeNames, this.preferredHighlighter);
			if (!isCurrentRequest()) return;
			if (getHighlighterIfLoaded({ theme }) == null) {
				await this.loadSharedHighlighter(themeNames, ["text"]);
				if (!isCurrentRequest()) return;
			}
			this.renderOptions = newRenderOptions;
			this.resolvedWorkerThemes = resolvedThemes;
			this.renderOptionsVersion++;
			if (this.initialization?.state === "pending") this.initialization.stopThemeWait?.();
			this.diffCache.clear();
			this.fileCache.clear();
			this.failedHighlightKeys.clear();
			this.invalidateRenderTasks();
			if (themeChanged && this.initialization?.state === "failed" && this.initialization.reason === "preparation") {
				const { languages } = this.initialization;
				this.initialization = void 0;
				this.queueInitialization(languages);
			}
			const workerSetup = this.setRenderOptionsOnWorkers(themeChanged);
			for (const instance of this.themeSubscribers) instance.onThemeChange();
			if (themeChanged) this.renderPendingThemeViews();
			await workerSetup;
		} catch (error) {
			if (error instanceof WorkerPoolTerminatedError || !isCurrentRequest()) return;
			throw error;
		}
	}
	getPreferredHighlighter() {
		return this.preferredHighlighter;
	}
	getFileRenderOptions() {
		const { tokenizeMaxLineLength, theme, useTokenTransformer } = this.renderOptions;
		return {
			theme,
			useTokenTransformer,
			tokenizeMaxLineLength
		};
	}
	getDiffRenderOptions() {
		return { ...this.renderOptions };
	}
	async setRenderOptionsOnWorkers(themeChanged) {
		const { renderOptionsVersion } = this;
		const taskPromises = [];
		for (const slot of this.workerSlots) {
			const { worker } = slot;
			if (slot.state === "ready" && worker != null) {
				const resolvedThemes = themeChanged || worker.pendingSetupRequestId != null ? this.resolvedWorkerThemes : [];
				taskPromises.push(this.setRenderOptionsOnWorker(worker, resolvedThemes).catch((error) => {
					if (slot.worker === worker && this.renderOptionsVersion === renderOptionsVersion) this.failWorkerSlot(slot, normalizeWorkerStartupError(error));
					throw error;
				}));
			}
		}
		await Promise.all(taskPromises);
	}
	setRenderOptionsOnWorker(managedWorker, resolvedThemes) {
		const { renderOptionsVersion } = this;
		return new Promise((resolve, reject) => {
			const id = this.generateRequestId();
			const task = {
				type: "set-render-options",
				id,
				request: {
					type: "set-render-options",
					id,
					renderOptions: this.renderOptions,
					resolvedThemes
				},
				resolve() {
					managedWorker.renderOptionsVersion = renderOptionsVersion;
					resolve();
				},
				reject,
				requestStart: Date.now()
			};
			this.postWorkerSetup(managedWorker, task);
		});
	}
	subscribeToThemeChanges(instance) {
		this.themeSubscribers.add(instance);
		this.queueBroadcastStateChanges();
		return () => {
			this.unsubscribeToThemeChanges(instance);
			this.queueBroadcastStateChanges();
		};
	}
	unsubscribeToThemeChanges(instance) {
		this.themeSubscribers.delete(instance);
		this.queueBroadcastStateChanges();
	}
	subscribeToStatChanges(callback) {
		this.statSubscribers.add(callback);
		callback(this.getStats());
		return () => {
			this.statSubscribers.delete(callback);
		};
	}
	queueBroadcastStateChanges() {
		if (this._queuedBroadcast != null) return;
		this._queuedBroadcast = requestAnimationFrame(this._broadcastStateChanges);
	}
	_broadcastStateChanges = () => {
		if (this._queuedBroadcast != null) {
			cancelAnimationFrame(this._queuedBroadcast);
			this._queuedBroadcast = void 0;
		}
		const stats = this.getStats();
		for (const callback of this.statSubscribers) callback(stats);
	};
	cleanUpTasks(instance) {
		this.detachInstanceFromQueuedTasks(instance);
		const requestId = this.activeRequestByInstance.get(instance);
		if (requestId != null) {
			const task = this.activeTaskById.get(requestId);
			if (isRenderTask(task)) {
				this.detachInstanceFromRenderTask(task, instance);
				if (!task.primeCache && task.instances.size === 0) this.removeActiveTask(task);
			} else this.activeTaskById.delete(requestId);
		}
		this.activeRequestByInstance.delete(instance);
		this.queueBroadcastStateChanges();
	}
	/** Whether a worker has joined since construction or the last termination. */
	isInitialized() {
		return this.initialization?.state === "succeeded";
	}
	async initialize(languages) {
		const { initialization: current } = this;
		if (current?.state === "succeeded") {
			if (getHighlighterIfLoaded({ theme: this.renderOptions.theme }) == null) await this.preloadLocalHighlighter(languages ?? []);
			return;
		}
		if (current?.state === "pending") return current.promise;
		if (current?.state === "failed") {
			if (current.reason === "workers") throw current.error;
			languages ??= current.languages;
		}
		this.terminated = false;
		const initialization = this.initialization = {
			state: "pending",
			promise: Promise.resolve(),
			resolve() {},
			reject() {}
		};
		initialization.promise = new Promise((resolve, reject) => {
			initialization.resolve = resolve;
			initialization.reject = reject;
		});
		this.workerSlots = Array.from({ length: this.configuredWorkers }, () => ({ state: "starting" }));
		this.startPool(initialization, languages ?? []);
		this.queueBroadcastStateChanges();
		return initialization.promise;
	}
	async startPool(initialization, languages) {
		const { lifecycleGeneration, renderOptionsVersion } = this;
		const themes = getThemes(this.renderOptions.theme);
		this.preloadLocalHighlighter(languages).catch((error) => {
			if (this.isCurrentLifecycle(lifecycleGeneration)) console.error(error);
		});
		try {
			try {
				const resolvedThemes = hasResolvedThemes(themes, this.preferredHighlighter) ? getResolvedThemes(themes, this.preferredHighlighter) : await this.waitForWorkerThemes(initialization, themes);
				if (this.initialization === initialization && this.renderOptionsVersion === renderOptionsVersion) this.resolvedWorkerThemes = resolvedThemes;
			} catch (error) {
				if (this.renderOptionsVersion === renderOptionsVersion) throw error;
			}
			if (this.initialization !== initialization) return;
			const resolving = this.resolveWorkerLanguages(languages);
			const resolvedLanguages = Array.isArray(resolving) ? resolving : await resolving;
			if (this.initialization !== initialization) return;
			this.resolvedWorkerLanguages = resolvedLanguages;
			if (this.workerSlots.length === 0) {
				const error = new WorkerPoolWorkerError("WorkerPoolManager: no workers configured");
				this.workerSlotsExhausted = true;
				this.rejectInitialization(initialization, {
					reason: "workers",
					error
				});
				this.rejectAllQueuedRenderTasks(error);
				return;
			}
			this.startWorkerAttempts(this.workerSlots, "starting");
		} catch (error) {
			if (this.initialization !== initialization) return;
			this.workerSlots = [];
			const setupError = normalizeWorkerError(error);
			this.rejectInitialization(initialization, {
				reason: "preparation",
				error: setupError,
				languages: [...languages]
			});
			this.rejectAllQueuedRenderTasks(setupError);
		}
	}
	waitForWorkerThemes(initialization, themes) {
		const stopped = new Promise((resolve) => {
			initialization.stopThemeWait = () => resolve(this.resolvedWorkerThemes);
		});
		return Promise.race([resolveThemes(themes, this.preferredHighlighter), stopped]);
	}
	preloadLocalHighlighter(languages) {
		if (this.pendingThemeRenders.size > 0) this.loadLocalThemeForRender();
		return this.loadSharedHighlighter(getThemes(this.renderOptions.theme), ["text", ...languages]);
	}
	async loadSharedHighlighter(themes, langs) {
		try {
			await getSharedHighlighter({
				themes,
				langs,
				preferredHighlighter: this.preferredHighlighter
			});
		} catch (error) {
			if (!(error instanceof HighlighterDisposedError)) throw error;
		}
	}
	/**
	* Give currently failed slots one new attempt each. Resolve when these
	* attempts settle, including if termination cancels them.
	*/
	async retryFailedWorkers() {
		const failedSlots = this.workerSlots.filter((slot) => slot.state === "failed");
		if (failedSlots.length > 0) await Promise.all(this.startWorkerAttempts(failedSlots, "retrying"));
		return this.getStats();
	}
	startWorkerAttempts(slots, state) {
		const settlements = slots.map((slot) => new Promise((resolve) => {
			const startup = { resolve };
			slot.startup = startup;
			slot.state = state;
			slot.error = void 0;
			this.startWorkerAttempt(slot, startup);
		}));
		this.queueBroadcastStateChanges();
		return settlements;
	}
	async startWorkerAttempt(slot, startup) {
		const timeoutMs = this.options.workerInitializationTimeout ?? DEFAULT_WORKER_INITIALIZATION_TIMEOUT;
		startup.timeout = setTimeout(() => {
			this.failWorkerAttempt(slot, startup, new WorkerPoolWorkerError(`WorkerPoolManager: worker initialization timed out after ${timeoutMs}ms`));
		}, timeoutMs);
		try {
			const worker = this.options.workerFactory();
			const managedWorker = {
				worker,
				requestId: void 0,
				pendingSetupRequestId: void 0,
				renderOptionsVersion: this.renderOptionsVersion,
				langs: /* @__PURE__ */ new Set(["text", ...this.resolvedWorkerLanguages.map(({ name }) => name)]),
				customExtensionsVersion: 0
			};
			slot.worker = managedWorker;
			worker.addEventListener("message", (event) => {
				if (slot.worker === managedWorker) this.handleWorkerMessage(managedWorker, event.data);
			});
			worker.addEventListener("error", (event) => {
				if (slot.worker === managedWorker) this.handleWorkerError(slot, managedWorker, event);
			});
			await new Promise((resolve, reject) => {
				const id = this.generateRequestId();
				const task = {
					type: "initialize",
					id,
					request: {
						type: "initialize",
						resultFormat: "hast-ops-v1",
						id,
						renderOptions: this.renderOptions,
						preferredHighlighter: this.preferredHighlighter,
						resolvedThemes: this.resolvedWorkerThemes,
						resolvedLanguages: this.resolvedWorkerLanguages
					},
					resolve,
					reject,
					requestStart: Date.now()
				};
				this.postWorkerSetup(managedWorker, task);
			});
			while (slot.startup === startup && managedWorker.renderOptionsVersion !== this.renderOptionsVersion) await this.setRenderOptionsOnWorker(managedWorker, this.resolvedWorkerThemes);
			if (slot.startup !== startup) return;
			slot.state = "ready";
			this.settleWorkerStartup(slot);
			this.readyWorkerCount++;
			this.workerSlotsExhausted = false;
			const { initialization } = this;
			if (initialization?.state !== "succeeded") {
				this.initialization = { state: "succeeded" };
				if (initialization?.state === "pending") initialization.resolve();
			}
			this.queueDrain();
			this.queueBroadcastStateChanges();
		} catch (cause) {
			this.failWorkerAttempt(slot, startup, cause);
		}
	}
	postWorkerSetup(worker, task) {
		this.cancelWorkerSetup(worker);
		this.activeTaskById.set(task.id, task);
		worker.pendingSetupRequestId = task.id;
		this.executeTask(worker, task);
	}
	cancelWorkerSetup(worker, error) {
		const { pendingSetupRequestId } = worker;
		if (pendingSetupRequestId != null) {
			const task = this.activeTaskById.get(pendingSetupRequestId);
			if (task?.type === "initialize" || task?.type === "set-render-options") task.reject(error ?? new WorkerPoolTaskCanceledError());
			this.cleanWorkerAndTask(worker, task, pendingSetupRequestId);
		}
	}
	retireWorker(slot, error) {
		const { worker } = slot;
		if (worker == null) return;
		slot.worker = void 0;
		this.cancelWorkerSetup(worker, error);
		worker.worker.terminate();
	}
	failWorkerAttempt(slot, startup, cause) {
		if (slot.startup !== startup) return;
		const error = normalizeWorkerStartupError(cause);
		if (slot.state !== "starting") {
			this.failWorkerSlot(slot, error);
			return;
		}
		clearTimeout(startup.timeout);
		const replacement = { resolve: startup.resolve };
		slot.startup = replacement;
		slot.state = "retrying";
		this.retireWorker(slot, error);
		this.queueBroadcastStateChanges();
		this.startWorkerAttempt(slot, replacement);
	}
	failWorkerSlot(slot, error) {
		const wasReady = slot.state === "ready";
		this.retireWorker(slot, error);
		slot.state = "failed";
		slot.error = error;
		this.settleWorkerStartup(slot);
		if (wasReady) this.readyWorkerCount--;
		this.queueBroadcastStateChanges();
		if (this.readyWorkerCount > 0 || this.workerSlotsExhausted) return;
		const errors = this.workerSlots.map(({ error }) => error);
		if (!errors.every((error) => error != null)) {
			if (wasReady) this.rejectAllQueuedRenderTasks(slot.error);
			return;
		}
		this.workerSlotsExhausted = true;
		const poolError = errors.length === 1 ? slot.error : new WorkerPoolWorkerError(`WorkerPoolManager: all ${errors.length} worker slots failed`, { cause: new AggregateError(errors, "Worker slot failures") });
		if (errors.length > 1 && errors.every(isHandledWorkerPoolError)) markWorkerErrorReported(poolError);
		const { initialization } = this;
		if (initialization?.state === "pending") this.rejectInitialization(initialization, {
			reason: "workers",
			error: poolError
		});
		this.rejectAllQueuedRenderTasks(poolError);
	}
	settleWorkerStartup(slot) {
		const { startup } = slot;
		if (startup != null) {
			slot.startup = void 0;
			clearTimeout(startup.timeout);
			startup.resolve();
		}
	}
	rejectInitialization(initialization, failure) {
		this.initialization = {
			state: "failed",
			...failure
		};
		initialization.reject(failure.error);
	}
	rejectAllQueuedRenderTasks(error) {
		const instances = /* @__PURE__ */ new Set();
		for (const task of this.removeAllQueuedRenderTasks()) {
			this.rejectRenderTaskCallbacks(task, error);
			for (const instance of getInstances(task)) instances.add(instance);
		}
		this.queueBroadcastStateChanges();
		for (const instance of instances) try {
			instance.onLocalFallback();
		} catch (callbackError) {
			console.error(callbackError);
		}
	}
	/**
	* Pass browser errors to onWorkerError, or log them if no callback is set.
	* Only startup errors interrupt the current request. A ready worker can
	* still acknowledge its work after an unrelated error event.
	*/
	handleWorkerError(slot, managedWorker, event) {
		const { onWorkerError } = this.options;
		if (onWorkerError != null) try {
			onWorkerError(event, managedWorker.worker);
		} catch (hookError) {
			console.error("WorkerPoolManager: onWorkerError threw:", hookError);
		}
		else console.error("Worker error:", event, managedWorker);
		const { pendingSetupRequestId } = managedWorker;
		if (slot.startup == null || pendingSetupRequestId == null) return;
		const task = this.activeTaskById.get(pendingSetupRequestId);
		if (task == null || !("reject" in task)) return;
		const error = errorFromWorkerErrorEvent(event);
		if (onWorkerError != null) markWorkerErrorReported(error);
		this.cleanWorkerAndTask(managedWorker, task);
		task.reject(error);
	}
	drainQueue = () => {
		this._queuedDrain = void 0;
		if (this.readyWorkerCount === 0 || this.queuedTasks.length === 0) return;
		for (let i = 0; i < this.queuedTasks.length;) {
			const task = this.queuedTasks[i];
			if (this.hasActiveRequest(task)) {
				i++;
				continue;
			}
			const langs = getLangsFromRequest(task.request);
			const availableWorker = this.getAvailableWorker(langs);
			if (availableWorker == null) break;
			this.queuedTasks.splice(i, 1);
			this.assignWorkerToTask(task, availableWorker);
			this.resolveLanguagesAndExecuteTask(availableWorker, task, langs);
		}
		this.queueBroadcastStateChanges();
	};
	highlightFileAST(instance, file) {
		const cachedResult = this.getFileResultCache(file);
		if (isFilePlainText(file) || cachedResult != null && areFileRenderOptionsEqual(cachedResult.options, this.getFileRenderOptions())) return;
		if (!this.hasMatchingFileInstanceTask(instance, file)) this.submitTask(instance, {
			type: "file",
			file
		});
	}
	primeFileHighlightCache(file) {
		if (!this.isWorkingPool()) return Promise.reject(/* @__PURE__ */ new Error("WorkerPoolManager.primeFileHighlightCache: worker pool is not working"));
		if (!this.shouldPrimeFileHighlightCache(file)) return Promise.resolve();
		if (this.shouldHighlightOnMainThread(file)) {
			const options = this.getFileRenderOptions();
			return this.primeHighlightCacheOnMainThread(getLangsFromRequest({
				type: "file",
				file
			}), options.theme, (highlighter) => this.setFileResultCache(file.cacheKey, {
				result: renderFileWithHighlighter(file, highlighter, options),
				options
			}));
		}
		const task = this.getOrCreateFileHighlightCacheTask(file);
		return task != null ? this.createRenderTaskCallbacks(task) : Promise.resolve();
	}
	shouldPrimeFileHighlightCache(file) {
		if (file.cacheKey == null) {
			console.warn(`WorkerPoolManager.primeFileHighlightCache: priming highlight cache requires file.cacheKey; skipping "${file.name}".`);
			return false;
		}
		const cachedResult = this.getFileResultCache(file);
		return !isFilePlainText(file) && (cachedResult == null || !areFileRenderOptionsEqual(cachedResult.options, this.getFileRenderOptions()));
	}
	getOrCreateFileHighlightCacheTask(file) {
		const highlightKey = this.getFileHighlightKey(file);
		if (highlightKey == null) return;
		const existingTask = this.getTaskByHighlightKey(highlightKey);
		if (existingTask != null) {
			if (existingTask.type !== "file") throw new Error("WorkerPoolManager.getOrCreateFileHighlightCacheTask: Invalid task type");
			existingTask.primeCache = true;
			return existingTask;
		} else {
			const task = this.submitCacheTask({
				type: "file",
				file
			}, highlightKey);
			if (task.type !== "file") throw new Error("WorkerPoolManager.getOrCreateFileHighlightCacheTask: Invalid task created");
			return task;
		}
	}
	getPlainFileAST(file, startingLine, totalLines, lines) {
		const highlighter = getHighlighterIfLoaded({ theme: this.renderOptions.theme });
		if (highlighter == null) {
			this.queueInitialization();
			return;
		}
		return renderFileWithHighlighter(file, highlighter, this.renderOptions, {
			forcePlainText: true,
			startingLine,
			totalLines,
			lines
		});
	}
	highlightDiffAST(instance, diff) {
		const cachedResult = this.getDiffResultCache(diff);
		if (isDiffPlainText(diff) || cachedResult != null && areDiffRenderOptionsEqual(cachedResult.options, this.getDiffRenderOptions())) return;
		if (!this.hasMatchingDiffInstanceTask(instance, diff)) this.submitTask(instance, {
			type: "diff",
			diff
		});
	}
	primeDiffHighlightCache(diff) {
		if (!this.isWorkingPool()) return Promise.reject(/* @__PURE__ */ new Error("WorkerPoolManager.primeDiffHighlightCache: worker pool is not working"));
		if (!this.shouldPrimeDiffHighlightCache(diff)) return Promise.resolve();
		if (this.shouldHighlightOnMainThread(diff)) {
			const options = this.getDiffRenderOptions();
			return this.primeHighlightCacheOnMainThread(getLangsFromRequest({
				type: "diff",
				diff
			}), options.theme, (highlighter) => this.setDiffResultCache(diff.cacheKey, {
				result: renderDiffWithHighlighter(diff, highlighter, options),
				options
			}));
		}
		const task = this.getOrCreateDiffHighlightCacheTask(diff);
		return task != null ? this.createRenderTaskCallbacks(task) : Promise.resolve();
	}
	shouldPrimeDiffHighlightCache(diff) {
		if (diff.cacheKey == null) {
			console.warn(`WorkerPoolManager.primeDiffHighlightCache: priming highlight cache requires diff.cacheKey; skipping "${diff.prevName ?? diff.name}" -> "${diff.name}".`);
			return false;
		}
		const cachedResult = this.getDiffResultCache(diff);
		return !isDiffPlainText(diff) && (cachedResult == null || !areDiffRenderOptionsEqual(cachedResult.options, this.getDiffRenderOptions()));
	}
	primeHighlightCacheOnMainThread(langs, theme, highlightAndCacheResult) {
		function highlightAndCacheIfLoaded() {
			const highlighter = getHighlighterIfLoaded({
				theme,
				langs
			});
			return highlighter != null && highlightAndCacheResult(highlighter);
		}
		if (highlightAndCacheIfLoaded()) return Promise.resolve();
		const { lifecycleGeneration } = this;
		return this.loadSharedHighlighter(getThemes(theme), ["text", ...langs]).then(() => {
			if (!this.isCurrentLifecycle(lifecycleGeneration)) throw new WorkerPoolTerminatedError();
			if (!highlightAndCacheIfLoaded()) throw new WorkerPoolTaskCanceledError();
		});
	}
	getOrCreateDiffHighlightCacheTask(diff) {
		const highlightKey = this.getDiffHighlightKey(diff);
		if (highlightKey == null) return;
		const existingTask = this.getTaskByHighlightKey(highlightKey);
		if (existingTask != null) {
			if (existingTask.type !== "diff") throw new Error("WorkerPoolManager.getOrCreateDiffHighlightCacheTask: Invalid task type");
			existingTask.primeCache = true;
			return existingTask;
		} else {
			const task = this.submitCacheTask({
				type: "diff",
				diff
			}, highlightKey);
			if (task.type !== "diff") throw new Error("WorkerPoolManager.getOrCreateDiffHighlightCacheTask: Invalid task created");
			return task;
		}
	}
	getPlainDiffAST(diff, startingLine, totalLines, expandedHunks, collapsedContextThreshold) {
		const highlighter = getHighlighterIfLoaded({ theme: this.renderOptions.theme });
		if (highlighter == null) {
			this.queueInitialization();
			return;
		}
		return renderDiffWithHighlighter(diff, highlighter, this.renderOptions, {
			forcePlainText: true,
			startingLine,
			totalLines,
			expandedHunks,
			collapsedContextThreshold
		});
	}
	terminate() {
		this.lifecycleGeneration++;
		const error = new WorkerPoolTerminatedError();
		this.terminated = true;
		this.readyWorkerCount = 0;
		this.workerSlotsExhausted = false;
		if (this.initialization?.state === "pending") {
			this.initialization.stopThemeWait?.();
			this.initialization.resolve();
		}
		this.initialization = void 0;
		for (const slot of this.workerSlots) {
			this.settleWorkerStartup(slot);
			this.retireWorker(slot, error);
		}
		this.workerSlots.length = 0;
		this.resolvedWorkerThemes.length = 0;
		this.resolvedWorkerLanguages.length = 0;
		for (const task of this.removeAllQueuedRenderTasks()) this.rejectRenderTaskCallbacks(task, error);
		for (const task of this.activeTaskById.values()) if ("reject" in task) task.reject(error);
		else if (isRenderTask(task)) this.rejectRenderTaskCallbacks(task, error);
		this.fileCache.clear();
		this.diffCache.clear();
		this.failedHighlightKeys.clear();
		this.activeRequestByInstance.clear();
		this.taskByHighlightKey.clear();
		this.activeTaskById.clear();
		this.queueBroadcastStateChanges();
	}
	isCurrentLifecycle(lifecycleGeneration) {
		return this.lifecycleGeneration === lifecycleGeneration;
	}
	initializeIfNeeded() {
		if (this.initialization == null) this.queueInitialization();
	}
	queueInitialization(languages) {
		if (this.initialization?.state === "failed") return;
		this.initialize(languages).catch((error) => {
			if (isHandledWorkerPoolError(error)) return;
			console.error(error);
		});
	}
	removeAllQueuedRenderTasks() {
		const { queuedTasks } = this;
		this.queuedTasks = [];
		this.queuedTaskByInstance.clear();
		for (const task of queuedTasks) this.clearHighlightKey(task);
		return queuedTasks;
	}
	getStats() {
		const initializationState = this.initialization?.state;
		let totalWorkers = 0;
		let busyWorkers = 0;
		let retryingWorkerSlots = 0;
		let failedWorkerSlots = 0;
		for (const { state, worker } of this.workerSlots) {
			if (worker != null) {
				totalWorkers++;
				if (worker.requestId != null || worker.pendingSetupRequestId != null) busyWorkers++;
			}
			switch (state) {
				case "retrying":
					retryingWorkerSlots++;
					break;
				case "failed": failedWorkerSlots++;
			}
		}
		return {
			managerState: initializationState === "succeeded" ? "initialized" : initializationState === "pending" ? "initializing" : "waiting",
			configuredWorkers: this.configuredWorkers,
			totalWorkers,
			readyWorkers: this.readyWorkerCount,
			retryingWorkerSlots,
			failedWorkerSlots,
			workersFailed: this.workerSlotsExhausted,
			busyWorkers,
			queuedTasks: this.queuedTasks.length,
			activeTasks: this.activeTaskById.size,
			themeSubscribers: this.themeSubscribers.size,
			fileCacheSize: this.fileCache.size,
			diffCacheSize: this.diffCache.size
		};
	}
	submitTask(instance, request) {
		if (this.shouldUseLocalFallback()) return;
		this.initializeIfNeeded();
		const highlightKey = this.getHighlightKeyForRequest(request);
		const existingTask = highlightKey != null ? this.getTaskByHighlightKey(highlightKey) : void 0;
		if (existingTask != null) {
			this.detachInstanceFromQueuedTasks(instance, existingTask);
			this.addInstanceToTask(existingTask, instance);
			this.queueBroadcastStateChanges();
			return;
		}
		this.detachInstanceFromQueuedTasks(instance);
		const id = this.generateRequestId();
		const requestStart = Date.now();
		const { renderOptionsVersion } = this;
		const task = (() => {
			switch (request.type) {
				case "file": return {
					type: "file",
					id,
					request: {
						...request,
						id
					},
					instances: /* @__PURE__ */ new Set([instance]),
					primeCache: false,
					highlightKey,
					callbacks: /* @__PURE__ */ new Set(),
					renderOptionsVersion,
					requestStart
				};
				case "diff": return {
					type: "diff",
					id,
					request: {
						...request,
						id
					},
					instances: /* @__PURE__ */ new Set([instance]),
					primeCache: false,
					highlightKey,
					callbacks: /* @__PURE__ */ new Set(),
					renderOptionsVersion,
					requestStart
				};
			}
		})();
		this.enqueueRenderTask(task, instance);
	}
	submitCacheTask(request, highlightKey) {
		this.initializeIfNeeded();
		const id = this.generateRequestId();
		const requestStart = Date.now();
		const { renderOptionsVersion } = this;
		const task = (() => {
			switch (request.type) {
				case "file": return {
					type: "file",
					id,
					request: {
						...request,
						id
					},
					instances: /* @__PURE__ */ new Set(),
					primeCache: true,
					highlightKey,
					callbacks: /* @__PURE__ */ new Set(),
					renderOptionsVersion,
					requestStart
				};
				case "diff": return {
					type: "diff",
					id,
					request: {
						...request,
						id
					},
					instances: /* @__PURE__ */ new Set(),
					primeCache: true,
					highlightKey,
					callbacks: /* @__PURE__ */ new Set(),
					renderOptionsVersion,
					requestStart
				};
			}
		})();
		this.enqueueRenderTask(task);
		return task;
	}
	enqueueRenderTask(task, instance) {
		this.queuedTasks.push(task);
		if (instance != null) this.queuedTaskByInstance.set(instance, task);
		if (task.highlightKey != null) this.taskByHighlightKey.set(task.highlightKey, task);
		this.queueDrain();
	}
	resolveWorkerLanguages(langs) {
		if (this.preferredHighlighter === "highlights") return resolveHighlightsLanguages(langs);
		return hasResolvedLanguages(langs) ? getResolvedLanguages(langs) : resolveLanguages(langs);
	}
	async resolveLanguagesAndExecuteTask(availableWorker, task, langs) {
		try {
			const highlighter = getHighlighterIfLoaded();
			const mainThreadLangs = langs.filter((lang) => highlighter == null || !areLanguagesAttached(lang, highlighter));
			if (mainThreadLangs.length > 0) this.loadSharedHighlighter(getThemes(this.renderOptions.theme), ["text", ...mainThreadLangs]).catch((error) => {
				console.error(error);
			});
			const workerMissingLangs = langs.filter((lang) => !availableWorker.langs.has(lang) && (this.preferredHighlighter !== "highlights" || RegisteredHighlightsLanguages.has(lang)));
			if (workerMissingLangs.length > 0) {
				const resolving = this.resolveWorkerLanguages(workerMissingLangs);
				task.request.resolvedLanguages = Array.isArray(resolving) ? resolving : await resolving;
			}
			if (!this.activeTaskById.has(task.id)) {
				if (availableWorker.requestId === task.id) {
					this.cleanWorkerAndTask(availableWorker, task);
					this.queueBroadcastStateChanges();
					if (this.queuedTasks.length > 0) this.queueDrain();
				}
				return;
			}
			this.executeTask(availableWorker, task);
		} catch (error) {
			this.notifyHighlightError(task, error);
			this.rejectRenderTaskCallbacks(task, normalizeWorkerError(error));
			this.cleanWorkerAndTask(availableWorker, task);
			this.queueBroadcastStateChanges();
			if (this.queuedTasks.length > 0) this.queueDrain();
		}
	}
	handleWorkerMessage(managedWorker, response) {
		const task = this.activeTaskById.get(response.id);
		try {
			if (task == null) throw IGNORE_RESPONSE;
			else if (response.type === "error") {
				const error = new Error(response.error);
				if (response.stack) error.stack = response.stack;
				if ("reject" in task) task.reject(error);
				else if (isRenderTask(task)) {
					this.notifyHighlightError(task, error);
					this.rejectRenderTaskCallbacks(task, error);
				} else throw new Error("handleWorkerMessage: unknown task type");
				throw error;
			} else {
				if (isRenderTask(task)) for (const { name } of task.request.resolvedLanguages ?? []) managedWorker.langs.add(name);
				switch (response.requestType) {
					case "initialize":
						if (task.type !== "initialize") throw new Error("handleWorkerMessage: task/response dont match");
						this.syncCustomExtensionVersion(managedWorker, task.request);
						task.resolve();
						break;
					case "set-render-options":
						if (task.type !== "set-render-options") throw new Error("handleWorkerMessage: task/response dont match");
						task.resolve();
						break;
					case "file": {
						if (task.type !== "file") throw new Error("handleWorkerMessage: task/response dont match");
						const { options } = response;
						if (!this.isCurrentRenderTask(task) || !areFileRenderOptionsEqual(options, this.getFileRenderOptions())) throw IGNORE_RESPONSE;
						const { request } = task;
						const result = {
							...response.result,
							code: decodeHastLines(response.result.code)
						};
						this.syncCustomExtensionVersion(managedWorker, request);
						if (task.cacheKeyAtDispatch != null) this.fileCache.set(task.cacheKeyAtDispatch, {
							result,
							options
						});
						this.resolveRenderTaskCallbacks(task);
						this.notifyFileInstances(task, result, options);
						break;
					}
					case "diff": {
						if (task.type !== "diff") throw new Error("handleWorkerMessage: task/response dont match");
						const { options } = response;
						if (!this.isCurrentRenderTask(task) || !areDiffRenderOptionsEqual(options, this.getDiffRenderOptions())) throw IGNORE_RESPONSE;
						const { request } = task;
						const result = {
							...response.result,
							code: {
								deletionLines: decodeHastLines(response.result.code.deletionLines),
								additionLines: decodeHastLines(response.result.code.additionLines)
							}
						};
						this.syncCustomExtensionVersion(managedWorker, request);
						if (task.cacheKeyAtDispatch != null) this.diffCache.set(task.cacheKeyAtDispatch, {
							result,
							options
						});
						this.resolveRenderTaskCallbacks(task);
						this.notifyDiffInstances(task, result, options);
						break;
					}
				}
			}
		} catch (error) {
			if (error !== IGNORE_RESPONSE) console.error(error, task, response);
		}
		this.cleanWorkerAndTask(managedWorker, task, response.id);
		this.queueBroadcastStateChanges();
		if (this.queuedTasks.length > 0) this.queueDrain();
	}
	_queuedDrain;
	queueDrain() {
		if (this._queuedDrain != null) return;
		this._queuedDrain = Promise.resolve().then(this.drainQueue);
		this.queueBroadcastStateChanges();
	}
	assignWorkerToTask(task, managedWorker) {
		managedWorker.requestId = task.id;
		this.clearQueuedInstanceRequests(task);
		this.trackInstanceRequests(task);
		this.activeTaskById.set(task.id, task);
	}
	cleanWorkerAndTask(managedWorker, task, requestId = task?.id) {
		if (managedWorker.requestId === requestId) managedWorker.requestId = void 0;
		if (managedWorker.pendingSetupRequestId === requestId) managedWorker.pendingSetupRequestId = void 0;
		if (task != null) {
			if (isRenderTask(task)) {
				this.rejectRenderTaskCallbacks(task, new WorkerPoolTaskCanceledError());
				this.clearInstanceRequests(task);
				this.clearHighlightKey(task);
			}
			this.activeTaskById.delete(task.id);
		}
	}
	executeTask(managedWorker, task) {
		if (shouldSyncCustomExtensions(task.request)) this.maybeAttachCustomExtensions(managedWorker, task.request);
		try {
			if (task.type === "file") task.cacheKeyAtDispatch = task.request.file.cacheKey;
			else if (task.type === "diff") task.cacheKeyAtDispatch = task.request.diff.cacheKey;
			managedWorker.worker.postMessage(task.request);
		} catch (error) {
			console.error("Failed to post message to worker:", error);
			if (isRenderTask(task)) {
				this.notifyHighlightError(task, error);
				this.rejectRenderTaskCallbacks(task, normalizeWorkerError(error));
			} else if ("reject" in task) task.reject(error);
			this.cleanWorkerAndTask(managedWorker, task);
			if (this.queuedTasks.length > 0) this.queueDrain();
		}
		this.queueBroadcastStateChanges();
	}
	maybeAttachCustomExtensions(managedWorker, request) {
		if (request.customExtensionsVersion != null) return;
		const version = getCustomExtensionsVersion();
		if (managedWorker.customExtensionsVersion >= version) return;
		request.customExtensionsVersion = version;
		request.customExtensionMap = getCustomExtensionsMap();
	}
	syncCustomExtensionVersion(managedWorker, request) {
		if (request.customExtensionsVersion == null) return;
		managedWorker.customExtensionsVersion = request.customExtensionsVersion;
	}
	getAvailableWorker(langs) {
		let worker;
		for (const { state, worker: managedWorker } of this.workerSlots) {
			if (state !== "ready" || managedWorker == null || managedWorker.requestId != null || managedWorker.pendingSetupRequestId != null || managedWorker.renderOptionsVersion !== this.renderOptionsVersion) continue;
			worker = managedWorker;
			if (langs.length === 0) break;
			let hasEveryLang = true;
			for (const lang of langs) if (!managedWorker.langs.has(lang) && (this.preferredHighlighter !== "highlights" || RegisteredHighlightsLanguages.has(lang))) {
				hasEveryLang = false;
				break;
			}
			if (hasEveryLang) break;
		}
		return worker;
	}
	getFileHighlightKey(file) {
		if (file.cacheKey == null) return;
		return `file:${file.cacheKey}:${this.renderOptionsVersion}`;
	}
	getDiffHighlightKey(diff) {
		if (diff.cacheKey == null) return;
		return `diff:${diff.cacheKey}:${this.renderOptionsVersion}`;
	}
	getHighlightKeyForRequest(request) {
		switch (request.type) {
			case "file": return this.getFileHighlightKey(request.file);
			case "diff": return this.getDiffHighlightKey(request.diff);
		}
	}
	hasActiveRequest(task) {
		for (const instance of getInstances(task)) if (this.activeRequestByInstance.has(instance)) return true;
		return false;
	}
	addInstanceToTask(task, instance) {
		if (task.type === "file") task.instances.add(instance);
		else task.instances.add(instance);
		if (this.activeTaskById.has(task.id)) this.activeRequestByInstance.set(instance, task.id);
		else this.queuedTaskByInstance.set(instance, task);
	}
	detachInstanceFromQueuedTasks(instance, exceptTask) {
		const task = this.queuedTaskByInstance.get(instance);
		if (task == null || task === exceptTask) return;
		this.queuedTaskByInstance.delete(instance);
		this.detachInstanceFromRenderTask(task, instance);
		if (!task.primeCache && task.instances.size === 0) this.removeQueuedTask(task);
	}
	detachInstanceFromRenderTask(task, instance) {
		if (task.type === "file") task.instances.delete(instance);
		else task.instances.delete(instance);
	}
	removeQueuedTask(task) {
		const index = this.queuedTasks.indexOf(task);
		if (index !== -1) this.queuedTasks.splice(index, 1);
		this.rejectRenderTaskCallbacks(task, new WorkerPoolTaskCanceledError());
		this.clearQueuedInstanceRequests(task);
		this.clearHighlightKey(task);
	}
	removeActiveTask(task) {
		this.rejectRenderTaskCallbacks(task, new WorkerPoolTaskCanceledError());
		this.clearInstanceRequests(task);
		this.clearHighlightKey(task);
		this.activeTaskById.delete(task.id);
	}
	createRenderTaskCallbacks(task) {
		return new Promise((resolve, reject) => {
			task.callbacks.add({
				resolve,
				reject
			});
		});
	}
	resolveRenderTaskCallbacks(task) {
		if (task.highlightKey != null) this.failedHighlightKeys.delete(task.highlightKey);
		for (const callbacks of task.callbacks) callbacks.resolve();
		task.callbacks.clear();
	}
	rejectRenderTaskCallbacks(task, error) {
		for (const callbacks of task.callbacks) callbacks.reject(error);
		task.callbacks.clear();
	}
	invalidateRenderTasks() {
		for (let index = this.queuedTasks.length - 1; index >= 0; index--) {
			const task = this.queuedTasks[index];
			if (task.renderOptionsVersion !== this.renderOptionsVersion) this.removeQueuedTask(task);
		}
		for (const task of Array.from(this.activeTaskById.values())) if (isRenderTask(task) && task.renderOptionsVersion !== this.renderOptionsVersion) this.removeActiveTask(task);
	}
	clearQueuedInstanceRequests(task) {
		for (const instance of getInstances(task)) if (this.queuedTaskByInstance.get(instance) === task) this.queuedTaskByInstance.delete(instance);
	}
	clearHighlightKey(task) {
		if (task.highlightKey != null && this.taskByHighlightKey.get(task.highlightKey) === task) this.taskByHighlightKey.delete(task.highlightKey);
	}
	trackInstanceRequests(task) {
		for (const instance of getInstances(task)) this.activeRequestByInstance.set(instance, task.id);
	}
	clearInstanceRequests(task) {
		for (const instance of getInstances(task)) if (this.activeRequestByInstance.get(instance) === task.id) this.activeRequestByInstance.delete(instance);
	}
	notifyFileInstances(task, result, options) {
		for (const instance of task.instances) if (this.activeRequestByInstance.get(instance) === task.id) instance.onHighlightSuccess(task.request.file, result, options);
	}
	notifyDiffInstances(task, result, options) {
		for (const instance of task.instances) if (this.activeRequestByInstance.get(instance) === task.id) instance.onHighlightSuccess(task.request.diff, result, options);
	}
	notifyHighlightError(task, error) {
		if (task.highlightKey != null) this.failedHighlightKeys.set(task.highlightKey, true);
		for (const instance of getInstances(task)) if (this.activeRequestByInstance.get(instance) === task.id) instance.onHighlightError(error);
	}
	hasMatchingFileInstanceTask(instance, file) {
		for (const task of this.iterateRenderTasks()) if (task.type === "file" && this.isCurrentRenderTask(task) && task.instances.has(instance) && areFilesEqual(file, task.request.file)) return true;
		return false;
	}
	hasMatchingDiffInstanceTask(instance, diff) {
		for (const task of this.iterateRenderTasks()) if (task.type === "diff" && this.isCurrentRenderTask(task) && task.instances.has(instance) && areDiffTargetsEqual(task.request.diff, diff)) return true;
		return false;
	}
	getTaskByHighlightKey(highlightKey) {
		const task = this.taskByHighlightKey.get(highlightKey);
		return task != null && this.isCurrentRenderTask(task) ? task : void 0;
	}
	isCurrentRenderTask(task) {
		return task.renderOptionsVersion === this.renderOptionsVersion;
	}
	*iterateRenderTasks() {
		for (const task of this.queuedTasks) yield task;
		for (const task of this.activeTaskById.values()) if (isRenderTask(task)) yield task;
	}
	generateRequestId() {
		return `req_${++this.nextRequestId}`;
	}
};
function shouldSyncCustomExtensions(request) {
	return request.type === "initialize" || request.type === "file" || request.type === "diff";
}
function getLangsFromRequest(request) {
	const langs = /* @__PURE__ */ new Set();
	switch (request.type) {
		case "file":
			langs.add(request.file.lang ?? getFiletypeFromFileName(request.file.name));
			break;
		case "diff":
			langs.add(request.diff.lang ?? getFiletypeFromFileName(request.diff.name));
			langs.add(request.diff.lang ?? getFiletypeFromFileName(request.diff.prevName ?? "-"));
	}
	langs.delete("text");
	return Array.from(langs);
}
function isRenderTask(task) {
	return task?.type === "file" || task?.type === "diff";
}
function getInstances(task) {
	return task.instances;
}
function normalizeWorkerError(error) {
	if (error instanceof Error) return error;
	if (error != null && typeof error === "object") {
		if ("error" in error && error.error instanceof Error) return error.error;
		if ("message" in error && typeof error.message === "string") return new Error(error.message);
	}
	return new Error(String(error));
}
function normalizeWorkerStartupError(error) {
	return error instanceof WorkerPoolWorkerError ? error : new WorkerPoolWorkerError(normalizeWorkerError(error).message, { cause: error });
}
function errorFromWorkerErrorEvent(event) {
	const cause = "error" in event ? event.error : void 0;
	const message = "message" in event && typeof event.message === "string" && event.message !== "" ? event.message : cause instanceof Error ? cause.message : "the worker script failed to load (the error event carries no message)";
	return new WorkerPoolWorkerError(`WorkerPoolManager: worker failed: ${message}`, cause instanceof Error ? { cause } : void 0);
}
//#endregion
export { WorkerPoolManager };

//# sourceMappingURL=WorkerPoolManager.js.map