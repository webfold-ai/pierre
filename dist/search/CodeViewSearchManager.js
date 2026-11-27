import "../constants.js";
import { getSearchQueryFromSelection } from "../editor/selection.js";
import { getHighlighterIfLoaded } from "../highlighter/shared_highlighter.js";
import { dequeueRender, queueRender } from "../managers/UniversalRenderingManager.js";
import { resolveSearchShortcut } from "../editor/command.js";
import { dequeueBackgroundTask, queueBackgroundTask } from "../managers/BackgroundTaskQueue.js";
import { wrapThemeCSS } from "../utils/cssWrappers.js";
import { getComposedSelectionRange } from "../utils/getComposedSelectionRange.js";
import { getHighlighterThemeStyles } from "../utils/getHighlighterThemeStyles.js";
import { getLineIndexForDiff } from "../utils/getLineIndexForDiff.js";
import { CodeViewSearchScan, areCodeViewSearchMatchesEqual, areOptionalCodeViewSearchMatchesEqual } from "./codeViewSearch.js";
import { MAX_SEARCH_MATCHES } from "./index.js";
import { revealMatchHorizontally } from "./revealMatchHorizontally.js";
import { SearchHighlighter } from "./SearchHighlighter.js";
import { SearchPanelWidget } from "./SearchPanelWidget.js";
//#region src/search/CodeViewSearchManager.ts
var CodeViewSearchManager = class {
	view;
	state = {
		originalViewport: void 0,
		matchViewport: void 0,
		scope: void 0,
		matches: [],
		scan: void 0,
		pendingNavigation: void 0,
		current: void 0,
		centerNavigation: false,
		pendingHorizontalReveal: false,
		currentPosition: void 0
	};
	panel;
	renderedThemeCSS;
	themeDirty = true;
	matchesDirty = false;
	highlighter;
	constructor(view) {
		this.view = view;
	}
	open(options) {
		const { view } = this;
		const { container } = view;
		const root = view.getContainerElement();
		if (root == null || container == null) return;
		const { mode = "replace", scope = "focused", query } = options ?? {};
		this.setScope(this.resolveScope(scope));
		let { panel } = this;
		if (panel != null) {
			if (query != null) panel.setQuery(query);
			panel.setMode(mode);
			panel.focus();
			return;
		}
		this.highlighter ??= SearchHighlighter.create(container.ownerDocument);
		panel = new SearchPanelWidget({
			containerElement: view.getHeaderElement() ?? container,
			themeCSS: this.renderedThemeCSS,
			unsafeCSS: view.options.unsafeCSS,
			defaultQuery: query ?? this.getQueryFromScope(),
			defaults: view.options.searchOptions?.defaults,
			mode,
			replace: this.getReplaceHandlers(),
			onStateChange: (state) => {
				if (this.matchesDirty) return;
				const { onSearchStateChange } = view.options;
				onSearchStateChange?.(state);
			},
			onQueryChange: () => {
				if (this.panel?.hasQuery() === false) this.restoreViewport();
				this.invalidateScan();
				this.setResults(this.state.matches, void 0);
				this.state.pendingNavigation = void 0;
				this.state.centerNavigation = false;
			},
			search: (searchParams) => this.search(searchParams),
			scrollToMatch: (match) => {
				this.forgetViewport();
				this.state.pendingNavigation = void 0;
				this.scrollToMatch(match);
			},
			currentMatchNeedsReveal: () => {
				const { current, pendingNavigation } = this.state;
				return pendingNavigation === "reveal" && current != null && !this.isMatchInView(current);
			},
			onUpdate: this.updateResults,
			onBeforeNavigate: this.settleCutOffMatch,
			onClose: () => {
				this.close();
			}
		});
		this.panel = panel;
		if (panel.hasQuery()) this.state.pendingNavigation = "jump";
		panel.mount();
		if (this.panel !== panel) return;
		root.addEventListener("click", this.handleMatchClick);
		root.ownerDocument.addEventListener("focusin", this.handleFocusIn);
		panel.getHostElement().addEventListener("focusout", this.handlePanelBlur);
		panel.getHostElement().dataset.searchPanelOverlay = "";
		panel.focus();
	}
	close() {
		this.restoreViewport();
		this.closeInPlace();
	}
	closeInPlace() {
		const { panel } = this;
		const panelHadFocus = this.isPanelFocused();
		const { scope } = this.state;
		this.removeListeners();
		this.panel = void 0;
		this.resetState();
		if (panel == null) return;
		panel.cleanup();
		if (panelHadFocus) this.view.restoreFocus(scope?.itemId);
		const { onSearchStateChange } = this.view.options;
		onSearchStateChange?.(void 0);
	}
	isOpen() {
		return this.panel != null;
	}
	navigate(direction) {
		this.flushMatches();
		this.panel?.navigate(direction === "previous");
	}
	handleKeyDown = (event) => {
		if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
		if (event.key === "Escape" && this.panel !== void 0) {
			event.preventDefault();
			event.stopPropagation();
			this.close();
			return;
		}
		const shortcut = resolveSearchShortcut(event);
		if (shortcut === "next" || shortcut === "previous") {
			if (this.panel == null) return;
			event.preventDefault();
			event.stopPropagation();
			this.navigate(shortcut);
			return;
		}
		if (shortcut != null && this.view.options.searchOptions?.disableShortcuts !== true) {
			event.preventDefault();
			event.stopPropagation();
			this.open();
		}
	};
	ownsEvent(event) {
		const host = this.panel?.getHostElement();
		return host != null && event.composedPath().includes(host);
	}
	userScrolled() {
		this.state.pendingHorizontalReveal = false;
		this.keepView();
	}
	addItems(count) {
		const { scan, scope } = this.state;
		if (scope == null) scan?.addItems(count);
		this.markMatchesDirty();
	}
	removeItem(itemId) {
		const { scan } = this.state;
		const position = this.getItemPosition(itemId);
		if (position != null) scan?.removeItem(position);
	}
	renameItem(oldId, newId) {
		const { state } = this;
		if (state.scope?.itemId === oldId) state.scope = { itemId: newId };
		state.originalViewport = renameViewport(state.originalViewport, oldId, newId);
		state.matchViewport = renameViewport(state.matchViewport, oldId, newId);
		this.invalidateScan();
		this.markMatchesDirty();
	}
	optionsChanged(previousOptions, nextOptions) {
		if (previousOptions.unsafeCSS !== nextOptions.unsafeCSS) this.panel?.setUnsafeCSS(nextOptions.unsafeCSS);
		if (hasSearchIndexOptionChanged(previousOptions, nextOptions)) {
			this.invalidateScan();
			this.markMatchesDirty();
		}
	}
	invalidateTheme() {
		this.themeDirty = true;
	}
	clearTheme() {
		this.renderedThemeCSS = void 0;
		this.themeDirty = true;
	}
	flushPendingTheme() {
		if (!this.themeDirty) return;
		const theme = this.view.getTheme();
		const highlighter = getHighlighterIfLoaded({ theme });
		if (highlighter == null) return;
		const baseThemeType = typeof theme === "string" ? highlighter.getTheme(theme).type : void 0;
		this.renderedThemeCSS = wrapThemeCSS(getHighlighterThemeStyles({
			theme,
			highlighter
		}), baseThemeType ?? this.view.options.themeType ?? "system");
		this.themeDirty = false;
		this.panel?.setThemeCSS(this.renderedThemeCSS);
	}
	editorRendered(itemId) {
		this.queueHighlightPaint();
		if (this.state.scope?.itemId === itemId && this.panel?.hasReplaceHandlers() === false) this.markMatchesDirty();
	}
	isPanelFocused() {
		return this.panel?.getHostElement().shadowRoot?.activeElement != null;
	}
	setScope(scope) {
		if (this.state.scope?.itemId === scope?.itemId) return;
		this.invalidateScan();
		this.state.scope = scope;
		this.state.pendingNavigation = void 0;
		this.state.centerNavigation = false;
		this.markMatchesDirty();
	}
	handleFocusIn = (event) => {
		if (this.view.shouldFixContainerFocus && event.composedPath()[0] === this.view.getContainerElement()) return;
		this.syncFocus();
	};
	handlePanelBlur = () => {
		queueRender(this.syncFocus);
	};
	syncFocus = () => {
		if (this.panel == null || this.isPanelFocused()) return;
		this.setScope(this.view.focusedEditor != null ? { itemId: this.view.focusedEditor.id } : void 0);
	};
	handleMatchClick = (event) => {
		const { highlighter, state, view } = this;
		const { current, matches, scan } = state;
		if (scan == null || highlighter == null || this.ownsEvent(event)) return;
		const row = getClickedCodeRow(event);
		if (row == null) return;
		const root = row.getRootNode();
		if (!(root instanceof ShadowRoot) || getComposedSelectionRange(root)?.collapsed === false) return;
		const item = view.getRenderedItems().find(({ element }) => element === root.host);
		const position = item != null ? this.getItemPosition(item.id) : void 0;
		if (position == null) return;
		const start = highlighter.getMatchStartAtPoint(row, event.clientX, event.clientY);
		if (start == null) return;
		const lineNumber = SearchHighlighter.getLineNumber(row);
		const match = scan.getFirstMatchAtOrAfter(position, lineNumber, start, SearchHighlighter.getLineSide(row));
		if (match?.lineNumber !== lineNumber || match.startCharacter !== start || areOptionalCodeViewSearchMatchesEqual(match, current)) return;
		dequeueRender(this.revealCurrentMatch);
		this.forgetViewport();
		state.pendingNavigation = void 0;
		state.pendingHorizontalReveal = false;
		this.setResults(matches, match);
		this.matchesDirty = true;
		this.flushMatches();
	};
	removeListeners() {
		const { view, panel } = this;
		const root = view.getContainerElement();
		dequeueRender(this.syncFocus);
		root?.removeEventListener("click", this.handleMatchClick);
		root?.ownerDocument.removeEventListener("focusin", this.handleFocusIn);
		panel?.getHostElement().removeEventListener("focusout", this.handlePanelBlur);
	}
	resolveScope(scope) {
		if (scope === "all") return;
		if (scope === "focused") {
			if (this.isPanelFocused()) return this.state.scope;
			return this.view.focusedEditor != null ? { itemId: this.view.focusedEditor.id } : void 0;
		}
		const item = this.view.idToItem.get(scope.itemId);
		return item != null && this.view.isItemInEditMode(item) ? { itemId: scope.itemId } : void 0;
	}
	getQueryFromScope() {
		const { scope } = this.state;
		if (scope == null) return this.getSelectedLineText();
		const editor = this.view.getEditor(scope.itemId);
		const document = editor?.getEditState()?.document;
		if (editor == null || document == null) return "";
		return getSearchQueryFromSelection(document, editor.getViewState().selections?.at(-1));
	}
	getSelectedLineText() {
		const { firstIndex, lastIndex } = this.view.renderState;
		for (let index = firstIndex; index >= 0 && index <= lastIndex; index++) {
			const shadowRoot = this.view.items[index]?.element?.shadowRoot;
			if (shadowRoot == null) continue;
			const selected = getComposedSelectionRange(shadowRoot);
			if (selected == null || selected.collapsed) continue;
			const line = getCodeLineElement(selected.startContainer);
			if (line == null || !shadowRoot.contains(line) || line !== getCodeLineElement(selected.endContainer)) continue;
			const range = document.createRange();
			range.setStart(selected.startContainer, selected.startOffset);
			range.setEnd(selected.endContainer, selected.endOffset);
			const text = range.toString();
			return text.includes("\n") ? "" : text;
		}
		return "";
	}
	resetState() {
		dequeueRender(this.flushMatches);
		dequeueRender(this.paintHighlights);
		dequeueRender(this.revealCurrentMatch);
		this.highlighter?.clear();
		this.forgetViewport();
		this.state.scope = void 0;
		this.state.matches = [];
		this.invalidateScan();
		this.state.pendingNavigation = void 0;
		this.state.current = void 0;
		this.state.centerNavigation = false;
		this.matchesDirty = false;
		this.state.pendingHorizontalReveal = false;
		this.state.currentPosition = void 0;
	}
	rememberViewport() {
		const { state } = this;
		if (state.originalViewport != null && this.isAtMatchViewport()) return;
		state.originalViewport = this.getViewport();
		state.matchViewport = void 0;
	}
	getViewport() {
		const { view } = this;
		const scrollTop = view.getScrollTop();
		return scrollTop > 0 ? view.getScrollAnchor(scrollTop) : "top";
	}
	forgetViewport() {
		const { state } = this;
		state.originalViewport = void 0;
		state.matchViewport = void 0;
	}
	recordMatchViewport() {
		const { state } = this;
		if (state.originalViewport != null) state.matchViewport = this.getViewport();
	}
	isAtViewport(viewport) {
		const { view } = this;
		return viewport === "top" ? view.getScrollTop() <= 0 : viewport != null && view.isAtScrollAnchor(viewport);
	}
	isAtMatchViewport() {
		const { state, view } = this;
		const { pendingScrollTarget } = view;
		return pendingScrollTarget?.type === "line" && pendingScrollTarget.searchMatch === true || this.isAtViewport(state.matchViewport);
	}
	restoreViewport() {
		const { state, view } = this;
		const { originalViewport } = state;
		const shouldReturn = this.isAtMatchViewport();
		this.forgetViewport();
		if (originalViewport == null || !shouldReturn) return;
		const behavior = view.options.searchOptions?.scrollBehavior ?? "instant";
		if (originalViewport === "top") view.requestScroll({
			type: "position",
			position: 0,
			behavior
		});
		else view.scrollToAnchor(originalViewport, behavior);
	}
	isMatchInView(match) {
		const item = this.view.idToItem.get(match.itemId);
		if (item == null) return false;
		const rect = item.item.collapsed === true ? {
			top: item.top,
			height: item.height
		} : this.view.getScrollTargetRect({
			type: "line",
			id: match.itemId,
			lineNumber: match.lineNumber,
			side: match.side,
			align: "nearest"
		});
		if (rect == null) return false;
		const top = this.view.getItemTopOffset() + rect.top;
		const bottom = top + rect.height;
		const scrollTop = this.view.getScrollTop();
		const visibleTop = scrollTop + this.view.getStickyHeaderOffset();
		const visibleBottom = scrollTop + this.view.getHeight();
		return top >= visibleTop && bottom <= visibleBottom || top <= visibleTop && bottom >= visibleBottom;
	}
	scrollToMatch(match) {
		this.state.pendingHorizontalReveal = true;
		this.state.current = match;
		this.view.render();
		const item = this.view.idToItem.get(match.itemId);
		if (item != null && this.isMatchHidden(item, match)) this.revealMatch(item, match);
		else {
			this.paintRanges();
			const rect = this.measureCurrentMatch();
			if ((rect != null ? this.isMatchRectVisible(rect) : this.isMatchInView(match)) && !this.state.centerNavigation) {
				this.view.clearPendingScroll();
				this.recordMatchViewport();
				return;
			}
		}
		this.state.centerNavigation = true;
		const target = {
			type: "line",
			id: match.itemId,
			lineNumber: match.lineNumber,
			side: match.side,
			align: "center",
			offset: -this.getTopInset() / 2,
			behavior: this.view.options.searchOptions?.scrollBehavior ?? "instant",
			searchMatch: true
		};
		this.view.requestScroll(target, () => this.recordMatchViewport());
	}
	keepView() {
		const { state, view } = this;
		const { pendingScrollTarget } = view;
		if (state.pendingNavigation === "jump") state.pendingNavigation = "select";
		else if (pendingScrollTarget?.type === "line" && pendingScrollTarget.searchMatch === true) state.pendingNavigation = "reveal";
	}
	isMatchHidden(item, match) {
		if (item.item.collapsed === true) return true;
		return item.type === "diff" && item.instance.isLineInCollapsedContext(match.lineNumber, match.side);
	}
	revealMatch(item, match) {
		const { item: collapsedItem } = item;
		if (collapsedItem.collapsed === true) {
			const openedItem = {
				...collapsedItem,
				collapsed: false,
				version: (collapsedItem.version ?? 0) + 1
			};
			this.view.updateItem(openedItem);
			const { onItemCollapsedChange } = this.view.options;
			onItemCollapsedChange?.(collapsedItem, openedItem);
		}
		if (item.type === "diff" && item.instance.isLineInCollapsedContext(match.lineNumber, match.side)) item.instance.revealLine(match.lineNumber, match.side);
	}
	getTopInset() {
		const { panel, view } = this;
		const root = view.getContainerElement();
		const stickyHeaderOffset = view.getStickyHeaderOffset();
		if (root == null || panel == null) return stickyHeaderOffset;
		const panelBottom = panel.getBounds().bottom - root.getBoundingClientRect().top - root.clientTop;
		return Math.max(stickyHeaderOffset, panelBottom);
	}
	measureCurrentMatch() {
		this.state.currentPosition = void 0;
		const { panel, view } = this;
		const root = view.getContainerElement();
		const { current } = this.state;
		const item = current != null ? view.idToItem.get(current.itemId) : void 0;
		const panelBounds = panel?.getBounds();
		if (root == null || item == null || panelBounds == null || panelBounds.width === 0 || panelBounds.height === 0) return;
		const rect = this.highlighter?.currentMatchRange?.getBoundingClientRect();
		if (rect == null) return;
		const viewportTop = root.getBoundingClientRect().top + root.clientTop;
		this.state.currentPosition = {
			top: rect.top - viewportTop + root.scrollTop + view.scrollPageOffset - view.getItemTopOffset() - item.top,
			height: rect.height
		};
		return rect;
	}
	isMatchRectVisible(rect) {
		const { panel, view } = this;
		const root = view.getContainerElement();
		if (root == null || panel == null) return false;
		const viewportTop = root.getBoundingClientRect().top + root.clientTop;
		if (rect.top < viewportTop + view.getStickyHeaderOffset() || rect.bottom > viewportTop + root.clientHeight) return false;
		const panelBounds = panel.getBounds();
		return !(rect.top < panelBounds.bottom && rect.bottom > panelBounds.top && rect.left < panelBounds.right && rect.right > panelBounds.left);
	}
	getReplaceHandlers() {
		const scope = this.state.scope;
		const editor = scope != null ? this.view.getEditor(scope.itemId) : void 0;
		const document = editor?.getEditState()?.document;
		if (editor == null || document == null) return;
		const toOffsets = (match) => [document.offsetAt({
			line: match.lineIndex,
			character: match.startCharacter
		}), document.offsetAt({
			line: match.lineIndex,
			character: match.endCharacter
		})];
		return {
			replaceMatch: (match, params) => {
				this.forgetViewport();
				const next = editor.replaceSearchMatches([toOffsets(match)], params);
				if (next == null) return;
				const position = document.positionAt(next[1]);
				return {
					...match,
					lineIndex: position.line,
					lineNumber: position.line + 1,
					startCharacter: position.character,
					endCharacter: position.character
				};
			},
			replaceAll: (matches, params) => {
				this.forgetViewport();
				editor.replaceSearchMatches(matches.map(toOffsets), params);
			}
		};
	}
	markMatchesDirty() {
		const { advanceScan, state, panel, view } = this;
		const { idToItem, focusedEditor } = view;
		const { scope } = state;
		dequeueBackgroundTask(advanceScan);
		const scopedItem = scope != null ? idToItem.get(scope.itemId) : void 0;
		if (focusedEditor != null) {
			const focusedItem = idToItem.get(focusedEditor.id);
			if (focusedItem == null || !view.isItemInEditMode(focusedItem)) view.focusedEditor = void 0;
		}
		if (scope != null && (scopedItem?.item.edit !== true || scopedItem.item.collapsed === true)) {
			this.invalidateScan();
			state.scope = void 0;
			state.pendingNavigation = void 0;
			state.centerNavigation = false;
		}
		const needsRefresh = panel?.hasQuery() === true;
		if (needsRefresh) this.matchesDirty = true;
		panel?.setReplaceHandlers(this.getReplaceHandlers());
		if (needsRefresh) view.render();
	}
	settleCutOffMatch = () => {
		const { scan, current } = this.state;
		if (scan == null || current?.cutOff !== true) return;
		const position = this.getItemPosition(current.itemId);
		if (position == null) return;
		while (scan.isItemPending(position) && !scan.finished) if (scan.advance(1, position)) this.matchesDirty = true;
		this.flushMatches();
	};
	flushMatches = () => {
		dequeueRender(this.flushMatches);
		if (!this.matchesDirty) return;
		this.matchesDirty = false;
		if (this.panel === void 0) return;
		this.panel.updateMatches({ skipNavigation: true });
	};
	setResults(matches, current) {
		const currentChanged = !areOptionalCodeViewSearchMatchesEqual(this.state.current, current);
		this.state.matches = matches;
		this.state.current = current;
		if (current == null) this.state.pendingHorizontalReveal = false;
		if (currentChanged) this.state.currentPosition = void 0;
		if (currentChanged) this.view.render();
		else if (matches.length === 0) this.highlighter?.clear();
	}
	updateResults = (result, options) => {
		const { matches, searching } = result;
		const { state } = this;
		const { current, scan, scope, pendingNavigation } = state;
		const pending = options?.skipNavigation === true || pendingNavigation === "select" ? pendingNavigation : "jump";
		const picksMatch = pending === "jump" || pending === "select";
		const replacementEnd = current != null && current.itemId === scope?.itemId && current.startCharacter === current.endCharacter ? current : void 0;
		let jumpTarget;
		if (picksMatch && scan != null) {
			if (replacementEnd != null) {
				const position = this.getItemPosition(replacementEnd.itemId);
				if (position != null && !scan.isItemPending(position)) jumpTarget = scan.getFirstMatchAtOrAfter(position, replacementEnd.lineNumber, replacementEnd.endCharacter);
			} else jumpTarget = this.getStartingMatch(scan);
		}
		if (picksMatch) state.pendingNavigation = jumpTarget != null ? pending === "select" ? "reveal" : void 0 : searching === true ? pending : void 0;
		const target = jumpTarget ?? current;
		const position = target != null ? this.getItemPosition(target.itemId) : void 0;
		const nextIndex = target != null && position != null ? scan?.getMatchIndex(position, target) : void 0;
		const nextCurrent = nextIndex != null ? matches[nextIndex] : void 0;
		const currentItemPending = jumpTarget == null && position != null && scan?.isItemPending(position) === true;
		this.setResults(matches, currentItemPending ? current : nextCurrent);
		if (jumpTarget != null && pending === "jump") {
			if (replacementEnd == null) this.rememberViewport();
			this.scrollToMatch(jumpTarget);
		} else if (current?.cutOff === true && nextCurrent != null && nextCurrent.cutOff !== true) queueRender(this.revealCurrentMatch);
		return nextIndex;
	};
	revealCurrentMatch = () => {
		const { current } = this.state;
		if (current != null) {
			this.rememberViewport();
			this.scrollToMatch(current);
		}
	};
	queueHighlightPaint = () => {
		if (this.panel != null) queueRender(this.paintHighlights);
	};
	paintHighlights = () => {
		dequeueRender(this.paintHighlights);
		this.paintRanges();
		if (this.state.pendingHorizontalReveal) {
			const range = this.highlighter?.currentMatchRange;
			this.state.pendingHorizontalReveal = range == null || !revealMatchHorizontally(range);
		}
	};
	paintRanges() {
		const { highlighter } = this;
		if (highlighter == null) return;
		highlighter.clear();
		if (this.state.matches.length === 0) return;
		const { firstIndex, lastIndex } = this.view.renderState;
		const { scan } = this.state;
		for (let index = firstIndex; index >= 0 && index <= lastIndex; index++) {
			const item = this.view.items[index];
			const root = item.element?.shadowRoot;
			const position = this.getItemPosition(item.item.id);
			const itemMatches = position != null ? scan?.getItemMatches(position) : void 0;
			if (root != null && scan != null && position != null && itemMatches != null) highlighter.paint(root, (lineNumber, side) => {
				const span = scan.getLineMatches(position, lineNumber, side);
				if (span == null) return void 0;
				const ranges = [];
				const { current } = this.state;
				for (let matchIndex = span.startIndex; matchIndex < span.endIndex; matchIndex++) {
					const match = itemMatches[matchIndex];
					ranges.push({
						startCharacter: match.startCharacter,
						endCharacter: match.endCharacter,
						current: current != null && areCodeViewSearchMatchesEqual(match, current)
					});
				}
				return ranges;
			});
		}
	}
	getItemPosition(itemId) {
		const { state, view } = this;
		const { idToItem } = view;
		const { scope } = state;
		const item = idToItem.get(itemId);
		return item != null && (scope == null || scope.itemId === itemId) ? scope != null ? 0 : item.index : void 0;
	}
	getSearchItem = (position) => {
		const { state, view } = this;
		const { items, idToItem, options } = view;
		const { scope } = state;
		const item = scope != null ? idToItem.get(scope.itemId) : items[position];
		if (item == null) throw new Error(`CodeViewSearchManager.getSearchItem: position ${position} does not exist`);
		const { id: itemId } = item.item;
		const contents = (view.getEditor(itemId)?.getEditState()?.document)?.getText();
		const lineCuts = item.instance.getLineCutsForSearch();
		return item.type === "file" ? {
			itemId,
			type: "file",
			lineCuts,
			contents: contents ?? item.item.file.contents
		} : {
			itemId,
			type: "diff",
			lineCuts,
			fileDiff: this.getSearchDiff(item),
			additionContents: contents,
			diffStyle: options.diffStyle ?? "split",
			additionsOnly: scope?.itemId === itemId
		};
	};
	getSearchDiff(item) {
		const { view } = this;
		const { id, fileDiff } = item.item;
		return view.getEditor(id)?.getEditState()?.document != null ? item.instance.getDiffForSearch() ?? fileDiff : fileDiff;
	}
	invalidateScan() {
		dequeueBackgroundTask(this.advanceScan);
		const { state } = this;
		state.scan = void 0;
	}
	rescanItem(itemId) {
		const { scan } = this.state;
		const position = this.getItemPosition(itemId);
		if (position != null) scan?.rescanItem(position);
		this.markMatchesDirty();
	}
	hasPendingRenderedItems(scan) {
		const { state, view } = this;
		const { renderState } = view;
		const { firstIndex, lastIndex } = renderState;
		return state.scope == null ? scan.hasPendingItems(firstIndex, lastIndex + 1) : scan.isItemPending(0);
	}
	runSlice(scan) {
		const { state, view } = this;
		const { renderState } = view;
		const { firstIndex } = renderState;
		return state.scope == null ? scan.advance(1, firstIndex) : scan.advance(1);
	}
	advanceScan = () => {
		const { scan } = this.state;
		if (scan == null) throw new Error("CodeViewSearchManager.advanceScan: queued scan is missing");
		const renderedItemsPending = this.hasPendingRenderedItems(scan);
		const changed = this.runSlice(scan);
		if (!scan.finished) queueBackgroundTask(this.advanceScan);
		if (changed) {
			this.matchesDirty = true;
			if (renderedItemsPending) this.view.render();
			else queueRender(this.flushMatches);
		}
	};
	search(searchParams) {
		const { state, view, getSearchItem } = this;
		const { items, idToItem, renderState } = view;
		const { scope } = state;
		const itemCount = scope != null ? idToItem.has(scope.itemId) ? 1 : 0 : items.length;
		let { scan } = state;
		if (scan == null) {
			const { firstIndex } = renderState;
			scan = new CodeViewSearchScan(searchParams, itemCount, getSearchItem, MAX_SEARCH_MATCHES, scope == null ? Math.max(0, firstIndex) : 0);
			state.scan = scan;
			this.runSlice(scan);
			view.render();
		} else if (this.hasPendingRenderedItems(scan)) this.runSlice(scan);
		if (!scan.finished) queueBackgroundTask(this.advanceScan);
		return {
			matches: scan.getMatches(),
			searching: !scan.finished
		};
	}
	getStartingMatch(scan) {
		const { state, view } = this;
		const { idToItem } = view;
		const { scope } = state;
		const anchor = view.getScrollAnchor(view.getScrollTop());
		const anchoredItem = anchor != null ? idToItem.get(anchor.id) : void 0;
		const scopedItem = scope != null ? idToItem.get(scope.itemId) : void 0;
		const position = scopedItem != null ? anchoredItem != null && anchoredItem.index > scopedItem.index ? 1 : 0 : anchoredItem?.index ?? 0;
		const first = scan.getFirstMatchedEntryAtOrAfter(position);
		if (first == null) return scan.finished ? scan.getFirstMatchedEntryAtOrAfter(0)?.matches[0] : void 0;
		if (scan.hasPendingItems(position, first.position + 1)) return;
		if (anchor?.type === "line" && anchoredItem != null && first.matches[0].itemId === anchor.id) {
			const candidate = this.findMatchAtAnchor(anchoredItem, first.matches, anchor);
			if (candidate != null) return candidate;
			const next = scan.getFirstMatchedEntryAtOrAfter(first.position + 1);
			if (next == null) return scan.finished ? scan.getFirstMatchedEntryAtOrAfter(0)?.matches[0] : void 0;
			return scan.hasPendingItems(first.position + 1, next.position + 1) ? void 0 : next.matches[0];
		}
		return first.matches[0];
	}
	findMatchAtAnchor(item, matches, anchor) {
		const { options } = this.view;
		const diff = item.type === "diff" ? this.getSearchDiff(item) : void 0;
		const rowIndex = options.diffStyle === "unified" ? 0 : 1;
		let anchorRow = anchor.lineNumber;
		if (diff != null) {
			const indexes = getLineIndexForDiff(diff, anchor.lineNumber, anchor.side ?? "additions");
			if (indexes == null) throw new Error("CodeViewSearchManager.findMatchAtAnchor: anchor row is missing");
			anchorRow = indexes[rowIndex];
		}
		let start = 0;
		let end = matches.length;
		while (start < end) {
			const middle = Math.floor((start + end) / 2);
			const match = matches[middle];
			let row = match.lineNumber;
			if (diff != null) {
				const indexes = getLineIndexForDiff(diff, match.lineNumber, match.side ?? "additions");
				if (indexes == null) throw new Error("CodeViewSearchManager.findMatchAtAnchor: matched row is missing");
				row = indexes[rowIndex];
			}
			if (row < anchorRow) start = middle + 1;
			else end = middle;
		}
		return matches[start];
	}
};
function renameViewport(viewport, oldId, newId) {
	return viewport != null && viewport !== "top" && viewport.id === oldId ? {
		...viewport,
		id: newId
	} : viewport;
}
function getClickedCodeRow(event) {
	for (const target of event.composedPath()) {
		if (target instanceof HTMLButtonElement) return void 0;
		if (target instanceof HTMLElement && target.matches("[data-line][data-line-type]")) return target;
	}
}
function getCodeLineElement(node) {
	return (node instanceof Element ? node : node.parentElement)?.closest("[data-line]") ?? void 0;
}
function hasSearchIndexOptionChanged(previousOptions, nextOptions) {
	return previousOptions.tokenizeMaxLineLength !== nextOptions.tokenizeMaxLineLength || (previousOptions.diffStyle ?? "split") !== (nextOptions.diffStyle ?? "split") || (previousOptions.expandUnchanged ?? false) !== (nextOptions.expandUnchanged ?? false) || (previousOptions.collapsedContextThreshold ?? 1) !== (nextOptions.collapsedContextThreshold ?? 1);
}
//#endregion
export { CodeViewSearchManager };

//# sourceMappingURL=CodeViewSearchManager.js.map