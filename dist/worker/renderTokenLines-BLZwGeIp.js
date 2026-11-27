//#region src/constants.ts
const DEFAULT_THEMES = {
	dark: "pierre-dark",
	light: "pierre-light"
};
Object.freeze({
	fromStart: 0,
	fromEnd: 0
});
Object.freeze([]);
//#endregion
//#region src/highlighter/languages/constants.ts
const ResolvedLanguages = /* @__PURE__ */ new Map();
const ResolvingLanguages = /* @__PURE__ */ new Map();
const RegisteredCustomLanguages = /* @__PURE__ */ new Map();
const RegisteredHighlightsLanguages = /* @__PURE__ */ new Map();
const ResolvedHighlightsLanguages = /* @__PURE__ */ new Map();
const AttachedLanguages = /* @__PURE__ */ new Set();
//#endregion
//#region src/highlighter/highlighterType.ts
let activeType;
let holds = 0;
var HighlighterDisposedError = class extends Error {
	constructor() {
		super("Highlighter is disposed");
		this.name = "HighlighterDisposedError";
	}
};
function resolveHighlighterType(type) {
	return type ?? activeType ?? "shiki-js";
}
function assertHighlighterType(type) {
	if (activeType != null && activeType !== type) throw new Error(`Cannot load the "${type}" highlighter while "${activeType}" is in use. Only one highlighter type can be active at a time; dispose every "${activeType}" instance (disposeHighlighter() disposes the shared one) before switching.`);
}
function acquireHighlighterType(type) {
	assertHighlighterType(type);
	activeType = type;
	holds++;
}
function releaseHighlighterType() {
	holds--;
	if (holds === 0) activeType = void 0;
}
//#endregion
//#region src/utils/appendItems.ts
function appendItems(target, items) {
	for (const item of items) target.push(item);
}
//#endregion
//#region src/utils/DecoratedLineBuilder.ts
/**
* Builds the children of one line element and wraps each decorated range in
* a <span> with that decoration's attributes.
*
* Add the line's text from left to right. Before adding text at a column,
* call `moveTo(column)`, then add the text to `parent`. Text must be split at
* `nextEdge`. After the last text, call `moveTo` with the line length.
*/
var DecoratedLineBuilder = class {
	/** The element that text at the current column should be added to. */
	parent;
	/**
	* The column where the next decoration starts or ends, or the line length
	* when there are no more. It is never Infinity, because that makes the
	* callers' text loops noticeably slower.
	*/
	nextEdge;
	#line;
	#lineLength;
	#boundaries = [];
	#boundaryIndex = 0;
	#active = [];
	#stack = [];
	constructor(line, spans, lineIndex, lineLength) {
		this.parent = this.#line = line;
		this.#lineLength = lineLength;
		if (spans.length > 1) spans.sort((a, b) => {
			if (a.start.line !== b.start.line) return a.start.line - b.start.line;
			if (a.start.character !== b.start.character) return a.start.character - b.start.character;
			if (a.end.line !== b.end.line) return b.end.line - a.end.line;
			return b.end.character - a.end.character;
		});
		const boundaries = this.#boundaries;
		for (let order = 0; order < spans.length; order++) {
			const decoration = spans[order];
			const range = {
				decoration,
				order,
				from: decoration.start.line === lineIndex ? decoration.start.character : 0,
				to: decoration.end.line === lineIndex ? decoration.end.character : lineLength
			};
			boundaries.push({
				position: Math.max(0, Math.min(range.from, lineLength)),
				range,
				start: true
			}, {
				position: Math.max(0, Math.min(range.to, lineLength)),
				range,
				start: false
			});
		}
		boundaries.sort((a, b) => a.position - b.position);
		this.nextEdge = boundaries[0]?.position ?? lineLength;
	}
	/** Opens and closes decorations for text that starts at `column`. */
	moveTo(column) {
		if (this.nextEdge === column && this.#boundaryIndex < this.#boundaries.length) this.#advance(column);
	}
	#advance(position) {
		const boundaries = this.#boundaries;
		const lineLength = this.#lineLength;
		const first = this.#boundaryIndex;
		let boundaryIndex = first;
		while (boundaries[boundaryIndex]?.position === position) boundaryIndex++;
		this.#boundaryIndex = boundaryIndex;
		this.nextEdge = boundaries[boundaryIndex]?.position ?? this.#lineLength;
		let hasMarker = false;
		for (let i = first; i < boundaryIndex; i++) {
			const { range, start } = boundaries[i];
			if (!start && range.from !== range.to && position < lineLength) this.#updateActive(range, false);
		}
		for (let i = first; i < boundaryIndex; i++) {
			const { range, start } = boundaries[i];
			if (start && range.from <= position && range.to >= position && (range.to > position || range.from === position || position === lineLength)) {
				this.#updateActive(range, true);
				if (range.from === range.to) hasMarker = true;
			}
		}
		if (hasMarker) {
			this.#getParent();
			for (let i = first; i < boundaryIndex; i++) {
				const { range, start } = boundaries[i];
				if (start && range.from === range.to) this.#updateActive(range, false);
			}
		}
		if (position < lineLength) this.parent = this.#getParent();
	}
	#updateActive(range, add) {
		const active = this.#active;
		let low = 0;
		let high = active.length;
		while (low < high) {
			const middle = low + high >>> 1;
			if (active[middle].order < range.order) low = middle + 1;
			else high = middle;
		}
		if (add) active.splice(low, 0, range);
		else if (active[low] === range) active.splice(low, 1);
	}
	#getParent() {
		const stack = this.#stack;
		let parent = this.#line;
		let depth = 0;
		for (const range of this.#active) {
			if (stack[depth]?.range !== range) {
				stack.length = depth;
				const wrapper = {
					type: "element",
					tagName: "span",
					properties: { ...range.decoration.properties },
					children: []
				};
				parent.children.push(wrapper);
				stack.push({
					range,
					node: wrapper
				});
			}
			parent = stack[depth++].node;
		}
		stack.length = depth;
		return parent;
	}
};
//#endregion
//#region src/utils/hast_utils.ts
function createTextNodeElement(value) {
	return {
		type: "text",
		value
	};
}
function createHastElement({ tagName, children = [], properties = {} }) {
	return {
		type: "element",
		tagName,
		properties,
		children
	};
}
//#endregion
//#region src/utils/processLine.ts
function processLine(node, line, state) {
	const lineInfo = typeof state.lineInfo === "function" ? state.lineInfo(line) : state.lineInfo[line - 1];
	if (lineInfo == null) {
		const errorMessage = `processLine: line ${line}, contains no state.lineInfo`;
		console.error(errorMessage, {
			node,
			line,
			state
		});
		throw new Error(errorMessage);
	}
	node.tagName = "div";
	node.properties["data-line"] = lineInfo.lineNumber;
	node.properties["data-alt-line"] = lineInfo.altLineNumber;
	node.properties["data-line-type"] = lineInfo.type;
	node.properties["data-line-index"] = lineInfo.lineIndex;
	if (node.children.length === 0) node.children.push(createTextNodeElement("\n"));
	return node;
}
//#endregion
//#region src/utils/setDeferredArrayItem.ts
function setDeferredArrayItem(array, index, create, { retain = true } = {}) {
	let initialized = false;
	let cached;
	Object.defineProperty(array, index, {
		configurable: true,
		enumerable: true,
		get() {
			if (initialized) return cached;
			const value = create();
			if (!retain) return value;
			cached = value;
			initialized = true;
			if (Object.getOwnPropertyDescriptor(array, index)?.configurable === true) Object.defineProperty(array, index, {
				configurable: true,
				enumerable: true,
				writable: true,
				value: cached
			});
			return cached;
		},
		set(value) {
			if (Object.getOwnPropertyDescriptor(array, index)?.configurable === true) Object.defineProperty(array, index, {
				configurable: true,
				enumerable: true,
				writable: true,
				value
			});
			else if (Object.isFrozen(array)) throw new TypeError(`Cannot assign to read only array index '${index}'`);
			else {
				cached = value;
				initialized = true;
			}
		}
	});
}
//#endregion
//#region src/utils/tokenStyle.ts
const htmlStyleCache = /* @__PURE__ */ new WeakMap();
/**
* Returns CSS declarations for a highlighted token. Enable caching only when
* htmlStyle objects are immutable and reused across tokens.
*/
function tokenStyle(token, cacheHtmlStyle = false) {
	const { htmlStyle } = token;
	if (htmlStyle != null) {
		let style = cacheHtmlStyle ? htmlStyleCache.get(htmlStyle) : void 0;
		if (style == null) {
			style = "";
			for (const name in htmlStyle) style += `${style === "" ? "" : ";"}${name}:${htmlStyle[name]}`;
			if (cacheHtmlStyle) htmlStyleCache.set(htmlStyle, style);
		}
		return style;
	}
	let style = token.color != null ? `color:${token.color}` : "";
	if (token.bgColor != null) style += `;background-color:${token.bgColor}`;
	if (token.fontStyle != null) {
		if ((token.fontStyle & 1) !== 0) style += ";font-style:italic";
		if ((token.fontStyle & 2) !== 0) style += ";font-weight:bold";
		const underline = (token.fontStyle & 4) !== 0;
		const strikethrough = (token.fontStyle & 8) !== 0;
		if (underline || strikethrough) style += `;text-decoration:${underline ? "underline" : ""}${underline && strikethrough ? " " : ""}${strikethrough ? "line-through" : ""}`;
	}
	return style.replace(/^;/, "");
}
//#endregion
//#region src/utils/wrapTokenFragments.ts
const NO_TOKEN = Symbol("no-token");
const MULTIPLE_TOKENS = Symbol("multiple-tokens");
function wrapTokenFragments(container) {
	const ownTokenChar = getTokenChar(container);
	if (ownTokenChar != null) return ownTokenChar;
	let containerTokenState = NO_TOKEN;
	const wrappedChildren = [];
	let currentTokenChildren = [];
	let currentTokenChar;
	const flushTokenChildren = () => {
		if (currentTokenChildren.length === 0 || currentTokenChar == null) {
			currentTokenChildren = [];
			currentTokenChar = void 0;
			return;
		}
		if (currentTokenChildren.length === 1) {
			const child = currentTokenChildren[0];
			if (child?.type === "element") {
				setTokenChar(child, currentTokenChar);
				for (const grandChild of child.children) stripTokenChar(grandChild);
			} else stripTokenChar(child);
			wrappedChildren.push(child);
			currentTokenChildren = [];
			currentTokenChar = void 0;
			return;
		}
		for (const child of currentTokenChildren) stripTokenChar(child);
		wrappedChildren.push(createHastElement({
			tagName: "span",
			properties: { "data-char": currentTokenChar },
			children: currentTokenChildren
		}));
		currentTokenChildren = [];
		currentTokenChar = void 0;
	};
	const mergeContainerTokenState = (childTokenState) => {
		if (childTokenState === NO_TOKEN) return;
		if (childTokenState === MULTIPLE_TOKENS) {
			containerTokenState = MULTIPLE_TOKENS;
			return;
		}
		if (containerTokenState === NO_TOKEN) {
			containerTokenState = childTokenState;
			return;
		}
		if (containerTokenState !== childTokenState) containerTokenState = MULTIPLE_TOKENS;
	};
	for (const child of container.children) {
		const childTokenState = child.type === "element" ? wrapTokenFragments(child) : NO_TOKEN;
		mergeContainerTokenState(childTokenState);
		if (typeof childTokenState !== "number") {
			flushTokenChildren();
			wrappedChildren.push(child);
			continue;
		}
		if (currentTokenChar != null && currentTokenChar !== childTokenState) flushTokenChildren();
		currentTokenChar ??= childTokenState;
		currentTokenChildren.push(child);
	}
	flushTokenChildren();
	container.children = wrappedChildren;
	return containerTokenState;
}
function getTokenChar(node) {
	const value = node.properties["data-char"];
	if (typeof value === "number") return value;
}
function stripTokenChar(node) {
	if (node.type !== "element") return;
	node.properties["data-char"] = void 0;
	for (const child of node.children) stripTokenChar(child);
}
function setTokenChar(node, char) {
	node.properties["data-char"] = char;
}
//#endregion
//#region src/utils/renderTokenLines.ts
/**
* Converts highlighted tokens to one HAST element per line for custom renderers.
* Callers provide any line separators and enclosing pre/code elements.
*/
function renderTokenLines(lines, { state, lazyLineAST = false, cacheHtmlStyles = false, useTokenTransformer = false, mergeWhitespaces = "always", decorations = [], lineOffsets = [] }) {
	let decorationsByLine;
	for (const decoration of decorations) {
		const byLine = decorationsByLine ??= /* @__PURE__ */ new Map();
		const normalized = {
			...decoration,
			start: getDecorationPosition(decoration.start, lineOffsets),
			end: getDecorationPosition(decoration.end, lineOffsets)
		};
		const lastLine = Math.min(normalized.end.line, lines.length - 1);
		for (let line = normalized.start.line; line <= lastLine; line++) {
			let spans = byLine.get(line);
			if (spans == null) byLine.set(line, spans = []);
			spans.push(normalized);
		}
	}
	const renderLine = (tokens, lineIndex) => {
		let normalized;
		if (useTokenTransformer || mergeWhitespaces !== "never") {
			let pendingWhitespace = "";
			let whitespaceOffset = 0;
			for (let i = 0; i < tokens.length; i++) {
				let token = tokens[i];
				if (useTokenTransformer) {
					const content = token.content.trim();
					if (content !== "" && content !== token.content) {
						normalized ??= tokens.slice(0, i);
						const start = token.content.indexOf(content);
						if (start > 0) normalized.push({
							content: token.content.slice(0, start),
							offset: token.offset
						});
						normalized.push({
							...token,
							content,
							offset: token.offset + start
						});
						const end = start + content.length;
						if (end < token.content.length) normalized.push({
							content: token.content.slice(end),
							offset: token.offset + end
						});
						continue;
					}
				} else {
					const decoratedWhitespace = ((token.fontStyle ?? 0) & 12) !== 0;
					if (!decoratedWhitespace && /^\s+$/.test(token.content) && i < tokens.length - 1) {
						normalized ??= tokens.slice(0, i);
						if (pendingWhitespace === "") whitespaceOffset = token.offset;
						pendingWhitespace += token.content;
						continue;
					}
					if (pendingWhitespace !== "" && normalized != null) {
						if (decoratedWhitespace) normalized.push({
							content: pendingWhitespace,
							offset: whitespaceOffset
						});
						else token = {
							...token,
							content: pendingWhitespace + token.content,
							offset: whitespaceOffset
						};
						pendingWhitespace = "";
					}
				}
				normalized?.push(token);
			}
		}
		normalized ??= tokens;
		const line = {
			type: "element",
			tagName: state == null ? "span" : "div",
			properties: state == null ? { class: "line" } : {},
			children: []
		};
		const spans = decorationsByLine?.get(lineIndex);
		const column = spans == null ? appendTokens(line, normalized, useTokenTransformer, cacheHtmlStyles) : appendDecoratedTokens(line, normalized, spans, lineIndex, useTokenTransformer, cacheHtmlStyles);
		if (useTokenTransformer && column === 0) line.children.push({
			type: "element",
			tagName: "br",
			properties: {},
			children: []
		});
		if (useTokenTransformer && spans != null) wrapTokenFragments(line);
		return state == null ? line : processLine(line, lineIndex + 1, state);
	};
	if (!lazyLineAST) return lines.map(renderLine);
	const rows = new Array(lines.length);
	for (let index = 0; index < lines.length; index++) {
		const tokens = lines[index];
		setDeferredArrayItem(rows, index, () => renderLine(tokens, index));
	}
	return rows;
}
function appendTokens(line, tokens, useTokenTransformer, cacheHtmlStyles) {
	let column = 0;
	for (const token of tokens) {
		if (token.content === "") continue;
		line.children.push(createTokenSpan(token, tokenStyle(token, cacheHtmlStyles), token.content, column, useTokenTransformer));
		column += token.content.length;
	}
	return column;
}
function appendDecoratedTokens(line, tokens, spans, lineIndex, useTokenTransformer, cacheHtmlStyles) {
	let lineLength = 0;
	for (const token of tokens) lineLength += token.content.length;
	const builder = new DecoratedLineBuilder(line, spans, lineIndex, lineLength);
	let column = 0;
	for (const token of tokens) {
		const { content } = token;
		if (content === "") continue;
		const start = column;
		const end = start + content.length;
		const style = tokenStyle(token, cacheHtmlStyles);
		while (column < end) {
			builder.moveTo(column);
			const to = Math.min(end, builder.nextEdge);
			builder.parent.children.push(createTokenSpan(token, style, column === start && to === end ? content : content.slice(column - start, to - start), start, useTokenTransformer));
			column = to;
		}
	}
	builder.moveTo(column);
	return column;
}
function createTokenSpan(token, style, text, start, useTokenTransformer) {
	const properties = token.htmlAttrs != null ? { ...token.htmlAttrs } : {};
	if (style !== "") properties.style = style;
	if (useTokenTransformer) properties["data-char"] = start;
	return {
		type: "element",
		tagName: "span",
		properties,
		children: [{
			type: "text",
			value: text
		}]
	};
}
function getDecorationPosition(position, lineOffsets) {
	if (typeof position !== "number") return position;
	let low = 0;
	let high = lineOffsets.length;
	while (low + 1 < high) {
		const middle = low + high >>> 1;
		if (lineOffsets[middle] <= position) low = middle;
		else high = middle;
	}
	return {
		line: low,
		character: position - (lineOffsets[low] ?? 0)
	};
}
//#endregion
export { acquireHighlighterType as a, AttachedLanguages as c, ResolvedHighlightsLanguages as d, ResolvedLanguages as f, HighlighterDisposedError as i, RegisteredCustomLanguages as l, DEFAULT_THEMES as m, setDeferredArrayItem as n, releaseHighlighterType as o, ResolvingLanguages as p, appendItems as r, resolveHighlighterType as s, renderTokenLines as t, RegisteredHighlightsLanguages as u };

//# sourceMappingURL=renderTokenLines-BLZwGeIp.js.map