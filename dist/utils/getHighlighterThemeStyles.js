import { DEFAULT_THEMES } from "../constants.js";
import { formatCSSVariablePrefix } from "./formatCSSVariablePrefix.js";
import { normalizeThemeColors } from "@pierre/theming/color";
//#region src/utils/getHighlighterThemeStyles.ts
function getHighlighterThemeStyles({ theme = DEFAULT_THEMES, highlighter, prefix }) {
	let styles = "";
	if (typeof theme === "string") {
		const themeData = highlighter.getTheme(theme);
		const normalized = getThemeColors(themeData, highlighter);
		styles += `color:${normalized.fg};`;
		styles += `background-color:${normalized.bg};`;
		styles += `${formatCSSVariablePrefix("global")}fg:${normalized.fg};`;
		styles += `${formatCSSVariablePrefix("global")}bg:${normalized.bg};`;
		styles += getGitVariables(themeData, prefix);
		styles += getSearchVariables(themeData);
	} else {
		let themeData = highlighter.getTheme(theme.dark);
		let normalized = getThemeColors(themeData, highlighter);
		styles += `${formatCSSVariablePrefix("global")}dark:${normalized.fg};`;
		styles += `${formatCSSVariablePrefix("global")}dark-bg:${normalized.bg};`;
		styles += getGitVariables(themeData, "dark");
		styles += getSearchVariables(themeData, "dark");
		themeData = highlighter.getTheme(theme.light);
		normalized = getThemeColors(themeData, highlighter);
		styles += `${formatCSSVariablePrefix("global")}light:${normalized.fg};`;
		styles += `${formatCSSVariablePrefix("global")}light-bg:${normalized.bg};`;
		styles += getGitVariables(themeData, "light");
		styles += getSearchVariables(themeData, "light");
	}
	return styles;
}
function getThemeColors(theme, highlighter) {
	if (highlighter.name === "highlights" && theme.zed?.cssVariables === true) {
		const prefix = formatCSSVariablePrefix("token");
		return {
			fg: `var(${prefix}foreground)`,
			bg: `var(${prefix}background)`
		};
	}
	return normalizeThemeColors(theme);
}
function getGitVariables(themeData, modePrefix) {
	modePrefix = modePrefix != null ? `${modePrefix}-` : "";
	let styles = "";
	const additionGreen = themeData.colors?.["gitDecoration.addedResourceForeground"] ?? themeData.colors?.["terminal.ansiGreen"];
	if (additionGreen != null) styles += `${formatCSSVariablePrefix("global")}${modePrefix}addition-color:${additionGreen};`;
	const deletionRed = themeData.colors?.["gitDecoration.deletedResourceForeground"] ?? themeData.colors?.["terminal.ansiRed"];
	if (deletionRed != null) styles += `${formatCSSVariablePrefix("global")}${modePrefix}deletion-color:${deletionRed};`;
	const modifiedBlue = themeData.colors?.["gitDecoration.modifiedResourceForeground"] ?? themeData.colors?.["terminal.ansiBlue"];
	if (modifiedBlue != null) styles += `${formatCSSVariablePrefix("global")}${modePrefix}modified-color:${modifiedBlue};`;
	return styles;
}
function getSearchVariables(themeData, modePrefix) {
	modePrefix = modePrefix != null ? `${modePrefix}-` : "";
	const prefix = formatCSSVariablePrefix("global");
	const colors = themeData.colors;
	let styles = "";
	const matchBackground = colors?.["editor.findMatchHighlightBackground"];
	const matchForeground = colors?.["editor.findMatchHighlightForeground"];
	if (matchBackground != null && matchForeground != null) {
		styles += `${prefix}${modePrefix}bg-search-match-theme:${matchBackground};`;
		styles += `${prefix}${modePrefix}fg-search-match-theme:${matchForeground};`;
	}
	const currentBackground = colors?.["editor.findMatchBackground"];
	const currentForeground = colors?.["editor.findMatchForeground"];
	if (currentBackground != null && currentForeground != null) {
		styles += `${prefix}${modePrefix}bg-search-match-current-theme:${currentBackground};`;
		styles += `${prefix}${modePrefix}fg-search-match-current-theme:${currentForeground};`;
	}
	return styles;
}
//#endregion
export { getHighlighterThemeStyles };

//# sourceMappingURL=getHighlighterThemeStyles.js.map