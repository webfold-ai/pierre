//#region src/i18n/compileMessage.ts
const PLURAL_BLOCK = /\{(\w+)\s*,\s*plural\s*,((?:\s*\w+\s*\{[^{}]*\})+)\s*\}/;
const PLURAL_BRANCH = /(\w+)\s*\{([^{}]*)\}/g;
const ARGUMENT = /\{(\w+)\}/g;
const PLURAL_CATEGORIES = /* @__PURE__ */ new Set([
	"zero",
	"one",
	"two",
	"few",
	"many",
	"other"
]);
function isPluralCategory(value) {
	return PLURAL_CATEGORIES.has(value);
}
function readArgument(name, values) {
	const value = values?.[name];
	if (value == null) throw new Error(`i18n: message argument "${name}" was not provided`);
	return value;
}
function compileMessage(template, pluralRules, numberFormat) {
	const plural = PLURAL_BLOCK.exec(template);
	const before = plural == null ? template : template.slice(0, plural.index);
	const after = plural == null ? "" : template.slice(plural.index + plural[0].length);
	if (/[{}]/.test((before + after).replace(ARGUMENT, ""))) throw new Error(`i18n: unsupported syntax in "${template}"`);
	if (plural == null) return (values) => formatArguments(template, values, numberFormat);
	const [, name, branchSource] = plural;
	const branches = /* @__PURE__ */ new Map();
	for (const [, category, text] of branchSource.matchAll(PLURAL_BRANCH)) {
		if (!isPluralCategory(category)) throw new Error(`i18n: unknown plural category "${category}" in "${template}"`);
		if (branches.has(category)) throw new Error(`i18n: duplicate plural category "${category}" in "${template}"`);
		branches.set(category, text);
	}
	const other = branches.get("other");
	if (other == null) throw new Error(`i18n: plural block needs an "other" branch in "${template}"`);
	return (values) => {
		const count = readArgument(name, values);
		if (typeof count !== "number") throw new Error(`i18n: plural argument "${name}" must be a number`);
		const branch = branches.get(pluralRules.select(count)) ?? other;
		return formatArguments(before + branch.replaceAll("#", numberFormat.format(count)) + after, values, numberFormat);
	};
}
function formatArguments(text, values, numberFormat) {
	return text.replace(ARGUMENT, (_match, name) => {
		const value = readArgument(name, values);
		return typeof value === "number" ? numberFormat.format(value) : value;
	});
}
//#endregion
export { compileMessage };

//# sourceMappingURL=compileMessage.js.map