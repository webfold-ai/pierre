//#region src/managers/BackgroundTaskQueue.ts
const BACKGROUND_TASK_BUDGET_MS = 1;
const tasks = /* @__PURE__ */ new Map();
const taskIds = /* @__PURE__ */ new Map();
let nextTaskId = 0;
function runBackgroundTask(event) {
	const { data } = event;
	if (typeof data !== "string" || !data.startsWith("diffs-background-task:")) return;
	const id = Number(data.slice(22));
	const callback = tasks.get(id);
	if (callback == null) return;
	dequeueBackgroundTask(callback);
	callback();
}
function queueBackgroundTask(callback) {
	if (taskIds.has(callback)) return;
	if (tasks.size === 0) globalThis.addEventListener("message", runBackgroundTask);
	const id = ++nextTaskId;
	tasks.set(id, callback);
	taskIds.set(callback, id);
	globalThis.postMessage(`diffs-background-task:${id}`);
}
function dequeueBackgroundTask(callback) {
	const id = taskIds.get(callback);
	if (id == null) return;
	taskIds.delete(callback);
	tasks.delete(id);
	if (tasks.size === 0) globalThis.removeEventListener("message", runBackgroundTask);
}
//#endregion
export { BACKGROUND_TASK_BUDGET_MS, dequeueBackgroundTask, queueBackgroundTask, runBackgroundTask };

//# sourceMappingURL=BackgroundTaskQueue.js.map