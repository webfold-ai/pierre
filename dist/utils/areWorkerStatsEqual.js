//#region src/utils/areWorkerStatsEqual.ts
function areWorkerStatsEqual(statsA, statsB) {
	if (statsA == null || statsB == null) return statsA === statsB;
	return statsA.busyWorkers === statsB.busyWorkers && statsA.diffCacheSize === statsB.diffCacheSize && statsA.fileCacheSize === statsB.fileCacheSize && statsA.managerState === statsB.managerState && statsA.activeTasks === statsB.activeTasks && statsA.queuedTasks === statsB.queuedTasks && statsA.themeSubscribers === statsB.themeSubscribers && statsA.configuredWorkers === statsB.configuredWorkers && statsA.totalWorkers === statsB.totalWorkers && statsA.readyWorkers === statsB.readyWorkers && statsA.retryingWorkerSlots === statsB.retryingWorkerSlots && statsA.failedWorkerSlots === statsB.failedWorkerSlots && statsA.workersFailed === statsB.workersFailed;
}
//#endregion
export { areWorkerStatsEqual };

//# sourceMappingURL=areWorkerStatsEqual.js.map