import { DEFAULT_EXPANDED_REGION, DEFAULT_RENDER_RANGE, DEFAULT_THEMES, DEFAULT_TOKENIZE_MAX_LENGTH } from "../constants.js";
import { HighlighterDisposedError } from "../highlighter/highlighterType.js";
import { areThemesAttached } from "../highlighter/themes/areThemesAttached.js";
import { getHighlighterIfLoaded, getSharedHighlighter } from "../highlighter/shared_highlighter.js";
import { getHighlighterThemeStyles } from "../utils/getHighlighterThemeStyles.js";
import { createGutterWrapper, createHastElement } from "../utils/hast_utils.js";
import { LineCuts } from "../rows/LineCuts.js";
import { endsWithNewline } from "../utils/endsWithNewline.js";
import { growExpandedRegion } from "../utils/virtualDiffLayout.js";
import { resolvePreferredHighlighter } from "../utils/resolvePreferredHighlighter.js";
import { hastToHtml } from "../utils/hastToHtml.js";
import { columnCells } from "../layout/RowSpec.js";
import { areLanguagesAttached } from "../highlighter/languages/areLanguagesAttached.js";
import { areRenderRangesEqual } from "../utils/areRenderRangesEqual.js";
import { createAnnotationElement } from "../utils/createAnnotationElement.js";
import { RowSource } from "../rows/RowSource.js";
import { addMissingRows } from "../utils/addMissingRows.js";
import { createContentColumn } from "../utils/createContentColumn.js";
import { createFileHeaderElement } from "../utils/createFileHeaderElement.js";
import { createPreElement } from "../utils/createPreElement.js";
import { getFiletypeFromFileName } from "../utils/getFiletypeFromFileName.js";
import { getHighlighterOptions } from "../utils/getHighlighterOptions.js";
import { getLineAnnotationName } from "../utils/getLineAnnotationName.js";
import { isDefaultRenderRange } from "../utils/isDefaultRenderRange.js";
import { reportEditWithoutTokenTransformer } from "../utils/reportEditWithoutTokenTransformer.js";
import { isHandledWorkerPoolError } from "../worker/errors.js";
import { areDiffTargetsEqual } from "../utils/areDiffTargetsEqual.js";
import { DiffLayout } from "../layout/DiffLayout.js";
import { DiffModel } from "../model/DiffModel.js";
import { areDiffRenderOptionsEqual } from "../utils/areDiffRenderOptionsEqual.js";
import { isDiffPlainText } from "../utils/isDiffPlainText.js";
import { renderDiffWithHighlighter } from "../utils/renderDiffWithHighlighter.js";
//#region src/renderers/DiffHunksRenderer.ts
let instanceId = -1;
var DiffHunksRenderer = class {
	options;
	annotationSlotName;
	onRenderUpdate;
	workerManager;
	__id = `diff-hunks-renderer:${++instanceId}`;
	diff;
	lineCuts = new LineCuts();
	expandedHunks = /* @__PURE__ */ new Map();
	annotationList = [];
	deletionAnnotations = {};
	additionAnnotations = {};
	computedLangs = ["text"];
	renderCache;
	pendingHighlightResult;
	layout;
	rowSource;
	model;
	editSessionActive = false;
	constructor(options = { theme: DEFAULT_THEMES }, annotationSlotName = getLineAnnotationName, onRenderUpdate, workerManager) {
		this.options = options;
		this.annotationSlotName = annotationSlotName;
		this.onRenderUpdate = onRenderUpdate;
		this.workerManager = workerManager;
	}
	cleanUp() {
		this.endEditSession();
		this.recycle();
		this.lineCuts.clear();
		this.expandedHunks.clear();
		this.workerManager = void 0;
		this.onRenderUpdate = void 0;
	}
	recycle() {
		this.diff = void 0;
		if (this.editSessionActive) {
			this.workerManager?.cancelLocalThemeRender(this);
			if (this.renderCache != null) this.renderCache.renderRange = void 0;
			this.pendingHighlightResult = void 0;
		} else this.clearRenderCache();
		this.annotationList = [];
		this.additionAnnotations = {};
		this.deletionAnnotations = {};
		this.workerManager?.cleanUpTasks(this);
	}
	/**
	* Starts editing `inputDiff`'s new file and returns the diff being edited,
	* a copy that edits change in place. Rows come from the input diff's
	* highlighted rows while a line is unchanged, and from the editor's tokens
	* once it has sent some.
	*/
	startEditSession(inputDiff, options = {}) {
		const model = DiffModel.startEditSession(inputDiff, {
			...options,
			parseDiffOptions: this.options.parseDiffOptions
		});
		const { rowSource } = this;
		const renderCache = this.promoteReadyResult(inputDiff) ?? this.renderCache;
		this.editSessionActive = true;
		this.model = model;
		this.diff = model.diff;
		this.pendingHighlightResult = void 0;
		const { options: renderOptions } = this.getRenderOptions(model.diff);
		if (renderCache?.result != null && renderCache.highlighted && model.diff.additionLines === inputDiff.additionLines && areDiffTargetsEqual(renderCache.diff, inputDiff) && areDiffRenderOptionsEqual(renderCache.options, renderOptions)) {
			const { result } = renderCache;
			const lines = {
				ids: model.lineIds(),
				texts: model.diff.additionLines.slice()
			};
			this.renderCache = {
				diff: model.diff,
				options: renderOptions,
				highlighted: true,
				result,
				renderRange: renderCache.renderRange,
				lines
			};
			if (rowSource != null && rowSource.result === result) {
				rowSource.source.setHighlightRows({
					deletionRows: result.code.deletionLines,
					additionRows: result.code.additionLines,
					additionLines: lines.texts,
					lineIds: lines.ids
				});
				this.layout?.invalidateLines();
				rowSource.model = model;
			} else this.rowSource = void 0;
		} else {
			if (renderCache != null && renderCache.options.useTokenTransformer !== true) reportEditWithoutTokenTransformer(model.diff.name);
			this.renderCache = void 0;
			this.rowSource = void 0;
		}
		return model.diff;
	}
	promoteReadyResult(diff) {
		const { options } = this.getRenderOptions(diff);
		const ready = this.getReadyRenderResult(diff, options);
		return ready != null ? {
			...ready,
			diff,
			renderRange: void 0
		} : void 0;
	}
	/**
	* Applies one change of the editor's document to the diff being edited,
	* with the tokens the editor produced for it. Returns what changed besides
	* the text: the line delta and whether collapsed regions moved.
	*/
	applyChange(change, document, tokens) {
		const model = this.requireSession();
		const result = model.applyChange(change, document, {
			parseDiffOptions: this.options.parseDiffOptions,
			expandedHunks: this.expandedHunks
		});
		this.expandedHunks = result.expandedHunks;
		if (result.removedLineIds.length > 0) {
			this.editSessionRows(model).source.forgetLines(result.removedLineIds);
			this.layout?.forgetLines(result.removedLineIds);
		}
		if (result.lineDelta !== 0 || result.removedLineIds.length > 0 || result.regionsChanged || result.hunksChanged) this.layout?.invalidateLines();
		else this.layout?.markLines(result.changedLines);
		if (tokens != null) this.setTokens(tokens);
		return result;
	}
	/**
	* Stores tokens the editor produced in the background. Returns the lines
	* whose rows changed.
	*/
	setTokens(tokens) {
		const model = this.requireSession();
		const rows = this.editSessionRows(model).source;
		const changed = [];
		for (const [line, lineTokens] of tokens) if (rows.setTokens(model.lineId(line), lineTokens)) changed.push(line);
		this.layout?.markLines(changed);
		return changed;
	}
	/** The key of the row showing a line of the editor's document. */
	lineKey(line) {
		const model = this.requireSession();
		return line >= 0 && line < model.lineCount ? `a${model.lineId(line)}` : void 0;
	}
	/** The document line a row key shows, or undefined for other rows. */
	lineOfKey(key) {
		const model = this.requireSession();
		return key.startsWith("a") ? model.lineOf(Number(key.slice(1))) : void 0;
	}
	/**
	* The document line where editing continues from an old-file line number
	* (a read-only row's `data-line`), or undefined outside every hunk.
	*/
	editLineFor(deletionLineNumber) {
		return this.requireSession().editLineFor(deletionLineNumber);
	}
	/**
	* Called when the editor detaches. Recomputes the hunks as a fresh diff of
	* the final text would, keeping context the user expanded, then leaves
	* edit mode. The rows stay until another diff renders. Returns whether the
	* hunks changed.
	*/
	endEditSession() {
		const model = this.editSessionActive ? this.model : void 0;
		let changed = false;
		if (model != null) {
			const { collapsedContextThreshold } = this.getOptionsWithDefaults();
			const finished = model.finish(collapsedContextThreshold, {
				parseDiffOptions: this.options.parseDiffOptions,
				expandedHunks: this.expandedHunks
			});
			changed = finished.changed;
			this.expandedHunks = finished.expandedHunks;
		}
		this.editSessionActive = false;
		this.pendingHighlightResult = void 0;
		if (this.diff == null) this.clearRenderCache();
		return changed;
	}
	requireSession() {
		const { model } = this;
		if (!this.editSessionActive || model == null || !model.live) throw new Error("DiffHunksRenderer: no edit session is active");
		return model;
	}
	editSessionRows(model) {
		const { rowSource } = this;
		if (rowSource != null && rowSource.model === model) return rowSource;
		const source = new RowSource({
			deletionRows: [],
			additionRows: [],
			additionLines: [],
			lineIds: []
		});
		return this.rowSource = {
			result: {
				code: {
					additionLines: [],
					deletionLines: []
				},
				themeStyles: "",
				baseThemeType: void 0
			},
			source,
			model
		};
	}
	/**
	* Whether the rows on screen are ones the editor can update in place: laid
	* out from a highlighted result that carries the token spans it reads.
	*/
	editorRenderReady() {
		const { renderCache, rowSource } = this;
		return renderCache?.options.useTokenTransformer === true && renderCache.highlighted && renderCache.result != null && rowSource?.result === renderCache.result;
	}
	includesTrailingNewline() {
		return this.editSessionActive;
	}
	hasTrailingNewlineRow(diff) {
		return this.includesTrailingNewline() && endsWithNewline(diff, "additions");
	}
	showsNoNewlineMarkers() {
		return !this.editSessionActive;
	}
	/**
	* Re-highlights the current diff in the background and stages the fresh
	* result for the next render. Needed after an edit session's exit recompute:
	* session passes plain-fill shifted lines in the cached result, and the
	* recompute mutates the keyless session diff in place, so object identity
	* alone would otherwise treat the stale highlight as current forever. The
	* current result — content-correct, mostly highlighted — keeps rendering
	* until the fresh one is promoted, so no interim paint drops highlighting.
	*/
	refreshHighlightedResult() {
		const { diff, renderCache, workerManager } = this;
		if (diff == null || renderCache == null || !areDiffTargetsEqual(renderCache.diff, diff) || isDiffPlainText(diff) || isDiffMassive(diff, this.getTokenizeMaxLength())) return Promise.resolve();
		if (!this.editSessionActive && workerManager?.isWorkingPool() === true && diff.cacheKey != null) {
			workerManager.evictDiffFromCache(diff.cacheKey);
			return workerManager.primeDiffHighlightCache(diff).then(() => {
				this.applyRefreshedResult(diff, workerManager.getDiffResultCache(diff));
			}).catch((error) => {
				if (!isHandledWorkerPoolError(error)) this.onHighlightError(error);
			});
		}
		return this.asyncHighlight(diff).then((fresh) => this.applyRefreshedResult(diff, fresh)).catch((error) => this.onHighlightError(error));
	}
	applyRefreshedResult(diff, fresh) {
		const { diff: currentDiff, renderCache } = this;
		if (fresh == null || currentDiff == null || renderCache == null || !areDiffTargetsEqual(currentDiff, diff) || !areDiffTargetsEqual(renderCache.diff, diff) || this.editSessionActive) return;
		const { options } = this.getRenderOptions(currentDiff);
		if (!areDiffRenderOptionsEqual(options, fresh.options)) return;
		this.pendingHighlightResult = {
			diff: currentDiff,
			options: fresh.options,
			highlighted: true,
			result: fresh.result
		};
		this.onRenderUpdate?.();
	}
	get diffCache() {
		return this.renderCache?.diff ?? this.diff;
	}
	waitForLocalTheme(langs) {
		const { workerManager, onRenderUpdate } = this;
		return onRenderUpdate != null && workerManager?.renderWhenLocalThemeLoads(this, onRenderUpdate, langs) === true;
	}
	clearRenderCache() {
		this.workerManager?.cancelLocalThemeRender(this);
		this.renderCache = void 0;
		this.pendingHighlightResult = void 0;
		this.layout = void 0;
		if (this.editSessionActive) this.rowSource?.source.forgetTokens();
		else {
			this.rowSource = void 0;
			this.model = void 0;
		}
	}
	expandLine(target) {
		this.lineCuts.expand(target);
		this.layout?.invalidateLines();
	}
	setOptions(options) {
		this.options = options;
	}
	mergeOptions(options) {
		this.options = {
			...this.options,
			...options
		};
	}
	expandHunk(index, direction, expansionLineCount = this.getOptionsWithDefaults().expansionLineCount) {
		this.expandedHunks.set(index, growExpandedRegion(this.expandedHunks.get(index), direction, expansionLineCount));
		this.handleExpansionChange();
	}
	handleExpansionChange() {
		if (this.renderCache?.highlighted !== true) this.clearRenderCache();
		this.layout?.invalidateLines();
	}
	getExpandedHunk(hunkIndex) {
		return this.expandedHunks.get(hunkIndex) ?? DEFAULT_EXPANDED_REGION;
	}
	getExpandedHunksMap() {
		return this.expandedHunks;
	}
	/** Replace the whole expansion state, such as with a pending one. */
	setExpandedHunksMap(expandedHunks) {
		this.expandedHunks = expandedHunks;
		this.handleExpansionChange();
	}
	setLineAnnotations(lineAnnotations) {
		const { annotationList } = this;
		if (lineAnnotations === annotationList || lineAnnotations.length === 0 && annotationList.length === 0) return;
		this.annotationList = lineAnnotations;
		this.additionAnnotations = {};
		this.deletionAnnotations = {};
		for (const annotation of lineAnnotations) {
			const map = (() => {
				switch (annotation.side) {
					case "deletions": return this.deletionAnnotations;
					case "additions": return this.additionAnnotations;
				}
			})();
			const arr = map[annotation.lineNumber] ?? [];
			map[annotation.lineNumber] = arr;
			arr.push(annotation);
		}
	}
	getUnifiedLineDecoration({ lineType }) {
		return {
			gutterLineType: lineType,
			contentProperties: { "data-line-type": lineType }
		};
	}
	getSplitLineDecoration({ side, type }) {
		const lineType = type === "change" ? side === "deletions" ? "change-deletion" : "change-addition" : type;
		return {
			gutterLineType: lineType,
			contentProperties: { "data-line-type": lineType }
		};
	}
	createAnnotationElement(span) {
		return createAnnotationElement(span);
	}
	getOptionsWithDefaults() {
		const { diffIndicators = "bars", diffStyle = "split", disableBackground = false, disableFileHeader = false, disableLineNumbers = false, disableVirtualizationBuffers = false, collapsed = false, expandUnchanged = false, collapsedContextThreshold = 1, expansionLineCount = 100, hunkSeparators = "line-info", lineDiffType = "word-alt", maxLineDiffLength = 1e3, overflow = "scroll", stickyHeader = false, theme = DEFAULT_THEMES, headerRenderMode = "default", tokenizeMaxLineLength = 1e3, tokenizeMaxLength = DEFAULT_TOKENIZE_MAX_LENGTH, useTokenTransformer = false, useCSSClasses = false } = this.options;
		return {
			diffIndicators,
			diffStyle,
			disableBackground,
			disableFileHeader,
			disableLineNumbers,
			disableVirtualizationBuffers,
			collapsed,
			expandUnchanged,
			collapsedContextThreshold,
			expansionLineCount,
			hunkSeparators,
			lineDiffType,
			maxLineDiffLength,
			overflow,
			stickyHeader,
			theme: this.workerManager?.getDiffRenderOptions().theme ?? theme,
			headerRenderMode,
			tokenizeMaxLineLength,
			tokenizeMaxLength,
			useTokenTransformer,
			useCSSClasses
		};
	}
	initializeHighlighter(langs = this.computedLangs) {
		return getSharedHighlighter(getHighlighterOptions(langs, {
			theme: this.getLocalHighlightTheme(),
			preferredHighlighter: resolvePreferredHighlighter(this.workerManager, this.options)
		}));
	}
	hydrate(diff) {
		if (diff == null) return;
		this.diff = diff;
		const { options } = this.getRenderOptions(diff);
		const massiveDiff = isDiffMassive(diff, this.getTokenizeMaxLength());
		let cache = this.workerManager?.getDiffResultCache(diff);
		if (cache != null && !areDiffRenderOptionsEqual(options, cache.options)) cache = void 0;
		this.renderCache ??= {
			diff,
			hydrated: true,
			highlighted: !massiveDiff && !isDiffPlainText(diff),
			options,
			result: massiveDiff ? void 0 : cache?.result,
			renderRange: void 0
		};
		const workerManager = this.getHighlightWorkerManager(diff);
		if (workerManager != null) {
			if (this.renderCache.result == null && !massiveDiff) workerManager.highlightDiffAST(this, this.diff);
		} else if (this.options.deferHydrationHighlight !== true && getHighlighterIfLoaded({ theme: this.getLocalHighlightTheme() }) == null) {
			this.computedLangs = getDiffLanguages(diff);
			this.initializeHighlighter().catch((error) => {
				if (!(error instanceof HighlighterDisposedError)) this.onHighlightError(error);
			});
		}
	}
	/**
	* Whether a session started now would throw away a pool highlight that is
	* still on its way: the pool highlights `diff` with the token spans the
	* editor reads, and that result is neither rendered nor ready to render.
	* The pool task is joined through the diff's cache key, so a diff without
	* one is never waited on, and neither is one the pool already refused: a
	* session highlights that diff locally, as a read-only render of it stays
	* plain.
	*/
	awaitsPoolHighlight(diff) {
		const workerManager = this.getHighlightWorkerManager(diff);
		if (workerManager == null || diff.cacheKey == null || workerManager.didHighlightFail(diff)) return false;
		const options = workerManager.getDiffRenderOptions();
		return options.useTokenTransformer === true && (diff.additionLines.length > 0 || diff.deletionLines.length > 0) && !isDiffPlainText(diff) && !isDiffMassive(diff, this.getTokenizeMaxLength()) && !this.hasHighlightedRenderCache(diff, options) && this.getReadyRenderResult(diff, options) == null;
	}
	getHighlightWorkerManager(diff) {
		const { editSessionActive, workerManager } = this;
		return !editSessionActive && workerManager?.isWorkingPool() === true && !workerManager.shouldHighlightOnMainThread(diff) ? workerManager : void 0;
	}
	cacheHighlightResult(diff, renderResult) {
		const { editSessionActive, workerManager } = this;
		if (!editSessionActive && workerManager?.isWorkingPool() === true) workerManager.setDiffResultCache(diff.cacheKey, renderResult);
	}
	getLocalHighlightTheme() {
		return this.workerManager?.getDiffRenderOptions().theme ?? this.options.theme ?? DEFAULT_THEMES;
	}
	getLineCutLength(options = this.options) {
		if (this.editSessionActive) return Infinity;
		const { tokenizeMaxLineLength = 1e3 } = this.getEffectiveCodeOptions(options);
		return tokenizeMaxLineLength > 0 ? tokenizeMaxLineLength : Infinity;
	}
	getEffectiveCodeOptions(options = this.options) {
		const poolOptions = this.workerManager?.getDiffRenderOptions();
		return {
			theme: poolOptions?.theme ?? this.options.theme ?? DEFAULT_THEMES,
			tokenizeMaxLineLength: poolOptions?.tokenizeMaxLineLength ?? options.tokenizeMaxLineLength
		};
	}
	getRenderOptions(diff) {
		const options = (() => {
			if (this.workerManager != null) {
				const poolOptions = this.workerManager.getDiffRenderOptions();
				if (this.editSessionActive && poolOptions.useTokenTransformer !== true) return {
					...poolOptions,
					useTokenTransformer: true
				};
				return poolOptions;
			}
			const { theme, tokenizeMaxLineLength, lineDiffType, maxLineDiffLength } = this.getOptionsWithDefaults();
			return {
				theme,
				useTokenTransformer: this.editSessionActive || this.options.useTokenTransformer === true,
				tokenizeMaxLineLength,
				lineDiffType,
				preferredDiffLib: this.options.parseDiffOptions?.preferredDiffLib,
				maxLineDiffLength
			};
		})();
		this.getOptionsWithDefaults();
		const { renderCache } = this;
		if (renderCache?.result == null) return {
			options,
			forceHighlight: true
		};
		if (!areDiffTargetsEqual(diff, renderCache.diff) || !areDiffRenderOptionsEqual(options, renderCache.options)) return {
			options,
			forceHighlight: true
		};
		return {
			options,
			forceHighlight: false
		};
	}
	/**
	* Returns the diff that the next synchronous render can commit without
	* changing the renderer's current diff or render cache. Components use this
	* to prepare state that must match the following DOM render.
	*/
	getDiffForNextRender(diff) {
		const { options } = this.getRenderOptions(diff);
		if (this.getReadyRenderResult(diff, options) != null) return diff;
		if (this.renderCache == null) return diff;
		if (areDiffTargetsEqual(this.renderCache.diff, diff)) return this.renderCache.diff;
		const forcePlainText = !(diff.additionLines.length > 0 || diff.deletionLines.length > 0) || isDiffPlainText(diff) || isDiffMassive(diff, this.getTokenizeMaxLength());
		return this.canRenderDiff(diff, options, forcePlainText) ? diff : this.renderCache.diff;
	}
	canRenderDiff(diff, options, forcePlainText) {
		const { renderCache } = this;
		if (renderCache == null || areDiffTargetsEqual(renderCache.diff, diff)) return true;
		if (forcePlainText) return renderCache.result == null && renderCache.hydrated !== true || this.workerManager?.isWorkingPool() === true && !this.workerManager.shouldHighlightOnMainThread(diff) || getHighlighterIfLoaded({ theme: options.theme }) != null;
		if (renderCache.result == null && renderCache.hydrated !== true) return true;
		if (this.getHighlightWorkerManager(diff) != null) return !renderCache.highlighted;
		return getHighlighterIfLoaded({ theme: options.theme }) != null;
	}
	renderCollapsed(diff) {
		this.workerManager?.cancelLocalThemeRender(this);
		this.diff = diff;
		const { renderCache } = this;
		if (renderCache != null && (!areDiffTargetsEqual(renderCache.diff, diff) || renderCache.hydrated === true && renderCache.result == null)) this.clearRenderCache();
		const theme = this.getLocalHighlightTheme();
		const highlighter = getHighlighterIfLoaded({ theme });
		if (highlighter == null) {
			this.initializeHighlighter(["text"]).then(() => this.onRenderUpdate?.()).catch((error) => {
				if (!(error instanceof HighlighterDisposedError)) this.onHighlightError(error);
			});
			return;
		}
		const { disableFileHeader = false } = this.options;
		return {
			headerElement: disableFileHeader ? void 0 : this.renderHeader(diff),
			themeStyles: getHighlighterThemeStyles({
				theme,
				highlighter
			}),
			baseThemeType: typeof theme === "string" ? highlighter.getTheme(theme).type : void 0
		};
	}
	renderDiff(diff = this.diff, renderRange = DEFAULT_RENDER_RANGE) {
		this.diff = diff;
		if (diff == null) {
			this.pendingHighlightResult = void 0;
			return;
		}
		const { expandUnchanged, collapsedContextThreshold } = this.getOptionsWithDefaults();
		let { options, forceHighlight } = this.getRenderOptions(diff);
		const readyResult = this.getReadyRenderResult(diff, options);
		this.pendingHighlightResult = void 0;
		if (readyResult != null) {
			this.renderCache = {
				...readyResult,
				diff,
				renderRange: void 0,
				lines: this.lineSnapshot(diff)
			};
			forceHighlight = false;
		}
		this.renderCache ??= {
			diff,
			highlighted: false,
			options,
			result: void 0,
			renderRange: void 0
		};
		const hasContent = diff.additionLines.length > 0 || diff.deletionLines.length > 0;
		const forcePlainText = !hasContent || isDiffPlainText(diff) || isDiffMassive(diff, this.getTokenizeMaxLength());
		const canRenderDiff = this.canRenderDiff(diff, options, forcePlainText);
		const newContent = !areDiffTargetsEqual(diff, this.renderCache.diff);
		const newRenderRange = !areRenderRangesEqual(this.renderCache.renderRange, renderRange);
		const workerManager = this.getHighlightWorkerManager(diff);
		if (workerManager != null) {
			const preserveHydratedContent = this.renderCache.result == null && this.renderCache.highlighted && !forcePlainText && !newContent && isDefaultRenderRange(renderRange);
			if (canRenderDiff && !preserveHydratedContent && (forcePlainText || this.renderCache.result == null || !this.renderCache.highlighted && (newContent || newRenderRange))) {
				this.renderCache.diff = diff;
				this.renderCache.options = options;
				this.renderCache.highlighted = false;
				if (this.renderCache.result == null || newContent || newRenderRange || forceHighlight) {
					const windowResult = workerManager.getPlainDiffAST(diff, renderRange.startingLine, renderRange.totalLines, isDefaultRenderRange(renderRange) ? true : expandUnchanged ? true : this.expandedHunks, collapsedContextThreshold);
					if (windowResult == null) this.waitForLocalTheme();
					const { result: currentResult } = this.renderCache;
					const nextResult = currentResult != null && windowResult != null && !newContent && !forceHighlight ? addPlainRows(currentResult, windowResult) : windowResult;
					if (nextResult !== currentResult) this.renderCache.lines = this.lineSnapshot(diff);
					this.renderCache.result = nextResult;
				}
				this.renderCache.renderRange = renderRange;
			}
			if (!forcePlainText && hasContent && (!this.renderCache.highlighted || forceHighlight)) workerManager.highlightDiffAST(this, diff);
		} else {
			this.computedLangs = getDiffLanguages(diff);
			const highlighter = getHighlighterIfLoaded();
			const hasThemes = highlighter != null && areThemesAttached(options.theme, highlighter);
			const hasLangs = highlighter != null && areLanguagesAttached(this.computedLangs, highlighter);
			const canHighlight = !forcePlainText && hasLangs;
			const lazyLineAST = Number.isFinite(renderRange.totalLines);
			if (canRenderDiff && highlighter != null && hasThemes && (forceHighlight || !this.renderCache.highlighted && canHighlight || this.renderCache.result == null)) {
				const { result, options } = this.renderDiffWithHighlighter(diff, highlighter, forcePlainText || !hasLangs, lazyLineAST);
				this.renderCache = {
					diff,
					options,
					highlighted: canHighlight,
					result,
					renderRange: void 0,
					lines: this.lineSnapshot(diff)
				};
				if (canHighlight) this.cacheHighlightResult(diff, {
					result,
					options
				});
			}
			if (!hasThemes || !forcePlainText && !hasLangs) {
				if (this.renderCache.result == null && !this.renderCache.highlighted && !this.editSessionActive && this.waitForLocalTheme(forcePlainText || hasLangs ? [] : this.computedLangs)) return;
				this.asyncHighlight(diff, lazyLineAST).then(({ result, options }) => {
					if (!forcePlainText) this.cacheHighlightResult(diff, {
						result,
						options
					});
					this.applyHighlightResult(diff, result, options, !forcePlainText);
				}).catch((error) => {
					if (!(error instanceof HighlighterDisposedError)) this.onHighlightError(error);
				});
			}
		}
		if (this.renderCache.result != null) {
			this.workerManager?.cancelLocalThemeRender(this);
			return this.layoutResult(this.renderCache.diff, renderRange, this.renderCache.result, this.renderCache.lines);
		}
		if (!this.editSessionActive) return;
		const { result } = this.editSessionRows(this.requireSession());
		return this.layoutResult(this.renderCache.diff, renderRange, result, {
			ids: [],
			texts: []
		});
	}
	async asyncRender(diff, renderRange = DEFAULT_RENDER_RANGE) {
		this.diff = diff;
		const { result } = await this.asyncHighlight(diff, Number.isFinite(renderRange.totalLines));
		return this.layoutResult(diff, renderRange, result);
	}
	createPreElement(split, totalLines, customProperties) {
		const { diffIndicators, disableBackground, disableLineNumbers, overflow } = this.getOptionsWithDefaults();
		return createPreElement({
			type: "diff",
			diffIndicators,
			disableBackground,
			disableLineNumbers,
			overflow,
			split,
			totalLines,
			customProperties
		});
	}
	async asyncHighlight(diff, lazyLineAST = false) {
		const forcePlainText = isDiffMassive(diff, this.getTokenizeMaxLength());
		this.computedLangs = forcePlainText ? ["text"] : getDiffLanguages(diff);
		let highlighter = getHighlighterIfLoaded();
		const hasThemes = highlighter != null && areThemesAttached(this.getLocalHighlightTheme(), highlighter);
		const hasLangs = forcePlainText || highlighter != null && areLanguagesAttached(this.computedLangs, highlighter);
		if (highlighter == null || !hasThemes || !hasLangs) highlighter = await this.initializeHighlighter();
		return this.renderDiffWithHighlighter(diff, highlighter, forcePlainText, lazyLineAST);
	}
	renderDiffWithHighlighter(diff, highlighter, forcePlainText = false, lazyLineAST = false) {
		const { options } = this.getRenderOptions(diff);
		const { collapsedContextThreshold } = this.getOptionsWithDefaults();
		return {
			result: renderDiffWithHighlighter(diff, highlighter, options, {
				forcePlainText,
				lazyLineAST,
				expandedHunks: forcePlainText ? true : void 0,
				collapsedContextThreshold
			}),
			options
		};
	}
	onHighlightSuccess(diff, result, options, highlighted = true) {
		if (this.editSessionActive) return;
		this.applyHighlightResult(diff, result, options, highlighted);
	}
	applyHighlightResult(diff, result, options, highlighted = true) {
		const { diff: currentDiff, renderCache } = this;
		if (currentDiff == null || renderCache == null || !areDiffTargetsEqual(currentDiff, diff) || !areDiffRenderOptionsEqual(options, this.getRenderOptions(currentDiff).options)) return;
		if (!(renderCache.result == null || !renderCache.highlighted || !areDiffRenderOptionsEqual(renderCache.options, options) || !areDiffTargetsEqual(renderCache.diff, currentDiff))) return;
		this.pendingHighlightResult = {
			diff: currentDiff,
			options,
			highlighted,
			result
		};
		this.onRenderUpdate?.();
	}
	getMatchingWorkerResultCache(diff, options) {
		if (this.editSessionActive) return;
		const cache = this.workerManager?.getDiffResultCache(diff);
		if (cache == null || !areDiffRenderOptionsEqual(options, cache.options)) return;
		return cache;
	}
	getReadyRenderResult(diff, options) {
		const { pendingHighlightResult } = this;
		if (pendingHighlightResult != null && areDiffTargetsEqual(pendingHighlightResult.diff, diff) && areDiffRenderOptionsEqual(pendingHighlightResult.options, options)) return pendingHighlightResult;
		const workerCache = this.getMatchingWorkerResultCache(diff, options);
		if (workerCache == null || this.hasHighlightedRenderCache(diff, options)) return;
		return {
			diff,
			highlighted: true,
			...workerCache
		};
	}
	hasHighlightedRenderCache(diff, options) {
		const { renderCache } = this;
		return renderCache?.result != null && renderCache.highlighted && areDiffTargetsEqual(diff, renderCache.diff) && areDiffRenderOptionsEqual(options, renderCache.options);
	}
	onHighlightError(error) {
		console.error(error);
	}
	onLocalFallback() {
		this.onRenderUpdate?.();
	}
	getTokenizeMaxLength() {
		return this.options.tokenizeMaxLength ?? 1e5;
	}
	layoutWithOptions(diff) {
		const { diffStyle, expandUnchanged, expansionLineCount, collapsedContextThreshold, hunkSeparators } = this.getOptionsWithDefaults();
		const { lineDiffType, maxLineDiffLength, preferredDiffLib } = this.getRenderOptions(diff).options;
		const layoutOptions = {
			diffStyle,
			expandUnchanged,
			expansionLineCount,
			collapsedContextThreshold,
			hunkSeparators,
			lineDiffType,
			maxLineDiffLength,
			preferredDiffLib,
			canHydrateContext: canHydrateCollapsedContext(diff, this.options.loadDiffFiles != null)
		};
		const layout = this.layout ??= new DiffLayout(layoutOptions, this.lineCuts);
		layout.setOptions(layoutOptions);
		return layout;
	}
	/**
	* The editor works in new-file lines, while a window is a range of rows
	* (separators and old-side rows included). This is the range of new-file
	* lines the window's rows show, so the editor can finish coloring exactly
	* those lines before a render.
	*/
	editorRenderRange(diff, renderRange) {
		if (renderRange == null || diff == null || isDefaultRenderRange(renderRange)) return renderRange;
		const model = this.model?.diff === diff ? this.model : this.model = DiffModel.fromDiff(diff);
		const rows = this.rowSource?.source ?? new RowSource({
			deletionRows: [],
			additionRows: [],
			additionLines: [],
			lineIds: []
		});
		const lines = this.layoutWithOptions(diff).newFileLines(this.layoutInput(model, rows, renderRange));
		return lines == null ? {
			...renderRange,
			startingLine: 0,
			totalLines: 0
		} : {
			...renderRange,
			startingLine: lines.first - 1,
			totalLines: lines.last - lines.first + 1
		};
	}
	layoutInput(model, rows, renderRange) {
		this.lineCuts.setLimit(this.getLineCutLength());
		return {
			host: this,
			model,
			rows,
			renderRange,
			expandedHunks: this.expandedHunks,
			deletionAnnotations: this.deletionAnnotations,
			additionAnnotations: this.additionAnnotations,
			annotationSlotName: this.annotationSlotName,
			includeTrailingNewline: this.includesTrailingNewline(),
			showNoNewlineMarkers: this.showsNoNewlineMarkers()
		};
	}
	layoutResult(diff, renderRange, result, lines) {
		const { themeStyles, baseThemeType } = result;
		const { disableFileHeader } = this.getOptionsWithDefaults();
		const layout = this.layoutWithOptions(diff);
		const model = this.model?.diff === diff ? this.model : this.model = DiffModel.fromDiff(diff);
		const previousResult = this.rowSource?.result;
		const rows = this.getRowSource(result, model, lines);
		const { columns, patched, hunkData, rowCount, totalLines } = layout.layout(this.layoutInput(model, rows, renderRange));
		return {
			fileDiff: diff,
			columns,
			allRowsChanged: previousResult !== result,
			patched,
			hunkData,
			preNode: this.createPreElement(columns.deletions != null && columns.additions != null, totalLines),
			themeStyles,
			baseThemeType,
			headerElement: !disableFileHeader ? this.renderHeader(diff) : void 0,
			totalLines,
			rowCount,
			bufferBefore: renderRange.bufferBefore,
			bufferAfter: renderRange.bufferAfter
		};
	}
	lineSnapshot(diff) {
		const { model } = this;
		if (model == null || model.diff !== diff || !model.live) return;
		return {
			ids: model.lineIds(),
			texts: diff.additionLines.slice()
		};
	}
	getRowSource(result, model, lines) {
		const { rowSource } = this;
		if (rowSource != null && rowSource.result === result) return rowSource.source;
		if (model.live && lines == null) throw new Error("DiffHunksRenderer: a highlight result for an edited diff has no line snapshot");
		const highlightRows = {
			deletionRows: result.code.deletionLines,
			additionRows: result.code.additionLines,
			additionLines: lines?.texts ?? model.diff.additionLines,
			lineIds: lines?.ids
		};
		if (rowSource != null && model.live && rowSource.model === model) {
			rowSource.source.setHighlightRows(highlightRows);
			this.layout?.invalidateLines();
			rowSource.result = result;
			return rowSource.source;
		}
		const source = new RowSource(highlightRows);
		this.rowSource = {
			result,
			source,
			model
		};
		return source;
	}
	renderCodeAST(type, result) {
		const specs = result.columns[type];
		if (specs == null) return;
		const cells = columnCells(specs);
		const gutter = createGutterWrapper(cells.gutter);
		gutter.properties.style = `grid-row: span ${result.rowCount}`;
		return [gutter, createContentColumn(cells.content, result.rowCount)];
	}
	renderFullAST(result, children = []) {
		const containerSize = this.getOptionsWithDefaults().hunkSeparators === "line-info";
		const unifiedAST = this.renderCodeAST("unified", result);
		if (unifiedAST != null) {
			children.push(createHastElement({
				tagName: "code",
				children: unifiedAST,
				properties: {
					"data-code": "",
					"data-container-size": containerSize ? "" : void 0,
					"data-unified": ""
				}
			}));
			return {
				...result.preNode,
				children
			};
		}
		const deletionsAST = this.renderCodeAST("deletions", result);
		if (deletionsAST != null) children.push(createHastElement({
			tagName: "code",
			children: deletionsAST,
			properties: {
				"data-code": "",
				"data-container-size": containerSize ? "" : void 0,
				"data-deletions": ""
			}
		}));
		const additionsAST = this.renderCodeAST("additions", result);
		if (additionsAST != null) children.push(createHastElement({
			tagName: "code",
			children: additionsAST,
			properties: {
				"data-code": "",
				"data-container-size": containerSize ? "" : void 0,
				"data-additions": ""
			}
		}));
		return {
			...result.preNode,
			children
		};
	}
	renderFullHTML(result, tempChildren = []) {
		return hastToHtml(this.renderFullAST(result, tempChildren));
	}
	renderPartialHTML(children, columnType) {
		if (columnType == null) return hastToHtml(children);
		return hastToHtml(createHastElement({
			tagName: "code",
			children,
			properties: {
				"data-code": "",
				"data-container-size": this.getOptionsWithDefaults().hunkSeparators === "line-info" ? "" : void 0,
				[`data-${columnType}`]: ""
			}
		}));
	}
	renderHeader(diff) {
		const { headerRenderMode, stickyHeader } = this.getOptionsWithDefaults();
		return createFileHeaderElement({
			fileOrDiff: diff,
			mode: headerRenderMode,
			stickyHeader
		});
	}
};
function addPlainRows(current, window) {
	addMissingRows(current.code.deletionLines, window.code.deletionLines);
	addMissingRows(current.code.additionLines, window.code.additionLines);
	return current;
}
function getDiffLanguages(diff) {
	if (diff.lang != null) return [diff.lang];
	const deletionLang = getFiletypeFromFileName(diff.prevName ?? diff.name);
	const additionLang = getFiletypeFromFileName(diff.name);
	return deletionLang === additionLang ? [additionLang] : [deletionLang, additionLang];
}
function isDiffMassive(diff, tokenizeMaxLength) {
	return Math.max(diff.additionLines.length, diff.deletionLines.length) > tokenizeMaxLength;
}
function canHydrateCollapsedContext(fileDiff, hasFileLoader) {
	return fileDiff.isPartial && hasFileLoader && (fileDiff.type === "change" || fileDiff.type === "rename-changed");
}
//#endregion
export { DiffHunksRenderer };

//# sourceMappingURL=DiffHunksRenderer.js.map