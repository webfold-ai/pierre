import { DEFAULT_THEMES } from "../constants.js";
import { areObjectsEqual } from "./areObjectsEqual.js";
import { areThemesEqual } from "./areThemesEqual.js";
//#region src/utils/areOptionsEqual.ts
function areOptionsEqual(optionsA, optionsB) {
	const searchOptionsA = getSearchOptions(optionsA);
	const searchOptionsB = getSearchOptions(optionsB);
	return areThemesEqual(optionsA?.theme ?? DEFAULT_THEMES, optionsB?.theme ?? DEFAULT_THEMES) && areObjectsEqual(optionsA, optionsB, [
		"theme",
		"parseDiffOptions",
		"searchOptions"
	]) && areObjectsEqual(getParseDiffOptions(optionsA), getParseDiffOptions(optionsB)) && areObjectsEqual(searchOptionsA, searchOptionsB, ["defaults"]) && areObjectsEqual(searchOptionsA?.defaults, searchOptionsB?.defaults);
}
function getSearchOptions(options) {
	if (options != null && "searchOptions" in options) return options.searchOptions;
}
function getParseDiffOptions(options) {
	if (options != null && "parseDiffOptions" in options) return options.parseDiffOptions;
}
//#endregion
export { areOptionsEqual };

//# sourceMappingURL=areOptionsEqual.js.map