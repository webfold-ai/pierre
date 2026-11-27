import { DEFAULT_RENDER_RANGE, DEFAULT_THEMES } from "../constants.js";
import { HighlighterDisposedError } from "../highlighter/highlighterType.js";
import { areThemesAttached } from "../highlighter/themes/areThemesAttached.js";
import { getHighlighterIfLoaded, getSharedHighlighter } from "../highlighter/shared_highlighter.js";
import { getHighlighterThemeStyles } from "../utils/getHighlighterThemeStyles.js";
import { createGutterWrapper, createHastElement } from "../utils/hast_utils.js";
import { LineCuts } from "../rows/LineCuts.js";
import { resolvePreferredHighlighter } from "../utils/resolvePreferredHighlighter.js";
import { countLineBreaks } from "../utils/computeFileOffsets.js";
import { areFileTargetsEqual } from "../utils/areFileTargetsEqual.js";
import { hastToHtml } from "../utils/hastToHtml.js";
import { columnCells } from "../layout/RowSpec.js";
import { areLanguagesAttached } from "../highlighter/languages/areLanguagesAttached.js";
import { areRenderRangesEqual } from "../utils/areRenderRangesEqual.js";
import { FileLayout } from "../layout/FileLayout.js";
import { FileModel } from "../model/FileModel.js";
import { RowSource } from "../rows/RowSource.js";
import { addMissingRows } from "../utils/addMissingRows.js";
import { areFileRenderOptionsEqual } from "../utils/areFileRenderOptionsEqual.js";
import { createContentColumn } from "../utils/createContentColumn.js";
import { createFileHeaderElement } from "../utils/createFileHeaderElement.js";
import { createPreElement } from "../utils/createPreElement.js";
import { getFiletypeFromFileName } from "../utils/getFiletypeFromFileName.js";
import { getHighlighterOptions } from "../utils/getHighlighterOptions.js";
import { getLineAnnotationName } from "../utils/getLineAnnotationName.js";
import { isDefaultRenderRange } from "../utils/isDefaultRenderRange.js";
import { isFilePlainText } from "../utils/isFilePlainText.js";
import { renderFileWithHighlighter } from "../utils/renderFileWithHighlighter.js";
import { reportEditWithoutTokenTransformer } from "../utils/reportEditWithoutTokenTransformer.js";
//#region src/renderers/FileRenderer.ts
let instanceId = -1;
var FileRenderer = class {
	options;
	annotationSlotName;
	onRenderUpdate;
	workerManager;
	__id = `file-renderer:${++instanceId}`;
	file;
	renderCache;
	pendingHighlightResult;
	computedLang = "text";
	annotationList = [];
	lineAnnotations = {};
	lineCuts = new LineCuts();
	editSessionActive = false;
	model;
	rowSource;
	layout;
	get fileCache() {
		return this.renderCache?.file;
	}
	constructor(options = { theme: DEFAULT_THEMES }, annotationSlotName = getLineAnnotationName, onRenderUpdate, workerManager) {
		this.options = options;
		this.annotationSlotName = annotationSlotName;
		this.onRenderUpdate = onRenderUpdate;
		this.workerManager = workerManager;
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
	setLineAnnotations(lineAnnotations) {
		const { annotationList } = this;
		if (lineAnnotations === annotationList || lineAnnotations.length === 0 && annotationList.length === 0) return;
		this.annotationList = lineAnnotations;
		this.lineAnnotations = {};
		for (const annotation of lineAnnotations) {
			const arr = this.lineAnnotations[annotation.lineNumber] ?? [];
			this.lineAnnotations[annotation.lineNumber] = arr;
			arr.push(annotation);
		}
	}
	cleanUp() {
		this.endEditSession();
		this.recycle();
		this.lineCuts.clear();
		this.workerManager = void 0;
		this.onRenderUpdate = void 0;
	}
	recycle() {
		this.file = void 0;
		if (this.editSessionActive) {
			this.workerManager?.cancelLocalThemeRender(this);
			if (this.renderCache != null) this.renderCache.renderRange = void 0;
			this.pendingHighlightResult = void 0;
		} else this.clearRenderCache();
		this.workerManager?.cleanUpTasks(this);
	}
	/**
	* Starts editing `file` and returns the file being edited, a copy without
	* the input's cache key. Rows come from the input's highlighted rows while
	* a line is unchanged, and from the editor's tokens once it has sent some.
	* `retained` is a document the editor kept from an earlier session.
	*/
	startEditSession(file, retained) {
		const model = FileModel.startEditSession(file, retained);
		const { rowSource, model: previous } = this;
		const renderCache = this.promoteReadyResult(file) ?? this.renderCache;
		this.editSessionActive = true;
		this.model = model;
		this.file = model.file;
		this.pendingHighlightResult = void 0;
		const { options: renderOptions } = this.getRenderOptions(model.file);
		if (!(previous != null && previous.live && renderCache?.file === previous.file) && renderCache?.result != null && renderCache.highlighted && renderCache.file.contents === model.file.contents && areFileTargetsEqual(renderCache.file, file) && areFileRenderOptionsEqual(renderCache.options, renderOptions)) {
			const { result } = renderCache;
			const lines = {
				ids: model.lineIds(),
				texts: model.lines.slice()
			};
			this.renderCache = {
				file: model.file,
				options: renderOptions,
				highlighted: true,
				result,
				renderRange: renderCache.renderRange,
				lines
			};
			if (rowSource != null && rowSource.result === result) {
				rowSource.source.setHighlightRows({
					deletionRows: [],
					additionRows: result.code,
					additionLines: lines.texts,
					lineIds: lines.ids
				});
				this.layout?.invalidateLines();
				rowSource.model = model;
			} else this.rowSource = void 0;
		} else {
			if (renderCache != null && renderCache.options.useTokenTransformer !== true) reportEditWithoutTokenTransformer(model.file.name);
			this.renderCache = void 0;
			this.rowSource = void 0;
		}
		return model.file;
	}
	promoteReadyResult(file) {
		const { options } = this.getRenderOptions(file);
		const ready = this.getReadyRenderResult(file, options);
		return ready != null ? {
			...ready,
			file,
			renderRange: void 0
		} : void 0;
	}
	/**
	* Applies one change of the editor's document to the file being edited,
	* with the tokens the editor produced for it.
	*/
	applyChange(change, document, tokens) {
		const model = this.requireSession();
		const result = model.applyChange(change, document);
		if (result.removedLineIds.length > 0) {
			this.editSessionRows(model).source.forgetLines(result.removedLineIds);
			this.layout?.forgetLines(result.removedLineIds);
		}
		if (result.lineDelta !== 0 || result.removedLineIds.length > 0) this.layout?.invalidateLines();
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
	* Called when the editor detaches. Leaves edit mode and returns the file as
	* edited, or undefined when no session was active. The rows stay until
	* another file renders.
	*/
	endEditSession() {
		this.editSessionActive = false;
		this.pendingHighlightResult = void 0;
		if (this.file == null) this.clearRenderCache();
	}
	requireSession() {
		const { model } = this;
		if (!this.editSessionActive || model == null || !model.live) throw new Error("FileRenderer: no edit session is active");
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
				code: [],
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
	hydrate(file) {
		this.file = file;
		const { options } = this.getRenderOptions(file);
		const massiveFile = isFileMassive(this.getLineCount(file), this.getTokenizeMaxLength());
		let cache = this.workerManager?.getFileResultCache(file);
		if (cache != null && !areFileRenderOptionsEqual(options, cache.options)) cache = void 0;
		this.renderCache ??= {
			file,
			hydrated: true,
			options,
			highlighted: !massiveFile && !isFilePlainText(file),
			result: massiveFile ? void 0 : cache?.result,
			renderRange: void 0
		};
		const workerManager = this.getHighlightWorkerManager(file);
		if (workerManager != null) {
			if (this.renderCache.result == null && !massiveFile) workerManager.highlightFileAST(this, file);
		} else if (this.options.deferHydrationHighlight !== true && getHighlighterIfLoaded({ theme: this.getLocalHighlightTheme() }) == null) {
			this.computedLang = file.lang ?? getFiletypeFromFileName(file.name);
			this.initializeHighlighter().catch((error) => {
				if (!(error instanceof HighlighterDisposedError)) this.onHighlightError(error);
			});
		}
	}
	/**
	* Whether a session started now would throw away a pool highlight that is
	* still on its way: the pool highlights `file` with the token spans the
	* editor reads, and that result is neither rendered nor ready to render.
	* The pool task is joined through the file's cache key, so a file without
	* one is never waited on, and neither is one the pool already refused: a
	* session highlights that file locally, as a read-only render of it stays
	* plain.
	*/
	awaitsPoolHighlight(file) {
		const workerManager = this.getHighlightWorkerManager(file);
		if (workerManager == null || file.cacheKey == null || workerManager.didHighlightFail(file)) return false;
		const options = workerManager.getFileRenderOptions();
		return options.useTokenTransformer === true && file.contents.length > 0 && !isFilePlainText(file) && !isFileMassive(this.getLineCount(file), this.getTokenizeMaxLength()) && !this.hasHighlightedRenderCache(file, options) && this.getReadyRenderResult(file, options) == null;
	}
	getHighlightWorkerManager(file) {
		const { editSessionActive, workerManager } = this;
		return !editSessionActive && workerManager?.isWorkingPool() === true && !workerManager.shouldHighlightOnMainThread(file) ? workerManager : void 0;
	}
	cacheHighlightResult(file, renderResult) {
		const { editSessionActive, workerManager } = this;
		if (!editSessionActive && workerManager?.isWorkingPool() === true) workerManager.setFileResultCache(file.cacheKey, renderResult);
	}
	getLocalHighlightTheme() {
		return this.workerManager?.getFileRenderOptions().theme ?? this.options.theme ?? DEFAULT_THEMES;
	}
	getLineCutLength(options = this.options) {
		if (this.editSessionActive) return Infinity;
		const { tokenizeMaxLineLength = 1e3 } = this.getEffectiveCodeOptions(options);
		return tokenizeMaxLineLength > 0 ? tokenizeMaxLineLength : Infinity;
	}
	getEffectiveCodeOptions(options = this.options) {
		const poolOptions = this.workerManager?.getFileRenderOptions();
		return {
			theme: poolOptions?.theme ?? this.options.theme ?? DEFAULT_THEMES,
			tokenizeMaxLineLength: poolOptions?.tokenizeMaxLineLength ?? options.tokenizeMaxLineLength
		};
	}
	getRenderOptions(file) {
		const options = (() => {
			if (this.workerManager != null) {
				const poolOptions = this.workerManager.getFileRenderOptions();
				if (this.editSessionActive && poolOptions.useTokenTransformer !== true) return {
					...poolOptions,
					useTokenTransformer: true
				};
				return poolOptions;
			}
			const { tokenizeMaxLineLength = 1e3 } = this.options;
			return {
				theme: this.getLocalHighlightTheme(),
				useTokenTransformer: this.editSessionActive || this.options.useTokenTransformer === true,
				tokenizeMaxLineLength
			};
		})();
		const { renderCache } = this;
		if (renderCache?.result == null) return {
			options,
			forceHighlight: true
		};
		if (!areFileTargetsEqual(file, renderCache.file) || !areFileRenderOptionsEqual(options, renderCache.options)) return {
			options,
			forceHighlight: true
		};
		return {
			options,
			forceHighlight: false
		};
	}
	/**
	* Returns the file that the next synchronous render can commit without
	* changing the current render cache. Virtualized layouts use this to stay
	* aligned with the DOM while a replacement highlight is still pending.
	*/
	getFileForNextRender(file) {
		const { options } = this.getRenderOptions(file);
		if (this.getReadyRenderResult(file, options) != null) return file;
		const { renderCache } = this;
		if (renderCache == null) return file;
		if (areFileTargetsEqual(renderCache.file, file)) return renderCache.file;
		const forcePlainText = file.contents.length === 0 || isFilePlainText(file) || isFileMassive(this.getLineCount(file), this.getTokenizeMaxLength());
		return this.canRenderFile(file, options, forcePlainText) ? file : renderCache.file;
	}
	canRenderFile(file, options, forcePlainText) {
		const { renderCache } = this;
		if (renderCache == null || areFileTargetsEqual(renderCache.file, file)) return true;
		if (forcePlainText) return renderCache.result == null && renderCache.hydrated !== true || this.workerManager?.isWorkingPool() === true && !this.workerManager.shouldHighlightOnMainThread(file) || getHighlighterIfLoaded({ theme: options.theme }) != null;
		if (renderCache.result == null && renderCache.hydrated !== true) return true;
		if (this.getHighlightWorkerManager(file) != null) return !renderCache.highlighted;
		return getHighlighterIfLoaded({ theme: options.theme }) != null;
	}
	/** The number of lines the file renders, counting an empty last line. */
	getLineCount(file) {
		const { model } = this;
		if (model != null && model.file === file) return model.lineCount;
		return this.editSessionActive ? countLineBreaks(file.contents) + 1 : this.modelFor(file).lineCount;
	}
	modelFor(file) {
		const { model } = this;
		if (model != null && model.file === file) return model;
		if (this.editSessionActive) throw new Error("FileRenderer: only the session file renders during an edit session");
		return this.model = FileModel.fromFile(file);
	}
	renderCollapsed(file) {
		this.workerManager?.cancelLocalThemeRender(this);
		this.file = file;
		const { renderCache } = this;
		if (renderCache != null && (!areFileTargetsEqual(renderCache.file, file) || renderCache.hydrated === true && renderCache.result == null)) this.clearRenderCache();
		const theme = this.getLocalHighlightTheme();
		const highlighter = getHighlighterIfLoaded({ theme });
		if (highlighter == null) {
			this.initializeHighlighter("text").then(() => this.onRenderUpdate?.()).catch((error) => {
				if (!(error instanceof HighlighterDisposedError)) this.onHighlightError(error);
			});
			return;
		}
		const { disableFileHeader = false } = this.options;
		return {
			headerAST: disableFileHeader ? void 0 : this.renderHeader(file),
			themeStyles: getHighlighterThemeStyles({
				theme,
				highlighter
			}),
			baseThemeType: typeof theme === "string" ? highlighter.getTheme(theme).type : void 0
		};
	}
	renderFile(file = this.file, renderRange = DEFAULT_RENDER_RANGE) {
		this.file = file;
		if (file == null) {
			this.pendingHighlightResult = void 0;
			return;
		}
		let { options, forceHighlight } = this.getRenderOptions(file);
		const readyResult = this.getReadyRenderResult(file, options);
		this.pendingHighlightResult = void 0;
		if (readyResult != null) {
			this.renderCache = {
				...readyResult,
				file,
				renderRange: void 0,
				lines: this.lineSnapshot(this.modelFor(file))
			};
			forceHighlight = false;
		}
		this.renderCache ??= {
			file,
			highlighted: false,
			options,
			result: void 0,
			renderRange: void 0
		};
		const newContent = !areFileTargetsEqual(file, this.renderCache.file);
		const cacheFile = newContent ? file : this.renderCache.file;
		const model = this.modelFor(cacheFile);
		const hasContent = file.contents.length > 0;
		const forcePlainText = !hasContent || isFilePlainText(file) || isFileMassive(model.lineCount, this.getTokenizeMaxLength());
		const canRenderFile = this.canRenderFile(file, options, forcePlainText);
		const newRenderRange = !areRenderRangesEqual(this.renderCache.renderRange, renderRange);
		const workerManager = this.getHighlightWorkerManager(file);
		if (workerManager != null) {
			const preserveHydratedContent = this.renderCache.result == null && this.renderCache.highlighted && !forcePlainText && !newContent && isDefaultRenderRange(renderRange);
			if (canRenderFile && !preserveHydratedContent && (forcePlainText || this.renderCache.result == null || !this.renderCache.highlighted && (newContent || newRenderRange))) {
				this.renderCache.file = cacheFile;
				this.renderCache.options = options;
				this.renderCache.highlighted = false;
				if (this.renderCache.result == null || newContent || newRenderRange || forceHighlight) {
					const windowResult = workerManager.getPlainFileAST(file, renderRange.startingLine, renderRange.totalLines, model.lines);
					if (windowResult == null) this.waitForLocalTheme();
					const { result: currentResult } = this.renderCache;
					let nextResult = windowResult;
					if (currentResult != null && windowResult != null && !newContent && !forceHighlight) {
						addMissingRows(currentResult.code, windowResult.code);
						nextResult = currentResult;
					}
					if (nextResult !== currentResult) this.renderCache.lines = this.lineSnapshot(model);
					this.renderCache.result = nextResult;
				}
				this.renderCache.renderRange = renderRange;
			}
			if (!forcePlainText && hasContent && (!this.renderCache.highlighted || forceHighlight)) workerManager.highlightFileAST(this, file);
		} else {
			this.computedLang = file.lang ?? getFiletypeFromFileName(file.name);
			const highlighter = getHighlighterIfLoaded();
			const hasThemes = highlighter != null && areThemesAttached(options.theme, highlighter);
			const hasLangs = highlighter != null && areLanguagesAttached(this.computedLang, highlighter);
			const canHighlight = !forcePlainText && hasLangs;
			const lazyLineAST = Number.isFinite(renderRange.totalLines);
			if (canRenderFile && highlighter != null && hasThemes && (forceHighlight || !this.renderCache.highlighted && canHighlight || this.renderCache.result == null)) {
				const { result, options } = this.renderFileWithHighlighter(file, highlighter, forcePlainText || !hasLangs, lazyLineAST);
				this.renderCache = {
					file: cacheFile,
					options,
					highlighted: canHighlight,
					result,
					renderRange: void 0,
					lines: this.lineSnapshot(model)
				};
				if (canHighlight) this.cacheHighlightResult(file, {
					result,
					options
				});
			}
			if (!hasThemes || !forcePlainText && !hasLangs) {
				if (this.renderCache.result == null && !this.renderCache.highlighted && !this.editSessionActive && this.waitForLocalTheme(forcePlainText || hasLangs ? [] : [this.computedLang])) return;
				this.asyncHighlight(file, lazyLineAST).then(({ result, options }) => {
					if (!forcePlainText) this.cacheHighlightResult(file, {
						result,
						options
					});
					this.applyHighlightResult(file, result, options, !forcePlainText);
				}).catch((error) => {
					if (!(error instanceof HighlighterDisposedError)) this.onHighlightError(error);
				});
			}
		}
		if (this.renderCache.result != null) {
			this.workerManager?.cancelLocalThemeRender(this);
			return this.layoutResult(this.renderCache.file, renderRange, this.renderCache.result, this.renderCache.lines);
		}
		if (!this.editSessionActive) return;
		const { result } = this.editSessionRows(this.requireSession());
		return this.layoutResult(this.renderCache.file, renderRange, result, {
			ids: [],
			texts: []
		});
	}
	async asyncRender(file, renderRange = DEFAULT_RENDER_RANGE) {
		this.file = file;
		const { result } = await this.asyncHighlight(file, Number.isFinite(renderRange.totalLines));
		return this.layoutResult(file, renderRange, result, this.lineSnapshot(this.modelFor(file)));
	}
	async asyncHighlight(file, lazyLineAST = false) {
		const forcePlainText = isFileMassive(this.getLineCount(file), this.getTokenizeMaxLength());
		this.computedLang = forcePlainText ? "text" : file.lang ?? getFiletypeFromFileName(file.name);
		let highlighter = getHighlighterIfLoaded();
		const hasThemes = highlighter != null && areThemesAttached(this.getLocalHighlightTheme(), highlighter);
		const hasLangs = forcePlainText || highlighter != null && areLanguagesAttached(this.computedLang, highlighter);
		if (highlighter == null || !hasThemes || !hasLangs) highlighter = await this.initializeHighlighter();
		return this.renderFileWithHighlighter(file, highlighter, forcePlainText, lazyLineAST);
	}
	renderFileWithHighlighter(file, highlighter, forcePlainText = false, lazyLineAST = false) {
		const { options } = this.getRenderOptions(file);
		return {
			result: renderFileWithHighlighter(file, highlighter, options, {
				forcePlainText,
				lazyLineAST
			}),
			options
		};
	}
	lineSnapshot(model) {
		return model.live && model === this.model ? {
			ids: model.lineIds(),
			texts: model.lines.slice()
		} : void 0;
	}
	getRowSource(result, model, lines) {
		const { rowSource } = this;
		if (rowSource != null && rowSource.result === result) return rowSource.source;
		if (model.live && lines == null) throw new Error("FileRenderer: a highlight result for an edited file has no line snapshot");
		const highlightRows = {
			deletionRows: [],
			additionRows: result.code,
			additionLines: lines?.texts ?? model.lines,
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
	layoutInput(model, rows, renderRange) {
		this.lineCuts.setLimit(this.getLineCutLength());
		return {
			model,
			rows,
			renderRange,
			annotations: this.lineAnnotations,
			annotationSlotName: this.annotationSlotName
		};
	}
	layoutResult(file, renderRange, result, lines) {
		const { themeStyles, baseThemeType } = result;
		const { disableFileHeader = false } = this.options;
		const layout = this.layout ??= new FileLayout(this.lineCuts);
		const model = this.modelFor(file);
		const previousResult = this.rowSource?.result;
		const rows = this.getRowSource(result, model, lines);
		const { column, patched, rowCount, totalLines } = layout.layout(this.layoutInput(model, rows, renderRange));
		return {
			file,
			column,
			allRowsChanged: previousResult !== result,
			patched,
			preAST: this.createPreElement(totalLines),
			headerAST: !disableFileHeader ? this.renderHeader(file) : void 0,
			totalLines,
			rowCount,
			themeStyles,
			baseThemeType,
			bufferBefore: renderRange.bufferBefore,
			bufferAfter: renderRange.bufferAfter
		};
	}
	renderHeader(file) {
		const { headerRenderMode = "default", stickyHeader = false } = this.options;
		return createFileHeaderElement({
			fileOrDiff: file,
			mode: headerRenderMode,
			stickyHeader
		});
	}
	renderFullHTML(result) {
		return hastToHtml(this.renderFullAST(result));
	}
	renderFullAST(result, children = []) {
		children.push(createHastElement({
			tagName: "code",
			children: this.renderCodeAST(result),
			properties: { "data-code": "" }
		}));
		return {
			...result.preAST,
			children
		};
	}
	renderCodeAST(result) {
		const cells = columnCells(result.column);
		const gutter = createGutterWrapper();
		gutter.children = cells.gutter;
		gutter.properties.style = `grid-row: span ${result.rowCount}`;
		return [gutter, createContentColumn(cells.content, result.rowCount)];
	}
	initializeHighlighter(lang = this.computedLang) {
		return getSharedHighlighter(getHighlighterOptions(lang, {
			theme: this.getLocalHighlightTheme(),
			preferredHighlighter: resolvePreferredHighlighter(this.workerManager, this.options)
		}));
	}
	onHighlightSuccess(file, result, options, highlighted = true) {
		if (this.editSessionActive) return;
		this.applyHighlightResult(file, result, options, highlighted);
	}
	applyHighlightResult(file, result, options, highlighted = true) {
		const { file: currentFile, renderCache } = this;
		if (currentFile == null || renderCache == null || !areFileTargetsEqual(file, currentFile) || !areFileRenderOptionsEqual(options, this.getRenderOptions(currentFile).options)) return;
		if (!(renderCache.result == null || !renderCache.highlighted || !areFileRenderOptionsEqual(renderCache.options, options) || !areFileTargetsEqual(renderCache.file, currentFile))) return;
		this.pendingHighlightResult = {
			file: currentFile,
			options,
			highlighted,
			result
		};
		this.onRenderUpdate?.();
	}
	getMatchingWorkerResultCache(file, options) {
		if (this.editSessionActive) return;
		const cache = this.workerManager?.getFileResultCache(file);
		if (cache == null || !areFileRenderOptionsEqual(options, cache.options)) return;
		return cache;
	}
	getReadyRenderResult(file, options) {
		const { pendingHighlightResult } = this;
		if (pendingHighlightResult != null && areFileTargetsEqual(pendingHighlightResult.file, file) && areFileRenderOptionsEqual(pendingHighlightResult.options, options)) return pendingHighlightResult;
		const workerCache = this.getMatchingWorkerResultCache(file, options);
		if (workerCache == null || this.hasHighlightedRenderCache(file, options)) return;
		return {
			file,
			highlighted: true,
			...workerCache
		};
	}
	hasHighlightedRenderCache(file, options) {
		const { renderCache } = this;
		return renderCache?.result != null && renderCache.highlighted && areFileTargetsEqual(file, renderCache.file) && areFileRenderOptionsEqual(options, renderCache.options);
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
	createPreElement(totalLines) {
		const { disableLineNumbers = false, overflow = "scroll" } = this.options;
		return createPreElement({
			type: "file",
			diffIndicators: "none",
			disableBackground: true,
			disableLineNumbers,
			overflow,
			split: false,
			totalLines
		});
	}
};
function isFileMassive(lineCount, tokenizeMaxLength) {
	return lineCount > tokenizeMaxLength;
}
//#endregion
export { FileRenderer };

//# sourceMappingURL=FileRenderer.js.map