import { DEFAULT_THEMES } from "../constants.js";
import { addEventListener } from "./utils.js";
import { areRenderRangesEqual } from "../utils/areRenderRangesEqual.js";
import { colorUtils } from "@pierre/theming/color";
//#region src/editor/tokenizer.ts
/** Applies editor theme CSS and delegates tokenization to the selected backend. */
var EditorTokenizer = class {
	#highlighter;
	#textDocument;
	#tokenizer;
	#mediaQueryList;
	#themeType = "dark";
	#themeName = "";
	#setStyle;
	#style = "";
	#onThemeChange;
	#disposes;
	#followsSystemThemeType = false;
	get themeType() {
		return this.#themeType;
	}
	get highlighter() {
		return this.#highlighter;
	}
	constructor({ codeOptions, highlighter, textDocument, matchBrackets, setStyle, onDeferTokenize, onThemeChange, __debug }) {
		const { themeType: themeTypeOption = "system", theme = DEFAULT_THEMES, tokenizeMaxLineLength = 1e3 } = codeOptions;
		this.#mediaQueryList = window.matchMedia("(prefers-color-scheme: dark)");
		let themeType;
		if (themeTypeOption === "system") themeType = this.#resolveSystemThemeType();
		else themeType = themeTypeOption;
		if (typeof theme !== "string" && themeTypeOption === "system") {
			const observer = new MutationObserver((mutations) => {
				for (const { type, attributeName } of mutations) if (type === "attributes" && attributeName !== null && (attributeName === "class" || attributeName.startsWith("data-"))) {
					const themeType = this.#resolveSystemThemeType();
					this.#emitThemeChange(theme[themeType], themeType);
					break;
				}
			});
			observer.observe(document.documentElement, { attributes: true });
			observer.observe(document.body, { attributes: true });
			this.#disposes = [addEventListener(this.#mediaQueryList, "change", () => {
				const themeType = this.#resolveSystemThemeType();
				this.#emitThemeChange(theme[themeType], themeType);
			}), () => observer.disconnect()];
		}
		this.#followsSystemThemeType = this.#disposes != null;
		this.#highlighter = highlighter;
		this.#setStyle = setStyle;
		this.#onThemeChange = onThemeChange;
		this.#setTheme(typeof theme === "string" ? theme : theme[themeType], typeof theme === "string" ? void 0 : themeType);
		this.#textDocument = textDocument;
		this.#tokenizer = highlighter.createEditorTokenizer({
			textDocument,
			theme: this.#themeName,
			tokenizeMaxLineLength,
			matchBrackets,
			__debug,
			onDeferTokenize: (lines) => onDeferTokenize(lines, this.#themeType)
		});
	}
	#emitThemeChange(themeName, themeType) {
		if (themeName === this.#themeName && themeType === this.#themeType) return;
		this.#setTheme(themeName, themeType);
		this.#tokenizer.setTheme(themeName);
		this.#onThemeChange?.();
	}
	#resolveSystemThemeType() {
		try {
			if (typeof document !== "undefined" && typeof getComputedStyle === "function" && document.body != null) {
				const colorSchemes = getComputedStyle(document.body).colorScheme.split(/\s+/);
				const supportsDark = colorSchemes.includes("dark");
				if (supportsDark !== colorSchemes.includes("light")) return supportsDark ? "dark" : "light";
			}
		} catch {}
		return this.#mediaQueryList.matches ? "dark" : "light";
	}
	syncTheme(codeOptions) {
		const { themeType = "system", theme = DEFAULT_THEMES } = codeOptions;
		if (typeof theme === "string") {
			this.#followsSystemThemeType = false;
			const pinnedThemeType = this.#highlighter.getTheme(theme).type;
			if (theme === this.#themeName && pinnedThemeType === this.#themeType) return;
			this.#emitThemeChange(theme, pinnedThemeType);
			return;
		}
		const nextThemeType = themeType !== "system" ? themeType : this.#followsSystemThemeType ? this.#themeType : this.#resolveSystemThemeType();
		this.#followsSystemThemeType = themeType === "system" && this.#disposes != null;
		const nextThemeName = theme[nextThemeType];
		if (nextThemeType === this.#themeType && nextThemeName === this.#themeName) return;
		this.#emitThemeChange(nextThemeName, nextThemeType);
	}
	#setTheme(themeName, themeType) {
		const theme = this.#highlighter.getTheme(themeName);
		const { colors = {} } = theme;
		const selectionBackground = colors["editor.selectionBackground"];
		const themeLineHighlightBackground = colors["editor.lineHighlightBackground"];
		const lineHighlightBackground = themeLineHighlightBackground != null && themeLineHighlightBackground.trim() !== "" && !colorUtils.isFullyTransparent(themeLineHighlightBackground) ? themeLineHighlightBackground : void 0;
		const lineHighlightBorder = colors["editor.lineHighlightBorder"] ?? (lineHighlightBackground == null ? "color-mix(in lab, var(--diffs-bg) 70%, var(--diffs-fg))" : "transparent");
		const activeLineSourceMix = lineHighlightBackground == null ? "100%" : "85%";
		const cursorForeground = colors["editorCursor.foreground"];
		const bracketMatchBackground = colors["editorBracketMatch.background"];
		const bracketMatchBorder = colors["editorBracketMatch.border"];
		const hintForeground = colors["editorHint.foreground"];
		const infoForeground = colors["editorInfo.foreground"];
		const warningForeground = colors["editorWarning.foreground"];
		const errorForeground = colors["editorError.foreground"];
		this.#style = `:host {
      --diffs-editor-selection-bg: ${selectionBackground ?? "var(--diffs-line-bg)"};
      --diffs-editor-line-highlight-border: ${lineHighlightBorder};
      --diffs-editor-active-line-source-mix: ${activeLineSourceMix};
      --diffs-editor-bracket-match-bg: ${bracketMatchBackground ?? "initial"};
      --diffs-editor-bracket-match-border: ${bracketMatchBorder ?? "initial"};
      --diffs-editor-cursor-fg: ${cursorForeground ?? "initial"};
      --diffs-editor-hint-fg: ${hintForeground ?? "initial"};
      --diffs-editor-info-fg: ${infoForeground ?? "initial"};
      --diffs-editor-warning-fg: ${warningForeground ?? "initial"};
      --diffs-editor-error-fg: ${errorForeground ?? "initial"};
    }`;
		this.#setStyle(this.#style);
		this.#themeName = themeName;
		this.#themeType = themeType ?? theme.type;
	}
	applyStyle() {
		this.#setStyle(this.#style);
	}
	cleanUp() {
		this.#tokenizer.dispose();
		this.#disposes?.forEach((dispose) => dispose());
		this.#disposes = void 0;
	}
	tokenize(change, renderRange) {
		this.#prepared = void 0;
		return this.#tokenizer.tokenize(change, renderRange);
	}
	getStringCommentRegexpRangesInLine(lineIndex) {
		return this.#tokenizer.getStringCommentRegexpRangesInLine(lineIndex);
	}
	#prepared;
	prebuildStateStack(renderRange, domCurrent = false) {
		this.#prepared = {
			version: this.#textDocument.version,
			renderRange
		};
		this.#tokenizer.prebuildStateStack(renderRange, domCurrent);
	}
	flush(renderRange) {
		const version = this.#textDocument.version;
		const prepared = this.#prepared;
		if (prepared != null && prepared.version === version && areRenderRangesEqual(prepared.renderRange, renderRange)) return /* @__PURE__ */ new Map();
		this.#prepared = {
			version,
			renderRange
		};
		return this.#tokenizer.flush(renderRange);
	}
	pauseBackgroundTokenize() {
		this.#tokenizer.pauseBackgroundTokenize();
	}
	resumeBackgroundTokenize() {
		this.#tokenizer.resumeBackgroundTokenize();
	}
};
//#endregion
export { EditorTokenizer };

//# sourceMappingURL=tokenizer.js.map