//#region html/mermaid.ts
/**
* Render `mermaid` code blocks as SVG with Pele. An open fence draws its
* complete lines and keeps the last diagram that parsed; with no diagram yet it
* shows nothing. A closed diagram that does not parse shows as a code block.
*/
function createMermaidPlugin(pele, options) {
	const open = /* @__PURE__ */ new Map();
	const draw = (code) => `<div data-markdown="mermaid">${pele.render(code, options).svg}</div>`;
	return { render({ code, isIncomplete }) {
		if (!isIncomplete) try {
			return draw(code);
		} catch {
			return null;
		}
		code = code.slice(0, code.lastIndexOf("\n") + 1);
		let html = open.get(code);
		if (html !== void 0) return html;
		let previous;
		html = "";
		for (const [key, value] of open) if (code.startsWith(key) && key.length >= (previous?.length ?? 0)) {
			previous = key;
			html = value;
		}
		if (previous !== void 0) open.delete(previous);
		if (code.trim() !== "") try {
			html = draw(code);
		} catch {}
		open.set(code, html);
		if (open.size > 16) open.delete(open.keys().next().value);
		return html;
	} };
}
//#endregion
export { createMermaidPlugin };

//# sourceMappingURL=mermaid.js.map