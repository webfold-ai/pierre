import { attributeFor, hastToHtml } from "../utils/hastToHtml.js";
//#region src/dom/ColumnReconciler.ts
/**
* Keeps a code column's gutter and content children in step with a list of
* row specs, by key. The first paint writes one string per column. After
* that, a reconcile walks the specs once against the children: rows whose
* key is gone are removed, missing rows are inserted (contiguous runs as one
* string), rows that moved are moved, and rows whose spec changed have their
* attributes and children rewritten. A row whose gutter and content cells
* are the same objects as last time is not touched, so the layout's
* memoization decides the cost. A change that moved no row skips the walk
* and patches the rows it touched by key.
*/
var ColumnReconciler = class {
	#gutter;
	#content;
	#rows = /* @__PURE__ */ new Map();
	#keys = /* @__PURE__ */ new WeakMap();
	#unindexed;
	#hasRows = false;
	constructor(gutter, content) {
		this.#gutter = gutter;
		this.#content = content;
	}
	/** Writes every row with one string per column. */
	replaceAll(specs) {
		this.#gutter.innerHTML = hastToHtml(specs.map((spec) => spec.gutter));
		this.#content.innerHTML = hastToHtml(specs.map((spec) => spec.content));
		this.#rows.clear();
		this.#unindexed = {
			specs,
			trusted: true
		};
		this.#hasRows = true;
	}
	/**
	* Takes the rows already in the columns, such as server-rendered markup,
	* as the rows for `specs`, matched by position. Their contents are not
	* trusted, so the next reconcile rewrites them. Returns false, and changes
	* nothing, when the row counts do not match.
	*/
	adopt(specs) {
		if (this.#content.childElementCount !== specs.length || this.#gutter.childElementCount !== specs.length) return false;
		this.#rows.clear();
		this.#unindexed = {
			specs,
			trusted: false
		};
		this.#hasRows = true;
		return true;
	}
	/** The elements of the row with this key, if it is on screen. */
	elementFor(key) {
		this.#index();
		return this.#rows.get(key);
	}
	/**
	* Removes the rows whose keys are not in `specs`, ahead of a reconcile with
	* the same specs. Called for every column before any column takes new rows,
	* so the columns of a split view shrink together and the tree is at its
	* smallest while the new rows parse.
	*/
	removeStale(specs) {
		if (!this.#hasRows) return;
		this.#index();
		const keep = /* @__PURE__ */ new Set();
		for (const spec of specs) keep.add(spec.key);
		for (const [key, row] of this.#rows) if (!keep.has(key)) {
			row.gutter.remove();
			row.content.remove();
			this.#rows.delete(key);
		}
	}
	/**
	* Brings the columns in step with `specs`. When `patched` is given, those
	* are the only rows that differ from the last reconcile: their cells are
	* rewritten by key and the columns are not walked. Columns without rows
	* yet are written whole either way.
	*/
	reconcile(specs, patched) {
		if (!this.#hasRows) {
			this.replaceAll(specs);
			return {
				changed: new Set(specs.map((spec) => spec.key)),
				attributesReset: true,
				gutterRewritten: true
			};
		}
		this.#index();
		return patched == null ? this.#walk(specs) : this.#patch(patched);
	}
	#patch(specs) {
		const result = {
			changed: /* @__PURE__ */ new Set(),
			attributesReset: false,
			gutterRewritten: false
		};
		for (const spec of specs) {
			const row = this.#rows.get(spec.key);
			if (row != null) this.#patchRow(row, spec, result);
		}
		return result;
	}
	#walk(specs) {
		const gutter = this.#gutter;
		const content = this.#content;
		const rows = this.#rows;
		const result = {
			changed: /* @__PURE__ */ new Set(),
			attributesReset: false,
			gutterRewritten: false
		};
		const { changed } = result;
		const nextKeys = /* @__PURE__ */ new Set();
		for (const spec of specs) {
			if (nextKeys.has(spec.key)) throw new Error(`ColumnReconciler: duplicate row key "${spec.key}"`);
			nextKeys.add(spec.key);
		}
		let cursor = content.firstElementChild;
		let gutterCursor = gutter.firstElementChild;
		const advance = () => {
			cursor = cursor?.nextElementSibling ?? null;
			gutterCursor = gutterCursor?.nextElementSibling ?? null;
		};
		const removeAtCursor = () => {
			const key = this.#keyOf(cursor);
			const next = cursor?.nextElementSibling ?? null;
			const nextGutter = gutterCursor?.nextElementSibling ?? null;
			cursor?.remove();
			gutterCursor?.remove();
			rows.delete(key);
			cursor = next;
			gutterCursor = nextGutter;
		};
		let pending = [];
		const flushPending = () => {
			if (pending.length === 0) return;
			const gutterCells = insertRun(gutter, gutterCursor, pending.map((spec) => spec.gutter));
			const contentCells = insertRun(content, cursor, pending.map((spec) => spec.content));
			for (let index = 0; index < pending.length; index++) {
				const spec = pending[index];
				const row = {
					gutter: gutterCells[index],
					content: contentCells[index],
					spec
				};
				rows.set(spec.key, row);
				this.#keys.set(row.content, spec.key);
				changed.add(spec.key);
			}
			result.attributesReset = true;
			pending = [];
		};
		for (const spec of specs) {
			while (cursor != null && !nextKeys.has(this.#keyOf(cursor))) removeAtCursor();
			const existing = rows.get(spec.key);
			if (existing == null) {
				pending.push(spec);
				continue;
			}
			flushPending();
			if (existing.content === cursor) advance();
			else {
				gutter.insertBefore(existing.gutter, gutterCursor);
				content.insertBefore(existing.content, cursor);
			}
			this.#patchRow(existing, spec, result);
		}
		flushPending();
		while (cursor != null) removeAtCursor();
		return result;
	}
	#patchRow(row, spec, result) {
		const previous = row.spec;
		if (previous?.content !== spec.content) {
			const patched = patchCell(row.content, previous?.content, spec.content);
			if (patched.element !== row.content) {
				row.content = patched.element;
				this.#keys.set(patched.element, spec.key);
			}
			result.attributesReset ||= patched.reset;
			result.changed.add(spec.key);
		}
		if (previous?.gutter !== spec.gutter) {
			const patched = patchCell(row.gutter, previous?.gutter, spec.gutter);
			row.gutter = patched.element;
			result.attributesReset ||= patched.reset;
			result.gutterRewritten = true;
			result.changed.add(spec.key);
		}
		row.spec = spec;
	}
	#index() {
		const unindexed = this.#unindexed;
		if (unindexed == null) return;
		this.#unindexed = void 0;
		const { specs, trusted } = unindexed;
		let gutterCell = this.#gutter.firstElementChild;
		let contentCell = this.#content.firstElementChild;
		for (const spec of specs) {
			if (!(gutterCell instanceof HTMLElement) || !(contentCell instanceof HTMLElement)) throw new Error("ColumnReconciler: the columns have fewer rows than their specs");
			this.#rows.set(spec.key, {
				gutter: gutterCell,
				content: contentCell,
				spec: trusted ? spec : void 0
			});
			this.#keys.set(contentCell, spec.key);
			gutterCell = gutterCell.nextElementSibling;
			contentCell = contentCell.nextElementSibling;
		}
		if (gutterCell != null || contentCell != null) throw new Error("ColumnReconciler: the columns have more rows than their specs");
	}
	#keyOf(element) {
		const key = element == null ? void 0 : this.#keys.get(element);
		if (key == null) throw new Error("ColumnReconciler: a row on screen has no key");
		return key;
	}
};
function insertRun(parent, cursor, cells) {
	const before = cursor == null ? parent.lastElementChild : cursor.previousElementSibling;
	const html = hastToHtml([...cells]);
	if (cursor == null) parent.insertAdjacentHTML("beforeend", html);
	else cursor.insertAdjacentHTML("beforebegin", html);
	const elements = new Array(cells.length);
	let node = cursor == null ? parent.lastElementChild : cursor.previousElementSibling;
	for (let index = cells.length - 1; index >= 0; index--) {
		if (!(node instanceof HTMLElement)) throw new Error("ColumnReconciler: a row cell did not parse to an element");
		elements[index] = node;
		node = node.previousElementSibling;
	}
	if (node !== before) throw new Error("ColumnReconciler: a row cell did not parse to one element");
	return elements;
}
function patchCell(element, previous, next) {
	if (element.tagName.toLowerCase() !== next.tagName.toLowerCase()) {
		element.insertAdjacentHTML("beforebegin", hastToHtml(next));
		const replacement = element.previousElementSibling;
		element.remove();
		if (!(replacement instanceof HTMLElement)) throw new Error("ColumnReconciler: a row cell did not parse to an element");
		return {
			element: replacement,
			reset: true
		};
	}
	let reset = false;
	if (previous == null || !patchAttributes(element, previous, next)) {
		syncAttributes(element, next);
		reset = true;
	}
	if (previous == null || previous.children !== next.children) element.innerHTML = hastToHtml(next.children);
	return {
		element,
		reset
	};
}
function patchAttributes(element, previous, next) {
	const nextNames = /* @__PURE__ */ new Set();
	for (const key in next.properties) {
		const attribute = attributeFor(key, next.properties[key]);
		if (attribute === void 0) return false;
		if (attribute === null) continue;
		nextNames.add(attribute.name);
		if (element.getAttribute(attribute.name) !== attribute.value) element.setAttribute(attribute.name, attribute.value);
	}
	for (const key in previous.properties) {
		const attribute = attributeFor(key, previous.properties[key]);
		if (attribute === void 0) return false;
		if (attribute != null && !nextNames.has(attribute.name)) element.removeAttribute(attribute.name);
	}
	return true;
}
function syncAttributes(element, next) {
	const template = document.createElement("template");
	template.innerHTML = hastToHtml({
		...next,
		children: []
	});
	const target = template.content.firstElementChild;
	if (target == null) throw new Error("ColumnReconciler: a row cell did not parse to an element");
	for (const name of element.getAttributeNames()) if (!target.hasAttribute(name)) element.removeAttribute(name);
	for (const name of target.getAttributeNames()) {
		const value = target.getAttribute(name) ?? "";
		if (element.getAttribute(name) !== value) element.setAttribute(name, value);
	}
}
//#endregion
export { ColumnReconciler };

//# sourceMappingURL=ColumnReconciler.js.map