//#region src/managers/BackgroundTaskQueue.d.ts
declare const BACKGROUND_TASK_BUDGET_MS = 1;
type BackgroundTask = () => void;
declare function runBackgroundTask(event: MessageEvent<unknown>): void;
declare function queueBackgroundTask(callback: BackgroundTask): void;
declare function dequeueBackgroundTask(callback: BackgroundTask): void;
//#endregion
export { BACKGROUND_TASK_BUDGET_MS, BackgroundTask, dequeueBackgroundTask, queueBackgroundTask, runBackgroundTask };
//# sourceMappingURL=BackgroundTaskQueue.d.ts.map