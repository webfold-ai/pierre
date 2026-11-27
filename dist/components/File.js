import { CUSTOM_HEADER_SLOT_ID, DEFAULT_THEMES, EMPTY_LINE_ANNOTATIONS, HEADER_FILENAME_SUFFIX_SLOT_ID, HEADER_METADATA_SLOT_ID, HEADER_PREFIX_SLOT_ID } from "../constants.js";
import { HighlighterDisposedError } from "../highlighter/highlighterType.js";
import { getThemes } from "../utils/getThemes.js";
import { getHighlighterIfLoaded, getSharedHighlighter } from "../highlighter/shared_highlighter.js";
import { dequeueRender, queueRender } from "../managers/UniversalRenderingManager.js";
import { isSafari } from "../utils/platform.js";
import { getMeasuredScrollbarGutter } from "../utils/scrollbarGutter.js";
import { patchScrollbarGutterSize, wrapThemeCSS, wrapUnsafeCSS } from "../utils/cssWrappers.js";
import { areObjectsEqual } from "../utils/areObjectsEqual.js";
import { i18n } from "../i18n/I18n.js";
import { createGutterWrapper } from "../utils/hast_utils.js";
import { createUnsafeCSSStyleNode } from "../utils/createUnsafeCSSStyleNode.js";
import { areThemesEqual } from "../utils/areThemesEqual.js";
import { isStyleNode } from "../utils/isStyleNode.js";
import { resolvePreferredHighlighter } from "../utils/resolvePreferredHighlighter.js";
import { areFileTargetsEqual } from "../utils/areFileTargetsEqual.js";
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
import { isFilePlainText } from "../utils/isFilePlainText.js";
import { FileRenderer } from "../renderers/FileRenderer.js";
import { areLineAnnotationsEqual } from "../utils/areLineAnnotationsEqual.js";
import { arePrePropertiesEqual } from "../utils/arePrePropertiesEqual.js";
import { createAnnotationWrapperNode } from "../utils/createAnnotationWrapperNode.js";
import { createGutterUtilityContentNode } from "../utils/createGutterUtilityContentNode.js";
import { createSVGSpriteElement, hydrateSVGSpriteElement } from "../utils/createSVGSpriteElement.js";
import { adoptEditSessionAnnotations, resolveEditSessionSlotName, writeEditSessionAnnotations } from "../utils/editSessionAnnotations.js";
import { getFileRendererOptions } from "../utils/getFileRendererOptions.js";
import { getOrCreateCodeNode } from "../utils/getOrCreateCodeNode.js";
import { guardWebKitScrollDuringRebuild } from "../utils/guardWebKitScrollDuringRebuild.js";
import { upsertHostThemeStyle } from "../utils/hostTheme.js";
import { prerenderHTMLIfNecessary } from "../utils/prerenderHTMLIfNecessary.js";
import { setPreNodeProperties } from "../utils/setWrapperNodeProps.js";
import { isHandledWorkerPoolError } from "../worker/errors.js";
import "./web-components.js";
//#region src/components/File.ts
let instanceId = -1;
var File = class {
	options;
	workerManager;
	requestOwnerRender;
	static LoadedCustomComponent = true;
	__id = `file:${++instanceId}`;
	type = "file";
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
	errorWrapper;
	placeHolder;
	lastRenderedHeaderHTML;
	cachedHeaderHTML;
	appliedPreAttributes;
	lastRowCount;
	columnReconcilers = /* @__PURE__ */ new WeakMap();
	changedRowKeys = [];
	mounted = false;
	headerElement;
	headerCustom;
	headerPrefix;
	headerFilenameSuffix;
	headerMetadata;
	fileRenderer;
	resizeManager;
	interactionManager;
	annotationCache = /* @__PURE__ */ new Map();
	get lineAnnotations() {
		return this.renderedData?.lineAnnotations ?? EMPTY_LINE_ANNOTATIONS;
	}
	managersDirty = false;
	appliedManagerSetup;
	file;
	editSession;
	renderedData;
	pendingData;
	pendingAttach;
	forceRenderOverride;
	renderRange;
	enabled = true;
	editor;
	constructor(options = { theme: DEFAULT_THEMES }, workerManager, requestOwnerRender) {
		this.options = options;
		this.workerManager = workerManager;
		this.requestOwnerRender = requestOwnerRender;
		this.fileRenderer = new FileRenderer(options, this.getAnnotationSlotName, this.handleHighlightRender, this.workerManager);
		this.resizeManager = new ResizeManager();
		this.interactionManager = new InteractionManager("file", pluckInteractionOptions(options, this.expandLine));
	}
	subscribeToChanges() {
		this.workerManager?.subscribeToThemeChanges(this);
		i18n.subscribe(this);
	}
	getAnnotationSlotName = (annotation) => {
		return resolveEditSessionSlotName(this.editSession?.annotations, annotation, getLineAnnotationName);
	};
	handleHighlightRender = () => {
		this.rerender();
	};
	expandLine = (target) => {
		this.fileRenderer.expandLine(target);
		this.rerender();
	};
	rerender() {
		const file = this.getInputFile();
		if (!this.enabled || file == null) return;
		if (this.requestRender()) return;
		this.render({
			file,
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
	getTheme() {
		return this.workerManager?.getFileRenderOptions().theme ?? this.options.theme ?? DEFAULT_THEMES;
	}
	getInputFile() {
		return this.file;
	}
	getWorkingFile(fallbackFile = this.file) {
		return this.editSession?.file ?? fallbackFile;
	}
	getRenderedFile() {
		return this.renderedData?.file;
	}
	/**
	* @internal Data the next render() with this input will display. While a
	* replacement file is being highlighted, this is still the displayed data.
	*/
	__getNextRenderData({ file, lineAnnotations }) {
		const sessionAnnotations = this.editSession?.annotations;
		if (sessionAnnotations != null) return {
			file,
			lineAnnotations: lineAnnotations != null && this.isNewAnnotations(lineAnnotations) ? lineAnnotations : sessionAnnotations.provided
		};
		const workingFile = this.getWorkingFile(file) ?? file;
		const nextFile = this.getFileForNextRender(workingFile);
		return {
			file: nextFile,
			lineAnnotations: lineAnnotations != null && areFileTargetsEqual(nextFile, workingFile) ? lineAnnotations : this.getAnnotationsForFile(nextFile)
		};
	}
	getFileForNextRender(workingFile) {
		const { collapsed = false } = this.options;
		return collapsed ? workingFile : this.fileRenderer.getFileForNextRender(workingFile);
	}
	getLatestAnnotations() {
		return this.pendingData?.lineAnnotations ?? this.editSession?.annotations?.current ?? this.lineAnnotations;
	}
	getAnnotationsForFile(file) {
		const { pendingData } = this;
		return pendingData != null && areFileTargetsEqual(file, pendingData.file) ? pendingData.lineAnnotations : this.lineAnnotations;
	}
	adoptRenderData(file) {
		const { pendingData } = this;
		const matchesPending = pendingData != null && areFileTargetsEqual(file, pendingData.file);
		this.renderedData = {
			file,
			lineAnnotations: matchesPending ? pendingData.lineAnnotations : this.lineAnnotations
		};
		if (matchesPending) this.pendingData = void 0;
	}
	isNewAnnotations(lineAnnotations) {
		const session = this.editSession?.annotations;
		if (lineAnnotations === this.getLatestAnnotations()) return false;
		return session == null || lineAnnotations !== session.provided && lineAnnotations !== session.current;
	}
	updateInputFile(incomingFile, lineAnnotations) {
		if (areFileTargetsEqual(this.getInputFile(), incomingFile)) return false;
		this.editor?.__assertOutsideChangeCallback("File.render");
		this.fileRenderer.lineCuts.clear();
		const previousAnnotations = this.getLatestAnnotations();
		this.file = incomingFile;
		const { editSession } = this;
		if (editSession?.annotations != null && lineAnnotations != null) editSession.annotations = adoptEditSessionAnnotations(lineAnnotations, getLineAnnotationName, editSession.annotations);
		if (editSession != null) this.replaceEditSession(incomingFile, editSession.annotations?.current ?? lineAnnotations ?? previousAnnotations);
		this.pendingData = {
			file: this.editSession?.file ?? incomingFile,
			lineAnnotations: this.editSession?.annotations?.current ?? lineAnnotations ?? previousAnnotations
		};
		return true;
	}
	replaceEditSession(incomingFile, lineAnnotations) {
		const { editor, editSession } = this;
		this.installEditSession(incomingFile);
		if (editor != null && editSession != null) editor.__replaceDocument(incomingFile, false, lineAnnotations);
	}
	installEditSession(inputFile, retainedDocument) {
		const file = this.fileRenderer.startEditSession(inputFile, retainedDocument);
		const annotations = this.editSession?.annotations ?? adoptEditSessionAnnotations(this.getLatestAnnotations(), getLineAnnotationName);
		this.editSession = {
			file,
			inputFile,
			annotations
		};
		this.pendingData = {
			file,
			lineAnnotations: annotations.current
		};
	}
	onMessagesChange() {
		this.rerender();
	}
	onThemeChange() {
		this.fileRenderer.clearRenderCache();
		this.rerender();
	}
	setOptions(options) {
		if (options == null) return;
		if (options.unsafeCSS !== this.options.unsafeCSS) this.editor?.__setSearchPanelUnsafeCSS(options.unsafeCSS);
		this.options = options;
		this.fileRenderer.setOptions(getFileRendererOptions(options));
		this.cachedHeaderHTML = void 0;
		this.syncInteractionOptions();
		this.managersDirty = true;
	}
	syncInteractionOptions() {
		this.interactionManager.setOptions(pluckInteractionOptions(this.options, this.expandLine));
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
	setLineAnnotations(lineAnnotations) {
		const sessionAnnotations = this.editSession?.annotations;
		if (sessionAnnotations != null) {
			if (!this.isNewAnnotations(lineAnnotations)) return;
			writeEditSessionAnnotations(sessionAnnotations, lineAnnotations, getLineAnnotationName);
		}
		const file = this.getWorkingFile();
		if (file != null) this.pendingData = {
			file,
			lineAnnotations
		};
	}
	syncEditSessionAnnotationsFromEditor(lineAnnotations) {
		const session = this.editSession?.annotations;
		if (session == null || lineAnnotations === session.current) return false;
		session.current = lineAnnotations;
		if (this.renderedData != null) this.renderedData.lineAnnotations = lineAnnotations;
		this.pendingData = void 0;
		this.fileRenderer.setLineAnnotations(lineAnnotations);
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
	get code() {
		return this.codeColumns.get("code");
	}
	set code(code) {
		this.codeColumns.set("code", code);
	}
	getCodeScrollLeft() {
		return this.codeColumns.scrollLeft;
	}
	setCodeScrollLeft(position) {
		this.codeColumns.setScrollLeft(position);
	}
	/**
	* @internal Applies one change of the editor's document to the file and the
	* rows on screen.
	*/
	applyChange(document, change, options = {}) {
		if (this.editSession == null) throw new Error("File.applyChange: requires an active edit session");
		const { tokens, lineAnnotations } = options;
		const { lineDelta, removedLineIds } = this.fileRenderer.applyChange(change, document, tokens);
		if (lineAnnotations != null) this.syncEditSessionAnnotationsFromEditor(lineAnnotations);
		const rowsMoved = lineDelta !== 0 || removedLineIds.length > 0;
		this.renderChange(rowsMoved);
		if (this.fileContainer == null || this.editSession == null) return { rebuiltLines: [] };
		if (rowsMoved) this.interactionManager.setSelectionDirty();
		return { rebuiltLines: this.takeRebuiltLines() };
	}
	renderChange(_structural) {
		if (this.fileContainer == null) return;
		this.rerender();
	}
	/** @internal Background tokenizing finished coloring these lines. */
	applyTokens(tokens) {
		if (this.editSession == null) return;
		if (this.fileRenderer.setTokens(tokens).some((line) => this.lineElement(line) != null)) this.rerender();
	}
	recordRowsWritten({ changed, attributesReset, gutterRewritten }) {
		for (const key of changed) {
			this.changedRowKeys.push(key);
			if (!isLineKey(key)) this.managersDirty = true;
		}
		if (attributesReset) this.interactionManager.setSelectionDirty();
		if (attributesReset || gutterRewritten) this.managersDirty = true;
	}
	/** @internal The content element of a document line's row, if on screen. */
	lineElement(line) {
		const { code } = this;
		if (code == null || this.editSession == null) return;
		const key = this.fileRenderer.lineKey(line);
		return key == null ? void 0 : this.columnReconcilers.get(code)?.elementFor(key)?.content;
	}
	takeRebuiltLines() {
		const { changedRowKeys: keys } = this;
		this.changedRowKeys = [];
		const lines = [];
		for (const key of keys) {
			const line = this.fileRenderer.lineOfKey(key);
			if (line != null) lines.push(line);
		}
		return lines;
	}
	__getEffectiveCodeOptions() {
		return {
			...this.options,
			...this.fileRenderer.getEffectiveCodeOptions(),
			themeType: this.options.themeType
		};
	}
	flushManagers() {
		if (this.pre == null) {
			this.managersDirty = false;
			return;
		}
		const { overflow = "scroll" } = this.options;
		const setup = {
			overflow,
			disableAnnotations: overflow === "wrap",
			columnVariables: this.shouldApplyColumnVariables(overflow) ? "apply" : "measure"
		};
		if (!this.managersDirty && areObjectsEqual(setup, this.appliedManagerSetup)) return;
		this.interactionManager.setup(this.pre);
		this.resizeManager.setup(this.pre, {
			disableAnnotations: setup.disableAnnotations,
			columnVariables: setup.columnVariables
		});
		this.appliedManagerSetup = setup;
		this.managersDirty = false;
	}
	shouldApplyColumnVariables(overflow) {
		return overflow === "scroll" && this.lineAnnotations.length > 0;
	}
	cleanUp(recycle = false) {
		const editor = this.editor;
		dequeueRender(this.handleEditSessionRender);
		this.emitPostRender(true);
		editor?.cleanUp(recycle ? "recycle" : "discard");
		if (!recycle) this.editor = void 0;
		this.resizeManager.cleanUp();
		this.interactionManager.cleanUp();
		this.managersDirty = false;
		this.workerManager?.unsubscribeToThemeChanges(this);
		i18n.unsubscribe(this);
		this.renderRange = void 0;
		if (!this.isComponentManaged) this.fileContainer?.remove();
		this.fileContainer = void 0;
		this.mounted = false;
		if (!recycle) {
			this.renderedData = void 0;
			this.pendingData = void 0;
			this.pendingAttach = void 0;
		}
		this.clearAuxiliaryNodes();
		this.pre?.remove();
		this.pre = void 0;
		this.codeColumns.cleanUp();
		this.bufferBefore?.remove();
		this.bufferBefore = void 0;
		this.bufferAfter?.remove();
		this.bufferAfter = void 0;
		this.appliedPreAttributes = void 0;
		this.lastRowCount = void 0;
		this.headerElement?.remove();
		this.headerElement = void 0;
		this.clearHeaderSlots();
		this.lastRenderedHeaderHTML = void 0;
		if (!recycle) this.cachedHeaderHTML = void 0;
		this.errorWrapper?.remove();
		this.errorWrapper = void 0;
		this.spriteSVG = void 0;
		this.themeCSSStyle = void 0;
		this.appliedThemeCSS = void 0;
		this.hasAdoptedThemeCSS = false;
		this.unsafeCSSStyle = void 0;
		this.appliedUnsafeCSS = void 0;
		this.placeHolder?.remove();
		this.placeHolder = void 0;
		if (recycle) this.fileRenderer.recycle();
		else {
			this.fileRenderer.cleanUp();
			this.workerManager = void 0;
			this.file = void 0;
			this.editSession = void 0;
		}
		this.enabled = false;
	}
	virtualizedSetup() {
		this.enabled = true;
	}
	hydrate(props) {
		const { fileContainer, prerenderedHTML, preventEmit = false, file, lineAnnotations } = props;
		if (!this.enabled) throw new Error("File.hydrate: attempting to call hydrate after cleaned up");
		if (this.fileContainer != null) throw new Error("File.hydrate: hydrate can only be called before the instance has rendered or hydrated");
		this.hydrateElements(fileContainer, prerenderedHTML);
		const forceEditorRender = this.editor != null;
		if (forceEditorRender || shouldRenderCode(this.pre, file, this.options.collapsed) || shouldRenderHeader(this.headerElement, file, this.options.disableFileHeader)) this.render({
			...props,
			forceRender: forceEditorRender || props.forceRender,
			preventEmit: true
		});
		else this.hydrationSetup({
			file,
			lineAnnotations
		});
		if (!preventEmit) this.emitPostRender();
	}
	hydrateElements(fileContainer, prerenderedHTML) {
		if (this.fileContainer !== fileContainer) this.emitPostRender(true);
		prerenderHTMLIfNecessary(fileContainer, prerenderedHTML);
		for (const element of Array.from(fileContainer.shadowRoot?.children ?? [])) {
			if (element instanceof SVGElement) {
				this.spriteSVG = hydrateSVGSpriteElement(element);
				continue;
			}
			if (!(element instanceof HTMLElement)) continue;
			if (element instanceof HTMLPreElement) {
				this.pre = element;
				this.appliedPreAttributes = void 0;
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
			if ("diffsHeader" in element.dataset) {
				this.headerElement = element;
				this.lastRenderedHeaderHTML = void 0;
				continue;
			}
		}
		if (this.pre != null) {
			this.syncCodeNodeFromPre(this.pre);
			this.pre.removeAttribute("data-dehydrated");
		}
		if (this.fileContainer == null) this.subscribeToChanges();
		this.fileContainer = fileContainer;
		this.hydrateMeasuredScrollbar();
	}
	hydrationSetup({ file, lineAnnotations }) {
		this.renderedData = {
			file,
			lineAnnotations: lineAnnotations ?? this.getLatestAnnotations()
		};
		this.pendingData = void 0;
		this.file = file;
		this.fileRenderer.setOptions(getFileRendererOptions(this.options));
		this.syncInteractionOptions();
		if (this.pre == null) return;
		this.fileRenderer.hydrate(file);
		this.renderAnnotations();
		this.renderGutterUtility();
		this.injectUnsafeCSS();
		this.managersDirty = true;
		this.flushManagers();
	}
	syncRenderViewToEditor() {
		const { editor, fileContainer, renderRange } = this;
		const lineAnnotations = this.getLatestAnnotations();
		const file = this.getWorkingFile();
		if (editor == null || fileContainer == null || file == null) return;
		const syncEditor = (highlighter) => {
			if (!this.enabled || this.editor !== editor || this.fileContainer !== fileContainer || this.getWorkingFile() !== file) return;
			editor.__syncRenderView({
				highlighter,
				fileContainer,
				columns: this.editorColumns(),
				file,
				lineAnnotations,
				renderRange,
				domCurrent: this.fileRenderer.editorRenderReady()
			});
		};
		const theme = this.getTheme();
		const lang = file.lang ?? getFiletypeFromFileName(file.name);
		const highlighter = getHighlighterIfLoaded({
			theme,
			lang
		});
		if (highlighter != null) syncEditor(highlighter);
		else getSharedHighlighter({
			themes: getThemes(theme),
			langs: Array.from(/* @__PURE__ */ new Set(["text", lang])),
			preferredHighlighter: resolvePreferredHighlighter(this.workerManager, this.options)
		}).then(syncEditor).catch((error) => {
			if (!(error instanceof HighlighterDisposedError)) console.error(error);
		});
	}
	/** @internal Settle annotations */
	__acceptEditorChange(event) {
		const { lineAnnotations } = event;
		if (lineAnnotations != null) this.syncEditSessionAnnotationsFromEditor(lineAnnotations);
	}
	emitEditChange(event) {
		const { onEditChange } = this.options;
		onEditChange?.(event);
	}
	/** @internal Plain files have no component-owned diff session state. */
	__captureDocumentSessionState() {}
	/**
	* Whether a new edit session can start now: a file is set and no worker
	* pool highlight the session would reuse is still in flight. When true,
	* `Editor.edit` can be called at once; otherwise await `prepareForEditing`.
	*/
	isReadyToEdit() {
		const file = this.getInputFile();
		return file != null && !this.fileRenderer.awaitsPoolHighlight(file);
	}
	/**
	* Gets the file ready for a new edit session. Call this before Editor.edit:
	* it renders a pool highlight that is still in flight, so the session starts
	* from highlighted rows instead of highlighting on the main thread. Resolves
	* once this instance can start editing.
	*/
	async prepareForEditing() {
		if (this.isReadyToEdit()) return;
		const pending = this.__prepareForEditing();
		if (pending == null) throw new Error("File.prepareForEditing: a file is required before editing");
		await pending;
		if (!this.isReadyToEdit()) throw new Error("File.prepareForEditing: the file is not ready to edit");
	}
	/**
	* @internal Resolves once an editor may attach to the current input, or
	* returns undefined when it already may or there is no input. The same
	* promise is returned while it is pending for the same input.
	*/
	__prepareForEditing() {
		const file = this.getInputFile();
		if (file == null || this.isReadyToEdit()) return;
		const { pendingAttach } = this;
		if (pendingAttach?.file === file) return pendingAttach.promise;
		const pending = {
			file,
			promise: this.awaitPoolHighlight(file)
		};
		this.pendingAttach = pending;
		pending.promise = pending.promise.finally(() => {
			if (this.pendingAttach === pending) this.pendingAttach = void 0;
		});
		return pending.promise;
	}
	async awaitPoolHighlight(file) {
		await this.primeHighlightCache(file);
		if (this.enabled && this.getInputFile() === file && !this.fileRenderer.awaitsPoolHighlight(file)) this.rerender();
	}
	/** @internal Associate this component with its editor for a render lifecycle. */
	__attachEditor(editor) {
		if (this.editor != null) throw new Error("File.__attachEditor: an editor is already attached");
		if (!this.isReadyToEdit()) throw new Error("File.__attachEditor: the component is not ready to edit; await prepareForEditing() first");
		this.editor = editor;
		const detach = () => {
			this.editor = void 0;
			this.fileRenderer.endEditSession();
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
		if (this.editor !== editor) throw new Error("File.__resumeEditor: editor association changed");
		this.resumeEditorRendering(editor);
	}
	resumeEditorRendering(editor) {
		if (this.editSession == null) {
			const inputFile = this.getInputFile();
			if (inputFile == null) throw new Error("File.__attachEditor: a file is required before editing");
			this.installEditSession(inputFile, editor.__getDocumentContents(inputFile));
		}
		const editSessionFile = this.editSession?.file;
		if (this.fileRenderer.editorRenderReady()) {
			if (editSessionFile != null && this.fileRenderer.fileCache === editSessionFile) this.adoptRenderData(editSessionFile);
			if (this.canAdoptEditorRows()) this.syncRenderViewToEditor();
			else this.rerender();
		} else this.rerender();
	}
	/**
	* @internal
	*
	* Ends the edit session and settles which file this component renders.
	* Requires the editor to be detached first. Does nothing when no session
	* exists, so callers can invoke it again safely after it has settled.
	*
	* `onEditComplete` receives the completed file, current input file, and
	* both annotation collections even when the final text is unchanged. In
	* `install` mode, accepting installs the completed file and its annotations;
	* rejecting or having no handler restores the external values. `discard`
	* mode always restores the external values. An accepted file cannot reuse
	* the replaced file's `cacheKey`.
	*/
	__completeEditSession(editor, mode) {
		this.settleEditSession(mode === "install", editor);
	}
	settleEditSession(installResult, editor) {
		const { editSession } = this;
		if (editSession == null) return;
		const { file: editSessionFile, inputFile, annotations: editSessionAnnotations } = editSession;
		const inputAnnotations = editSessionAnnotations?.provided ?? this.lineAnnotations;
		if (this.editor != null) throw new Error("File.__completeEditSession: detach the editor before completing the session");
		const sessionAnnotationsCurrent = editSessionAnnotations?.current;
		let acceptedFile;
		let failed = false;
		let failure;
		if (editor == null) throw new Error("File.__completeEditSession: editor is required for completion");
		const completedFile = { ...editSessionFile };
		const event = {
			file: completedFile,
			editor,
			originalFile: inputFile,
			lineAnnotations: sessionAnnotationsCurrent,
			originalLineAnnotations: inputAnnotations
		};
		Object.freeze(event);
		try {
			editor.__emitEditComplete(event);
			if (this.options.onEditComplete?.(event) === "accept") {
				if (completedFile.cacheKey != null && completedFile.cacheKey === inputFile.cacheKey) throw new Error("File.__completeEditSession: an accepted file must not reuse the replaced file cacheKey");
				acceptedFile = completedFile;
			}
		} catch (error) {
			failed = true;
			failure = error;
		}
		const settledFile = installResult && acceptedFile != null ? acceptedFile : inputFile;
		const settledAnnotations = installResult && acceptedFile != null ? sessionAnnotationsCurrent ?? inputAnnotations : inputAnnotations;
		if (installResult && acceptedFile != null) this.fileRenderer.lineCuts.clear();
		this.editSession = void 0;
		this.file = settledFile;
		this.pendingData = {
			file: settledFile,
			lineAnnotations: settledAnnotations
		};
		if (areFileTargetsEqual(this.getRenderedFile(), settledFile)) this.adoptRenderData(settledFile);
		if (this.fileContainer != null) {
			if (installResult) this.rerender();
			else queueRender(this.handleEditSessionRender);
		}
		if (failed) throw failure;
	}
	handleEditSessionRender = () => {
		this.rerender();
	};
	render({ file, fileContainer, forceRender = false, preventEmit = false, containerWrapper, deferManagers = false, lineAnnotations, renderRange }) {
		if (!this.enabled) throw new Error("File.render: attempting to call render after cleaned up");
		forceRender = this.forceRenderOverride ?? forceRender;
		this.forceRenderOverride = void 0;
		this.editor?.__postponeBgTokenizeToNextFrame();
		const { collapsed = false, themeType = "system" } = this.options;
		const nextRenderRange = collapsed ? void 0 : renderRange;
		const themeChanged = this.hasThemeChanged();
		const annotationsChanged = lineAnnotations != null && (lineAnnotations.length > 0 || this.getLatestAnnotations().length > 0) ? this.isNewAnnotations(lineAnnotations) : false;
		const didFileChange = !areFileTargetsEqual(this.getInputFile(), file);
		if (didFileChange) this.updateInputFile(file, lineAnnotations);
		const workingFile = this.getWorkingFile(file) ?? file;
		if (!collapsed && !forceRender && areRenderRangesEqual(nextRenderRange, this.renderRange) && !didFileChange && !annotationsChanged && !themeChanged) {
			const rendered = this.applyCachedThemeState(themeType);
			if (rendered) this.finalizeRender();
			return rendered;
		}
		this.renderRange = nextRenderRange;
		if (didFileChange) this.cachedHeaderHTML = void 0;
		this.fileRenderer.setOptions(getFileRendererOptions(this.options));
		this.syncInteractionOptions();
		if (lineAnnotations != null) this.setLineAnnotations(lineAnnotations);
		if (annotationsChanged) this.managersDirty = true;
		const nextRenderFile = this.getFileForNextRender(workingFile);
		this.fileRenderer.setLineAnnotations(this.getAnnotationsForFile(nextRenderFile));
		const { disableErrorHandling = false, disableFileHeader = false } = this.options;
		if (disableFileHeader) {
			if (this.headerElement != null) {
				this.headerElement.remove();
				this.headerElement = void 0;
				this.lastRenderedHeaderHTML = void 0;
			}
			this.clearHeaderSlots();
		}
		fileContainer = this.getOrCreateFileContainerNode(fileContainer, containerWrapper);
		this.ensureSpriteSVG(fileContainer);
		this.applyCachedThemeState(themeType);
		if (collapsed) {
			this.removeRenderedCode();
			this.clearAuxiliaryNodes();
			try {
				const collapsedResult = this.fileRenderer.renderCollapsed(workingFile);
				if (collapsedResult != null) this.applyThemeState(fileContainer, collapsedResult.themeStyles, themeType, collapsedResult.baseThemeType);
				if (collapsedResult?.headerAST != null) this.applyHeaderToDOM(collapsedResult.headerAST, fileContainer, workingFile);
				this.adoptRenderData(workingFile);
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
		const finishedTokens = this.editor?.__prepareRender(nextRenderRange);
		if (finishedTokens != null) this.fileRenderer.setTokens(finishedTokens);
		try {
			const pre = this.getOrCreatePreNode(fileContainer);
			const fileResult = this.fileRenderer.renderFile(workingFile, nextRenderRange);
			if (fileResult == null) return false;
			this.applyThemeState(fileContainer, fileResult.themeStyles, themeType, fileResult.baseThemeType);
			if (fileResult.headerAST != null) this.applyHeaderToDOM(fileResult.headerAST, fileContainer, fileResult.file);
			this.applyRowsToDOM(fileResult, pre);
			this.applyBuffers(pre, nextRenderRange);
			this.injectUnsafeCSS();
			this.adoptRenderData(fileResult.file);
			this.renderAnnotations();
			this.renderGutterUtility();
			if (!deferManagers) this.flushManagers();
			this.finalizeRender();
			if (this.editor != null) this.syncRenderViewToEditor();
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
			onPostRender?.(fileContainer, this, "unmount");
			return;
		}
		if (fileContainer == null) return;
		const phase = this.mounted ? "update" : "mount";
		this.mounted = true;
		onPostRender?.(fileContainer, this, phase);
	}
	removeRenderedCode() {
		this.resizeManager.cleanUp();
		this.interactionManager.cleanUp();
		this.bufferBefore?.remove();
		this.bufferBefore = void 0;
		this.bufferAfter?.remove();
		this.bufferAfter = void 0;
		this.code?.remove();
		this.codeColumns.cleanUp();
		this.pre?.remove();
		this.pre = void 0;
		this.appliedPreAttributes = void 0;
		this.lastRowCount = void 0;
	}
	clearAuxiliaryNodes() {
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
	async primeHighlightCache(file = this.getInputFile()) {
		const { workerManager } = this;
		if (file == null || workerManager == null || !workerManager.isWorkingPool() || file.cacheKey == null || isFilePlainText(file)) return;
		const tokenizeMaxLength = this.options.tokenizeMaxLength ?? 1e5;
		if (this.fileRenderer.getLineCount(file) > tokenizeMaxLength) return;
		await workerManager.primeFileHighlightCache(file).catch((error) => {
			if (isHandledWorkerPoolError(error)) return;
			console.error(error);
		});
	}
	cleanChildNodes() {
		this.resizeManager.cleanUp();
		this.interactionManager.cleanUp();
		this.clearAuxiliaryNodes();
		this.bufferAfter?.remove();
		this.bufferBefore?.remove();
		this.code?.remove();
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
		this.lastRenderedHeaderHTML = void 0;
		this.lastRowCount = void 0;
		this.mounted = false;
	}
	renderAnnotations() {
		if (this.isComponentManaged || this.fileContainer == null) {
			for (const { element } of this.annotationCache.values()) element.remove();
			this.annotationCache.clear();
			return;
		}
		const staleAnnotations = new Map(this.annotationCache);
		const { renderAnnotation } = this.options;
		const { renderedData } = this;
		if (renderAnnotation != null && renderedData != null) {
			const { file, lineAnnotations } = renderedData;
			for (const [index, annotation] of lineAnnotations.entries()) {
				const name = this.getAnnotationSlotName(annotation);
				const id = `${index}-${name}`;
				let cache = this.annotationCache.get(id);
				if (cache == null || cache.file !== file || !areLineAnnotationsEqual(annotation, cache.annotation)) {
					cache?.element.remove();
					const content = renderAnnotation(annotation, file);
					if (content == null) continue;
					cache = {
						element: createAnnotationWrapperNode(name),
						annotation,
						file
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
	applyRowsToDOM(result, pre) {
		this.cleanupErrorWrapper();
		this.applyPreNodeAttributes(pre, result);
		this.changedRowKeys = [];
		const code = this.code = getOrCreateCodeNode({ code: this.code });
		this.editor?.__captureFocusForDOMReplacement();
		const write = () => {
			this.writeColumn(code, result);
			if (!pre.contains(code)) {
				pre.replaceChildren(code);
				this.managersDirty = true;
			}
		};
		if (this.shouldGuardRebuildScroll()) guardWebKitScrollDuringRebuild(pre, write);
		else write();
		this.lastRowCount = result.rowCount;
	}
	writeColumn(code, { column: specs, patched, rowCount, allRowsChanged }) {
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
	canAdoptEditorRows() {
		const { code, columnReconcilers, fileRenderer } = this;
		return code == null || columnReconcilers.has(code) && !fileRenderer.lineCuts.hasCutRows;
	}
	createColumns(code, rowCount) {
		const gutter = createGutterWrapper();
		gutter.properties.style = `grid-row: span ${rowCount}`;
		code.innerHTML = hastToHtml([gutter, createContentColumn([], rowCount)]);
		const columns = this.getColumnPair(code);
		if (columns == null) throw new Error("File.createColumns: the columns did not parse");
		return columns;
	}
	editorColumns() {
		const code = this.codeColumns.get("code");
		const pair = code == null ? void 0 : this.getColumnPair(code);
		if (code == null || pair == null) return;
		return {
			code,
			gutter: pair.gutter,
			content: pair.content,
			deletions: void 0
		};
	}
	getColumnPair(code) {
		const gutter = code.children[0];
		const content = code.children[1];
		if (!(gutter instanceof HTMLElement) || !(content instanceof HTMLElement) || gutter.dataset.gutter == null || content.dataset.content == null) return;
		return {
			gutter,
			content
		};
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
	applyHeaderToDOM(headerAST, container, file) {
		this.cleanupErrorWrapper();
		this.placeHolder?.remove();
		this.placeHolder = void 0;
		const headerHTML = this.cachedHeaderHTML ?? hastToHtml(headerAST);
		this.cachedHeaderHTML = headerHTML;
		if (headerHTML !== this.lastRenderedHeaderHTML) {
			const tempDiv = document.createElement("div");
			tempDiv.innerHTML = headerHTML;
			const newHeader = tempDiv.firstElementChild;
			if (!(newHeader instanceof HTMLElement)) return;
			if (this.headerElement != null) container.shadowRoot?.replaceChild(newHeader, this.headerElement);
			else container.shadowRoot?.prepend(newHeader);
			this.headerElement = newHeader;
			this.lastRenderedHeaderHTML = headerHTML;
		}
		if (this.isComponentManaged) return;
		const { renderHeaderPrefix, renderHeaderFilenameSuffix, renderCustomHeader, renderHeaderMetadata } = this.options;
		if (renderCustomHeader != null) {
			const content = renderCustomHeader(file) ?? void 0;
			this.headerCustom = this.upsertHeaderSlotElement(container, this.headerCustom, CUSTOM_HEADER_SLOT_ID, content);
			this.headerPrefix?.remove();
			this.headerFilenameSuffix?.remove();
			this.headerMetadata?.remove();
			this.headerPrefix = void 0;
			this.headerFilenameSuffix = void 0;
			this.headerMetadata = void 0;
		} else {
			const prefix = renderHeaderPrefix?.(file) ?? void 0;
			const suffix = renderHeaderFilenameSuffix?.(file) ?? void 0;
			const content = renderHeaderMetadata?.(file) ?? void 0;
			this.headerPrefix = this.upsertHeaderSlotElement(container, this.headerPrefix, HEADER_PREFIX_SLOT_ID, prefix);
			this.headerFilenameSuffix = this.upsertHeaderSlotElement(container, this.headerFilenameSuffix, HEADER_FILENAME_SUFFIX_SLOT_ID, suffix);
			this.headerMetadata = this.upsertHeaderSlotElement(container, this.headerMetadata, HEADER_METADATA_SLOT_ID, content);
			this.headerCustom?.remove();
			this.headerCustom = void 0;
		}
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
	getOrCreateFileContainerNode(fileContainer, parentNode) {
		const { fileContainer: previousContainer } = this;
		const nextContainer = fileContainer ?? previousContainer ?? document.createElement("diffs-container");
		const containerChanged = previousContainer !== nextContainer;
		if (previousContainer != null && containerChanged) this.editor?.__captureFocusForDOMReplacement();
		if (containerChanged) this.emitPostRender(true);
		if (previousContainer == null) this.subscribeToChanges();
		this.fileContainer = nextContainer;
		if (previousContainer != null && containerChanged) {
			this.lastRenderedHeaderHTML = void 0;
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
			container.shadowRoot?.appendChild(this.pre);
			this.appliedPreAttributes = void 0;
			this.managersDirty = true;
		}
		this.placeHolder?.remove();
		this.placeHolder = void 0;
		return this.pre;
	}
	syncCodeNodeFromPre(pre) {
		this.codeColumns.cleanUp();
		for (const child of Array.from(pre.children)) {
			if (!(child instanceof HTMLElement)) continue;
			if (child.hasAttribute("data-code")) {
				this.code = child;
				return;
			}
		}
	}
	applyPreNodeAttributes(pre, { totalLines }) {
		const { overflow = "scroll", disableLineNumbers = false } = this.options;
		const preProperties = {
			type: "file",
			split: false,
			overflow,
			disableLineNumbers,
			diffIndicators: "none",
			disableBackground: true,
			totalLines
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
function shouldRenderCode(pre, file, collapsed = false) {
	return !collapsed && pre == null && file != null;
}
function shouldRenderHeader(headerElement, file, disableFileHeader = false) {
	return headerElement == null && file != null && !disableFileHeader;
}
//#endregion
export { File };

//# sourceMappingURL=File.js.map