import "../constants.js";
import { areObjectsEqual } from "../utils/areObjectsEqual.js";
import { computeVirtualFileMetrics, getVirtualFileHeaderHeight, getVirtualFileHeaderRegion, getVirtualFilePaddingBottom } from "../utils/computeVirtualFileMetrics.js";
import { getExpandedRegion, getLeadingHunkSeparatorLayout, getTrailingExpandedRegion, getTrailingHunkSeparatorLayout, growExpandedRegion } from "../utils/virtualDiffLayout.js";
import { DiffRowCursor } from "../utils/DiffRowCursor.js";
import { areOptionsEqual } from "../utils/areOptionsEqual.js";
import { changeMovesLines } from "../editor/textDocument.js";
import { areGhostTextRowsEqual } from "../utils/areGhostTextRowsEqual.js";
import { FILE_ANNOTATION_DOM_KEY, includesFileAnnotations, shouldRenderFileAnnotations } from "../utils/includesFileAnnotations.js";
import { areDiffTargetsEqual } from "../utils/areDiffTargetsEqual.js";
import { areFilesEqual } from "../utils/areFilesEqual.js";
import { awaitWithTimeout } from "../utils/awaitWithTimeout.js";
import { computeEstimatedDiffHeights } from "../utils/computeEstimatedDiffHeights.js";
import { getDiffFileInput } from "../utils/getDiffFileInput.js";
import { hydratePartialDiff } from "../utils/hydratePartialDiff.js";
import { parseDiffFromFile } from "../utils/parseDiffFromFile.js";
import { FileDiff } from "./FileDiff.js";
//#region src/components/VirtualizedFileDiff.ts
const VIRTUALIZED_FILE_DIFF_LAYOUT_CHECKPOINT_INTERVAL = 3e3;
const NO_GHOST_TEXT_ROWS = /* @__PURE__ */ new Map();
let instanceId = -1;
var VirtualizedFileDiff = class extends FileDiff {
	__id = `little-virtualized-file-diff:${++instanceId}`;
	renderType = "virtualized";
	top;
	height = 0;
	metrics;
	cache = {
		heightDeltas: /* @__PURE__ */ new Map(),
		measuredHeightDeltaTotal: 0,
		estimatedSplitHeight: void 0,
		estimatedUnifiedHeight: void 0,
		checkpoints: [],
		totalLines: 0,
		fileAnnotationHeight: 0,
		ghostTextRows: NO_GHOST_TEXT_ROWS
	};
	highestMeasuredRow = -1;
	unmeasured = false;
	isVisible = false;
	isSetup = false;
	virtualizer;
	layoutDirty = true;
	currentCollapsed;
	pendingHydratedDiff;
	pendingExpandedHunks;
	pendingRender;
	constructor(options, virtualizer, metrics, workerManager, requestOwnerRender) {
		super(options, workerManager, requestOwnerRender);
		this.virtualizer = virtualizer;
		this.metrics = computeVirtualFileMetrics(metrics);
	}
	setMetrics(metrics, force = false) {
		const nextMetrics = computeVirtualFileMetrics(metrics);
		if (!force && areObjectsEqual(this.metrics, nextMetrics)) return;
		this.metrics = nextMetrics;
		this.resetMeasurements();
		this.invalidateLayout({ includeEstimatedHeights: true });
	}
	setLineAnnotations(lineAnnotations) {
		if (this.syncLineAnnotations(lineAnnotations)) this.forceRenderOverride = true;
	}
	syncLineAnnotations(lineAnnotations) {
		if (lineAnnotations == null || !this.isNewAnnotations(lineAnnotations) || lineAnnotations.length === 0 && this.getLatestAnnotations().length === 0) return false;
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
	setFileAnnotationHeight(nextHeight) {
		const previousHeight = this.cache.fileAnnotationHeight;
		if (nextHeight === previousHeight) return false;
		this.cache.fileAnnotationHeight = nextHeight;
		this.cache.measuredHeightDeltaTotal += nextHeight - previousHeight;
		return true;
	}
	hasFileAnnotations(fileDiff) {
		const lineAnnotations = this.getLayoutAnnotations();
		if (!includesFileAnnotations(lineAnnotations)) return false;
		return lineAnnotations.some((annotation) => {
			if (annotation.lineNumber !== 0) return false;
			if (fileDiff.type === "new") return annotation.side === "additions";
			if (fileDiff.type === "deleted") return annotation.side === "deletions";
			return true;
		});
	}
	getLineHeight(rowIndex, lineIndex, hasMetadataLine = false) {
		const { cache } = this;
		const height = this.getEstimatedLineHeight(hasMetadataLine) + (cache.heightDeltas.get(rowIndex) ?? 0);
		if (lineIndex == null || cache.ghostTextRows.size === 0) return height;
		return height + (cache.ghostTextRows.get(lineIndex) ?? 0) * this.metrics.lineHeight;
	}
	ghostTextRowsHeight() {
		let rows = 0;
		for (const count of this.cache.ghostTextRows.values()) rows += count;
		return rows * this.metrics.lineHeight;
	}
	ghostTextRowsByIndex(fileDiff) {
		const diffStyle = this.getDiffStyle();
		const byIndex = /* @__PURE__ */ new Map();
		for (const [line, rows] of this.cache.ghostTextRows) {
			const indexes = this.getLineIndexForDiff(fileDiff, line + 1, "additions");
			if (indexes != null) byIndex.set(diffStyle === "split" ? indexes[1] : indexes[0], rows);
		}
		return byIndex;
	}
	getEstimatedLineHeight(hasMetadataLine = false) {
		const multiplier = hasMetadataLine ? 2 : 1;
		return this.metrics.lineHeight * multiplier;
	}
	hasNoNewlineMarker(rows) {
		return this.hunksRenderer.showsNoNewlineMarkers() && (rows.hasAddition && rows.additionNoEOFCR || rows.hasDeletion && rows.deletionNoEOFCR);
	}
	setOptions(options) {
		if (this.isAdvancedMode()) throw new Error("VirtualizedFileDiff.setOptions cannot be used inside CodeView. Update CodeView options instead.");
		if (options == null) return;
		const { options: previousOptions } = this;
		const optionsChanged = !areOptionsEqual(previousOptions, options);
		const layoutChanged = optionsChanged && hasDiffLayoutOptionChanged(previousOptions, options);
		super.setOptions(options);
		if (layoutChanged) {
			this.resetMeasurements();
			this.invalidateLayout({
				forceSimpleRecompute: true,
				includeEstimatedHeights: hasDiffEstimateOptionChanged(previousOptions, options)
			});
		}
		if (optionsChanged) this.forceRenderOverride = true;
		if (optionsChanged && this.isSimpleMode()) this.virtualizer.instanceChanged(this, layoutChanged);
	}
	setThemeType(themeType) {
		if (this.isAdvancedMode()) throw new Error("VirtualizedFileDiff.setThemeType cannot be used inside CodeView. Update CodeView options instead.");
		super.setThemeType(themeType);
	}
	resetMeasurements() {
		this.cache.fileAnnotationHeight = 0;
		this.cache.heightDeltas.clear();
		this.cache.measuredHeightDeltaTotal = 0;
		this.highestMeasuredRow = -1;
		this.cache.ghostTextRows = NO_GHOST_TEXT_ROWS;
	}
	dropMeasurementsPastEnd() {
		const fileDiff = this.getRenderedDiff();
		const { heightDeltas } = this.cache;
		if (fileDiff == null || heightDeltas.size === 0) return;
		const diffStyle = this.getDiffStyle();
		const rowCount = Math.max(this.getExpandedLineCount(fileDiff, diffStyle), diffStyle === "split" ? fileDiff.splitLineCount : fileDiff.unifiedLineCount, fileDiff.additionLines.length, fileDiff.deletionLines.length);
		for (let row = this.highestMeasuredRow; row >= rowCount; row--) {
			const delta = heightDeltas.get(row);
			if (delta != null) {
				heightDeltas.delete(row);
				this.cache.measuredHeightDeltaTotal -= delta;
			}
		}
		this.highestMeasuredRow = Math.min(this.highestMeasuredRow, rowCount - 1);
	}
	invalidateLayout({ forceSimpleRecompute = false, includeEstimatedHeights = false, resetRenderRange = true } = {}) {
		this.layoutDirty = true;
		if (this.cache.checkpoints.length > 0) this.cache.checkpoints.length = 0;
		if (this.cache.totalLines !== 0) this.cache.totalLines = 0;
		if (includeEstimatedHeights) {
			this.cache.estimatedSplitHeight = void 0;
			this.cache.estimatedUnifiedHeight = void 0;
		}
		if (this.renderRange != null && resetRenderRange) this.renderRange = void 0;
		if (forceSimpleRecompute && this.isSimpleMode()) this.computeApproximateSize();
	}
	applyGhostTextRows(ghostTextRows) {
		if (this.cache.ghostTextRows === ghostTextRows) return false;
		const changed = !areGhostTextRowsEqual(ghostTextRows, this.cache.ghostTextRows);
		this.cache.ghostTextRows = ghostTextRows;
		return changed;
	}
	reconcileHeights() {
		let hasHeightChange = false;
		this.unmeasured = false;
		const { options: { overflow = "scroll" } } = this;
		const fileDiff = this.placeHolder != null ? this.getLayoutDiff() : this.getRenderedDiff();
		if (this.fileContainer == null || fileDiff == null) {
			if (this.height !== 0) hasHeightChange = true;
			this.height = 0;
			return hasHeightChange;
		}
		this.top = this.getVirtualizedTop();
		hasHeightChange = this.applyGhostTextRows(this.editor?.__getGhostTextRows() ?? NO_GHOST_TEXT_ROWS);
		const measureAllRows = overflow !== "scroll" || this.lineAnnotations.length > 0 || typeof process !== "undefined" && process.env.NODE_ENV === "development" && this.getSimpleVirtualizer()?.config.resizeDebugging === true;
		if (this.placeHolder != null || !measureAllRows && this.cache.heightDeltas.size === 0 && this.cache.fileAnnotationHeight === 0) {
			if (hasHeightChange) {
				this.computeApproximateSize(true);
				this.setPlaceholderHeight(this.height);
			}
			return hasHeightChange;
		}
		const diffStyle = this.getDiffStyle();
		const codeGroups = diffStyle === "split" ? [this.codeAdditions, this.codeDeletions] : [this.codeUnified];
		const measuredTracks = /* @__PURE__ */ new Set();
		for (const codeGroup of codeGroups) {
			if (codeGroup == null) continue;
			const content = codeGroup.children[1];
			if (!(content instanceof HTMLElement)) continue;
			const isDeletionsColumn = diffStyle === "split" && codeGroup === this.codeDeletions;
			for (const line of content.children) {
				if (!(line instanceof HTMLElement)) continue;
				const lineIndexAttr = line.dataset.lineIndex;
				if (lineIndexAttr == null) continue;
				const lineIndex = parseLineIndex(lineIndexAttr, diffStyle);
				if (isDeletionsColumn) {
					if (measuredTracks.has(lineIndex)) continue;
				} else if (diffStyle === "split") measuredTracks.add(lineIndex);
				const previousDelta = this.cache.heightDeltas.get(lineIndex) ?? 0;
				if (!measureAllRows && previousDelta === 0) continue;
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
				const estimatedHeight = this.getEstimatedLineHeight(hasMetadata);
				const nextDelta = measuredHeight - estimatedHeight;
				if (nextDelta === previousDelta) continue;
				hasHeightChange = true;
				this.cache.measuredHeightDeltaTotal += nextDelta - previousDelta;
				if (nextDelta === 0) this.cache.heightDeltas.delete(lineIndex);
				else {
					this.cache.heightDeltas.set(lineIndex, nextDelta);
					this.highestMeasuredRow = Math.max(this.highestMeasuredRow, lineIndex);
				}
			}
			if (this.unmeasured) break;
		}
		if (!this.unmeasured && this.renderRange != null && shouldRenderFileAnnotations(this.renderRange)) {
			const nextFileAnnotationHeight = measureFileAnnotationHeight(codeGroups) ?? 0;
			if (this.setFileAnnotationHeight(nextFileAnnotationHeight)) hasHeightChange = true;
		}
		if (hasHeightChange || typeof process !== "undefined" && process.env.NODE_ENV === "development" && this.getSimpleVirtualizer()?.config.resizeDebugging === true) this.computeApproximateSize(true);
		return hasHeightChange;
	}
	onRender = (dirty) => {
		if (this.fileContainer == null) return false;
		if (dirty) this.top = this.getVirtualizedTop();
		return this.render();
	};
	renderChange(structural) {
		if (structural) this.escalateEditSessionRender("change");
		else this.rerender();
	}
	applyChange(document, change, options) {
		if (changeMovesLines(change)) this.getAdvancedVirtualizer()?.capturePendingLayoutAnchor();
		return super.applyChange(document, change, options);
	}
	updateCodeViewLayout(fileDiff, top, reset, lineAnnotations) {
		let dropMeasurements = false;
		let resetEstimatedHeights = false;
		const { pendingExpandedHunks, pendingHydratedDiff, options: { collapsed = false } } = this;
		if (pendingHydratedDiff != null) {
			this.pendingHydratedDiff = void 0;
			if (areDiffTargetsEqual(pendingHydratedDiff.expectedDiff, fileDiff)) {
				Object.assign(fileDiff, pendingHydratedDiff.nextDiff);
				this.setHydratedState(pendingHydratedDiff.files);
				this.installHydratedDiff(fileDiff);
				this.forceRenderOverride = true;
				dropMeasurements = true;
				resetEstimatedHeights = true;
			}
		}
		if (pendingExpandedHunks != null) {
			this.pendingExpandedHunks = void 0;
			this.hunksRenderer.setExpandedHunksMap(pendingExpandedHunks);
			this.forceRenderOverride = true;
			resetEstimatedHeights = true;
		}
		const diffChanged = this.updateInputDiff(fileDiff, lineAnnotations);
		const { pendingRenderDiff, layoutDiffChanged, renderedDiffChanged, annotationsChanged } = this.updatePendingRender(fileDiff, lineAnnotations);
		if (!this.forceRenderOverride && (diffChanged || renderedDiffChanged || annotationsChanged)) this.forceRenderOverride = true;
		if (reset?.resetDiffLayoutCache === true || layoutDiffChanged) dropMeasurements = true;
		if (layoutDiffChanged || reset?.resetDiffLayoutCache === true && reset.includeEstimatedDiffHeights) resetEstimatedHeights = true;
		if (reset?.metrics != null) {
			this.metrics = computeVirtualFileMetrics(reset.metrics);
			dropMeasurements = true;
			resetEstimatedHeights = true;
		}
		if (this.currentCollapsed !== collapsed) {
			this.currentCollapsed = collapsed;
			dropMeasurements = true;
		}
		if (dropMeasurements) {
			this.resetMeasurements();
			this.invalidateLayout({ includeEstimatedHeights: resetEstimatedHeights });
		} else if (resetEstimatedHeights) this.invalidateLayout({ includeEstimatedHeights: true });
		this.top = top;
		this.computeApproximateSize(false, pendingRenderDiff);
		return this.height;
	}
	getLinePosition(lineNumber, side = "additions") {
		const fileDiff = this.getLayoutDiff();
		if (fileDiff == null || lineNumber < 1) return;
		const targetLineIndexes = this.getLineIndexForDiff(fileDiff, lineNumber, side);
		if (targetLineIndexes == null) return;
		const { disableFileHeader = false, expandUnchanged = false, collapsed = false, collapsedContextThreshold = 1 } = this.options;
		const diffStyle = this.getDiffStyle();
		const hunkSeparators = this.getHunkSeparatorType();
		const targetLineIndex = diffStyle === "split" ? targetLineIndexes[1] : targetLineIndexes[0];
		this.approximateLayoutCheckpoints(fileDiff);
		const headerRegion = getVirtualFileHeaderRegion(this.metrics, disableFileHeader);
		const checkpoint = this.getLayoutCheckpointBeforeLineIndex(targetLineIndex);
		let top = checkpoint?.top ?? headerRegion + this.cache.fileAnnotationHeight;
		if (collapsed) return {
			top: getVirtualFileHeaderHeight(this.metrics, disableFileHeader),
			height: 0
		};
		let position;
		const rows = new DiffRowCursor({
			diff: fileDiff,
			diffStyle,
			startingLine: checkpoint?.renderedLineIndex ?? 0,
			expandedHunks: expandUnchanged ? true : this.pendingExpandedHunks ?? this.hunksRenderer.getExpandedHunksMap(),
			collapsedContextThreshold,
			includeTrailingNewline: this.hunksRenderer.includesTrailingNewline()
		});
		while (rows.next()) {
			const { hunkIndex, hunk, collapsedBefore, collapsedAfter } = rows;
			const lineIndex = diffStyle === "split" ? rows.splitLineIndex : rows.unifiedLineIndex;
			if (collapsedBefore > 0) {
				const separator = getLeadingHunkSeparatorLayout({
					type: hunkSeparators,
					metrics: this.metrics,
					hunkIndex,
					hunkSpecs: hunk?.hunkSpecs
				});
				if (separator != null) {
					top += separator.gapBefore;
					if (targetLineIndex >= lineIndex - collapsedBefore && targetLineIndex < lineIndex) {
						position = {
							top,
							height: separator.height
						};
						break;
					}
					top += separator.height + separator.gapAfter;
				}
			}
			const lineHeight = this.getLineHeight(lineIndex, rows.hasAddition ? rows.additionLineIndex : void 0, this.hasNoNewlineMarker(rows));
			if (lineIndex === targetLineIndex) {
				position = {
					top,
					height: lineHeight
				};
				break;
			}
			top += lineHeight;
			if (collapsedAfter > 0) {
				const separator = getTrailingHunkSeparatorLayout({
					type: hunkSeparators,
					metrics: this.metrics
				});
				if (separator != null) {
					if (targetLineIndex > lineIndex && targetLineIndex <= lineIndex + collapsedAfter) {
						position = {
							top: top + separator.gapBefore,
							height: separator.height
						};
						break;
					}
					top += separator.totalHeight;
				}
			}
		}
		return position;
	}
	getEditorViewport() {
		return this.virtualizer.type === "simple" ? this.virtualizer.getRoot() : this.virtualizer.getContainerElement();
	}
	scrollToLine(lineNumber, align, onDone) {
		const { virtualizer } = this;
		if (this.isLineInCollapsedContext(lineNumber)) {
			virtualizer.cancelScroll();
			onDone("cancelled");
			return;
		}
		if (virtualizer.type === "advanced") virtualizer.scrollToInstanceLine(this, lineNumber, align, onDone);
		else virtualizer.scrollSpanIntoView({
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
		const diff = this.getLayoutDiff();
		return {
			top: getVirtualFileHeaderRegion(this.metrics, this.options.disableFileHeader ?? false) + (range.startingLine === 0 ? this.cache.fileAnnotationHeight : range.bufferBefore),
			bottom: this.height - (diff != null && diff.hunks.length === 0 ? 0 : getVirtualFilePaddingBottom(this.metrics)) - range.bufferAfter
		};
	}
	getNumericScrollAnchor(localViewportTop) {
		const fileDiff = this.getLayoutDiff();
		if (fileDiff == null) return;
		const { disableFileHeader = false, expandUnchanged = false, collapsed = false, collapsedContextThreshold = 1 } = this.options;
		if (collapsed) return;
		const diffStyle = this.getDiffStyle();
		const hunkSeparators = this.getHunkSeparatorType();
		this.approximateLayoutCheckpoints(fileDiff);
		const checkpoint = this.getLayoutCheckpointBeforeTop(localViewportTop);
		let top = checkpoint?.top ?? getVirtualFileHeaderRegion(this.metrics, disableFileHeader) + this.cache.fileAnnotationHeight;
		let anchor;
		const rows = new DiffRowCursor({
			diff: fileDiff,
			diffStyle,
			startingLine: checkpoint?.renderedLineIndex ?? 0,
			expandedHunks: expandUnchanged ? true : this.hunksRenderer.getExpandedHunksMap(),
			collapsedContextThreshold,
			includeTrailingNewline: this.hunksRenderer.includesTrailingNewline()
		});
		while (rows.next()) {
			const { hunkIndex, hunk, collapsedBefore, collapsedAfter } = rows;
			const lineIndex = diffStyle === "split" ? rows.splitLineIndex : rows.unifiedLineIndex;
			if (collapsedBefore > 0) {
				const separator = getLeadingHunkSeparatorLayout({
					type: hunkSeparators,
					metrics: this.metrics,
					hunkIndex,
					hunkSpecs: hunk?.hunkSpecs
				});
				if (separator != null) top += separator.totalHeight;
			}
			if (top >= localViewportTop) {
				anchor = rows.hasDeletion ? {
					lineNumber: rows.deletionLineNumber,
					side: "deletions",
					top
				} : {
					lineNumber: rows.additionLineNumber,
					side: "additions",
					top
				};
				break;
			}
			const lineHeight = this.getLineHeight(lineIndex, rows.hasAddition ? rows.additionLineIndex : void 0, this.hasNoNewlineMarker(rows));
			top += lineHeight;
			if (collapsedAfter > 0) {
				const separator = getTrailingHunkSeparatorLayout({
					type: hunkSeparators,
					metrics: this.metrics
				});
				if (separator != null) top += separator.totalHeight;
			}
		}
		return anchor;
	}
	getVirtualizedHeight() {
		return this.height;
	}
	getAdvancedStickySpecs(windowSpecs) {
		const fileDiff = this.getLayoutDiff();
		if (this.top == null || fileDiff == null) return;
		if (this.options.collapsed === true) return {
			topOffset: this.top,
			height: this.height
		};
		const renderRange = windowSpecs != null ? this.computeRenderRangeFromWindow(fileDiff, this.top, windowSpecs) : this.renderRange;
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
		const shouldRecomputeLayout = recycle && this.isAdvancedMode() && this.fileContainer != null && (hadGhostTextRows || !areDiffTargetsEqual(this.getRenderedDiff(), this.getWorkingDiff()));
		if (this.fileContainer != null && this.isSimpleMode()) this.getSimpleVirtualizer()?.disconnect(this.fileContainer);
		if (!recycle) {
			this.resetMeasurements();
			this.invalidateLayout({ includeEstimatedHeights: true });
			this.pendingExpandedHunks = void 0;
			this.pendingHydratedDiff = void 0;
		}
		this.pendingRender = void 0;
		this.isSetup = false;
		super.cleanUp(recycle);
		if (shouldRecomputeLayout) this.virtualizer.instanceChanged(this, true);
	}
	expandHunk = (hunkIndex, direction, expansionLineCountOverride) => {
		if (this.getInputDiff() == null) return;
		this.loadFilesIfNecessary();
		if (this.isAdvancedMode()) {
			const { expansionLineCount = 100 } = this.options;
			const pending = this.pendingExpandedHunks ??= new Map(this.hunksRenderer.getExpandedHunksMap());
			pending.set(hunkIndex, growExpandedRegion(pending.get(hunkIndex), direction, expansionLineCountOverride ?? expansionLineCount));
		} else {
			this.hunksRenderer.expandHunk(hunkIndex, direction, expansionLineCountOverride);
			this.resetMeasurements();
			this.invalidateLayout({ includeEstimatedHeights: true });
			this.computeApproximateSize();
		}
		this.forceRenderOverride = true;
		this.virtualizer.instanceChanged(this, true);
	};
	async handleFilesLoaded(expectedDiff, files) {
		if (this.getInputDiff() !== expectedDiff || !expectedDiff.isPartial) return;
		if (this.isAdvancedMode()) {
			const nextDiff = hydratePartialDiff("clone", expectedDiff, files, this.options.parseDiffOptions);
			await awaitWithTimeout(() => this.primeHighlightCache(nextDiff));
			if (this.getInputDiff() !== expectedDiff) return;
			this.pendingHydratedDiff = {
				expectedDiff,
				nextDiff,
				files
			};
		} else {
			hydratePartialDiff("merge", expectedDiff, files, this.options.parseDiffOptions);
			this.setHydratedState(files);
			if (!this.installHydratedDiff(expectedDiff)) {
				await awaitWithTimeout(() => this.primeHighlightCache(expectedDiff));
				if (this.getInputDiff() !== expectedDiff) return;
			}
			this.resetMeasurements();
			this.invalidateLayout({ includeEstimatedHeights: true });
			this.computeApproximateSize();
		}
		this.forceRenderOverride = true;
		this.virtualizer.instanceChanged(this, true);
	}
	loadFilesIfNecessary() {
		if (this.pendingHydratedDiff != null) {
			if (this.pendingHydratedDiff.expectedDiff === this.getInputDiff()) return;
			this.pendingHydratedDiff = void 0;
		}
		super.loadFilesIfNecessary();
	}
	isLineInCollapsedContext(lineNumber, side = "additions", expandedHunks = this.pendingExpandedHunks ?? this.hunksRenderer.getExpandedHunksMap()) {
		return super.isLineInCollapsedContext(lineNumber, side, expandedHunks);
	}
	invalidateEditSessionLayout() {
		this.getSimpleVirtualizer()?.markDOMDirty();
		this.invalidateLayout({
			forceSimpleRecompute: this.isSimpleMode(),
			includeEstimatedHeights: true,
			resetRenderRange: false
		});
		this.getSimpleVirtualizer()?.requestHeightReconcile(this);
	}
	escalateEditSessionRender(cause) {
		if (cause === "exit") this.resetMeasurements();
		else this.dropMeasurementsPastEnd();
		this.invalidateEditSessionLayout();
		if (!this.enabled || this.getInputDiff() == null) return;
		this.forceRenderOverride = true;
		this.virtualizer.instanceChanged(this, true);
	}
	shouldSelfHealEditSession() {
		return !this.isAdvancedMode() && super.shouldSelfHealEditSession();
	}
	getLineCutsForSearch() {
		const { hunksRenderer, options } = this;
		return {
			cutLength: hunksRenderer.getLineCutLength(options),
			expandedLines: hunksRenderer.lineCuts.expandedLines
		};
	}
	getDiffForSearch() {
		return this.getWorkingDiff();
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
		if (!this.enabled || this.getInputDiff() == null && this.additionFile == null && this.deletionFile == null) return;
		const workingDiff = this.getWorkingDiff();
		const nextRenderDiff = workingDiff == null ? void 0 : this.getDiffForNextRender(workingDiff);
		if (this.isSimpleMode()) this.pendingRender = void 0;
		this.forceRenderOverride = true;
		if (this.isSimpleMode() && this.requestRender()) return;
		this.virtualizer.instanceChanged(this, !areDiffTargetsEqual(this.getRenderedDiff(), nextRenderDiff));
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
	computeApproximateSize(force = false, fileDiff = this.getLayoutDiff()) {
		if (!force && !this.layoutDirty && (typeof process === "undefined" || process.env.NODE_ENV !== "development" || this.getSimpleVirtualizer()?.config.resizeDebugging !== true)) return;
		const isFirstCompute = this.height === 0;
		this.height = 0;
		this.cache.checkpoints = [];
		this.cache.totalLines = 0;
		if (fileDiff == null) {
			this.layoutDirty = false;
			return;
		}
		this.applyGhostTextRows(this.editor?.__getGhostTextRows() ?? NO_GHOST_TEXT_ROWS);
		const { disableFileHeader = false, collapsed = false } = this.options;
		if (collapsed) {
			this.height += getVirtualFileHeaderHeight(this.metrics, disableFileHeader);
			this.layoutDirty = false;
			return;
		}
		this.height = this.getActiveEstimatedHeight(fileDiff) + this.cache.measuredHeightDeltaTotal + this.ghostTextRowsHeight();
		if (typeof process !== "undefined" && process.env.NODE_ENV === "development" && this.getSimpleVirtualizer()?.config.resizeDebugging === true && !isFirstCompute) this.validateComputedHeight(fileDiff);
		this.layoutDirty = false;
	}
	getLayoutDiff() {
		return this.pendingRender?.diff ?? this.getRenderedDiff();
	}
	getLayoutAnnotations() {
		const { pendingRender } = this;
		return pendingRender != null ? this.getAnnotationsForDiff(pendingRender.diff) : this.lineAnnotations;
	}
	getActiveEstimatedHeight(fileDiff = this.getLayoutDiff()) {
		this.ensureEstimatedDiffHeights(fileDiff);
		const estimatedHeight = this.getDiffStyle() === "split" ? this.cache.estimatedSplitHeight : this.cache.estimatedUnifiedHeight;
		if (estimatedHeight == null) throw new Error("VirtualizedFileDiff.getActiveEstimatedHeight: missing estimated height");
		return estimatedHeight;
	}
	ensureEstimatedDiffHeights(fileDiff = this.getLayoutDiff()) {
		if (fileDiff == null) {
			this.cache.estimatedSplitHeight = void 0;
			this.cache.estimatedUnifiedHeight = void 0;
			return;
		}
		if (this.cache.estimatedSplitHeight != null && this.cache.estimatedUnifiedHeight != null) return;
		const { disableFileHeader = false, expandUnchanged = false, collapsedContextThreshold = 1 } = this.options;
		const { splitHeight, unifiedHeight } = computeEstimatedDiffHeights({
			fileDiff,
			metrics: this.metrics,
			disableFileHeader,
			hunkSeparators: this.getHunkSeparatorType(),
			expandUnchanged,
			expandedHunks: this.hunksRenderer.getExpandedHunksMap(),
			collapsedContextThreshold,
			canHydratePartialDiff: canHydrateCollapsedContext(fileDiff, this.options.loadDiffFiles != null),
			includeTrailingNewline: this.hunksRenderer.includesTrailingNewline(),
			showNoNewlineMarkers: this.hunksRenderer.showsNoNewlineMarkers()
		});
		this.cache.estimatedSplitHeight = splitHeight;
		this.cache.estimatedUnifiedHeight = unifiedHeight;
	}
	validateComputedHeight(fileDiff = this.getLayoutDiff()) {
		if (typeof process === "undefined" || process.env.NODE_ENV !== "development" || this.fileContainer == null || fileDiff == null) return;
		const rect = this.fileContainer.getBoundingClientRect();
		if (rect.height !== this.height) console.log("VirtualizedFileDiff.computeApproximateSize: computed height doesnt match", {
			name: fileDiff.name,
			elementHeight: rect.height,
			computedHeight: this.height
		});
		else console.log("VirtualizedFileDiff.computeApproximateSize: computed height IS CORRECT");
	}
	render({ fileContainer, fileDiff, forceRender = false, lineAnnotations, ...fileInputProps } = {}) {
		const fileInput = getDiffFileInput(fileInputProps, "VirtualizedFileDiff.render");
		const hasFileInput = fileInput != null;
		const oldFile = fileInput?.oldFile;
		const newFile = fileInput?.newFile;
		const filesDidChange = hasFileInput && (!areOptionalFilesEqual(oldFile, this.deletionFile) || !areOptionalFilesEqual(newFile, this.additionFile));
		let nextFileDiff = fileDiff ?? this.getInputDiff();
		if (fileDiff == null && hasFileInput && (filesDidChange || this.getInputDiff() == null)) nextFileDiff = parseDiffFromFile(fileInput.oldFile, fileInput.newFile, this.options.parseDiffOptions);
		const { forceRenderOverride, isSetup } = this;
		this.forceRenderOverride = void 0;
		const targetChanged = nextFileDiff != null && !areDiffTargetsEqual(this.getInputDiff(), nextFileDiff);
		const dataChanged = targetChanged || filesDidChange;
		fileContainer = this.getOrCreateFileContainer(fileContainer);
		if (nextFileDiff == null) {
			console.error("VirtualizedFileDiff.render: attempting to virtually render when we dont have the correct data");
			return false;
		}
		if (targetChanged) this.updateInputDiff(nextFileDiff, lineAnnotations);
		const { pendingRenderDiff, layoutDiffChanged, renderedDiffChanged, annotationsChanged } = (() => {
			if (this.pendingRender != null && this.pendingRender.workingDiff === (this.getWorkingDiff(nextFileDiff) ?? nextFileDiff)) return {
				pendingRenderDiff: this.pendingRender.diff,
				layoutDiffChanged: false,
				renderedDiffChanged: false,
				annotationsChanged: this.syncLineAnnotations(lineAnnotations)
			};
			return this.updatePendingRender(nextFileDiff, lineAnnotations);
		})();
		if (layoutDiffChanged) {
			this.resetMeasurements();
			this.invalidateLayout({ includeEstimatedHeights: true });
		}
		if (!isSetup) {
			this.computeApproximateSize(false, pendingRenderDiff);
			const virtualizer = this.getSimpleVirtualizer();
			this.top ??= this.getVirtualizedTop();
			if (this.isAdvancedMode()) this.isVisible = true;
			else {
				if (virtualizer == null) throw new Error("VirtualizedFileDiff.render: simple virtualizer is not available");
				virtualizer.connect(fileContainer, this);
				this.isVisible = virtualizer.isInstanceVisible(this.top ?? 0, this.height);
			}
			this.isSetup = true;
		} else {
			this.top ??= this.getVirtualizedTop();
			if (this.layoutDirty && this.isSimpleMode()) {
				this.getSimpleVirtualizer()?.markDOMDirty();
				this.computeApproximateSize(false, pendingRenderDiff);
			}
		}
		if (!this.isVisible && this.isSimpleMode() && (!dataChanged || !isSetup)) {
			if (fileInput != null) {
				this.deletionFile = oldFile;
				this.additionFile = newFile;
			}
			if (targetChanged) this.clearReusableHeader();
			return this.renderPlaceholder(this.height);
		}
		const windowSpecs = this.virtualizer.getWindowSpecs();
		const fileTop = this.top ?? 0;
		const renderRange = this.computeRenderRangeFromWindow(pendingRenderDiff, fileTop, windowSpecs);
		return super.render({
			fileDiff: nextFileDiff,
			fileContainer,
			renderRange,
			lineAnnotations,
			forceRender: (forceRenderOverride ?? forceRender) || annotationsChanged || renderedDiffChanged || targetChanged,
			...fileInput,
			...fileInputProps
		});
	}
	finalizeRender() {
		if (!areDiffTargetsEqual(this.getRenderedDiff(), this.pendingRender?.diff)) throw new Error("VirtualizedFileDiff.render: rendered a different diff than its prepared layout");
		this.pendingRender = void 0;
		if (this.isSimpleMode()) this.getSimpleVirtualizer()?.requestHeightReconcile(this);
	}
	updatePendingRender(nextFileDiff, lineAnnotations) {
		const workingDiff = this.getWorkingDiff(nextFileDiff) ?? nextFileDiff;
		const previousRenderedDiff = this.getRenderedDiff();
		const { pendingRender } = this;
		const previousLayoutDiff = pendingRender?.diff ?? previousRenderedDiff;
		const pendingRenderDiff = this.getDiffForNextRender(workingDiff);
		this.pendingRender = {
			workingDiff,
			diff: pendingRenderDiff
		};
		return {
			pendingRenderDiff,
			annotationsChanged: this.syncLineAnnotations(lineAnnotations),
			layoutDiffChanged: !areDiffTargetsEqual(previousLayoutDiff, pendingRenderDiff),
			renderedDiffChanged: !areDiffTargetsEqual(previousRenderedDiff, pendingRenderDiff)
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
	getDiffStyle() {
		return this.options.diffStyle ?? "split";
	}
	getHunkSeparatorType() {
		return getOptionHunkSeparatorType(this.options.hunkSeparators);
	}
	approximateLayoutCheckpoints(fileDiff) {
		if (!this.layoutDirty && this.cache.checkpoints.length > 0 || fileDiff.hunks.length === 0 || this.options.collapsed === true) return;
		const { disableFileHeader = false, expandUnchanged = false, collapsedContextThreshold = 1 } = this.options;
		const finalHunkIndex = fileDiff.hunks.length - 1;
		const canHydratePartialDiff = canHydrateCollapsedContext(fileDiff, this.options.loadDiffFiles != null);
		const diffStyle = this.getDiffStyle();
		const hunkSeparators = this.getHunkSeparatorType();
		const expandedHunks = expandUnchanged ? true : this.hunksRenderer.getExpandedHunksMap();
		const heightDeltaPrefix = createHeightDeltaPrefix(this.cache.heightDeltas, this.ghostTextRowsByIndex(fileDiff), this.metrics.lineHeight);
		let top = getVirtualFileHeaderRegion(this.metrics, disableFileHeader) + this.cache.fileAnnotationHeight;
		let renderedLineIndex = 0;
		const processRows = ({ rowCount, startLineIndex, preSeparatorHeight = 0, postSeparatorHeight = 0, metadataOffsets = [] }) => {
			if (rowCount <= 0) return;
			const blockStart = renderedLineIndex;
			const blockEnd = renderedLineIndex + rowCount;
			let nextCheckpoint = getNextCheckpointIndex(blockStart);
			while (nextCheckpoint < blockEnd) {
				const offset = nextCheckpoint - blockStart;
				const checkpointTop = top + (offset > 0 ? preSeparatorHeight : 0) + offset * this.metrics.lineHeight + countMetadataOffsetsBefore(metadataOffsets, offset) * this.metrics.lineHeight + sumHeightDeltas(heightDeltaPrefix, startLineIndex, startLineIndex + offset);
				this.cache.checkpoints.push({
					renderedLineIndex: nextCheckpoint,
					lineIndex: startLineIndex + offset,
					top: checkpointTop
				});
				nextCheckpoint += VIRTUALIZED_FILE_DIFF_LAYOUT_CHECKPOINT_INTERVAL;
			}
			top += preSeparatorHeight + rowCount * this.metrics.lineHeight + metadataOffsets.length * this.metrics.lineHeight + sumHeightDeltas(heightDeltaPrefix, startLineIndex, startLineIndex + rowCount) + postSeparatorHeight;
			renderedLineIndex = blockEnd;
		};
		for (let hunkIndex = 0; hunkIndex < fileDiff.hunks.length; hunkIndex++) {
			const hunk = fileDiff.hunks[hunkIndex];
			if (hunk == null) throw new Error("VirtualizedFileDiff.approximateLayoutCheckpoints: invalid hunk index");
			const leadingRegion = getExpandedRegion({
				isPartial: fileDiff.isPartial,
				rangeSize: hunk.collapsedBefore,
				expandedHunks,
				hunkIndex,
				collapsedContextThreshold
			});
			const leadingSeparatorHeight = leadingRegion.collapsedLines > 0 ? getLeadingHunkSeparatorLayout({
				type: hunkSeparators,
				metrics: this.metrics,
				hunkIndex,
				hunkSpecs: hunk.hunkSpecs
			})?.totalHeight ?? 0 : 0;
			processRows({
				rowCount: leadingRegion.fromStart,
				startLineIndex: (diffStyle === "split" ? hunk.splitLineStart : hunk.unifiedLineStart) - leadingRegion.rangeSize
			});
			let pendingLeadingSeparatorHeight = leadingSeparatorHeight;
			processRows({
				rowCount: leadingRegion.fromEnd,
				startLineIndex: (diffStyle === "split" ? hunk.splitLineStart : hunk.unifiedLineStart) - leadingRegion.fromEnd,
				preSeparatorHeight: pendingLeadingSeparatorHeight
			});
			if (leadingRegion.fromEnd > 0) pendingLeadingSeparatorHeight = 0;
			const trailingRegion = hunkIndex === finalHunkIndex ? getTrailingExpandedRegion({
				fileDiff,
				hunkIndex,
				expandedHunks,
				collapsedContextThreshold,
				errorPrefix: "VirtualizedFileDiff"
			}) : void 0;
			const trailingSeparatorHeight = trailingRegion != null && trailingRegion.collapsedLines > 0 ? getTrailingHunkSeparatorLayout({
				type: hunkSeparators,
				metrics: this.metrics
			})?.totalHeight ?? 0 : hunkIndex === finalHunkIndex && canHydratePartialDiff ? getTrailingHunkSeparatorLayout({
				type: hunkSeparators,
				metrics: this.metrics
			})?.totalHeight ?? 0 : 0;
			const trailingExpandedCount = trailingRegion != null ? trailingRegion.fromStart + trailingRegion.fromEnd : 0;
			const hunkBodyRowCount = diffStyle === "split" ? hunk.splitLineCount : hunk.unifiedLineCount;
			const hunkBodyStartLineIndex = diffStyle === "split" ? hunk.splitLineStart : hunk.unifiedLineStart;
			processRows({
				rowCount: hunkBodyRowCount,
				startLineIndex: hunkBodyStartLineIndex,
				preSeparatorHeight: pendingLeadingSeparatorHeight,
				postSeparatorHeight: trailingExpandedCount === 0 ? trailingSeparatorHeight : 0,
				metadataOffsets: this.hunksRenderer.showsNoNewlineMarkers() ? getHunkMetadataOffsets({
					diffStyle,
					hunk,
					rowCount: hunkBodyRowCount
				}) : []
			});
			if (trailingRegion != null && trailingExpandedCount > 0) processRows({
				rowCount: trailingExpandedCount,
				startLineIndex: hunkBodyStartLineIndex + hunkBodyRowCount,
				postSeparatorHeight: trailingSeparatorHeight
			});
		}
		this.cache.totalLines = renderedLineIndex;
	}
	getLayoutCheckpointBeforeLineIndex(lineIndex) {
		if (lineIndex <= 0 || this.cache.checkpoints.length === 0) return;
		let low = 0;
		let high = this.cache.checkpoints.length - 1;
		let result;
		while (low <= high) {
			const mid = low + high >> 1;
			const checkpoint = this.cache.checkpoints[mid];
			if (checkpoint == null) throw new Error("VirtualizedFileDiff: invalid checkpoint index");
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
			if (checkpoint == null) throw new Error("VirtualizedFileDiff: invalid checkpoint index");
			if (checkpoint.top <= top) {
				resultIndex = mid;
				low = mid + 1;
			} else high = mid - 1;
		}
		if (hunkLineCount == null) return resultIndex >= 0 ? this.cache.checkpoints[resultIndex] : void 0;
		for (let index = resultIndex; index >= 0; index--) {
			const checkpoint = this.cache.checkpoints[index];
			if (checkpoint == null) throw new Error("VirtualizedFileDiff: invalid checkpoint index");
			if (checkpoint.renderedLineIndex % hunkLineCount === 0) return checkpoint;
		}
	}
	getExpandedLineCount(fileDiff, diffStyle) {
		let count = 0;
		if (fileDiff.isPartial) {
			for (const hunk of fileDiff.hunks) count += diffStyle === "split" ? hunk.splitLineCount : hunk.unifiedLineCount;
			return count;
		}
		const { expandUnchanged = false, collapsedContextThreshold = 1 } = this.options;
		const expandedHunks = expandUnchanged ? true : this.hunksRenderer.getExpandedHunksMap();
		for (const [hunkIndex, hunk] of fileDiff.hunks.entries()) {
			const hunkCount = diffStyle === "split" ? hunk.splitLineCount : hunk.unifiedLineCount;
			count += hunkCount;
			const collapsedBefore = Math.max(hunk.collapsedBefore, 0);
			const { fromStart, fromEnd, renderAll } = getExpandedRegion({
				isPartial: fileDiff.isPartial,
				rangeSize: collapsedBefore,
				expandedHunks,
				hunkIndex,
				collapsedContextThreshold
			});
			if (collapsedBefore > 0) count += renderAll ? collapsedBefore : fromStart + fromEnd;
		}
		const trailingRegion = getTrailingExpandedRegion({
			fileDiff,
			hunkIndex: fileDiff.hunks.length - 1,
			expandedHunks,
			collapsedContextThreshold,
			errorPrefix: "VirtualizedFileDiff"
		});
		if (trailingRegion != null) count += trailingRegion.fromStart + trailingRegion.fromEnd;
		if (fileDiff.hunks.length > 0 && (trailingRegion?.collapsedLines ?? 0) === 0 && this.hunksRenderer.hasTrailingNewlineRow(fileDiff)) count += 1;
		return count;
	}
	getLayoutLineCount(fileDiff, diffStyle) {
		const expandedLineCount = this.getExpandedLineCount(fileDiff, diffStyle);
		const metadataLineCount = (diffStyle === "split" ? fileDiff.splitLineCount : fileDiff.unifiedLineCount) + (this.hunksRenderer.hasTrailingNewlineRow(fileDiff) ? 1 : 0);
		return Math.max(expandedLineCount, metadataLineCount, fileDiff.additionLines.length, fileDiff.deletionLines.length, this.cache.totalLines);
	}
	computeRenderRangeFromWindow(fileDiff, fileTop, { top, bottom }) {
		const { disableFileHeader = false, expandUnchanged = false, collapsedContextThreshold = 1 } = this.options;
		const { hunkLineCount, lineHeight } = this.metrics;
		const diffStyle = this.getDiffStyle();
		const hunkSeparators = this.getHunkSeparatorType();
		const canHydratePartialDiff = canHydrateCollapsedContext(fileDiff, this.options.loadDiffFiles != null);
		const fileHeight = this.height;
		let lineCount = this.getLayoutLineCount(fileDiff, diffStyle);
		const headerRegion = getVirtualFileHeaderRegion(this.metrics, disableFileHeader);
		const paddingBottom = fileDiff.hunks.length > 0 ? getVirtualFilePaddingBottom(this.metrics) : 0;
		const { fileAnnotationHeight } = this.cache;
		const codeRegionTop = headerRegion + fileAnnotationHeight;
		const codeHeight = Math.max(0, fileHeight - headerRegion - fileAnnotationHeight - paddingBottom);
		const hasFileAnnotations = this.hasFileAnnotations(fileDiff);
		const fileAnnotationTop = fileTop + headerRegion;
		const measuredFileAnnotationVisible = fileAnnotationHeight > 0 && hasFileAnnotations && fileAnnotationTop < bottom && fileAnnotationTop + fileAnnotationHeight > top;
		if (fileTop < top - fileHeight || fileTop > bottom) return {
			startingLine: 0,
			totalLines: 0,
			bufferBefore: 0,
			bufferAfter: fileHeight - headerRegion - paddingBottom
		};
		if (lineCount <= hunkLineCount || fileDiff.hunks.length === 0) return {
			startingLine: 0,
			totalLines: hunkLineCount,
			bufferBefore: 0,
			bufferAfter: 0
		};
		this.approximateLayoutCheckpoints(fileDiff);
		lineCount = this.getLayoutLineCount(fileDiff, diffStyle);
		const estimatedTargetLines = Math.ceil(Math.max(bottom - top, 0) / lineHeight);
		const totalLines = Math.ceil(estimatedTargetLines / hunkLineCount) * hunkLineCount + hunkLineCount;
		const totalHunks = totalLines / hunkLineCount;
		const overflowHunks = totalHunks;
		const hunkOffsets = [];
		const checkpoint = this.getLayoutCheckpointBeforeTop(Math.max(0, top - fileTop - totalLines * lineHeight * 2), hunkLineCount);
		let absoluteLineTop = fileTop + (checkpoint?.top ?? codeRegionTop);
		let currentLine = checkpoint?.renderedLineIndex ?? 0;
		let firstVisibleHunk;
		let overflowCounter;
		const rows = new DiffRowCursor({
			diff: fileDiff,
			diffStyle,
			startingLine: checkpoint?.renderedLineIndex ?? 0,
			expandedHunks: expandUnchanged ? true : this.hunksRenderer.getExpandedHunksMap(),
			collapsedContextThreshold,
			includeTrailingNewline: this.hunksRenderer.includesTrailingNewline()
		});
		while (rows.next()) {
			const { hunkIndex, hunk, collapsedBefore, collapsedAfter, splitLineIndex, unifiedLineIndex } = rows;
			const hasMetadata = this.hasNoNewlineMarker(rows);
			const isFinalHunkRow = hunkIndex === fileDiff.hunks.length - 1 && hunk != null && (diffStyle === "split" ? splitLineIndex === hunk.splitLineStart + hunk.splitLineCount - 1 : unifiedLineIndex === hunk.unifiedLineStart + hunk.unifiedLineCount - 1);
			const gapAdjustment = (collapsedBefore > 0 ? getLeadingHunkSeparatorLayout({
				type: hunkSeparators,
				metrics: this.metrics,
				hunkIndex,
				hunkSpecs: hunk?.hunkSpecs
			}) : void 0)?.totalHeight ?? 0;
			absoluteLineTop += gapAdjustment;
			const isAtHunkBoundary = currentLine % hunkLineCount === 0;
			const currentHunk = Math.floor(currentLine / hunkLineCount);
			if (isAtHunkBoundary) {
				hunkOffsets[currentHunk] = absoluteLineTop - (fileTop + codeRegionTop + gapAdjustment);
				if (overflowCounter != null) {
					if (overflowCounter <= 0) break;
					overflowCounter--;
				}
			}
			const lineHeight = this.getLineHeight(diffStyle === "split" ? splitLineIndex : unifiedLineIndex, rows.hasAddition ? rows.additionLineIndex : void 0, hasMetadata);
			if (absoluteLineTop > top - lineHeight && absoluteLineTop < bottom) firstVisibleHunk ??= currentHunk;
			if (overflowCounter == null && absoluteLineTop >= bottom && isAtHunkBoundary) overflowCounter = overflowHunks;
			currentLine++;
			absoluteLineTop += lineHeight;
			if (collapsedAfter > 0 || isFinalHunkRow && canHydratePartialDiff) {
				const trailingSeparator = getTrailingHunkSeparatorLayout({
					type: hunkSeparators,
					metrics: this.metrics
				});
				if (trailingSeparator != null) {
					if (absoluteLineTop < bottom && absoluteLineTop + trailingSeparator.totalHeight > top) firstVisibleHunk ??= currentHunk;
					absoluteLineTop += trailingSeparator.totalHeight;
				}
			}
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
		const bufferAfter = finalHunkIndex < hunkOffsets.length ? codeHeight - hunkOffsets[finalHunkIndex] : codeHeight - (absoluteLineTop - fileTop - codeRegionTop);
		return {
			startingLine,
			totalLines,
			bufferBefore,
			bufferAfter: Math.max(0, bufferAfter)
		};
	}
};
function measureFileAnnotationHeight(codeGroups) {
	let height;
	for (const codeGroup of codeGroups) {
		if (codeGroup == null) continue;
		const content = codeGroup.children[1];
		if (!(content instanceof HTMLElement)) continue;
		for (const child of content.children) {
			if (!(child instanceof HTMLElement)) continue;
			if (child.dataset.lineAnnotation !== FILE_ANNOTATION_DOM_KEY) continue;
			height = Math.max(height ?? 0, child.getBoundingClientRect().height);
		}
	}
	return height;
}
function createHeightDeltaPrefix(heightDeltas, ghostTextRowsByIndex, lineHeight) {
	let extras = heightDeltas;
	if (ghostTextRowsByIndex.size > 0) {
		extras = new Map(heightDeltas);
		for (const [rowIndex, rows] of ghostTextRowsByIndex) extras.set(rowIndex, (extras.get(rowIndex) ?? 0) + rows * lineHeight);
	}
	const entries = Array.from(extras).sort((a, b) => a[0] - b[0]);
	const lineIndexes = [];
	const prefixTotals = [0];
	let total = 0;
	for (const [lineIndex, delta] of entries) {
		lineIndexes.push(lineIndex);
		total += delta;
		prefixTotals.push(total);
	}
	return {
		lineIndexes,
		prefixTotals
	};
}
function sumHeightDeltas({ lineIndexes, prefixTotals }, startLineIndex, endLineIndex) {
	if (startLineIndex >= endLineIndex || lineIndexes.length === 0) return 0;
	const start = lowerBound(lineIndexes, startLineIndex);
	return (prefixTotals[lowerBound(lineIndexes, endLineIndex)] ?? 0) - (prefixTotals[start] ?? 0);
}
function lowerBound(values, target) {
	let low = 0;
	let high = values.length;
	while (low < high) {
		const mid = low + high >> 1;
		const value = values[mid];
		if (value == null) throw new Error("VirtualizedFileDiff: invalid prefix index");
		if (value < target) low = mid + 1;
		else high = mid;
	}
	return low;
}
function getNextCheckpointIndex(renderedLineIndex) {
	return Math.ceil(renderedLineIndex / VIRTUALIZED_FILE_DIFF_LAYOUT_CHECKPOINT_INTERVAL) * VIRTUALIZED_FILE_DIFF_LAYOUT_CHECKPOINT_INTERVAL;
}
function countMetadataOffsetsBefore(metadataOffsets, offset) {
	let count = 0;
	for (const metadataOffset of metadataOffsets) if (metadataOffset < offset) count++;
	return count;
}
function getHunkMetadataOffsets({ diffStyle, hunk, rowCount }) {
	if (rowCount <= 0 || !hunk.noEOFCRAdditions && !hunk.noEOFCRDeletions) return [];
	const lastContent = hunk.hunkContent.at(-1);
	if (lastContent == null) return [];
	if (lastContent.type === "context") return [rowCount - 1];
	const splitCount = Math.max(lastContent.deletions, lastContent.additions);
	const unifiedCount = lastContent.deletions + lastContent.additions;
	if (diffStyle === "split") return splitCount > 0 && (hunk.noEOFCRAdditions || hunk.noEOFCRDeletions) ? [rowCount - 1] : [];
	const offsets = [];
	const contentStartOffset = rowCount - unifiedCount;
	if (lastContent.deletions > 0 && hunk.noEOFCRDeletions) offsets.push(contentStartOffset + lastContent.deletions - 1);
	if (lastContent.additions > 0 && hunk.noEOFCRAdditions) offsets.push(rowCount - 1);
	return offsets;
}
function hasDiffLayoutOptionChanged(previousOptions, nextOptions) {
	return (previousOptions.diffStyle ?? "split") !== (nextOptions.diffStyle ?? "split") || (previousOptions.overflow ?? "scroll") !== (nextOptions.overflow ?? "scroll") || (previousOptions.collapsed ?? false) !== (nextOptions.collapsed ?? false) || (previousOptions.disableLineNumbers ?? false) !== (nextOptions.disableLineNumbers ?? false) || (previousOptions.disableFileHeader ?? false) !== (nextOptions.disableFileHeader ?? false) || (previousOptions.diffIndicators ?? "bars") !== (nextOptions.diffIndicators ?? "bars") || (previousOptions.hunkSeparators ?? "line-info") !== (nextOptions.hunkSeparators ?? "line-info") || Boolean(previousOptions.loadDiffFiles) !== Boolean(nextOptions.loadDiffFiles) || (previousOptions.expandUnchanged ?? false) !== (nextOptions.expandUnchanged ?? false) || (previousOptions.collapsedContextThreshold ?? 1) !== (nextOptions.collapsedContextThreshold ?? 1) || previousOptions.unsafeCSS !== nextOptions.unsafeCSS;
}
function hasDiffEstimateOptionChanged(previousOptions, nextOptions) {
	return (previousOptions.disableFileHeader ?? false) !== (nextOptions.disableFileHeader ?? false) || (previousOptions.hunkSeparators ?? "line-info") !== (nextOptions.hunkSeparators ?? "line-info") || Boolean(previousOptions.loadDiffFiles) !== Boolean(nextOptions.loadDiffFiles) || (previousOptions.expandUnchanged ?? false) !== (nextOptions.expandUnchanged ?? false) || (previousOptions.collapsedContextThreshold ?? 1) !== (nextOptions.collapsedContextThreshold ?? 1);
}
function canHydrateCollapsedContext(fileDiff, hasFileLoader) {
	return fileDiff.isPartial && hasFileLoader && (fileDiff.type === "change" || fileDiff.type === "rename-changed");
}
function getOptionHunkSeparatorType(hunkSeparators) {
	return typeof hunkSeparators === "function" ? "custom" : hunkSeparators ?? "line-info";
}
function areOptionalFilesEqual(fileA, fileB) {
	if (fileA == null || fileB == null) return fileA == null && fileB == null;
	return areFilesEqual(fileA, fileB);
}
function parseLineIndex(lineIndexAttr, diffStyle) {
	const [unifiedIndex, splitIndex] = lineIndexAttr.split(",").map(Number);
	return diffStyle === "split" ? splitIndex : unifiedIndex;
}
//#endregion
export { VIRTUALIZED_FILE_DIFF_LAYOUT_CHECKPOINT_INTERVAL, VirtualizedFileDiff };

//# sourceMappingURL=VirtualizedFileDiff.js.map