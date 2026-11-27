import { composeCacheKey } from "./composeCacheKey.js";
import { diffLibs, resolveDiffLib } from "./diffLibs.js";
import { processFile } from "./parsePatchFiles.js";
//#region src/utils/parseDiffFromFile.ts
const MISSING_FILE_NAME = "/dev/null";
/**
* Parses a diff from two file contents objects.
*
* If both `oldFile` and `newFile` have a `cacheKey`, the resulting diff gets a
* collision-safe key derived from both values and the line-matching mode.
*/
function parseDiffFromFile(oldFile, newFile, { preferredDiffLib = "jsdiff", disableLineMatching, ...diffOptions } = {}, throwOnError = false) {
	if (oldFile === null && newFile === null) throw new Error("parseDiffFromFile: You must pass oldFile, newFile, or both");
	const resolvedOldFile = oldFile ?? createMissingFile();
	const resolvedNewFile = newFile ?? createMissingFile();
	const patchArgs = [
		resolvedOldFile.name,
		resolvedNewFile.name,
		resolvedOldFile.contents,
		resolvedNewFile.contents,
		resolvedOldFile.header,
		resolvedNewFile.header,
		diffOptions
	];
	const diffLib = throwOnError ? preferredDiffLib : resolveDiffLib(preferredDiffLib);
	let patch;
	try {
		patch = diffLibs[diffLib].createTwoFilesPatch(...patchArgs);
	} catch (error) {
		if (throwOnError || diffLib === "jsdiff") throw error;
		console.error(error);
		patch = diffLibs.jsdiff.createTwoFilesPatch(...patchArgs);
	}
	const fileData = processFile(patch, {
		cacheKey: (() => {
			const oldCacheKey = oldFile?.cacheKey;
			const newCacheKey = newFile?.cacheKey;
			return oldCacheKey != null && newCacheKey != null ? composeCacheKey(disableLineMatching === true ? "diff-raw" : "diff", oldCacheKey, newCacheKey) : void 0;
		})(),
		oldFile: resolvedOldFile,
		newFile: resolvedNewFile,
		disableLineMatching,
		throwOnError
	});
	if (fileData == null) throw new Error("parseDiffFrom: FileInvalid diff -- probably need to fix something -- if the files are the same maybe?");
	if (oldFile === null) {
		fileData.type = "new";
		fileData.prevName = void 0;
	} else if (newFile === null) {
		fileData.type = "deleted";
		fileData.prevName = void 0;
	}
	const language = newFile?.lang ?? (newFile === null ? oldFile?.lang : void 0);
	if (language != null) fileData.lang = language;
	return fileData;
}
function createMissingFile() {
	return {
		name: MISSING_FILE_NAME,
		contents: ""
	};
}
//#endregion
export { parseDiffFromFile };

//# sourceMappingURL=parseDiffFromFile.js.map