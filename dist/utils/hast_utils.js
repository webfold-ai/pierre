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
function createIconElement({ name, width = 16, height = 16, properties }) {
	return createHastElement({
		tagName: "svg",
		properties: {
			width,
			height,
			viewBox: "0 0 16 16",
			...properties
		},
		children: [createHastElement({
			tagName: "use",
			properties: { href: `#${name.replace(/^#/, "")}` }
		})]
	});
}
function findCodeElement(nodes) {
	let firstChild = nodes.children[0];
	while (firstChild != null) {
		if (firstChild.type === "element" && firstChild.tagName === "code") return firstChild;
		if ("children" in firstChild) firstChild = firstChild.children[0];
		else firstChild = null;
	}
}
function createGutterWrapper(children) {
	return createHastElement({
		tagName: "div",
		properties: { "data-gutter": "" },
		children
	});
}
function createGutterItem(lineType, lineNumber, lineIndex, properties = {}) {
	return createHastElement({
		tagName: "div",
		properties: {
			"data-line-type": lineType,
			"data-column-number": lineNumber,
			"data-line-index": lineIndex,
			...properties
		},
		children: lineNumber != null ? [createHastElement({
			tagName: "span",
			properties: { "data-line-number-content": "" },
			children: [createTextNodeElement(`${lineNumber}`)]
		})] : void 0
	});
}
function createGutterGap(type, bufferType, size) {
	return createHastElement({
		tagName: "div",
		properties: {
			"data-gutter-buffer": bufferType,
			"data-buffer-size": size,
			"data-line-type": bufferType === "annotation" ? void 0 : type,
			style: bufferType === "annotation" ? `grid-row: span ${size};` : `grid-row: span ${size};min-height:calc(${size} * 1lh);`
		}
	});
}
function createTokenRow(tokens) {
	return createHastElement({
		tagName: "div",
		children: tokens.map(([char, color, text]) => {
			if (char === 0 && color === "") return text === "" ? createHastElement({ tagName: "br" }) : createTextNodeElement(text);
			return createHastElement({
				tagName: "span",
				properties: {
					"data-char": char,
					style: `color:${color};`
				},
				children: [createTextNodeElement(text)]
			});
		})
	});
}
function createPlainRow(lineText) {
	return createHastElement({
		tagName: "div",
		children: lineText === "" ? [createHastElement({ tagName: "br" })] : [createHastElement({
			tagName: "span",
			properties: { "data-char": 0 },
			children: [createTextNodeElement(lineText)]
		})]
	});
}
//#endregion
export { createGutterGap, createGutterItem, createGutterWrapper, createHastElement, createIconElement, createPlainRow, createTextNodeElement, createTokenRow, findCodeElement };

//# sourceMappingURL=hast_utils.js.map