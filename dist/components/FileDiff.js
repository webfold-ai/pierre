import { CUSTOM_HEADER_SLOT_ID, DEFAULT_THEMES, EMPTY_LINE_ANNOTATIONS, HEADER_FILENAME_SUFFIX_SLOT_ID, HEADER_METADATA_SLOT_ID, HEADER_PREFIX_SLOT_ID } from "../constants.js";
import { HighlighterDisposedError } from "../highlighter/highlighterType.js";
import { getThemes } from "../utils/getThemes.js";
import { getHighlighterIfLoaded, getSharedHighlighter } from "../highlighter/shared_highlighter.js";
import { dequeueRender, queueRender } from "../managers/UniversalRenderingManager.js";
import { isSafari } from "../utils/platform.js";
import { getMeasuredScrollbarGutter } from "../utils/scrollbarGutter.js";
import { patchScrollbarGutterSize, wrapThemeCSS, wrapUnsafeCSS } from "../utils/cssWrappers.js";
import { getLineIndexForDiff } from "../utils/getLineIndexForDiff.js";
import { areObjectsEqual } from "../utils/areObjectsEqual.js";
import { i18n } from "../i18n/I18n.js";
import { createGutterWrapper } from "../utils/hast_utils.js";
import { getExpandedRegion, getHunkLineRange, getNearestRenderableAdditionLine, getTrailingExpandedRegion, isDiffLineInCollapsedContext } from "../utils/virtualDiffLayout.js";
import { createUnsafeCSSStyleNode } from "../utils/createUnsafeCSSStyleNode.js";
import { areThemesEqual } from "../utils/areThemesEqual.js";
import { isStyleNode } from "../utils/isStyleNode.js";
import { resolvePreferredHighlighter } from "../utils/resolvePreferredHighlighter.js";
import { CodeColumns } from "../dom/CodeColumns.js";
import { hastToHtml } from "../utils/hastToHtml.js";
import { ColumnReconciler } from "../dom/ColumnReconciler.js";
import { isLineKey } from "../layout/RowSpec.js";
import { InteractionManager, pluckInteractionOptions } from "../managers/InteractionManager.js";
import { ResizeManager } from "../managers/ResizeManager.js";
import { areRenderRangesEqual } from "../utils/areRenderRangesEqual.js";
import { createContentColumn } from "../utils/createContentColumn.js";
import { getFiletypeFromFileName } from "../utils/getFiletypeFromFileName.js";
import { getLineAnnotationName } from "../utils/getLineAnnotationName.js";
import { arePrePropertiesEqual } from "../utils/arePrePropertiesEqual.js";
import { createAnnotationWrapperNode } from "../utils/createAnnotationWrapperNode.js";
import { createGutterUtilityContentNode } from "../utils/createGutterUtilityContentNode.js";
import { createSVGSpriteElement, hydrateSVGSpriteElement } from "../utils/createSVGSpriteElement.js";
import { adoptEditSessionAnnotations, resolveEditSessionSlotName, writeEditSessionAnnotations } from "../utils/editSessionAnnotations.js";
import { getOrCreateCodeNode } from "../utils/getOrCreateCodeNode.js";
import { guardWebKitScrollDuringRebuild } from "../utils/guardWebKitScrollDuringRebuild.js";
import { upsertHostThemeStyle } from "../utils/hostTheme.js";
import { prerenderHTMLIfNecessary } from "../utils/prerenderHTMLIfNecessary.js";
import { setPreNodeProperties } from "../utils/setWrapperNodeProps.js";
import { isHandledWorkerPoolError } from "../worker/errors.js";
import "./web-components.js";
import { areDiffTargetsEqual } from "../utils/areDiffTargetsEqual.js";
import { areFilesEqual } from "../utils/areFilesEqual.js";
import { awaitWithTimeout } from "../utils/awaitWithTimeout.js";
import { getDiffFileInput } from "../utils/getDiffFileInput.js";
import { cloneFileDiffMetadata, cloneHunks } from "../utils/cloneFileDiffMetadata.js";
import { hydratePartialDiff } from "../utils/hydratePartialDiff.js";
import { parseDiffFromFile } from "../utils/parseDiffFromFile.js";
import { ScrollSyncManager } from "../managers/ScrollSyncManager.js";
import { finishEditSessionForDiff } from "../utils/editSessionHunks.js";
import { isDiffPlainText } from "../utils/isDiffPlainText.js";
import { DiffHunksRenderer } from "../renderers/DiffHunksRenderer.js";
import { areDiffLineAnnotationsEqual } from "../utils/areDiffLineAnnotationsEqual.js";
import { areHunkDataEqual } from "../utils/areHunkDataEqual.js";
import { getDiffHunksRendererOptions } from "../utils/getDiffHunksRendererOptions.js";
//#region src/components/FileDiff.ts
function canHydrateDiff(fileDiff) {
	return fileDiff.isPartial && (fileDiff.type === "change" || fileDiff.type === "rename-changed" || fileDiff.type === "rename-pure");
}
function shouldResetUndoState(prevDiff, nextDiff) {
	if (prevDiff.isPartial || nextDiff.isPartial) throw new Error("FileDiff.shouldResetEditorForExternalDiff: diffs must be fully hydrated");
	const prevLanguage = prevDiff.lang ?? getFiletypeFromFileName(prevDiff.name);
	const nextLanguage = nextDiff.lang ?? getFiletypeFromFileName(nextDiff.name);
	const prevHasOldFile = prevDiff.type !== "new";
	const nextHasOldFile = nextDiff.type !== "new";
	if (prevDiff.name !== nextDiff.name || prevLanguage !== nextLanguage || prevHasOldFile !== nextHasOldFile || prevDiff.deletionLines.length !== nextDiff.deletionLines.length) return true;
	return prevDiff.deletionLines.some((line, index) => line !== nextDiff.deletionLines[index]);
}
let instanceId = -1;
var FileDiff = class {
	options;
	workerManager;
	requestOwnerRender;
	static LoadedCustomComponent = true;
	__id = `file-diff:${++instanceId}`;
	type = "file-diff";
	fileContainer;
	spriteSVG;
	pre;
	codeColumns = new CodeColumns();
	bufferBefore;
	bufferAfter;
	themeCSSStyle;
	appliedThemeCSS;
	hasAdoptedThemeCSS = false;
	unsafeCSSStyle;
	appliedUnsafeCSS;
	gutterUtilityContent;
	headerElement;
	headerPrefix;
	headerFilenameSuffix;
	headerMetadata;
	headerCustom;
	separatorCache = /* @__PURE__ */ new Map();
	errorWrapper;
	placeHolder;
	hunksRenderer;
	resizeManager;
	scrollSyncManager;
	interactionManager;
	annotationCache = /* @__PURE__ */ new Map();
	get lineAnnotations() {
		return this.renderedData?.lineAnnotations ?? EMPTY_LINE_ANNOTATIONS;
	}
	managersDirty = false;
	appliedManagerSetup;
	deletionFile;
	additionFile;
	fileDiff;
	editSession;
	renderedData;
	pendingData;
	forceRenderOverride;
	renderRange;
	pendingFiles;
	pendingAttach;
	appliedPreAttributes;
	headerCache = {
		lastRenderedHTML: void 0,
		html: void 0,
		fileDiff: void 0,
		messagesVersion: void 0
	};
	lastRowCount;
	columnReconcilers = /* @__PURE__ */ new WeakMap();
	changedRowKeys = [];
	mounted = false;
	enabled = true;
	editor;
	constructor(options = { theme: DEFAULT_THEMES }, workerManager, requestOwnerRender) {
		this.options = options;
		this.workerManager = workerManager;
		this.requestOwnerRender = requestOwnerRender;
		this.hunksRenderer = this.createHunksRenderer(options);
		this.resizeManager = new ResizeManager();
		this.scrollSyncManager = new ScrollSyncManager();
		this.interactionManager = new InteractionManager("diff", pluckInteractionOptions(options, this.expandLine, typeof options.hunkSeparators === "function" || (options.hunkSeparators ?? "line-info") === "line-info" || options.hunkSeparators === "line-info-basic" ? this.handleExpandHunk : void 0, this.getLineIndex));
		this.enabled = true;
	}
	subscribeToChanges() {
		this.workerManager?.subscribeToThemeChanges(this);
		i18n.subscribe(this);
	}
	handleHighlightRender = () => {
		this.rerender();
	};
	getTheme() {
		return this.workerManager?.getDiffRenderOptions().theme ?? this.options.theme ?? DEFAULT_THEMES;
	}
	getHunksRendererOptions(options) {
		return getDiffHunksRendererOptions(options);
	}
	createHunksRenderer(options) {
		return new DiffHunksRenderer(this.getHunksRendererOptions(options), this.getAnnotationSlotName, this.handleHighlightRender, this.workerManager);
	}
	getLineIndex = (lineNumber, side = "additions") => {
		return this.getLineIndexForDiff(this.getDiffForLineIndex(), lineNumber, side);
	};
	getDiffForLineIndex() {
		return this.getRenderedDiff();
	}
	getLineIndexForDiff(fileDiff, lineNumber, side) {
		return getLineIndexForDiff(fileDiff, lineNumber, side);
	}
	setOptions(options) {
		if (options == null) return;
		if (options.unsafeCSS !== this.options.unsafeCSS) this.editor?.__setSearchPanelUnsafeCSS(options.unsafeCSS);
		this.options = options;
		this.clearReusableHeader();
		this.hunksRenderer.setOptions(this.getHunksRendererOptions(options));
		this.syncInteractionOptions();
		this.managersDirty = true;
	}
	syncInteractionOptions() {
		this.interactionManager.setOptions(pluckInteractionOptions(this.options, this.expandLine, typeof this.options.hunkSeparators === "function" || (this.options.hunkSeparators ?? "line-info") === "line-info" || this.options.hunkSeparators === "line-info-basic" ? this.handleExpandHunk : void 0, this.getLineIndex));
	}
	mergeOptions(options) {
		this.options = {
			...this.options,
			...options
		};
	}
	setThemeType(themeType) {
		if ((this.options.themeType ?? "system") === themeType) return;
		this.mergeOptions({ themeType });
		if (this.editSession != null) this.onThemeChange();
		else this.applyCachedThemeState(themeType);
	}
	applyCachedThemeState(themeType) {
		if (typeof this.options.theme === "string" || this.fileContainer == null || this.appliedThemeCSS == null) return false;
		const effectiveThemeType = this.appliedThemeCSS.baseThemeType ?? themeType;
		if (this.appliedThemeCSS.themeType === effectiveThemeType) return false;
		this.applyThemeState(this.fileContainer, this.appliedThemeCSS.themeStyles, themeType, this.appliedThemeCSS.baseThemeType);
		return true;
	}
	hasThemeChanged() {
		return this.appliedThemeCSS != null && !areThemesEqual(this.appliedThemeCSS.theme, this.getTheme());
	}
	getHoveredLine = () => {
		return this.interactionManager.getHoveredLine();
	};
	getAnnotationSlotName = (annotation) => {
		return resolveEditSessionSlotName(this.editSession?.annotations, annotation, getLineAnnotationName);
	};
	getLatestAnnotations() {
		return this.pendingData?.lineAnnotations ?? this.editSession?.annotations?.current ?? this.lineAnnotations;
	}
	getAnnotationsForDiff(fileDiff) {
		const { pendingData } = this;
		return pendingData != null && areDiffTargetsEqual(fileDiff, pendingData.fileDiff) ? pendingData.lineAnnotations : this.lineAnnotations;
	}
	isNewAnnotations(lineAnnotations) {
		const session = this.editSession?.annotations;
		if (lineAnnotations === this.getLatestAnnotations()) return false;
		return session == null || lineAnnotations !== session.provided && lineAnnotations !== session.current;
	}
	setLineAnnotations(lineAnnotations) {
		const sessionAnnotations = this.editSession?.annotations;
		if (sessionAnnotations != null) {
			if (!this.isNewAnnotations(lineAnnotations)) return;
			writeEditSessionAnnotations(sessionAnnotations, lineAnnotations, getLineAnnotationName);
		}
		const fileDiff = this.getWorkingDiff();
		if (fileDiff != null) this.pendingData = {
			fileDiff,
			lineAnnotations
		};
	}
	syncEditSessionAnnotationsFromEditor(lineAnnotations) {
		const session = this.editSession?.annotations;
		if (session == null || lineAnnotations === session.current) return false;
		session.current = lineAnnotations;
		if (this.renderedData != null) this.renderedData.lineAnnotations = lineAnnotations;
		this.pendingData = void 0;
		this.hunksRenderer.setLineAnnotations(lineAnnotations);
		this.renderAnnotations();
		return true;
	}
	setSelectedLines(range, options) {
		this.interactionManager.setSelection(range, options);
	}
	setEditorActiveLine(lineNumber, options) {
		this.interactionManager.setEditorActiveLine(lineNumber, {
			lineNumberOnly: options?.lineNumberOnly,
			side: options?.side ?? "additions"
		});
	}
	flushManagers() {
		if (this.pre == null) {
			this.managersDirty = false;
			return;
		}
		const { diffStyle = "split", overflow = "scroll" } = this.options;
		const setup = {
			overflow,
			diffStyle,
			disableAnnotations: overflow === "wrap" || this.lineAnnotations.length === 0,
			columnVariables: this.shouldApplyColumnVariables(overflow) ? "apply" : "measure"
		};
		if (!this.managersDirty && areObjectsEqual(setup, this.appliedManagerSetup)) return;
		this.interactionManager.setup(this.pre);
		this.resizeManager.setup(this.pre, {
			disableAnnotations: setup.disableAnnotations,
			columnVariables: setup.columnVariables
		});
		if (overflow === "scroll" && diffStyle === "split") this.scrollSyncManager.setup(this.pre, this.codeDeletions, this.codeAdditions);
		else this.scrollSyncManager.cleanUp();
		this.appliedManagerSetup = setup;
		this.managersDirty = false;
	}
	shouldApplyColumnVariables(overflow) {
		if (typeof this.options.hunkSeparators === "function") return true;
		return overflow === "scroll" && (this.lineAnnotations.length > 0 || this.pre?.hasAttribute("data-has-merge-conflict") === true);
	}
	get codeUnified() {
		return this.codeColumns.get("unified");
	}
	set codeUnified(code) {
		this.codeColumns.set("unified", code);
	}
	get codeDeletions() {
		return this.codeColumns.get("deletions");
	}
	set codeDeletions(code) {
		this.codeColumns.set("deletions", code);
	}
	get codeAdditions() {
		return this.codeColumns.get("additions");
	}
	set codeAdditions(code) {
		this.codeColumns.set("additions", code);
	}
	getCodeScrollLeft() {
		return this.codeColumns.scrollLeft;
	}
	setCodeScrollLeft(position) {
		this.codeColumns.setScrollLeft(position);
	}
	__getEffectiveCodeOptions() {
		return {
			...this.options,
			...this.hunksRenderer.getEffectiveCodeOptions(),
			themeType: this.options.themeType
		};
	}
	cleanUp(recycle = false) {
		const { editor } = this;
		editor?.__assertOutsideChangeCallback("FileDiff.cleanUp");
		dequeueRender(this.handleEditSessionRender);
		this.emitPostRender(true);
		editor?.cleanUp(recycle ? "recycle" : "discard");
		if (!recycle) this.editor = void 0;
		this.resizeManager.cleanUp();
		this.interactionManager.cleanUp();
		this.scrollSyncManager.cleanUp();
		this.managersDirty = false;
		this.workerManager?.unsubscribeToThemeChanges(this);
		i18n.unsubscribe(this);
		this.renderRange = void 0;
		if (!recycle) {
			this.pendingFiles = void 0;
			this.pendingAttach = void 0;
		}
		if (!this.isComponentManaged) this.fileContainer?.remove();
		this.fileContainer = void 0;
		this.mounted = false;
		if (!recycle) {
			this.renderedData = void 0;
			this.pendingData = void 0;
		}
		this.clearAuxiliaryNodes();
		this.annotationCache.clear();
		this.pre?.remove();
		this.pre = void 0;
		this.codeColumns.cleanUp();
		this.bufferBefore?.remove();
		this.bufferBefore = void 0;
		this.bufferAfter?.remove();
		this.bufferAfter = void 0;
		this.appliedPreAttributes = void 0;
		this.headerElement?.remove();
		this.headerElement = void 0;
		this.clearHeaderSlots();
		this.placeHolder?.remove();
		this.placeHolder = void 0;
		this.headerCache.lastRenderedHTML = void 0;
		if (!recycle) this.clearReusableHeader();
		this.errorWrapper?.remove();
		this.errorWrapper = void 0;
		this.spriteSVG = void 0;
		this.lastRowCount = void 0;
		this.themeCSSStyle = void 0;
		this.appliedThemeCSS = void 0;
		this.hasAdoptedThemeCSS = false;
		this.unsafeCSSStyle = void 0;
		this.appliedUnsafeCSS = void 0;
		if (recycle) this.hunksRenderer.recycle();
		else {
			this.hunksRenderer.cleanUp();
			this.workerManager = void 0;
			this.fileDiff = void 0;
			this.editSession = void 0;
			this.deletionFile = void 0;
			this.additionFile = void 0;
		}
		this.enabled = false;
	}
	virtualizedSetup() {
		this.enabled = true;
	}
	hydrate({ fileContainer, prerenderedHTML, preventEmit = false, lineAnnotations, fileDiff, ...fileInputProps }) {
		if (!this.enabled) throw new Error("FileDiff.hydrate: attempting to call hydrate after cleaned up");
		if (this.fileContainer != null) throw new Error("FileDiff.hydrate: hydrate can only be called before the instance has rendered or hydrated");
		const fileInput = getDiffFileInput(fileInputProps, "FileDiff.hydrate");
		const oldFile = fileInput?.oldFile;
		const newFile = fileInput?.newFile;
		this.hydrateElements(fileContainer, prerenderedHTML);
		const forceEditorRender = this.editor != null;
		if (forceEditorRender || shouldRenderCode(this.pre, hasDiffContent({
			fileDiff,
			oldFile,
			newFile
		}), this.options.collapsed) || shouldRenderHeader(this.headerElement, hasDiffHeaderContent({
			fileDiff,
			oldFile,
			newFile
		}), this.options.disableFileHeader)) this.render({
			...fileInputProps,
			fileContainer,
			lineAnnotations,
			fileDiff,
			forceRender: forceEditorRender || fileInputProps.forceRender,
			preventEmit: true
		});
		else this.hydrationSetup({
			fileDiff,
			lineAnnotations,
			...fileInput
		});
		if (!preventEmit) this.emitPostRender();
	}
	hydrateElements(fileContainer, prerenderedHTML) {
		if (this.fileContainer !== fileContainer) this.emitPostRender(true);
		prerenderHTMLIfNecessary(fileContainer, prerenderedHTML);
		for (const element of fileContainer.shadowRoot?.children ?? []) {
			if (element instanceof SVGElement) {
				this.spriteSVG = hydrateSVGSpriteElement(element);
				continue;
			}
			if (!(element instanceof HTMLElement)) continue;
			if (element instanceof HTMLPreElement) {
				this.pre = element;
				for (const code of element.children) {
					if (!(code instanceof HTMLElement) || code.tagName.toLowerCase() !== "code") continue;
					if ("deletions" in code.dataset) this.codeDeletions = code;
					if ("additions" in code.dataset) this.codeAdditions = code;
					if ("unified" in code.dataset) this.codeUnified = code;
				}
				continue;
			}
			if ("diffsHeader" in element.dataset) {
				this.headerElement = element;
				continue;
			}
			if (element instanceof HTMLStyleElement && element.hasAttribute("data-theme-css")) {
				this.themeCSSStyle = element;
				continue;
			}
			if (element instanceof HTMLStyleElement && element.hasAttribute("data-unsafe-css")) {
				this.unsafeCSSStyle = element;
				this.appliedUnsafeCSS = element.textContent;
				continue;
			}
		}
		if (this.pre != null) {
			this.syncCodeNodesFromPre(this.pre);
			this.pre.removeAttribute("data-dehydrated");
		}
		if (this.fileContainer == null) this.subscribeToChanges();
		this.fileContainer = fileContainer;
		this.hydrateMeasuredScrollbar();
	}
	hydrationSetup({ fileDiff, oldFile, newFile, lineAnnotations }) {
		const hydratedAnnotations = lineAnnotations ?? this.getLatestAnnotations();
		this.pendingData = void 0;
		this.additionFile = newFile;
		this.deletionFile = oldFile;
		this.fileDiff = fileDiff ?? (oldFile !== void 0 && newFile !== void 0 ? parseDiffFromFile(oldFile, newFile, this.options.parseDiffOptions) : void 0);
		this.renderedData = this.fileDiff != null ? {
			fileDiff: this.fileDiff,
			lineAnnotations: hydratedAnnotations
		} : void 0;
		if (this.fileDiff != null) this.adoptRenderData(this.fileDiff);
		if (this.pre == null) return;
		this.syncInteractionOptions();
		this.hunksRenderer.hydrate(this.fileDiff);
		this.renderAnnotations();
		this.renderGutterUtility();
		this.injectUnsafeCSS();
		this.managersDirty = true;
		this.flushManagers();
	}
	expandLine = (target) => {
		this.hunksRenderer.expandLine(target);
		this.rerender();
	};
	rerender() {
		if (!this.enabled || this.getInputDiff() == null && this.additionFile == null && this.deletionFile == null) return;
		if (this.requestRender()) return;
		this.render({
			forceRender: true,
			renderRange: this.renderRange
		});
	}
	requestRender() {
		const { requestOwnerRender } = this;
		if (this.editSession != null || requestOwnerRender == null) return false;
		this.forceRenderOverride = true;
		requestOwnerRender();
		return true;
	}
	get isComponentManaged() {
		return this.requestOwnerRender != null;
	}
	onThemeChange() {
		this.hunksRenderer.clearRenderCache();
		this.rerender();
	}
	onMessagesChange() {
		this.rerender();
	}
	handleExpandHunk = (hunkIndex, direction, expansionLineCountOverride) => {
		this.expandHunk(hunkIndex, direction, expansionLineCountOverride);
	};
	expandHunk = (hunkIndex, direction, expansionLineCountOverride) => {
		this.loadFilesIfNecessary();
		this.hunksRenderer.expandHunk(hunkIndex, direction, expansionLineCountOverride);
		this.rerender();
	};
	loadFilesIfNecessary() {
		const fileDiff = this.getInputDiff();
		const { loadDiffFiles } = this.options;
		if (fileDiff == null || !canHydrateDiff(fileDiff) || this.pendingFiles?.fileDiff === fileDiff) return;
		if (loadDiffFiles == null) throw new Error("FileDiff: loadDiffFiles is required to load full files for a partial diff");
		const promise = this.loadFilesForDiff(fileDiff, loadDiffFiles);
		const pendingFiles = this.pendingFiles = {
			fileDiff,
			promise
		};
		const clearPendingFiles = () => {
			if (this.pendingFiles === pendingFiles) this.pendingFiles = void 0;
		};
		pendingFiles.promise = promise.finally(clearPendingFiles);
	}
	/**
	* Whether a new edit session can start now: the diff is complete (not
	* `isPartial`) and no worker pool highlight the session would reuse is still
	* in flight. When true, `Editor.edit` can be called at once; otherwise await
	* `prepareForEditing`.
	*/
	isReadyToEdit() {
		const fileDiff = this.getInputDiff();
		return fileDiff != null && !fileDiff.isPartial && !this.hunksRenderer.awaitsPoolHighlight(fileDiff);
	}
	/**
	* Gets the diff ready for a new edit session. Call this before Editor.edit:
	* it loads a partial diff through `loadDiffFiles` and renders a pool
	* highlight that is still in flight, so the session starts from highlighted
	* rows instead of highlighting on the main thread. Resolves once this
	* instance can start editing.
	*/
	async prepareForEditing() {
		if (this.isReadyToEdit()) return;
		const pending = this.__prepareForEditing();
		if (pending == null) throw new Error("FileDiff.prepareForEditing: a diff is required before editing");
		await pending;
		if (!this.isReadyToEdit()) throw new Error("FileDiff.prepareForEditing: the diff is not ready to edit");
	}
	/**
	* @internal Resolves once an editor may attach to the current input, or
	* returns undefined when it already may or there is no input. The same
	* promise is returned while it is pending for the same input.
	*/
	__prepareForEditing() {
		const fileDiff = this.getInputDiff();
		if (fileDiff == null || this.isReadyToEdit()) return;
		if (fileDiff.isPartial && !canHydrateDiff(fileDiff)) throw new Error("FileDiff: this partial diff cannot be hydrated; provide a complete diff to edit");
		const { pendingAttach } = this;
		if (pendingAttach?.fileDiff === fileDiff) return pendingAttach.promise;
		const pending = {
			fileDiff,
			promise: this.prepareInputForEditing(fileDiff)
		};
		this.pendingAttach = pending;
		pending.promise = pending.promise.finally(() => {
			if (this.pendingAttach === pending) this.pendingAttach = void 0;
		});
		return pending.promise;
	}
	async prepareInputForEditing(fileDiff) {
		if (fileDiff.isPartial) {
			this.loadFilesIfNecessary();
			await this.pendingFiles?.promise;
			if (!this.enabled || this.getInputDiff() !== fileDiff) return;
		}
		await this.awaitPoolHighlight(fileDiff);
	}
	async awaitPoolHighlight(fileDiff) {
		if (!this.hunksRenderer.awaitsPoolHighlight(fileDiff)) return;
		await this.primeHighlightCache(fileDiff);
		if (this.enabled && this.getInputDiff() === fileDiff && !this.hunksRenderer.awaitsPoolHighlight(fileDiff)) this.rerender();
	}
	async loadFilesForDiff(fileDiff, loadDiffFiles) {
		try {
			const files = await loadDiffFiles(fileDiff);
			if (this.getInputDiff() !== fileDiff) return;
			await this.handleFilesLoaded(fileDiff, files);
		} catch (error) {
			if (this.options.disableErrorHandling === true) throw error;
			console.error(error);
		}
	}
	async handleFilesLoaded(expectedDiff, files) {
		if (this.getInputDiff() !== expectedDiff || !expectedDiff.isPartial) return;
		hydratePartialDiff("merge", expectedDiff, files, this.options.parseDiffOptions);
		this.setHydratedState(files);
		if (!this.installHydratedDiff(expectedDiff)) {
			await awaitWithTimeout(() => this.primeHighlightCache(expectedDiff));
			if (!this.enabled || this.getInputDiff() !== expectedDiff) return;
		}
		this.rerender();
	}
	installHydratedDiff(expectedDiff) {
		if (this.editSession == null || this.getInputDiff() !== expectedDiff) return false;
		this.replaceEditSession(expectedDiff, this.getLatestAnnotations());
		return true;
	}
	replaceEditSession(incomingDiff, lineAnnotations) {
		const { editor, editSession } = this;
		const previousDiff = editSession?.diff;
		this.installEditSession(incomingDiff);
		if (editor != null && previousDiff != null) editor.__replaceDocument(getAdditionFile(incomingDiff), shouldResetUndoState(previousDiff, incomingDiff), lineAnnotations);
	}
	updateInputDiff(incomingDiff, lineAnnotations) {
		if (areDiffTargetsEqual(this.getInputDiff(), incomingDiff)) return false;
		this.editor?.__assertOutsideChangeCallback("FileDiff.render");
		this.hunksRenderer.lineCuts.clear();
		const previousAnnotations = this.getLatestAnnotations();
		this.fileDiff = incomingDiff;
		const { editSession } = this;
		if (editSession?.annotations != null && lineAnnotations != null) editSession.annotations = adoptEditSessionAnnotations(lineAnnotations, getLineAnnotationName, editSession.annotations);
		if (editSession != null) {
			if (incomingDiff.isPartial) {
				editSession.inputDiff = incomingDiff;
				this.loadFilesIfNecessary();
			} else this.replaceEditSession(incomingDiff, editSession.annotations?.current ?? lineAnnotations ?? previousAnnotations);
		}
		this.pendingData = {
			fileDiff: this.editSession?.diff ?? incomingDiff,
			lineAnnotations: this.editSession?.annotations?.current ?? lineAnnotations ?? previousAnnotations
		};
		return true;
	}
	installEditSession(inputDiff, retainedDocument, retainedSession) {
		const sessionDiff = this.hunksRenderer.startEditSession(inputDiff, {
			document: retainedDocument,
			snapshot: retainedSession
		});
		const annotations = this.editSession?.annotations ?? adoptEditSessionAnnotations(this.getLatestAnnotations(), getLineAnnotationName);
		this.editSession = {
			diff: sessionDiff,
			inputDiff,
			annotations
		};
		this.pendingData = {
			fileDiff: sessionDiff,
			lineAnnotations: annotations.current
		};
	}
	setHydratedState(files) {
		this.deletionFile = files.oldFile;
		this.additionFile = files.newFile;
		this.workerManager?.cleanUpTasks(this.hunksRenderer);
		this.hunksRenderer.clearRenderCache();
	}
	render({ fileDiff, deferManagers = false, forceRender = false, preventEmit = false, lineAnnotations, fileContainer, containerWrapper, renderRange, ...fileInputProps }) {
		if (!this.enabled) throw new Error("FileDiff.render: attempting to call render after cleaned up");
		forceRender = this.forceRenderOverride ?? forceRender;
		this.forceRenderOverride = void 0;
		const fileInput = getDiffFileInput(fileInputProps, "FileDiff.render");
		const oldFile = fileInput?.oldFile;
		const newFile = fileInput?.newFile;
		this.editor?.__postponeBgTokenizeToNextFrame();
		const { collapsed = false, themeType = "system", expandUnchanged = false } = this.options;
		const nextRenderRange = collapsed ? void 0 : renderRange;
		const themeChanged = this.hasThemeChanged();
		const hasFileInput = fileInput != null;
		const filesDidChange = hasFileInput && (!areOptionalFilesEqual(oldFile, this.deletionFile) || !areOptionalFilesEqual(newFile, this.additionFile));
		let diffDidChange = fileDiff != null && !areDiffTargetsEqual(fileDiff, this.getInputDiff());
		const annotationsChanged = lineAnnotations != null && (lineAnnotations.length > 0 || this.getLatestAnnotations().length > 0) ? this.isNewAnnotations(lineAnnotations) : false;
		if (!collapsed && areRenderRangesEqual(nextRenderRange, this.renderRange) && !forceRender && !annotationsChanged && !themeChanged && (fileDiff != null && !diffDidChange || fileDiff == null && !filesDidChange)) {
			const rendered = this.applyCachedThemeState(themeType);
			if (rendered) this.finalizeRender();
			return rendered;
		}
		let nextParsedFileDiff;
		if (fileDiff == null && hasFileInput && (filesDidChange || this.getInputDiff() == null)) nextParsedFileDiff = parseDiffFromFile(fileInput.oldFile, fileInput.newFile, this.options.parseDiffOptions);
		if (fileDiff != null && diffDidChange || nextParsedFileDiff != null) this.editor?.__assertOutsideChangeCallback("FileDiff.render");
		this.renderRange = nextRenderRange;
		if (hasFileInput) {
			this.deletionFile = oldFile;
			this.additionFile = newFile;
		} else if (fileDiff != null) {
			this.deletionFile = void 0;
			this.additionFile = void 0;
		}
		if (fileDiff != null && diffDidChange) this.updateInputDiff(fileDiff, lineAnnotations);
		else if (nextParsedFileDiff != null) {
			diffDidChange = true;
			this.updateInputDiff(nextParsedFileDiff, lineAnnotations);
		}
		if (diffDidChange) this.clearReusableHeader();
		if (lineAnnotations != null) this.setLineAnnotations(lineAnnotations);
		if (annotationsChanged) this.managersDirty = true;
		const workingDiff = this.getWorkingDiff();
		if (workingDiff == null) return false;
		if (workingDiff.editSessionDirty === true && this.shouldSelfHealEditSession()) {
			finishEditSessionForDiff(workingDiff, this.options.parseDiffOptions);
			this.hunksRenderer.refreshHighlightedResult();
		}
		if (expandUnchanged) this.loadFilesIfNecessary();
		this.hunksRenderer.setOptions(this.getHunksRendererOptions(this.options));
		this.syncInteractionOptions();
		this.prepareRenderData(this.getDiffForNextRender(workingDiff));
		const { disableErrorHandling = false, disableFileHeader = false } = this.options;
		if (disableFileHeader) {
			if (this.headerElement != null) {
				this.headerElement.remove();
				this.headerElement = void 0;
				this.headerCache.lastRenderedHTML = void 0;
			}
			this.clearHeaderSlots();
		}
		fileContainer = this.getOrCreateFileContainer(fileContainer, containerWrapper);
		this.ensureSpriteSVG(fileContainer);
		this.applyCachedThemeState(themeType);
		if (collapsed) {
			this.removeRenderedCode();
			this.clearAuxiliaryNodes();
			try {
				const collapsedResult = this.hunksRenderer.renderCollapsed(workingDiff);
				if (collapsedResult != null) this.applyThemeState(fileContainer, collapsedResult.themeStyles, themeType, collapsedResult.baseThemeType);
				if (collapsedResult?.headerElement != null) this.applyHeaderToDOM(collapsedResult.headerElement, fileContainer, workingDiff);
				this.renderSeparators([]);
				this.adoptRenderData(workingDiff);
				this.injectUnsafeCSS();
			} catch (error) {
				if (disableErrorHandling) throw error;
				console.error(error);
				if (error instanceof Error) this.applyErrorToDOM(error, fileContainer);
			}
			this.finalizeRender();
			if (!preventEmit) this.emitPostRender();
			return true;
		}
		const editorRenderRange = this.editor != null ? this.hunksRenderer.editorRenderRange(workingDiff, nextRenderRange) : void 0;
		const finishedTokens = this.editor?.__prepareRender(editorRenderRange);
		if (finishedTokens != null) this.hunksRenderer.setTokens(finishedTokens);
		try {
			const pre = this.getOrCreatePreNode(fileContainer);
			const hunksResult = this.hunksRenderer.renderDiff(workingDiff, nextRenderRange);
			if (hunksResult == null) return false;
			this.applyThemeState(fileContainer, hunksResult.themeStyles, themeType, hunksResult.baseThemeType);
			if (hunksResult.headerElement != null) this.applyHeaderToDOM(hunksResult.headerElement, fileContainer, hunksResult.fileDiff);
			const { unified, deletions, additions } = hunksResult.columns;
			if (unified != null || deletions != null || additions != null) this.applyHunksToDOM(pre, hunksResult);
			else if (this.pre != null) {
				this.pre.remove();
				this.pre = void 0;
			}
			this.renderSeparators(hunksResult.hunkData);
			this.adoptRenderData(hunksResult.fileDiff);
			this.applyBuffers(pre, nextRenderRange);
			this.injectUnsafeCSS();
			this.renderAnnotations();
			this.renderGutterUtility();
			if (!deferManagers) this.flushManagers();
			this.finalizeRender();
			if (this.editor != null) this.syncRenderViewToEditor(editorRenderRange);
		} catch (error) {
			if (disableErrorHandling) throw error;
			console.error(error);
			if (error instanceof Error) this.applyErrorToDOM(error, fileContainer);
		}
		if (!preventEmit) this.emitPostRender();
		return true;
	}
	finalizeRender() {}
	emitPostRender(unmount = false) {
		const { fileContainer, options: { onPostRender } } = this;
		if (unmount) {
			if (!this.mounted) return;
			this.mounted = false;
			if (fileContainer == null) return;
			this.options.onPostRender?.(fileContainer, this, "unmount");
			return;
		}
		if (fileContainer == null) return;
		const phase = this.mounted ? "update" : "mount";
		this.mounted = true;
		onPostRender?.(fileContainer, this, phase);
	}
	getInputDiff() {
		return this.fileDiff;
	}
	getWorkingDiff(fallbackDiff = this.fileDiff) {
		return this.editSession?.diff ?? fallbackDiff;
	}
	getRenderedDiff() {
		return this.renderedData?.fileDiff;
	}
	/**
	* @internal Data the next render() with this input will display. While a
	* replacement diff is being highlighted, this is still the displayed data.
	*/
	__getNextRenderData({ fileDiff, lineAnnotations }) {
		const sessionAnnotations = this.editSession?.annotations;
		if (sessionAnnotations != null) return {
			fileDiff,
			lineAnnotations: lineAnnotations != null && this.isNewAnnotations(lineAnnotations) ? lineAnnotations : sessionAnnotations.provided
		};
		const workingDiff = this.getWorkingDiff(fileDiff) ?? fileDiff;
		const nextDiff = this.getDiffForNextRender(workingDiff);
		return {
			fileDiff: nextDiff,
			lineAnnotations: lineAnnotations != null && areDiffTargetsEqual(nextDiff, workingDiff) ? lineAnnotations : this.getAnnotationsForDiff(nextDiff)
		};
	}
	getDiffForNextRender(workingDiff) {
		const { collapsed = false } = this.options;
		return collapsed ? workingDiff : this.hunksRenderer.getDiffForNextRender(workingDiff);
	}
	prepareRenderData(fileDiff) {
		this.hunksRenderer.setLineAnnotations(this.getAnnotationsForDiff(fileDiff));
	}
	adoptRenderData(fileDiff) {
		const { pendingData } = this;
		const matchesPending = pendingData != null && areDiffTargetsEqual(fileDiff, pendingData.fileDiff);
		this.renderedData = {
			fileDiff,
			lineAnnotations: matchesPending ? pendingData.lineAnnotations : this.lineAnnotations
		};
		if (matchesPending) this.pendingData = void 0;
	}
	syncRenderViewToEditor(renderRange = this.hunksRenderer.editorRenderRange(this.getWorkingDiff(), this.renderRange)) {
		const { editor, fileContainer } = this;
		const lineAnnotations = this.getLatestAnnotations();
		const fileDiff = this.getWorkingDiff();
		if (editor == null || fileContainer == null || fileDiff == null || fileDiff.isPartial) return;
		const sync = (highlighter) => {
			if (!this.enabled || this.editor !== editor || this.fileContainer !== fileContainer || this.getWorkingDiff() !== fileDiff) return;
			editor.__syncRenderView({
				highlighter,
				fileContainer,
				columns: this.editorColumns(),
				fileDiff,
				lineAnnotations,
				renderRange,
				domCurrent: this.hunksRenderer.editorRenderReady()
			});
		};
		const theme = this.getTheme();
		const lang = fileDiff.lang ?? getFiletypeFromFileName(fileDiff.name);
		const highlighter = getHighlighterIfLoaded({
			theme,
			lang
		});
		if (highlighter != null) sync(highlighter);
		else getSharedHighlighter({
			themes: getThemes(theme),
			langs: ["text", lang],
			preferredHighlighter: resolvePreferredHighlighter(this.workerManager, this.options)
		}).then(sync).catch((error) => {
			if (!(error instanceof HighlighterDisposedError)) console.error(error);
		});
	}
	/** @internal Settle annotations locally. */
	__acceptEditorChange(event) {
		const { lineAnnotations } = event;
		if (lineAnnotations != null) this.syncEditSessionAnnotationsFromEditor(lineAnnotations);
	}
	emitEditChange(event) {
		const { onEditChange } = this.options;
		onEditChange?.(event);
	}
	/**
	* @internal Capture the current diff session, or return `undefined` when no
	* complete compatible session exists.
	*
	* When `clone` is true, the returned lines and hunks are copied.
	*/
	__captureDocumentSessionState(clone = true) {
		const sessionDiff = this.editSession?.diff;
		if (sessionDiff == null || sessionDiff.isPartial) return;
		return {
			diffSession: {
				oldFile: sessionDiff.type !== "new" ? {
					name: sessionDiff.prevName ?? sessionDiff.name,
					lines: clone ? [...sessionDiff.deletionLines] : sessionDiff.deletionLines
				} : null,
				type: sessionDiff.type,
				hunks: clone ? cloneHunks(sessionDiff.hunks) : sessionDiff.hunks
			},
			hasChanges: sessionDiff.editSessionDirty === true
		};
	}
	/** @internal Associate this component with its editor for a render lifecycle. */
	__attachEditor(editor) {
		if (this.type !== "file-diff") throw new Error(`FileDiff.__attachEditor: cannot attach an editor to a "${this.type}" diff`);
		if (this.editor != null) throw new Error("FileDiff.__attachEditor: an editor is already attached");
		if (!this.isReadyToEdit()) throw new Error("FileDiff.__attachEditor: the component is not ready to edit; await prepareForEditing() first");
		const detach = () => {
			this.editor = void 0;
			this.endEditSession();
		};
		try {
			this.resumeEditorRendering(editor);
			return detach;
		} catch (error) {
			detach();
			throw error;
		}
	}
	/** @internal Resume rendering for the editor already associated with this component. */
	__resumeEditor(editor) {
		if (this.editor !== editor) throw new Error("FileDiff.__resumeEditor: editor association changed");
		this.resumeEditorRendering(editor);
	}
	resumeEditorRendering(editor) {
		const inputDiff = this.getInputDiff();
		const initialInputDiff = this.editSession == null && inputDiff != null && !inputDiff.isPartial ? inputDiff : void 0;
		if (initialInputDiff != null) this.installEditSession(initialInputDiff, editor.__getDocumentContents(getAdditionFile(initialInputDiff)), editor.__getDocumentSessionState());
		this.editor = editor;
		if (this.getInputDiff()?.isPartial === true) this.loadFilesIfNecessary();
		const editSessionDiff = this.editSession?.diff;
		if (editSessionDiff != null && this.hunksRenderer.editorRenderReady() && this.hunksRenderer.diffCache === editSessionDiff) this.adoptRenderData(editSessionDiff);
		this.renderChange(true);
	}
	/**
	* @internal
	*
	* Ends the edit session and settles which diff this component renders.
	* Requires the editor to be detached first. Does nothing when no session
	* exists, so callers can invoke it again safely after it has settled.
	*
	* `onEditComplete` receives the completed diff, current input diff,
	* complete file pair, and both annotation collections even when the final
	* text is unchanged. In `install` mode, accepting installs the completed diff
	* and its annotations; rejecting or having no handler restores the external
	* values. `discard` mode always restores the external values. An accepted
	* diff cannot reuse the replaced diff's `cacheKey`.
	*/
	__completeEditSession(editor, mode) {
		this.settleEditSession(mode === "install", editor);
	}
	settleEditSession(installResult, editor) {
		const { editSession } = this;
		if (editSession == null) return;
		const { diff: editSessionDiff, inputDiff, annotations: editSessionAnnotations } = editSession;
		const inputAnnotations = editSessionAnnotations?.provided ?? this.lineAnnotations;
		if (this.editor != null) throw new Error("FileDiff.__completeEditSession: detach the editor before completing the session");
		this.endEditSession();
		const sessionAnnotationsCurrent = editSessionAnnotations?.current;
		let acceptedDiff;
		let acceptedOldFile = null;
		let acceptedNewFile = null;
		let failed = false;
		let failure;
		if (editor == null) throw new Error("FileDiff.__completeEditSession: editor is required for completion");
		const completedDiff = cloneFileDiffMetadata(editSessionDiff);
		const newFile = {
			name: completedDiff.name,
			contents: completedDiff.additionLines.join("")
		};
		if (completedDiff.lang != null) newFile.lang = completedDiff.lang;
		const event = {
			fileDiff: completedDiff,
			editor,
			originalFileDiff: inputDiff,
			oldFile: completedDiff.type === "new" ? null : {
				name: completedDiff.prevName ?? completedDiff.name,
				contents: completedDiff.deletionLines.join("")
			},
			newFile,
			lineAnnotations: sessionAnnotationsCurrent,
			originalLineAnnotations: inputAnnotations
		};
		Object.freeze(event);
		try {
			editor.__emitEditComplete(event);
			if (this.options.onEditComplete?.(event) === "accept") {
				if (completedDiff.cacheKey != null && completedDiff.cacheKey === inputDiff.cacheKey) throw new Error("FileDiff.__completeEditSession: an accepted diff must not reuse the replaced diff cacheKey");
				acceptedDiff = completedDiff;
				acceptedOldFile = event.oldFile;
				acceptedNewFile = event.newFile;
			}
		} catch (error) {
			failed = true;
			failure = error;
		}
		if (installResult && acceptedDiff != null) {
			this.hunksRenderer.lineCuts.clear();
			if (this.additionFile != null) {
				this.deletionFile = acceptedOldFile;
				this.additionFile = acceptedNewFile;
			}
		}
		this.editSession = void 0;
		this.fileDiff = installResult && acceptedDiff != null ? acceptedDiff : inputDiff;
		this.pendingData = {
			fileDiff: this.fileDiff,
			lineAnnotations: installResult && acceptedDiff != null ? sessionAnnotationsCurrent ?? inputAnnotations : inputAnnotations
		};
		if (installResult && this.fileContainer != null) this.rerender();
		if (failed) throw failure;
	}
	endEditSession() {
		if (this.editSession == null) return;
		if (this.hunksRenderer.endEditSession()) this.hunksRenderer.refreshHighlightedResult();
		this.escalateEditSessionRender("exit");
	}
	/**
	* @internal Applies one change of the editor's document to the diff and the
	* rows on screen.
	*/
	applyChange(document, change, options = {}) {
		if (this.editSession == null) throw new Error("FileDiff.applyChange: requires an active edit session");
		const { tokens, lineAnnotations } = options;
		const { lineDelta, removedLineIds, regionsChanged, hunksChanged } = this.hunksRenderer.applyChange(change, document, tokens);
		if (lineAnnotations != null) this.syncEditSessionAnnotationsFromEditor(lineAnnotations);
		const rowsMoved = lineDelta !== 0 || removedLineIds.length > 0 || regionsChanged;
		this.renderChange(rowsMoved || hunksChanged);
		if (this.fileContainer == null || this.editSession == null) return { rebuiltLines: [] };
		if (rowsMoved) this.interactionManager.setSelectionDirty();
		return { rebuiltLines: this.takeRebuiltLines() };
	}
	renderChange(_structural) {
		if (this.fileContainer == null) return;
		this.rerender();
	}
	/** @internal Repaints lines the editor tokenized in the background. */
	applyTokens(tokens) {
		if (this.editSession == null) return;
		if (this.hunksRenderer.setTokens(tokens).some((line) => this.lineElement(line) != null)) this.rerender();
	}
	recordRowsWritten({ changed, attributesReset, gutterRewritten }) {
		for (const key of changed) {
			this.changedRowKeys.push(key);
			if (!isLineKey(key)) this.managersDirty = true;
		}
		if (attributesReset) this.interactionManager.setSelectionDirty();
		if (attributesReset || gutterRewritten) this.managersDirty = true;
	}
	/** @internal The element showing a line of the editor's document, if rendered. */
	lineElement(line) {
		const code = this.codeAdditions ?? this.codeUnified;
		if (code == null || this.editSession == null) return;
		const key = this.hunksRenderer.lineKey(line);
		return key == null ? void 0 : this.columnReconcilers.get(code)?.elementFor(key)?.content;
	}
	/**
	* @internal The document line where editing continues from an old-file line
	* number: the line itself for context, the first line a change added for a
	* deleted one, or the line after a deletion that added nothing. Undefined
	* outside an edit session or outside every hunk.
	*/
	editLineFor(deletionLineNumber) {
		return this.editSession != null ? this.hunksRenderer.editLineFor(deletionLineNumber) : void 0;
	}
	takeRebuiltLines() {
		const keys = this.changedRowKeys;
		this.changedRowKeys = [];
		const lines = [];
		for (const key of keys) {
			const line = this.hunksRenderer.lineOfKey(key);
			if (line != null) lines.push(line);
		}
		return lines;
	}
	isLineInCollapsedContext(lineNumber, side = "additions", expandedHunks = this.hunksRenderer.getExpandedHunksMap()) {
		const fileDiff = this.getRenderedDiff() ?? this.getWorkingDiff();
		if (fileDiff == null) return false;
		const { expandUnchanged = false, collapsedContextThreshold = 1 } = this.options;
		return isDiffLineInCollapsedContext({
			fileDiff,
			lineNumber,
			side,
			expandedHunks: expandUnchanged ? true : expandedHunks,
			collapsedContextThreshold
		});
	}
	getNearestRenderableLine(lineNumber, direction) {
		const fileDiff = this.getRenderedDiff() ?? this.getWorkingDiff();
		if (fileDiff == null) return lineNumber;
		const { expandUnchanged = false, collapsedContextThreshold = 1 } = this.options;
		return getNearestRenderableAdditionLine({
			fileDiff,
			lineNumber,
			direction,
			expandedHunks: expandUnchanged ? true : this.hunksRenderer.getExpandedHunksMap(),
			collapsedContextThreshold
		});
	}
	revealLine(lineNumber, side = "additions") {
		const fileDiff = this.getRenderedDiff() ?? this.getWorkingDiff();
		const { expandUnchanged = false, collapsedContextThreshold = 1, expansionLineCount = 100 } = this.options;
		if (fileDiff == null || fileDiff.isPartial || expandUnchanged) return false;
		const expandedHunks = this.hunksRenderer.getExpandedHunksMap();
		for (const [hunkIndex, hunk] of fileDiff.hunks.entries()) {
			const [hunkStart, hunkEnd] = getHunkLineRange(hunk, side);
			if (lineNumber < hunkStart) {
				const region = getExpandedRegion({
					isPartial: fileDiff.isPartial,
					rangeSize: hunk.collapsedBefore,
					expandedHunks,
					hunkIndex,
					collapsedContextThreshold
				});
				const gapStart = hunkStart - region.rangeSize;
				if (region.renderAll || lineNumber < gapStart + region.fromStart || lineNumber >= hunkStart - region.fromEnd) return false;
				const fromStartDistance = lineNumber - (gapStart + region.fromStart) + 1;
				const fromEndDistance = hunkStart - region.fromEnd - lineNumber;
				if (fromStartDistance <= fromEndDistance) this.expandHunk(hunkIndex, "up", fromStartDistance + expansionLineCount);
				else this.expandHunk(hunkIndex, "down", fromEndDistance + expansionLineCount);
				return true;
			}
			if (lineNumber < hunkEnd) return false;
		}
		const trailingRegion = getTrailingExpandedRegion({
			fileDiff,
			hunkIndex: fileDiff.hunks.length - 1,
			expandedHunks,
			collapsedContextThreshold,
			errorPrefix: "FileDiff.revealLine"
		});
		if (trailingRegion == null || trailingRegion.renderAll) return false;
		const lastHunk = fileDiff.hunks[fileDiff.hunks.length - 1];
		const [, trailingStart] = getHunkLineRange(lastHunk, side);
		if (lineNumber < trailingStart + trailingRegion.fromStart || lineNumber >= trailingStart + trailingRegion.rangeSize) return false;
		this.expandHunk(fileDiff.hunks.length, "up", lineNumber - (trailingStart + trailingRegion.fromStart) + 1 + expansionLineCount);
		return true;
	}
	shouldSelfHealEditSession() {
		return this.editor == null;
	}
	escalateEditSessionRender(_cause) {
		queueRender(this.handleEditSessionRender);
	}
	handleEditSessionRender = () => {
		this.rerender();
	};
	removeRenderedCode() {
		this.resizeManager.cleanUp();
		this.scrollSyncManager.cleanUp();
		this.interactionManager.cleanUp();
		this.bufferBefore?.remove();
		this.bufferBefore = void 0;
		this.bufferAfter?.remove();
		this.bufferAfter = void 0;
		this.codeUnified?.remove();
		this.codeDeletions?.remove();
		this.codeAdditions?.remove();
		this.codeColumns.cleanUp();
		this.pre?.remove();
		this.pre = void 0;
		this.appliedPreAttributes = void 0;
		this.lastRowCount = void 0;
	}
	clearAuxiliaryNodes() {
		for (const { element } of this.separatorCache.values()) element.remove();
		this.separatorCache.clear();
		for (const { element } of this.annotationCache.values()) element.remove();
		this.annotationCache.clear();
		this.gutterUtilityContent?.remove();
		this.gutterUtilityContent = void 0;
	}
	renderPlaceholder(height) {
		if (this.fileContainer == null) return false;
		this.editor?.__captureFocusForDOMReplacement();
		this.emitPostRender(true);
		this.cleanChildNodes();
		if (this.placeHolder == null) {
			const shadowRoot = this.fileContainer.shadowRoot ?? this.fileContainer.attachShadow({ mode: "open" });
			this.placeHolder = document.createElement("div");
			this.placeHolder.dataset.placeholder = "";
			shadowRoot.appendChild(this.placeHolder);
		}
		return this.setPlaceholderHeight(height);
	}
	setPlaceholderHeight(height) {
		if (this.placeHolder == null) return false;
		this.placeHolder.style.setProperty("height", `${height}px`);
		return true;
	}
	async primeHighlightCache(fileDiff = this.getInputDiff()) {
		const { workerManager } = this;
		if (fileDiff == null || workerManager == null || !workerManager.isWorkingPool() || fileDiff.cacheKey == null || isDiffPlainText(fileDiff)) return;
		const tokenizeMaxLength = this.options.tokenizeMaxLength ?? 1e5;
		if (Math.max(fileDiff.additionLines.length, fileDiff.deletionLines.length) > tokenizeMaxLength) return;
		await workerManager.primeDiffHighlightCache(fileDiff).catch((error) => {
			if (isHandledWorkerPoolError(error)) return;
			console.error(error);
		});
	}
	cleanChildNodes() {
		this.resizeManager.cleanUp();
		this.scrollSyncManager.cleanUp();
		this.interactionManager.cleanUp();
		this.clearAuxiliaryNodes();
		this.bufferAfter?.remove();
		this.bufferBefore?.remove();
		this.codeAdditions?.remove();
		this.codeDeletions?.remove();
		this.codeUnified?.remove();
		this.errorWrapper?.remove();
		this.headerElement?.remove();
		this.headerPrefix?.remove();
		this.headerFilenameSuffix?.remove();
		this.headerMetadata?.remove();
		this.headerCustom?.remove();
		this.pre?.remove();
		this.spriteSVG?.remove();
		this.themeCSSStyle?.remove();
		this.unsafeCSSStyle?.remove();
		this.bufferAfter = void 0;
		this.bufferBefore = void 0;
		this.codeColumns.cleanUp();
		this.errorWrapper = void 0;
		this.headerElement = void 0;
		this.headerPrefix = void 0;
		this.headerFilenameSuffix = void 0;
		this.headerMetadata = void 0;
		this.headerCustom = void 0;
		this.pre = void 0;
		this.spriteSVG = void 0;
		this.themeCSSStyle = void 0;
		this.appliedThemeCSS = void 0;
		this.hasAdoptedThemeCSS = false;
		this.unsafeCSSStyle = void 0;
		this.appliedUnsafeCSS = void 0;
		this.headerCache.lastRenderedHTML = void 0;
		this.lastRowCount = void 0;
		this.mounted = false;
	}
	renderSeparators(hunkData) {
		const { hunkSeparators } = this.options;
		if (this.isComponentManaged || this.fileContainer == null || typeof hunkSeparators !== "function") {
			for (const { element } of this.separatorCache.values()) element.remove();
			this.separatorCache.clear();
			return;
		}
		const staleSeparators = new Map(this.separatorCache);
		for (const hunk of hunkData) {
			const id = hunk.slotName;
			let cache = this.separatorCache.get(id);
			if (cache == null || !areHunkDataEqual(hunk, cache.hunkData)) {
				cache?.element.remove();
				const element = document.createElement("div");
				element.style.display = "contents";
				element.slot = hunk.slotName;
				const child = hunkSeparators(hunk, this);
				if (child != null) element.appendChild(child);
				this.fileContainer.appendChild(element);
				cache = {
					element,
					hunkData: hunk
				};
				this.separatorCache.set(id, cache);
			}
			staleSeparators.delete(id);
		}
		for (const [id, { element }] of staleSeparators.entries()) {
			this.separatorCache.delete(id);
			element.remove();
		}
	}
	renderAnnotations() {
		if (this.isComponentManaged || this.fileContainer == null) {
			for (const { element } of this.annotationCache.values()) element.remove();
			this.annotationCache.clear();
			return;
		}
		const staleAnnotations = new Map(this.annotationCache);
		const { renderedData, options: { renderAnnotation } } = this;
		if (renderAnnotation != null && renderedData != null) {
			const { fileDiff, lineAnnotations } = renderedData;
			for (const [index, annotation] of lineAnnotations.entries()) {
				const name = this.getAnnotationSlotName(annotation);
				const id = `${index}-${name}`;
				let cache = this.annotationCache.get(id);
				if (cache == null || cache.fileDiff !== fileDiff || !areDiffLineAnnotationsEqual(annotation, cache.annotation)) {
					cache?.element.remove();
					const content = renderAnnotation(annotation, fileDiff);
					if (content == null) continue;
					cache = {
						element: createAnnotationWrapperNode(name),
						annotation,
						fileDiff
					};
					cache.element.appendChild(content);
					this.fileContainer.appendChild(cache.element);
					this.annotationCache.set(id, cache);
				}
				staleAnnotations.delete(id);
			}
		}
		for (const [id, { element }] of staleAnnotations.entries()) {
			this.annotationCache.delete(id);
			element.remove();
		}
	}
	renderGutterUtility() {
		const { renderGutterUtility } = this.options;
		if (this.fileContainer == null || renderGutterUtility == null) {
			this.gutterUtilityContent?.remove();
			this.gutterUtilityContent = void 0;
			return;
		}
		const element = renderGutterUtility(this.interactionManager.getHoveredLine);
		if (element != null && this.gutterUtilityContent != null) return;
		else if (element == null) {
			this.gutterUtilityContent?.remove();
			this.gutterUtilityContent = void 0;
			return;
		}
		const gutterUtilityContent = createGutterUtilityContentNode();
		gutterUtilityContent.appendChild(element);
		this.fileContainer.appendChild(gutterUtilityContent);
		this.gutterUtilityContent = gutterUtilityContent;
	}
	getOrCreateFileContainer(fileContainer, parentNode) {
		const { fileContainer: previousContainer } = this;
		const nextContainer = fileContainer ?? previousContainer ?? document.createElement("diffs-container");
		const containerChanged = previousContainer !== nextContainer;
		if (previousContainer != null && containerChanged) this.editor?.__captureFocusForDOMReplacement();
		if (containerChanged) this.emitPostRender(true);
		if (previousContainer == null) this.subscribeToChanges();
		this.fileContainer = nextContainer;
		if (previousContainer != null && containerChanged) {
			this.headerCache.lastRenderedHTML = void 0;
			this.headerElement = void 0;
		}
		if (parentNode != null && this.fileContainer.parentNode !== parentNode) parentNode.appendChild(this.fileContainer);
		if (containerChanged) this.adoptReusableShellElements(this.fileContainer);
		return this.fileContainer;
	}
	adoptReusableShellElements(fileContainer) {
		const { shadowRoot } = fileContainer;
		if (shadowRoot == null) return;
		for (const element of shadowRoot.children) if (element instanceof SVGElement) this.spriteSVG ??= element;
		else if (isStyleNode(element) && element.hasAttribute("data-theme-css")) {
			this.themeCSSStyle ??= element;
			this.hasAdoptedThemeCSS = true;
		} else if (isStyleNode(element) && element.hasAttribute("data-unsafe-css")) {
			this.unsafeCSSStyle ??= element;
			this.appliedUnsafeCSS ??= this.options.unsafeCSS ?? void 0;
		}
	}
	ensureSpriteSVG(fileContainer) {
		const shadowRoot = fileContainer.shadowRoot ?? fileContainer.attachShadow({ mode: "open" });
		this.spriteSVG ??= createSVGSpriteElement();
		if (this.spriteSVG != null && this.spriteSVG.parentNode !== shadowRoot) shadowRoot.appendChild(this.spriteSVG);
	}
	getOrCreatePreNode(container) {
		const shadowRoot = container.shadowRoot ?? container.attachShadow({ mode: "open" });
		if (this.pre == null) {
			this.pre = document.createElement("pre");
			this.appliedPreAttributes = void 0;
			this.codeColumns.cleanUp();
			shadowRoot.appendChild(this.pre);
			this.managersDirty = true;
		} else if (this.pre.parentNode !== shadowRoot) {
			this.editor?.__captureFocusForDOMReplacement();
			shadowRoot.appendChild(this.pre);
			this.appliedPreAttributes = void 0;
			this.managersDirty = true;
		}
		this.placeHolder?.remove();
		this.placeHolder = void 0;
		return this.pre;
	}
	syncCodeNodesFromPre(pre) {
		this.codeColumns.cleanUp();
		for (const child of Array.from(pre.children)) {
			if (!(child instanceof HTMLElement)) continue;
			if (child.hasAttribute("data-unified")) this.codeUnified = child;
			else if (child.hasAttribute("data-deletions")) this.codeDeletions = child;
			else if (child.hasAttribute("data-additions")) this.codeAdditions = child;
		}
	}
	applyHeaderToDOM(headerAST, container, fileDiff) {
		this.cleanupErrorWrapper();
		this.placeHolder?.remove();
		this.placeHolder = void 0;
		const { headerCache: { fileDiff: cachedHeaderDiff, html: cachedHeaderHTML, lastRenderedHTML, messagesVersion: cachedMessagesVersion } } = this;
		const editSessionDiff = this.editSession?.diff;
		const { version: messagesVersion } = i18n;
		const headerHTML = (fileDiff !== editSessionDiff && cachedMessagesVersion === messagesVersion && areDiffTargetsEqual(cachedHeaderDiff, fileDiff) ? cachedHeaderHTML : void 0) ?? hastToHtml(headerAST);
		this.headerCache.html = headerHTML;
		this.headerCache.fileDiff = fileDiff;
		this.headerCache.messagesVersion = messagesVersion;
		if (headerHTML !== lastRenderedHTML) {
			const tempDiv = document.createElement("div");
			tempDiv.innerHTML = headerHTML;
			const newHeader = tempDiv.firstElementChild;
			if (!(newHeader instanceof HTMLElement)) return;
			if (this.headerElement != null) container.shadowRoot?.replaceChild(newHeader, this.headerElement);
			else container.shadowRoot?.prepend(newHeader);
			this.headerElement = newHeader;
			this.headerCache.lastRenderedHTML = headerHTML;
		}
		if (this.isComponentManaged) return;
		const { renderCustomHeader, renderHeaderPrefix, renderHeaderFilenameSuffix, renderHeaderMetadata } = this.options;
		if (renderCustomHeader != null) {
			const content = renderCustomHeader(fileDiff) ?? void 0;
			this.headerCustom = this.upsertHeaderSlotElement(container, this.headerCustom, CUSTOM_HEADER_SLOT_ID, content);
			this.headerPrefix?.remove();
			this.headerFilenameSuffix?.remove();
			this.headerMetadata?.remove();
			this.headerPrefix = void 0;
			this.headerFilenameSuffix = void 0;
			this.headerMetadata = void 0;
			return;
		}
		const prefix = renderHeaderPrefix?.(fileDiff) ?? void 0;
		const suffix = renderHeaderFilenameSuffix?.(fileDiff) ?? void 0;
		const content = renderHeaderMetadata?.(fileDiff) ?? void 0;
		this.headerPrefix = this.upsertHeaderSlotElement(container, this.headerPrefix, HEADER_PREFIX_SLOT_ID, prefix);
		this.headerFilenameSuffix = this.upsertHeaderSlotElement(container, this.headerFilenameSuffix, HEADER_FILENAME_SUFFIX_SLOT_ID, suffix);
		this.headerMetadata = this.upsertHeaderSlotElement(container, this.headerMetadata, HEADER_METADATA_SLOT_ID, content);
		this.headerCustom?.remove();
		this.headerCustom = void 0;
	}
	clearReusableHeader() {
		this.headerCache.html = void 0;
		this.headerCache.fileDiff = void 0;
	}
	clearHeaderSlots() {
		this.headerPrefix?.remove();
		this.headerFilenameSuffix?.remove();
		this.headerMetadata?.remove();
		this.headerCustom?.remove();
		this.headerPrefix = void 0;
		this.headerFilenameSuffix = void 0;
		this.headerMetadata = void 0;
		this.headerCustom = void 0;
	}
	upsertHeaderSlotElement(container, current, slot, content) {
		if (content == null) {
			current?.remove();
			return;
		}
		const element = current ?? this.createHeaderSlotElement(slot);
		if (current == null) container.appendChild(element);
		this.replaceHeaderSlotContent(element, content);
		return element;
	}
	replaceHeaderSlotContent(element, content) {
		element.replaceChildren();
		if (content instanceof Element) element.appendChild(content);
		else element.innerText = `${content}`;
	}
	createHeaderSlotElement(slot) {
		const element = document.createElement("div");
		element.slot = slot;
		return element;
	}
	injectUnsafeCSS() {
		const { unsafeCSS } = this.options;
		this.pre?.toggleAttribute("data-custom-styles", Boolean(unsafeCSS));
		const shadowRoot = this.fileContainer?.shadowRoot;
		if (shadowRoot == null) return;
		if (unsafeCSS == null || unsafeCSS === "") {
			if (this.unsafeCSSStyle != null) {
				this.unsafeCSSStyle.remove();
				this.unsafeCSSStyle = void 0;
			}
			this.appliedUnsafeCSS = void 0;
			return;
		}
		if (this.unsafeCSSStyle?.parentNode === shadowRoot && this.appliedUnsafeCSS === unsafeCSS) return;
		this.unsafeCSSStyle ??= createUnsafeCSSStyleNode();
		if (this.unsafeCSSStyle.parentNode !== shadowRoot) shadowRoot.appendChild(this.unsafeCSSStyle);
		this.unsafeCSSStyle.textContent = wrapUnsafeCSS(unsafeCSS);
		this.appliedUnsafeCSS = unsafeCSS;
	}
	applyThemeState(container, themeStyles, themeType, baseThemeType) {
		if (themeStyles === "") return;
		const shadowRoot = container.shadowRoot ?? container.attachShadow({ mode: "open" });
		const effectiveThemeType = baseThemeType ?? themeType;
		const currentTheme = this.getTheme();
		const theme = typeof currentTheme === "string" ? currentTheme : { ...currentTheme };
		const scrollbarGutter = getMeasuredScrollbarGutter(shadowRoot);
		if (this.themeCSSStyle?.parentNode === shadowRoot && this.appliedThemeCSS?.themeStyles === themeStyles && this.appliedThemeCSS.themeType === effectiveThemeType && this.appliedThemeCSS.scrollbarGutter === scrollbarGutter) {
			this.appliedThemeCSS.theme = theme;
			return;
		}
		if (this.hasAdoptedThemeCSS && this.themeCSSStyle?.parentNode === shadowRoot) {
			this.hasAdoptedThemeCSS = false;
			this.appliedThemeCSS = {
				theme,
				themeStyles,
				themeType: effectiveThemeType,
				baseThemeType,
				scrollbarGutter
			};
			return;
		}
		this.themeCSSStyle = upsertHostThemeStyle({
			shadowRoot,
			currentNode: this.themeCSSStyle,
			themeCSS: wrapThemeCSS(themeStyles, effectiveThemeType, scrollbarGutter)
		});
		this.appliedThemeCSS = this.themeCSSStyle != null ? {
			theme,
			themeStyles,
			themeType: effectiveThemeType,
			baseThemeType,
			scrollbarGutter
		} : void 0;
	}
	hydrateMeasuredScrollbar() {
		const shadowRoot = this.fileContainer?.shadowRoot;
		if (shadowRoot == null || this.themeCSSStyle == null) return;
		this.themeCSSStyle.textContent = patchScrollbarGutterSize(this.themeCSSStyle.textContent ?? "", getMeasuredScrollbarGutter(shadowRoot));
	}
	shouldGuardRebuildScroll() {
		return this.editor != null && isSafari();
	}
	applyHunksToDOM(pre, result) {
		if (this.shouldGuardRebuildScroll()) guardWebKitScrollDuringRebuild(pre, () => this.replaceCodeColumns(pre, result));
		else this.replaceCodeColumns(pre, result);
	}
	writeColumn(code, specs, patched, { rowCount, allRowsChanged }) {
		let columns = this.getColumnPair(code);
		if (columns == null) {
			columns = this.createColumns(code, rowCount);
			this.managersDirty = true;
		} else if (rowCount !== this.lastRowCount) {
			columns.gutter.style.setProperty("grid-row", `span ${rowCount}`);
			columns.content.style.setProperty("grid-row", `span ${rowCount}`);
		}
		let reconciler = this.columnReconcilers.get(code);
		if (reconciler == null) {
			reconciler = new ColumnReconciler(columns.gutter, columns.content);
			this.columnReconcilers.set(code, reconciler);
			if (!allRowsChanged && columns.content.childElementCount > 0) reconciler.adopt(specs);
		}
		if (allRowsChanged) {
			reconciler.replaceAll(specs);
			for (const spec of specs) this.changedRowKeys.push(spec.key);
			this.interactionManager.setSelectionDirty();
			this.managersDirty = true;
		} else this.recordRowsWritten(reconciler.reconcile(specs, patched));
	}
	removeStaleRows(code, specs) {
		if (code == null || specs == null) return;
		this.columnReconcilers.get(code)?.removeStale(specs);
	}
	createColumns(code, rowCount) {
		const gutter = createGutterWrapper();
		gutter.properties.style = `grid-row: span ${rowCount}`;
		code.innerHTML = hastToHtml([gutter, createContentColumn([], rowCount)]);
		const columns = this.getColumnPair(code);
		if (columns == null) throw new Error("FileDiff.createColumns: the columns did not parse");
		return columns;
	}
	replaceCodeColumns(pre, result) {
		const { overflow = "scroll" } = this.options;
		const containerSize = (this.options.hunkSeparators ?? "line-info") === "line-info";
		const rowSpan = overflow === "wrap" ? result.rowCount : void 0;
		this.cleanupErrorWrapper();
		this.applyPreNodeAttributes(pre, result);
		this.changedRowKeys = [];
		let shouldReplace = false;
		const codeElements = [];
		const { unified, deletions, additions } = result.columns;
		const { patched } = result;
		this.editor?.__captureFocusForDOMReplacement();
		if (!result.allRowsChanged && patched == null) {
			this.removeStaleRows(this.codeUnified, unified);
			this.removeStaleRows(this.codeDeletions, deletions);
			this.removeStaleRows(this.codeAdditions, additions);
		}
		if (unified != null) {
			shouldReplace = this.codeUnified == null || this.codeAdditions != null || this.codeDeletions != null;
			this.codeDeletions?.remove();
			this.codeDeletions = void 0;
			this.codeAdditions?.remove();
			this.codeAdditions = void 0;
			this.codeUnified = getOrCreateCodeNode({
				code: this.codeUnified,
				columnType: "unified",
				rowSpan,
				containerSize
			});
			this.writeColumn(this.codeUnified, unified, patched?.unified, result);
			codeElements.push(this.codeUnified);
		} else if (deletions != null || additions != null) {
			if (deletions != null) {
				shouldReplace = this.codeDeletions == null || this.codeUnified != null;
				this.codeUnified?.remove();
				this.codeUnified = void 0;
				this.codeDeletions = getOrCreateCodeNode({
					code: this.codeDeletions,
					columnType: "deletions",
					rowSpan,
					containerSize
				});
				this.writeColumn(this.codeDeletions, deletions, patched?.deletions, result);
				codeElements.push(this.codeDeletions);
			} else {
				this.codeDeletions?.remove();
				this.codeDeletions = void 0;
			}
			if (additions != null) {
				shouldReplace = shouldReplace || this.codeAdditions == null || this.codeUnified != null;
				this.codeUnified?.remove();
				this.codeUnified = void 0;
				this.codeAdditions = getOrCreateCodeNode({
					code: this.codeAdditions,
					columnType: "additions",
					rowSpan,
					containerSize
				});
				this.writeColumn(this.codeAdditions, additions, patched?.additions, result);
				codeElements.push(this.codeAdditions);
			} else {
				this.codeAdditions?.remove();
				this.codeAdditions = void 0;
			}
		} else {
			this.codeUnified?.remove();
			this.codeDeletions?.remove();
			this.codeAdditions?.remove();
			this.codeColumns.cleanUp();
		}
		if (codeElements.length === 0) pre.textContent = "";
		else if (shouldReplace) {
			pre.replaceChildren(...codeElements);
			this.managersDirty = true;
		}
		this.lastRowCount = result.rowCount;
	}
	editorColumns() {
		const code = this.codeAdditions ?? this.codeUnified;
		const pair = this.getColumnPair(code);
		if (code == null || pair == null) return;
		return {
			code,
			gutter: pair.gutter,
			content: pair.content,
			deletions: this.getColumnPair(this.codeDeletions)
		};
	}
	getColumnPair(code) {
		if (code == null) return;
		const gutter = code.children[0];
		const content = code.children[1];
		if (!(gutter instanceof HTMLElement) || !(content instanceof HTMLElement) || gutter.dataset.gutter == null || content.dataset.content == null) return;
		return {
			gutter,
			content
		};
	}
	updateBuffers(renderRange) {
		if (this.pre != null) this.applyBuffers(this.pre, renderRange);
	}
	applyBuffers(pre, renderRange) {
		if (renderRange == null || this.shouldDisableVirtualizationBuffers()) {
			if (this.bufferBefore != null) {
				this.bufferBefore.remove();
				this.bufferBefore = void 0;
			}
			if (this.bufferAfter != null) {
				this.bufferAfter.remove();
				this.bufferAfter = void 0;
			}
			return;
		}
		if (renderRange.bufferBefore > 0) {
			if (this.bufferBefore == null) {
				this.bufferBefore = document.createElement("div");
				this.bufferBefore.dataset.virtualizerBuffer = "before";
				pre.before(this.bufferBefore);
			}
			this.bufferBefore.style.setProperty("height", `${renderRange.bufferBefore}px`);
			this.bufferBefore.style.setProperty("contain", "strict");
		} else if (this.bufferBefore != null) {
			this.bufferBefore.remove();
			this.bufferBefore = void 0;
		}
		if (renderRange.bufferAfter > 0) {
			if (this.bufferAfter == null) {
				this.bufferAfter = document.createElement("div");
				this.bufferAfter.dataset.virtualizerBuffer = "after";
				pre.after(this.bufferAfter);
			}
			this.bufferAfter.style.setProperty("height", `${renderRange.bufferAfter}px`);
			this.bufferAfter.style.setProperty("contain", "strict");
		} else if (this.bufferAfter != null) {
			this.bufferAfter.remove();
			this.bufferAfter = void 0;
		}
	}
	shouldDisableVirtualizationBuffers() {
		return this.options.disableVirtualizationBuffers ?? false;
	}
	applyPreNodeAttributes(pre, { columns, totalLines }, customProperties) {
		const { diffIndicators = "bars", disableBackground = false, disableLineNumbers = false, overflow = "scroll", diffStyle = "split" } = this.options;
		const preProperties = {
			type: "diff",
			diffIndicators,
			disableBackground,
			disableLineNumbers,
			overflow,
			split: diffStyle === "unified" ? false : columns.additions != null && columns.deletions != null,
			totalLines,
			customProperties
		};
		if (arePrePropertiesEqual(preProperties, this.appliedPreAttributes)) return;
		setPreNodeProperties(pre, preProperties);
		this.appliedPreAttributes = preProperties;
	}
	applyErrorToDOM(error, container) {
		this.cleanupErrorWrapper();
		this.pre?.remove();
		this.pre = void 0;
		this.appliedPreAttributes = void 0;
		const shadowRoot = container.shadowRoot ?? container.attachShadow({ mode: "open" });
		this.errorWrapper ??= document.createElement("div");
		this.errorWrapper.dataset.errorWrapper = "";
		this.errorWrapper.textContent = "";
		shadowRoot.appendChild(this.errorWrapper);
		const errorMessage = document.createElement("div");
		errorMessage.dataset.errorMessage = "";
		errorMessage.innerText = error.message;
		this.errorWrapper.appendChild(errorMessage);
		const errorStack = document.createElement("pre");
		errorStack.dataset.errorStack = "";
		errorStack.innerText = error.stack ?? "No Error Stack";
		this.errorWrapper.appendChild(errorStack);
	}
	cleanupErrorWrapper() {
		this.errorWrapper?.remove();
		this.errorWrapper = void 0;
	}
};
function getAdditionFile(fileDiff) {
	return {
		name: fileDiff.name,
		lang: fileDiff.lang,
		contents: fileDiff.additionLines.join("")
	};
}
function areOptionalFilesEqual(fileA, fileB) {
	if (fileA == null || fileB == null) return fileA == null && fileB == null;
	return areFilesEqual(fileA, fileB);
}
function hasDiffContent({ fileDiff, oldFile, newFile }) {
	return fileDiff != null && fileDiff.hunks.length > 0 || oldFile != null || newFile != null;
}
function hasDiffHeaderContent({ fileDiff, oldFile, newFile }) {
	return fileDiff != null || oldFile != null || newFile != null;
}
function shouldRenderCode(pre, hasContent, collapsed = false) {
	return !collapsed && pre == null && hasContent;
}
function shouldRenderHeader(headerElement, hasContent, disableFileHeader = false) {
	return headerElement == null && hasContent && !disableFileHeader;
}
//#endregion
export { FileDiff };

//# sourceMappingURL=FileDiff.js.map