import { DEFAULT_VIRTUAL_FILE_METRICS } from "../constants.js";
import { areObjectsEqual } from "../utils/areObjectsEqual.js";
import { computeVirtualFileMetrics, getVirtualFileHeaderHeight, getVirtualFileHeaderRegion, getVirtualFilePaddingBottom } from "../utils/computeVirtualFileMetrics.js";
import { areOptionsEqual } from "../utils/areOptionsEqual.js";
import { changeMovesLines } from "../editor/textDocument.js";
import { areFileTargetsEqual } from "../utils/areFileTargetsEqual.js";
import { areGhostTextRowsEqual } from "../utils/areGhostTextRowsEqual.js";
import { FILE_ANNOTATION_DOM_KEY, includesFileAnnotations, shouldRenderFileAnnotations } from "../utils/includesFileAnnotations.js";
import { File } from "./File.js";
//#region src/components/VirtualizedFile.ts
const LAYOUT_CHECKPOINT_INTERVAL = 5e3;
const NO_GHOST_TEXT_ROWS = /* @__PURE__ */ new Map();
let instanceId = -1;
function hasFileLayoutOptionChanged(previousOptions, nextOptions) {
	return (previousOptions.overflow ?? "scroll") !== (nextOptions.overflow ?? "scroll") || (previousOptions.collapsed ?? false) !== (nextOptions.collapsed ?? false) || (previousOptions.disableLineNumbers ?? false) !== (nextOptions.disableLineNumbers ?? false) || (previousOptions.disableFileHeader ?? false) !== (nextOptions.disableFileHeader ?? false) || previousOptions.unsafeCSS !== nextOptions.unsafeCSS;
}
var VirtualizedFile = class extends File {
	virtualizer;
	metrics;
	__id = `virtualized-file:${++instanceId}`;
	renderType = "virtualized";
	top;
	height = 0;
	unmeasured = false;
	cache = {
		heights: /* @__PURE__ */ new Map(),
		checkpoints: [],
		fileAnnotationHeight: 0,
		ghostTextRows: NO_GHOST_TEXT_ROWS
	};
	pendingRender;
	isVisible = false;
	isSetup = false;
	layoutDirty = true;
	currentCollapsed;
	constructor(options, virtualizer, metrics = DEFAULT_VIRTUAL_FILE_METRICS, workerManager, requestOwnerRender) {
		super(options, workerManager, requestOwnerRender);
		this.virtualizer = virtualizer;
		this.metrics = metrics;
	}
	getLineCutsForSearch() {
		const { fileRenderer, options } = this;
		return {
			cutLength: fileRenderer.getLineCutLength(options),
			expandedLines: fileRenderer.lineCuts.expandedLines
		};
	}
	setMetrics(metrics, force = false) {
		const nextMetrics = computeVirtualFileMetrics(metrics);
		if (!force && areObjectsEqual(this.metrics, nextMetrics)) return;
		this.metrics = nextMetrics;
		this.resetMeasurements();
		this.invalidateLayout();
	}
	setLineAnnotations(lineAnnotations) {
		if (this.syncLineAnnotations(lineAnnotations)) this.forceRenderOverride = true;
	}
	syncLineAnnotations(lineAnnotations) {
		if (lineAnnotations == null || !this.isNewAnnotations(lineAnnotations)) return false;
		if (lineAnnotations.length === 0 && this.getLatestAnnotations().length === 0) return false;
		super.setLineAnnotations(lineAnnotations);
		this.managersDirty = true;
		return true;
	}
	syncEditSessionAnnotationsFromEditor(lineAnnotations) {
		if (super.syncEditSessionAnnotationsFromEditor(lineAnnotations)) {
			this.forceRenderOverride = true;
			return true;
		}
		return false;
	}
	hasLineAnnotations() {
		return this.getLayoutAnnotations().some((annotation) => annotation.lineNumber > 0);
	}
	hasUniformLineHeights() {
		const { overflow = "scroll" } = this.options;
		return overflow === "scroll" && !this.hasLineAnnotations() && this.cache.heights.size === 0 && this.cache.ghostTextRows.size === 0;
	}
	currentGhostTextRows() {
		return this.editor?.__getGhostTextRows() ?? NO_GHOST_TEXT_ROWS;
	}
	getLineHeight(lineIndex, hasMetadataLine = false) {
		const { cache } = this;
		const cached = cache.heights.get(lineIndex);
		if (cache.ghostTextRows.size === 0) return cached ?? this.metrics.lineHeight * (hasMetadataLine ? 2 : 1);
		const { lineHeight } = this.metrics;
		return (cached ?? lineHeight * (hasMetadataLine ? 2 : 1)) + (cache.ghostTextRows.get(lineIndex) ?? 0) * lineHeight;
	}
	setOptions(options) {
		if (this.isAdvancedMode()) throw new Error("VirtualizedFile.setOptions cannot be used inside CodeView. Update CodeView options instead.");
		if (options == null) return;
		const { options: previousOptions } = this;
		const optionsChanged = !areOptionsEqual(previousOptions, options);
		const layoutChanged = hasFileLayoutOptionChanged(previousOptions, options);
		super.setOptions(options);
		if (layoutChanged) {
			this.resetMeasurements();
			this.invalidateLayout({ forceSimpleRecompute: true });
		}
		if (optionsChanged) this.forceRenderOverride = true;
		if (optionsChanged) this.virtualizer.instanceChanged(this, layoutChanged);
	}
	setThemeType(themeType) {
		if (this.isAdvancedMode()) throw new Error("VirtualizedFile.setThemeType cannot be used inside CodeView. Update CodeView options instead.");
		super.setThemeType(themeType);
	}
	resetMeasurements() {
		this.cache.fileAnnotationHeight = 0;
		if (this.cache.heights.size > 0) this.cache.heights.clear();
		this.cache.ghostTextRows = NO_GHOST_TEXT_ROWS;
	}
	invalidateLayout({ forceSimpleRecompute = false, resetRenderRange = true } = {}) {
		this.layoutDirty = true;
		if (this.cache.checkpoints.length > 0) this.cache.checkpoints.length = 0;
		if (this.renderRange != null && resetRenderRange) this.renderRange = void 0;
		if (forceSimpleRecompute && this.isSimpleMode()) this.computeApproximateSize();
	}
	reconcileHeights() {
		let hasHeightChange = false;
		this.unmeasured = false;
		if (this.fileContainer == null || this.getLayoutFile() == null) {
			if (this.height !== 0) hasHeightChange = true;
			this.height = 0;
			return hasHeightChange;
		}
		const { overflow = "scroll" } = this.options;
		this.top = this.getVirtualizedTop();
		const ghostTextRows = this.currentGhostTextRows();
		if (!areGhostTextRowsEqual(ghostTextRows, this.cache.ghostTextRows)) hasHeightChange = true;
		this.cache.ghostTextRows = ghostTextRows;
		const measureAllRows = overflow !== "scroll" || this.lineAnnotations.length > 0 || typeof process !== "undefined" && process.env.NODE_ENV === "development" && this.getSimpleVirtualizer()?.config.resizeDebugging === true;
		if (this.placeHolder != null || !measureAllRows && this.cache.heights.size === 0 && this.cache.fileAnnotationHeight === 0) {
			if (hasHeightChange) {
				this.computeApproximateSize(true);
				this.setPlaceholderHeight(this.height);
			}
			return hasHeightChange;
		}
		const { lineHeight } = this.metrics;
		if (this.code == null) return hasHeightChange;
		const content = this.code.children[1];
		if (!(content instanceof HTMLElement)) return hasHeightChange;
		for (const line of content.children) {
			if (!(line instanceof HTMLElement)) continue;
			const lineIndexAttr = line.dataset.lineIndex;
			if (lineIndexAttr == null) continue;
			const lineIndex = Number(lineIndexAttr);
			const cachedHeight = this.cache.heights.get(lineIndex);
			if (!measureAllRows && cachedHeight == null) continue;
			let measuredHeight = line.getBoundingClientRect().height;
			if (measuredHeight === 0) {
				this.unmeasured = true;
				break;
			}
			let hasMetadata = false;
			if (line.nextElementSibling instanceof HTMLElement && ("lineAnnotation" in line.nextElementSibling.dataset || "noNewline" in line.nextElementSibling.dataset)) {
				if ("noNewline" in line.nextElementSibling.dataset) hasMetadata = true;
				measuredHeight += line.nextElementSibling.getBoundingClientRect().height;
			}
			const expectedHeight = cachedHeight ?? lineHeight * (hasMetadata ? 2 : 1);
			if (measuredHeight === expectedHeight) continue;
			hasHeightChange = true;
			if (measuredHeight === this.metrics.lineHeight * (hasMetadata ? 2 : 1)) this.cache.heights.delete(lineIndex);
			else this.cache.heights.set(lineIndex, measuredHeight);
		}
		if (!this.unmeasured && this.renderRange != null && shouldRenderFileAnnotations(this.renderRange)) {
			const nextFileAnnotationHeight = measureFileAnnotationHeight(content) ?? 0;
			if (nextFileAnnotationHeight !== this.cache.fileAnnotationHeight) {
				this.cache.fileAnnotationHeight = nextFileAnnotationHeight;
				hasHeightChange = true;
			}
		}
		if (hasHeightChange || typeof process !== "undefined" && process.env.NODE_ENV === "development" && this.getSimpleVirtualizer()?.config.resizeDebugging === true) this.computeApproximateSize(true);
		return hasHeightChange;
	}
	onRender = (dirty) => {
		const file = this.getInputFile();
		if (this.fileContainer == null || file == null) return false;
		if (dirty) this.top = this.getVirtualizedTop();
		return this.render({ file });
	};
	updateCodeViewLayout(file, top, reset, lineAnnotations) {
		const targetChanged = !areFileTargetsEqual(this.getInputFile(), file);
		if (targetChanged) this.updateInputFile(file, lineAnnotations);
		const { pendingRenderFile, layoutFileChanged, renderedFileChanged, annotationsChanged } = this.updatePendingRender(file, lineAnnotations);
		let shouldResetLayoutCache = reset?.resetFileLayoutCache === true || layoutFileChanged;
		if (reset?.metrics != null) {
			this.metrics = reset.metrics;
			shouldResetLayoutCache = true;
		}
		const { collapsed = false } = this.options;
		if (this.currentCollapsed !== collapsed) {
			this.currentCollapsed = collapsed;
			shouldResetLayoutCache = true;
		}
		if (shouldResetLayoutCache) {
			this.resetMeasurements();
			this.invalidateLayout();
		}
		if (targetChanged) this.layoutDirty = true;
		if (!this.forceRenderOverride && (targetChanged || renderedFileChanged || annotationsChanged)) this.forceRenderOverride = true;
		this.top = top;
		this.computeApproximateSize(false, pendingRenderFile);
		return this.height;
	}
	getLayoutFile() {
		return this.pendingRender?.file ?? this.getRenderedFile();
	}
	getLayoutAnnotations() {
		const { pendingRender } = this;
		return pendingRender != null ? this.getAnnotationsForFile(pendingRender.file) : this.lineAnnotations;
	}
	getLinePosition(lineNumber) {
		const file = this.getLayoutFile();
		if (file == null || lineNumber < 1) return;
		const { disableFileHeader = false, collapsed = false } = this.options;
		const lastLineIndex = this.fileRenderer.getLineCount(file) - 1;
		if (collapsed) return {
			top: getVirtualFileHeaderHeight(this.metrics, disableFileHeader),
			height: 0
		};
		let top = getVirtualFileHeaderRegion(this.metrics, disableFileHeader);
		if (lastLineIndex < 0) return {
			top,
			height: 0
		};
		const clampedLineIndex = Math.min(Math.max(lineNumber - 1, 0), lastLineIndex);
		const { lineHeight } = this.metrics;
		top += this.cache.fileAnnotationHeight;
		if (this.hasUniformLineHeights()) return {
			top: top + clampedLineIndex * lineHeight,
			height: lineHeight
		};
		const checkpoint = this.getLayoutCheckpointBeforeLineIndex(clampedLineIndex);
		top = checkpoint?.top ?? top;
		for (let lineIndex = checkpoint?.lineIndex ?? 0; lineIndex < clampedLineIndex; lineIndex++) top += this.getLineHeight(lineIndex, false);
		return {
			top,
			height: this.getLineHeight(clampedLineIndex, false)
		};
	}
	getEditorViewport() {
		return this.virtualizer.type === "simple" ? this.virtualizer.getRoot() : this.virtualizer.getContainerElement();
	}
	scrollToLine(lineNumber, align, onDone) {
		const { virtualizer } = this;
		if (virtualizer.type === "advanced") {
			virtualizer.scrollToInstanceLine(this, lineNumber, align, onDone);
			return;
		}
		virtualizer.scrollSpanIntoView({
			align,
			onDone,
			resolveSpan: () => {
				const position = this.getLinePosition(lineNumber);
				return position != null ? {
					top: this.getVirtualizedTop() + position.top,
					height: position.height
				} : void 0;
			}
		});
	}
	cancelScroll(onDone) {
		this.virtualizer.cancelScroll(onDone);
	}
	getRenderedBounds() {
		const range = this.renderRange;
		if (!this.enabled || range == null || range.totalLines <= 0) return void 0;
		return {
			top: getVirtualFileHeaderRegion(this.metrics, this.options.disableFileHeader ?? false) + (range.startingLine === 0 ? this.cache.fileAnnotationHeight : range.bufferBefore),
			bottom: this.height - getVirtualFilePaddingBottom(this.metrics) - range.bufferAfter
		};
	}
	getNumericScrollAnchor(localViewportTop) {
		const file = this.getLayoutFile();
		if (file == null || this.renderRange == null) return;
		const { disableFileHeader = false, collapsed = false } = this.options;
		if (collapsed || this.renderRange.totalLines <= 0) return;
		const lastLineIndex = this.fileRenderer.getLineCount(file) - 1;
		if (lastLineIndex < 0) return;
		const headerRegion = getVirtualFileHeaderRegion(this.metrics, disableFileHeader);
		const firstRenderedLineIndex = Math.min(this.renderRange.startingLine, lastLineIndex);
		const lastRenderedLineIndex = Math.min(firstRenderedLineIndex + this.renderRange.totalLines - 1, lastLineIndex);
		if (lastRenderedLineIndex < firstRenderedLineIndex) return;
		const { fileAnnotationHeight } = this.cache;
		if (this.hasUniformLineHeights()) {
			const { lineHeight } = this.metrics;
			const firstRenderedLineTop = headerRegion + (firstRenderedLineIndex === 0 ? fileAnnotationHeight : this.renderRange.bufferBefore);
			const lineIndex = firstRenderedLineIndex + Math.max(Math.ceil((localViewportTop - firstRenderedLineTop) / lineHeight), 0);
			if (lineIndex > lastRenderedLineIndex) return;
			return {
				lineNumber: lineIndex + 1,
				top: headerRegion + fileAnnotationHeight + lineIndex * lineHeight
			};
		}
		let top = headerRegion + (firstRenderedLineIndex === 0 ? fileAnnotationHeight : this.renderRange.bufferBefore);
		for (let lineIndex = firstRenderedLineIndex; lineIndex <= lastRenderedLineIndex; lineIndex++) {
			if (top >= localViewportTop) return {
				lineNumber: lineIndex + 1,
				top
			};
			top += this.getLineHeight(lineIndex);
		}
	}
	getVirtualizedHeight() {
		return this.height;
	}
	getAdvancedStickySpecs(windowSpecs) {
		const file = this.getLayoutFile();
		if (this.top == null || file == null) return;
		if (this.options.collapsed === true) return {
			topOffset: this.top,
			height: this.height
		};
		const renderRange = windowSpecs != null ? this.computeRenderRangeFromWindow(file, this.top, windowSpecs) : this.renderRange;
		if (renderRange == null) return;
		const { bufferBefore, bufferAfter, totalLines } = renderRange;
		let headerOnlyOffset = 0;
		if (totalLines === 0) {
			const activeWindow = windowSpecs ?? this.virtualizer.getWindowSpecs();
			if (this.top < activeWindow.top) headerOnlyOffset = bufferAfter;
		}
		return {
			topOffset: this.top + bufferBefore + headerOnlyOffset,
			height: this.height - (bufferBefore + bufferAfter)
		};
	}
	cleanUp(recycle = false) {
		const hadGhostTextRows = this.cache.ghostTextRows.size > 0;
		if (hadGhostTextRows) this.layoutDirty = true;
		const shouldRecomputeLayout = recycle && this.isAdvancedMode() && this.fileContainer != null && (hadGhostTextRows || !areFileTargetsEqual(this.getRenderedFile(), this.getWorkingFile()));
		if (this.fileContainer != null && this.isSimpleMode()) this.getSimpleVirtualizer()?.disconnect(this.fileContainer);
		if (!recycle) {
			this.resetMeasurements();
			this.invalidateLayout();
		}
		this.pendingRender = void 0;
		this.isSetup = false;
		super.cleanUp(recycle);
		if (shouldRecomputeLayout) this.virtualizer.instanceChanged(this, true);
	}
	computeApproximateSize(force = false, file = this.getLayoutFile()) {
		if (!force && !this.layoutDirty && (typeof process === "undefined" || process.env.NODE_ENV !== "development" || this.getSimpleVirtualizer()?.config.resizeDebugging !== true)) return;
		const isFirstCompute = this.height === 0;
		this.height = 0;
		this.cache.checkpoints = [];
		if (file == null) {
			this.layoutDirty = false;
			return;
		}
		this.cache.ghostTextRows = this.currentGhostTextRows();
		const { disableFileHeader = false, collapsed = false } = this.options;
		const { lineHeight } = this.metrics;
		const lineCount = this.fileRenderer.getLineCount(file);
		if (collapsed) {
			this.height += getVirtualFileHeaderHeight(this.metrics, disableFileHeader);
			this.layoutDirty = false;
			return;
		}
		const headerRegion = getVirtualFileHeaderRegion(this.metrics, disableFileHeader);
		const paddingBottom = getVirtualFilePaddingBottom(this.metrics);
		this.height += headerRegion;
		this.height += this.cache.fileAnnotationHeight;
		if (this.hasUniformLineHeights()) this.height += lineCount * lineHeight;
		else for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
			this.addLayoutCheckpoint(lineIndex, this.height);
			this.height += this.getLineHeight(lineIndex, false);
		}
		if (lineCount > 0) this.height += paddingBottom;
		if (typeof process !== "undefined" && process.env.NODE_ENV === "development" && this.getSimpleVirtualizer()?.config.resizeDebugging === true && this.fileContainer != null && !isFirstCompute) {
			const rect = this.fileContainer.getBoundingClientRect();
			if (rect.height !== this.height) console.log("VirtualizedFile.computeApproximateSize: computed height doesnt match", {
				name: file.name,
				elementHeight: rect.height,
				computedHeight: this.height
			});
			else console.log("VirtualizedFile.computeApproximateSize: computed height IS CORRECT");
		}
		this.layoutDirty = false;
	}
	setVisibility(visible) {
		if (this.isAdvancedMode() || this.fileContainer == null) return;
		this.renderRange = void 0;
		if (visible && !this.isVisible) {
			this.top = this.getVirtualizedTop();
			this.isVisible = true;
		} else if (!visible && this.isVisible) {
			this.isVisible = false;
			this.rerender();
		}
	}
	rerender() {
		if (!this.enabled || this.getInputFile() == null) return;
		const workingFile = this.getWorkingFile();
		const nextRenderFile = workingFile == null ? void 0 : this.getFileForNextRender(workingFile);
		if (this.isSimpleMode()) this.pendingRender = void 0;
		this.forceRenderOverride = true;
		if (this.isSimpleMode() && this.requestRender()) return;
		this.virtualizer.instanceChanged(this, !areFileTargetsEqual(this.getRenderedFile(), nextRenderFile));
	}
	get isComponentManaged() {
		return this.getAdvancedVirtualizer()?.isComponentManaged ?? super.isComponentManaged;
	}
	syncGhostTextRows() {
		const codeView = this.getAdvancedVirtualizer();
		if (codeView != null) {
			codeView.capturePendingLayoutAnchor();
			this.layoutDirty = true;
			codeView.instanceChanged(this, true);
		} else this.getSimpleVirtualizer()?.requestHeightReconcile(this);
	}
	renderChange(structural) {
		if (!structural) {
			this.rerender();
			return;
		}
		this.getSimpleVirtualizer()?.markDOMDirty();
		this.invalidateLayout({
			forceSimpleRecompute: this.isSimpleMode(),
			resetRenderRange: false
		});
		if (!this.isSimpleMode()) this.computeApproximateSize(true);
		this.forceRenderOverride = true;
		this.virtualizer.instanceChanged(this, true);
	}
	applyChange(document, change, options) {
		if (changeMovesLines(change)) this.getAdvancedVirtualizer()?.capturePendingLayoutAnchor();
		return super.applyChange(document, change, options);
	}
	render({ fileContainer, file, forceRender = false, lineAnnotations, ...props }) {
		const didFileChange = !areFileTargetsEqual(this.getInputFile(), file);
		if (didFileChange) {
			this.updateInputFile(file, lineAnnotations);
			this.cachedHeaderHTML = void 0;
		}
		const { pendingRenderFile, layoutFileChanged, renderedFileChanged, annotationsChanged } = (() => {
			if (this.pendingRender != null && this.pendingRender.workingFile === (this.getWorkingFile(file) ?? file)) return {
				pendingRenderFile: this.pendingRender.file,
				layoutFileChanged: false,
				renderedFileChanged: false,
				annotationsChanged: this.syncLineAnnotations(lineAnnotations)
			};
			return this.updatePendingRender(file, lineAnnotations);
		})();
		const { forceRenderOverride, isSetup } = this;
		this.forceRenderOverride = void 0;
		if (layoutFileChanged) {
			this.resetMeasurements();
			this.invalidateLayout();
		}
		fileContainer = this.getOrCreateFileContainerNode(fileContainer);
		if (!isSetup) {
			this.computeApproximateSize(false, pendingRenderFile);
			const virtualizer = this.getSimpleVirtualizer();
			this.top ??= this.getVirtualizedTop();
			if (this.isAdvancedMode()) this.isVisible = true;
			else {
				if (virtualizer == null) throw new Error("VirtualizedFile.render: simple virtualizer is not available");
				virtualizer.connect(fileContainer, this);
				this.isVisible = virtualizer.isInstanceVisible(this.top ?? 0, this.height);
			}
			this.isSetup = true;
		} else {
			this.top ??= this.getVirtualizedTop();
			if (this.layoutDirty && this.isSimpleMode()) {
				this.getSimpleVirtualizer()?.markDOMDirty();
				this.computeApproximateSize(false, pendingRenderFile);
			}
		}
		if (!this.isVisible && this.isSimpleMode() && (!didFileChange || !isSetup)) return this.renderPlaceholder(this.height);
		const windowSpecs = this.virtualizer.getWindowSpecs();
		const fileTop = this.top ?? 0;
		const renderRange = this.computeRenderRangeFromWindow(pendingRenderFile, fileTop, windowSpecs);
		return super.render({
			file,
			fileContainer,
			renderRange,
			lineAnnotations,
			forceRender: (forceRenderOverride ?? forceRender) || annotationsChanged || renderedFileChanged || didFileChange,
			...props
		});
	}
	finalizeRender() {
		if (this.getRenderedFile() !== this.pendingRender?.file) throw new Error("VirtualizedFile.render: rendered a different file than its prepared layout");
		this.pendingRender = void 0;
		if (this.isSimpleMode()) this.getSimpleVirtualizer()?.requestHeightReconcile(this);
	}
	updatePendingRender(nextFile, lineAnnotations) {
		const workingFile = this.getWorkingFile(nextFile) ?? nextFile;
		const previousRenderedFile = this.getRenderedFile();
		const previousLayoutFile = this.pendingRender?.file ?? previousRenderedFile;
		const pendingRenderFile = this.getFileForNextRender(workingFile);
		this.pendingRender = {
			workingFile,
			file: pendingRenderFile
		};
		return {
			pendingRenderFile,
			annotationsChanged: this.syncLineAnnotations(lineAnnotations),
			layoutFileChanged: !areFileTargetsEqual(previousLayoutFile, pendingRenderFile),
			renderedFileChanged: !areFileTargetsEqual(previousRenderedFile, pendingRenderFile)
		};
	}
	syncVirtualizedTop() {
		this.top = this.getVirtualizedTop();
	}
	shouldDisableVirtualizationBuffers() {
		return this.isAdvancedMode() || super.shouldDisableVirtualizationBuffers();
	}
	shouldGuardRebuildScroll() {
		return false;
	}
	isSimpleMode() {
		return this.virtualizer.type === "simple";
	}
	isAdvancedMode() {
		return this.virtualizer.type === "advanced";
	}
	addLayoutCheckpoint(lineIndex, top) {
		if (lineIndex % LAYOUT_CHECKPOINT_INTERVAL !== 0) return;
		this.cache.checkpoints.push({
			lineIndex,
			top
		});
	}
	getLayoutCheckpointBeforeLineIndex(lineIndex) {
		if (lineIndex <= 0 || this.cache.checkpoints.length === 0) return;
		let low = 0;
		let high = this.cache.checkpoints.length - 1;
		let result;
		while (low <= high) {
			const mid = low + high >> 1;
			const checkpoint = this.cache.checkpoints[mid];
			if (checkpoint == null) throw new Error("VirtualizedFile: invalid checkpoint index");
			if (checkpoint.lineIndex <= lineIndex) {
				result = checkpoint;
				low = mid + 1;
			} else high = mid - 1;
		}
		return result;
	}
	getLayoutCheckpointBeforeTop(top, hunkLineCount) {
		let low = 0;
		let high = this.cache.checkpoints.length - 1;
		let resultIndex = -1;
		while (low <= high) {
			const mid = low + high >> 1;
			const checkpoint = this.cache.checkpoints[mid];
			if (checkpoint == null) throw new Error("VirtualizedFile: invalid checkpoint index");
			if (checkpoint.top <= top) {
				resultIndex = mid;
				low = mid + 1;
			} else high = mid - 1;
		}
		if (hunkLineCount == null) return resultIndex >= 0 ? this.cache.checkpoints[resultIndex] : void 0;
		for (let index = resultIndex; index >= 0; index--) {
			const checkpoint = this.cache.checkpoints[index];
			if (checkpoint == null) throw new Error("VirtualizedFile: invalid checkpoint index");
			if (checkpoint.lineIndex % hunkLineCount === 0) return checkpoint;
		}
	}
	getVirtualizedTop() {
		if (this.virtualizer.type === "advanced") return this.virtualizer.getLocalTopForInstance(this);
		return this.fileContainer != null ? this.virtualizer.getOffsetInScrollContainer(this.fileContainer) : 0;
	}
	getSimpleVirtualizer() {
		return this.virtualizer.type === "simple" ? this.virtualizer : void 0;
	}
	getAdvancedVirtualizer() {
		return this.virtualizer.type === "advanced" ? this.virtualizer : void 0;
	}
	computeRenderRangeFromWindow(file, fileTop, { top, bottom }) {
		const { disableFileHeader = false } = this.options;
		const { hunkLineCount, lineHeight } = this.metrics;
		const lineCount = this.fileRenderer.getLineCount(file);
		const fileHeight = this.height;
		const headerRegion = getVirtualFileHeaderRegion(this.metrics, disableFileHeader);
		const paddingBottom = lineCount > 0 ? getVirtualFilePaddingBottom(this.metrics) : 0;
		const { fileAnnotationHeight } = this.cache;
		const codeRegionTop = headerRegion + fileAnnotationHeight;
		const codeRowsHeight = Math.max(0, fileHeight - headerRegion - fileAnnotationHeight - paddingBottom);
		const hasFileAnnotations = includesFileAnnotations(this.getLayoutAnnotations());
		const fileAnnotationTop = fileTop + headerRegion;
		const measuredFileAnnotationVisible = fileAnnotationHeight > 0 && hasFileAnnotations && fileAnnotationTop < bottom && fileAnnotationTop + fileAnnotationHeight > top;
		if (fileTop < top - fileHeight || fileTop > bottom) return {
			startingLine: 0,
			totalLines: 0,
			bufferBefore: 0,
			bufferAfter: fileHeight - headerRegion - paddingBottom
		};
		if (lineCount <= hunkLineCount) return {
			startingLine: 0,
			totalLines: hunkLineCount,
			bufferBefore: 0,
			bufferAfter: 0
		};
		const estimatedTargetLines = Math.ceil(Math.max(bottom - top, 0) / lineHeight);
		const totalLines = Math.ceil(estimatedTargetLines / hunkLineCount) * hunkLineCount + hunkLineCount;
		const totalHunks = totalLines / hunkLineCount;
		const viewportCenter = (top + bottom) / 2;
		if (this.hasUniformLineHeights()) {
			const sourceRowsTop = fileTop + codeRegionTop;
			const sourceRowsBottom = sourceRowsTop + codeRowsHeight;
			if (!measuredFileAnnotationVisible && !(sourceRowsTop < bottom && sourceRowsBottom > top)) return {
				startingLine: 0,
				totalLines: 0,
				bufferBefore: 0,
				bufferAfter: fileHeight - headerRegion - paddingBottom
			};
			const centerInHunks = measuredFileAnnotationVisible && viewportCenter < sourceRowsTop ? 0 : (viewportCenter - sourceRowsTop) / (lineHeight * hunkLineCount);
			const idealStartHunk = Math.round(centerInHunks - totalHunks / 2);
			const totalHunksInFile = Math.ceil(lineCount / hunkLineCount);
			const startingLine = Math.max(0, Math.min(idealStartHunk, totalHunksInFile)) * hunkLineCount;
			const clampedTotalLines = idealStartHunk < 0 ? totalLines + idealStartHunk * hunkLineCount : totalLines;
			const bufferBefore = startingLine === 0 ? 0 : fileAnnotationHeight + startingLine * lineHeight;
			const renderedLines = Math.min(clampedTotalLines, lineCount - startingLine);
			return {
				startingLine,
				totalLines: clampedTotalLines,
				bufferBefore,
				bufferAfter: Math.max(0, (lineCount - startingLine - renderedLines) * lineHeight)
			};
		}
		const overflowHunks = totalHunks;
		const hunkOffsets = [];
		const checkpoint = this.getLayoutCheckpointBeforeTop(Math.max(0, top - fileTop - totalLines * lineHeight * 2), hunkLineCount);
		let absoluteLineTop = fileTop + (checkpoint?.top ?? codeRegionTop);
		let currentLine = checkpoint?.lineIndex ?? 0;
		let firstVisibleHunk;
		let overflowCounter;
		const startingLineIndex = checkpoint?.lineIndex ?? 0;
		for (let lineIndex = startingLineIndex; lineIndex < lineCount; lineIndex++) {
			const isAtHunkBoundary = currentLine % hunkLineCount === 0;
			const currentHunk = Math.floor(currentLine / hunkLineCount);
			if (isAtHunkBoundary) {
				hunkOffsets[currentHunk] = absoluteLineTop - (fileTop + codeRegionTop);
				if (overflowCounter != null) {
					if (overflowCounter <= 0) break;
					overflowCounter--;
				}
			}
			const lineHeight = this.getLineHeight(lineIndex, false);
			if (absoluteLineTop > top - lineHeight && absoluteLineTop < bottom) firstVisibleHunk ??= currentHunk;
			if (overflowCounter == null && absoluteLineTop >= bottom && isAtHunkBoundary) overflowCounter = overflowHunks;
			currentLine++;
			absoluteLineTop += lineHeight;
		}
		if (firstVisibleHunk == null) {
			if (measuredFileAnnotationVisible) firstVisibleHunk = 0;
			else return {
				startingLine: 0,
				totalLines: 0,
				bufferBefore: 0,
				bufferAfter: fileHeight - headerRegion - paddingBottom
			};
		}
		const maxStartHunk = Math.max(0, Math.ceil(lineCount / hunkLineCount) - totalHunks);
		const startHunk = Math.min(firstVisibleHunk, maxStartHunk);
		const startingLine = startHunk * hunkLineCount;
		const codeBufferBefore = hunkOffsets[startHunk] ?? 0;
		const bufferBefore = startingLine === 0 ? 0 : fileAnnotationHeight + codeBufferBefore;
		const finalHunkIndex = startHunk + totalHunks;
		const bufferAfter = finalHunkIndex < hunkOffsets.length ? codeRowsHeight - hunkOffsets[finalHunkIndex] : codeRowsHeight - (absoluteLineTop - fileTop - codeRegionTop);
		return {
			startingLine,
			totalLines,
			bufferBefore,
			bufferAfter: Math.max(0, bufferAfter)
		};
	}
};
function measureFileAnnotationHeight(content) {
	let height;
	for (const child of content.children) {
		if (!(child instanceof HTMLElement)) continue;
		if (child.dataset.lineAnnotation !== FILE_ANNOTATION_DOM_KEY) continue;
		height = Math.max(height ?? 0, child.getBoundingClientRect().height);
	}
	return height;
}
//#endregion
export { VirtualizedFile };

//# sourceMappingURL=VirtualizedFile.js.map