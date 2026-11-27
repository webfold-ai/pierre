import { DecoratedLineBuilder } from "./DecoratedLineBuilder.js";
import { processLine } from "./processLine.js";
import { setDeferredArrayItem } from "./setDeferredArrayItem.js";
import { tokenStyle } from "./tokenStyle.js";
import { wrapTokenFragments } from "./wrapTokenFragments.js";
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
export { renderTokenLines };

//# sourceMappingURL=renderTokenLines.js.map