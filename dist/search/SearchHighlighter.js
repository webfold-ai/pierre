import { findRangeAtPoint } from "./findRangeAtPoint.js";
//#region src/search/SearchHighlighter.ts
const highlightsByDocument = /* @__PURE__ */ new WeakMap();
function canHitTest(registry) {
	return "highlightsFromPoint" in registry;
}
function isAlreadyRegisteredError(error) {
	return error instanceof Error && error.name === "InvalidModificationError";
}
var SearchHighlighter = class SearchHighlighter {
	highlights;
	static create(document) {
		const view = document.defaultView;
		if (view?.CSS?.highlights == null || typeof view.Highlight !== "function" || typeof view.CSS.registerProperty !== "function") return;
		let highlights = highlightsByDocument.get(document);
		if (highlights == null) {
			for (const name of [
				"--diffs-search-match-color",
				"--diffs-search-current-color",
				"--diffs-search-text-color"
			]) try {
				view.CSS.registerProperty({
					name,
					syntax: "<color>",
					inherits: true,
					initialValue: "transparent"
				});
			} catch (error) {
				if (!isAlreadyRegisteredError(error)) throw error;
			}
			highlights = {
				match: new view.Highlight(),
				current: new view.Highlight()
			};
			highlights.current.priority = 1;
			view.CSS.highlights.set("diffs-search-match", highlights.match);
			view.CSS.highlights.set("diffs-search-current", highlights.current);
			highlightsByDocument.set(document, highlights);
		}
		return new SearchHighlighter(highlights);
	}
	static getLineNumber(row) {
		return Number(row.dataset.line);
	}
	static getLineSide(row) {
		return row.dataset.lineType === "change-deletion" || row.closest("[data-deletions]") != null ? "deletions" : "additions";
	}
	ranges = [];
	markedButtons = [];
	currentRange;
	constructor(highlights) {
		this.highlights = highlights;
	}
	clear() {
		const { ranges, markedButtons } = this;
		for (const button of markedButtons) button.removeAttribute("data-search-match");
		markedButtons.length = 0;
		for (const { range, highlight } of ranges) highlight.delete(range);
		ranges.length = 0;
		this.currentRange = void 0;
	}
	/** The painted range of the current match, while one is mounted. */
	get currentMatchRange() {
		return this.currentRange;
	}
	getMatchStartAtPoint(row, clientX, clientY) {
		const { ranges, highlights } = this;
		const registry = row.ownerDocument.defaultView?.CSS.highlights;
		if (registry == null || !canHitTest(registry)) return findRangeAtPoint(ranges, row, clientX, clientY)?.startCharacter;
		const root = row.getRootNode();
		const hits = registry.highlightsFromPoint(clientX, clientY, { shadowRoots: root instanceof ShadowRoot ? [root] : [] });
		for (const { highlight, ranges: hitRanges } of hits) {
			if (highlight !== highlights.match && highlight !== highlights.current) continue;
			for (const hitRange of hitRanges) {
				const entry = ranges.find((painted) => painted.range === hitRange && painted.row === row);
				if (entry != null) return entry.startCharacter;
			}
		}
	}
	paint(root, getMatches) {
		for (const row of root.querySelectorAll("[data-line][data-line-type]")) {
			const lineMatches = getMatches(SearchHighlighter.getLineNumber(row), SearchHighlighter.getLineSide(row));
			if (lineMatches != null) this.paintLine(row, lineMatches);
		}
	}
	paintLine(row, matches) {
		const { highlights, ranges } = this;
		const document = row.ownerDocument;
		const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
		let offset = 0;
		let index = 0;
		let range;
		let node;
		while ((node = walker.nextNode()) != null && index < matches.length) {
			const end = offset + (node.textContent?.length ?? 0);
			while (index < matches.length) {
				const match = matches[index];
				if (match.startCharacter >= end) break;
				if (range == null) {
					range = document.createRange();
					range.setStart(node, match.startCharacter - offset);
				}
				if (match.endCharacter > end) break;
				range.setEnd(node, match.endCharacter - offset);
				const highlight = match.current ? highlights.current : highlights.match;
				highlight.add(range);
				ranges.push({
					range,
					highlight,
					row,
					startCharacter: match.startCharacter
				});
				if (match.current) this.currentRange ??= range;
				range = void 0;
				index++;
			}
			offset = end;
		}
		if (index < matches.length) {
			const button = row.querySelector("[data-expand-line]");
			if (button == null) return;
			const { current } = matches[index];
			button.setAttribute("data-search-match", current ? "current" : "");
			this.markedButtons.push(button);
			if (current) {
				const buttonRange = document.createRange();
				buttonRange.selectNode(button);
				this.currentRange ??= buttonRange;
			}
		}
	}
};
//#endregion
export { SearchHighlighter };

//# sourceMappingURL=SearchHighlighter.js.map