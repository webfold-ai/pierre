//#region src/utils/addMissingRows.ts
function addMissingRows(target, source) {
	for (const key of Object.keys(source)) {
		const index = Number(key);
		if (!(index in target)) target[index] = source[index];
	}
}
//#endregion
export { addMissingRows };

//# sourceMappingURL=addMissingRows.js.map