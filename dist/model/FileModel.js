import { linesFromFileContents } from "../utils/computeFileOffsets.js";
import { uniformLineEndings } from "../utils/lineEndings.js";
import { readAllLines, readChangedLines } from "./documentLines.js";
import { LineMap } from "./LineMap.js";
//#region src/model/FileModel.ts
/**
* The lines of a plain file and, while it is edited, a stable id for each
* line, so rows are keyed by line rather than by position. The one-sided
* twin of DiffModel.
*/
var FileModel = class FileModel {
	file;
	/** A model of the file as given, for rendering it read-only. */
	static fromFile(file) {
		return new FileModel(file, linesFromFileContents(file.contents), void 0);
	}
	/**
	* Starts editing a file. The session's file is a copy without the input's
	* cache key; `retained` supplies the name, language and contents of a
	* document the editor kept from an earlier session.
	*/
	static startEditSession(file, retained) {
		const source = retained ?? file;
		const contents = uniformLineEndings(source.contents);
		const sessionFile = {
			name: source.name,
			lang: source.lang,
			contents
		};
		const lines = linesFromFileContents(contents);
		return new FileModel(sessionFile, lines, new LineMap(lines.length));
	}
	#lines;
	#map;
	constructor(file, lines, map) {
		this.file = file;
		this.#lines = lines;
		this.#map = map;
	}
	/** Whether the file is being edited. */
	get live() {
		return this.#map != null;
	}
	get lineCount() {
		return this.#lines.length;
	}
	/** Every line with its line break, in order. */
	get lines() {
		return this.#lines;
	}
	/** The text of a line, with its line break. */
	lineText(line) {
		return this.#lines[line] ?? "";
	}
	/** The stable id of a line: its index until edits move it. */
	lineId(line) {
		return this.#map?.idAt(line) ?? line;
	}
	/** The line that currently has this id, or undefined once it was deleted. */
	lineOf(id) {
		return this.#map?.lineOf(id) ?? (id < this.#lines.length ? id : void 0);
	}
	/** The id of every line, in line order. */
	lineIds() {
		return this.#map?.ids() ?? this.#lines.map((_, line) => line);
	}
	/** Applies one change of the editor's document; `file` stays current. */
	applyChange(change, document) {
		const map = this.#map;
		if (map == null) throw new Error("FileModel.applyChange: the model is not live");
		const removedLineIds = map.applyChange(change);
		const changedLines = [];
		if (change.lineDelta === 0) {
			for (const [line, text] of readChangedLines(document, change)) if (this.#lines[line] !== text) {
				this.#lines[line] = text;
				changedLines.push(line);
			}
		} else {
			this.#lines = readAllLines(document).lines;
			for (let line = change.startLine; line <= change.endLine; line++) changedLines.push(line);
		}
		this.file.contents = this.#lines.join("");
		return {
			changedLines,
			removedLineIds,
			lineDelta: change.lineDelta
		};
	}
};
//#endregion
export { FileModel };

//# sourceMappingURL=FileModel.js.map