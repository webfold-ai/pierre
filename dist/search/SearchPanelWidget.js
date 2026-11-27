import { THEME_CSS_ATTRIBUTE } from "../constants.js";
import { h } from "../editor/utils.js";
import { dequeueRender, queueRender } from "../managers/UniversalRenderingManager.js";
import { resolveFindAgainShortcut, resolveSearchShortcut } from "../editor/command.js";
import { wrapUnsafeCSS } from "../utils/cssWrappers.js";
import { i18n } from "../i18n/I18n.js";
import { SVGSpriteSheet, getEditorIconSvg } from "../editor/sprite.js";
import { createUnsafeCSSStyleNode } from "../utils/createUnsafeCSSStyleNode.js";
import SearchPanelWidget_default from "./SearchPanelWidget2.js";
//#region src/search/SearchPanelWidget.ts
var SearchPanelWidget = class {
	#host;
	#widgetElement;
	#inputElement;
	#themeStyle;
	#unsafeStyle;
	#initializeMatches;
	#mount;
	#unsubscribeMessages;
	#closed = false;
	#updateMatches;
	#applyMode;
	#setReplaceHandlers;
	#navigate;
	#setQuery;
	#hasReplaceHandlers;
	#close;
	constructor(options) {
		const { containerElement, themeCSS, unsafeCSS, defaultQuery, defaults, mode = "find", search, scrollToMatch, currentMatchNeedsReveal, replace, onQueryChange, onUpdate, onStateChange, onBeforeNavigate, onClose } = options;
		let replaceHandlers = replace;
		let requestedMode = mode;
		const normalizeMode = (nextMode) => replaceHandlers != null ? nextMode : "find";
		const searchParams = {
			text: defaultQuery,
			replaceText: "",
			caseSensitive: defaults?.caseSensitive === true,
			wholeWord: defaults?.wholeWord === true,
			regex: defaults?.regex === true
		};
		const matches = {
			all: [],
			currentIndex: void 0
		};
		const getSearchParamsSnapshot = () => ({ ...searchParams });
		const emitState = () => {
			if (onStateChange == null || this.#closed) return;
			onStateChange({
				...getSearchParamsSnapshot(),
				mode: normalizeMode(requestedMode),
				canReplace: replaceHandlers != null,
				matchCount: matches.all.length,
				searching,
				currentMatchIndex: matches.currentIndex
			});
		};
		let searching = defaultQuery !== "";
		const matchResultElement = h("div", { dataset: { matches: "" } });
		let spinnerMessageVersion;
		const clearSearchingIndicator = () => {
			spinnerMessageVersion = void 0;
			delete matchResultElement.dataset.searching;
			matchResultElement.removeAttribute("aria-label");
		};
		const showNoMatches = () => {
			if (searching) {
				if (spinnerMessageVersion === i18n.version) return;
				if (spinnerMessageVersion == null) {
					matchResultElement.dataset.searching = "";
					matchResultElement.innerHTML = getEditorIconSvg("loader", 16);
				}
				const label = i18n.t("searching");
				if (matchResultElement.ariaLabel !== label) matchResultElement.ariaLabel = label;
				spinnerMessageVersion = i18n.version;
			} else {
				clearSearchingIndicator();
				matchResultElement.textContent = i18n.t("noSearchResults");
			}
			matchResultElement.toggleAttribute("data-no-matches", !searching);
		};
		showNoMatches();
		const updateCurrentMatch = (currentIndex) => {
			clearSearchingIndicator();
			matchResultElement.textContent = currentIndex != null ? i18n.t("searchResultPosition", {
				index: currentIndex + 1,
				count: matches.all.length
			}) : i18n.t("searchResultCount", { count: matches.all.length });
			matches.currentIndex = currentIndex;
		};
		let matchesUpdated = false;
		const updateMatches = (options) => {
			matchesUpdated = true;
			const result = searchParams.text !== "" ? search(getSearchParamsSnapshot()) : { matches: [] };
			matches.all = result.matches;
			searching = result.searching === true;
			replaceButton.disabled = searching;
			replaceAllButton.disabled = searching;
			const noMatches = matches.all.length === 0;
			prevButton.disabled = noMatches;
			nextButton.disabled = noMatches;
			if (noMatches) {
				showNoMatches();
				matches.currentIndex = void 0;
				onUpdate(result, options);
			} else {
				delete matchResultElement.dataset.noMatches;
				updateCurrentMatch(onUpdate(result, options));
			}
			emitState();
		};
		this.#updateMatches = updateMatches;
		const updateSearchParam = (key, value) => {
			if (searchParams[key] !== value) onQueryChange?.();
			searchParams[key] = value;
			updateMatches();
		};
		const findNextMatch = (findPrevious = false, retainFocus = false) => {
			onBeforeNavigate?.();
			if (this.#closed) return;
			const { all, currentIndex } = matches;
			if (all.length > 0) {
				let nextIndex;
				if (currentIndex == null) nextIndex = findPrevious ? all.length - 1 : 0;
				else if (currentMatchNeedsReveal?.() === true) nextIndex = currentIndex;
				else nextIndex = (currentIndex + (findPrevious ? -1 : 1) + all.length) % all.length;
				updateCurrentMatch(nextIndex);
				scrollToMatch(all[nextIndex], retainFocus);
			} else matches.currentIndex = void 0;
			emitState();
		};
		this.#navigate = (findPrevious) => findNextMatch(findPrevious, true);
		const replaceCurrentMatch = () => {
			const replace = replaceHandlers;
			if (searching || replace === void 0 || searchParams.text === "" || matches.all.length === 0) return;
			const currentIndex = matches.currentIndex ?? 0;
			if (matches.currentIndex == null) findNextMatch(false, true);
			const currentMatch = matches.all[currentIndex];
			const nextMatch = replace.replaceMatch(currentMatch, getSearchParamsSnapshot());
			if (nextMatch !== void 0) scrollToMatch(nextMatch, true);
			matches.currentIndex = void 0;
			updateMatches();
		};
		const replaceAllMatches = () => {
			const replace = replaceHandlers;
			if (searching || replace === void 0 || searchParams.text === "" || matches.all.length === 0) return;
			replace.replaceAll(matches.all.slice(), getSearchParamsSnapshot());
			matches.currentIndex = void 0;
			updateMatches();
		};
		const close = () => {
			onClose();
			this.cleanup();
		};
		this.#close = close;
		const buttonLabels = /* @__PURE__ */ new Map();
		const iconButton = (opts) => {
			const button = h("button", {
				type: "button",
				dataset: {
					searchIcon: "",
					...opts.dataset
				},
				innerHTML: getEditorIconSvg(opts.icon, opts.size ?? 16),
				onclick: opts.onClick
			});
			buttonLabels.set(button, opts.label);
			return button;
		};
		const makeToggle = (icon, label, key) => {
			const button = iconButton({
				icon,
				label,
				size: 14,
				onClick: () => {
					const next = !searchParams[key];
					button.ariaPressed = String(next);
					updateSearchParam(key, next);
				}
			});
			button.ariaPressed = String(searchParams[key]);
			return button;
		};
		const caseSensitiveToggle = makeToggle("case", "matchCase", "caseSensitive");
		const wholeWordToggle = makeToggle("whole-word", "wholeWord", "wholeWord");
		const regexToggle = makeToggle("regex", "regularExpression", "regex");
		this.#inputElement = h("input", {
			type: "text",
			dataset: "search",
			value: defaultQuery,
			oninput: (e) => {
				matches.currentIndex = void 0;
				updateSearchParam("text", e.target.value);
			},
			onkeydown: (e) => {
				if (e.isComposing || e.keyCode === 229) return;
				const shortcut = resolveSearchShortcut(e);
				if (e.key === "Escape") {
					e.preventDefault();
					close();
				} else if (e.key === "Enter") {
					e.preventDefault();
					findNextMatch(e.shiftKey, true);
				} else if (shortcut === "next" || shortcut === "previous") {
					e.preventDefault();
					findNextMatch(shortcut === "previous", true);
				} else if (shortcut != null) {
					e.preventDefault();
					applyMode(shortcut);
				}
			}
		});
		this.#setQuery = (text) => {
			if (this.#inputElement.value === text) return;
			this.#inputElement.value = text;
			matches.currentIndex = void 0;
			updateSearchParam("text", text);
		};
		const searchTogglesElement = h("div", {
			dataset: "searchToggles",
			children: [
				caseSensitiveToggle,
				wholeWordToggle,
				regexToggle
			]
		});
		const findInputBox = h("div", {
			dataset: {
				inputBox: "",
				find: ""
			},
			children: [this.#inputElement, matchResultElement]
		});
		const prevButton = iconButton({
			icon: "arrow-up",
			label: "previousMatch",
			onClick: () => {
				findNextMatch(true);
			}
		});
		const nextButton = iconButton({
			icon: "arrow-down",
			label: "nextMatch",
			onClick: () => {
				findNextMatch();
			}
		});
		prevButton.disabled = true;
		nextButton.disabled = true;
		const navElement = h("div", {
			dataset: "searchNav",
			children: [prevButton, nextButton]
		});
		const closeElement = iconButton({
			icon: "close",
			label: "closeSearch",
			onClick: close,
			dataset: { searchClose: "" }
		});
		const replaceInputElement = h("input", {
			type: "text",
			dataset: "replace",
			value: "",
			oninput: (e) => {
				searchParams.replaceText = e.target.value;
				emitState();
			},
			onkeydown: (e) => {
				if (e.isComposing || e.keyCode === 229) return;
				const findAgain = resolveFindAgainShortcut(e);
				if (e.key === "Escape") {
					e.preventDefault();
					close();
				} else if (e.key === "Enter") {
					e.preventDefault();
					replaceCurrentMatch();
				} else if (findAgain !== void 0) {
					e.preventDefault();
					findNextMatch(findAgain === "previous", true);
				}
			}
		});
		const replaceInputBox = h("div", {
			dataset: {
				inputBox: "",
				replace: "",
				replaceCell: ""
			},
			children: [replaceInputElement]
		});
		const replaceButton = iconButton({
			icon: "replace",
			label: "replaceMatch",
			onClick: replaceCurrentMatch
		});
		const replaceAllButton = iconButton({
			icon: "replace-all",
			label: "replaceAllMatches",
			onClick: replaceAllMatches
		});
		const replaceActionsElement = h("div", {
			dataset: {
				replaceActions: "",
				replaceCell: ""
			},
			children: [replaceButton, replaceAllButton]
		});
		const replaceToggleElement = iconButton({
			icon: "chevron",
			label: "toggleReplace",
			dataset: { replaceToggle: "" },
			onClick: () => {
				if (gridElement.dataset.mode === "replace") applyMode("find");
				else {
					applyMode("replace");
					replaceInputElement.focus();
				}
			}
		});
		const gridElement = h("div", {
			dataset: {
				searchGrid: "",
				mode: normalizeMode(mode)
			},
			children: [
				replaceToggleElement,
				findInputBox,
				replaceInputBox,
				replaceActionsElement,
				searchTogglesElement,
				navElement,
				closeElement
			]
		});
		const syncReplaceControls = () => {
			const canReplace = replaceHandlers != null;
			const currentMode = normalizeMode(requestedMode);
			gridElement.dataset.mode = currentMode;
			gridElement.toggleAttribute("data-can-replace", canReplace);
			replaceToggleElement.hidden = !canReplace;
			replaceToggleElement.ariaExpanded = String(currentMode === "replace");
		};
		syncReplaceControls();
		this.#hasReplaceHandlers = () => replaceHandlers != null;
		this.#setReplaceHandlers = (handlers) => {
			replaceHandlers = handlers;
			syncReplaceControls();
			emitState();
		};
		const applyMode = (next) => {
			requestedMode = next;
			syncReplaceControls();
			this.#inputElement.focus();
			this.#inputElement.select();
			emitState();
		};
		this.#applyMode = applyMode;
		this.#host = h("div", { dataset: "searchPanel" });
		const shadowRoot = this.#host.attachShadow({ mode: "open" });
		const spriteContainer = document.createElement("div");
		spriteContainer.innerHTML = SVGSpriteSheet;
		const spriteElement = spriteContainer.firstElementChild;
		if (spriteElement instanceof SVGElement) shadowRoot.appendChild(spriteElement);
		h("style", { textContent: SearchPanelWidget_default }, shadowRoot);
		this.#themeStyle = h("style", { textContent: themeCSS ?? "" }, shadowRoot);
		this.#themeStyle.setAttribute(THEME_CSS_ATTRIBUTE, "");
		this.setUnsafeCSS(unsafeCSS);
		this.#widgetElement = h("div", {
			dataset: "editorWidget",
			children: [gridElement]
		});
		h("div", {
			dataset: "searchPanel",
			children: [this.#widgetElement]
		}, shadowRoot);
		this.#initializeMatches = () => {
			if (matchesUpdated || this.#closed) return;
			updateMatches();
		};
		const refreshMessages = () => {
			this.#inputElement.placeholder = i18n.t("searchPlaceholder");
			replaceInputElement.placeholder = i18n.t("replacePlaceholder");
			for (const [button, key] of buttonLabels) {
				button.title = i18n.t(key);
				button.ariaLabel = button.title;
			}
			if (matches.all.length > 0) updateCurrentMatch(matches.currentIndex);
			else showNoMatches();
		};
		this.#mount = () => {
			if (this.#closed) return;
			refreshMessages();
			this.#unsubscribeMessages ??= i18n.subscribe({ onMessagesChange: refreshMessages });
			containerElement.before(this.#host);
			this.#inputElement.select();
			emitState();
			queueRender(this.#initializeMatches);
		};
	}
	mount() {
		this.#mount?.();
	}
	getHostElement() {
		return this.#host;
	}
	getBounds() {
		return this.#widgetElement.getBoundingClientRect();
	}
	setThemeCSS(themeCSS) {
		const css = themeCSS ?? "";
		if (this.#themeStyle.textContent !== css) this.#themeStyle.textContent = css;
	}
	setUnsafeCSS(css) {
		if (!css) {
			this.#unsafeStyle?.remove();
			this.#unsafeStyle = void 0;
			return;
		}
		if (this.#unsafeStyle == null) {
			this.#unsafeStyle = createUnsafeCSSStyleNode();
			this.#themeStyle.after(this.#unsafeStyle);
		}
		this.#unsafeStyle.textContent = wrapUnsafeCSS(css);
	}
	hasQuery() {
		return this.#inputElement.value !== "";
	}
	hasReplaceHandlers() {
		return this.#hasReplaceHandlers?.() === true;
	}
	focus() {
		this.#inputElement.focus();
	}
	navigate(findPrevious) {
		this.#initializeMatches();
		if (this.#closed) return;
		this.#navigate?.(findPrevious);
	}
	setQuery(text) {
		this.#setQuery?.(text);
	}
	updateMatches(options) {
		this.#updateMatches?.(options);
	}
	setMode(mode) {
		this.#applyMode?.(mode);
	}
	setReplaceHandlers(handlers) {
		this.#setReplaceHandlers?.(handlers);
	}
	close() {
		this.#close?.();
	}
	cleanup() {
		this.#closed = true;
		this.#unsubscribeMessages?.();
		dequeueRender(this.#initializeMatches);
		this.#host.remove();
	}
};
//#endregion
export { SearchPanelWidget };

//# sourceMappingURL=SearchPanelWidget.js.map