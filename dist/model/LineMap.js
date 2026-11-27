import { lineChangesOf, moveLineEntries } from "../utils/lineChanges.js";
//#region src/model/LineMap.ts
/**
* Gives every line of an edited document a stable id.
*
* Ids are what rows are keyed by: inserting a line gives the new line a fresh
* id while every line below keeps its id, so the rows below only change their
* line numbers.
*/
var LineMap = class {
	#ids;
	#nextId;
	#linesById;
	constructor(lineCount) {
		if (lineCount < 1) throw new Error("LineMap: a document has at least one line");
		this.#ids = Array.from({ length: lineCount }, (_, index) => index);
		this.#nextId = lineCount;
	}
	get lineCount() {
		return this.#ids.length;
	}
	/** The id of every line, in line order. */
	ids() {
		return this.#ids.slice();
	}
	idAt(line) {
		const id = this.#ids[line];
		if (id == null) throw new Error(`LineMap.idAt: line ${line} is out of range`);
		return id;
	}
	/** The line that currently has this id, or undefined when it was deleted. */
	lineOf(id) {
		let linesById = this.#linesById;
		if (linesById == null) {
			linesById = /* @__PURE__ */ new Map();
			for (const [line, lineId] of this.#ids.entries()) linesById.set(lineId, line);
			this.#linesById = linesById;
		}
		return linesById.get(id);
	}
	/**
	* Moves the ids through one document change. A line that stays keeps its
	* id, a line the change added gets a fresh one. Returns the ids of the
	* lines the change removed.
	*/
	applyChange(change) {
		const lineChanges = lineChangesOf(change);
		if (lineChanges.some(([, , lineDelta]) => lineDelta !== 0)) this.#linesById = void 0;
		const moved = moveLineEntries(this.#ids, lineChanges, () => this.#nextId++);
		this.#ids = moved.entries;
		if (this.#ids.length !== change.lineCount) throw new Error(`LineMap.applyChange: the document has ${change.lineCount} lines but the map has ${this.#ids.length}`);
		return moved.removed;
	}
};
//#endregion
export { LineMap };

//# sourceMappingURL=LineMap.js.map