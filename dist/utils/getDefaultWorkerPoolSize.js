//#region src/utils/getDefaultWorkerPoolSize.ts
function getDefaultWorkerPoolSize() {
	const availableCores = globalThis.navigator?.hardwareConcurrency ?? 1;
	return Math.min(3, Math.max(1, availableCores - 1));
}
//#endregion
export { getDefaultWorkerPoolSize };

//# sourceMappingURL=getDefaultWorkerPoolSize.js.map