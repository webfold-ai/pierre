"use client";
import { i as defaultUrlTransform, n as createHtmlRenderer, r as noIslands, t as createDomRenderer } from "./dom-BUlZRK7K.js";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
//#region react/react.tsx
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const subscribe = () => () => {};
function IslandPortal({ island, definition }) {
	const element = definition.render(island.data);
	const { fallback } = island;
	const mounted = element !== null;
	useIsomorphicLayoutEffect(() => {
		fallback.toggleAttribute("hidden", mounted);
		return () => {
			fallback.removeAttribute("hidden");
		};
	}, [fallback, mounted]);
	return createPortal(element, island.content);
}
/** React owns the container, and `createDomRenderer` owns its content. */
function Markdown({ children = "", mode = "streaming", isAnimating = false, animated = false, parseIncompleteMarkdown = true, components, plugins, islands, cjk, math, allowedHtml, escapeHtml, controls = true, lineNumbers = true, caret, allowedElements, disallowedElements, unwrapDisallowed, urlTransform, idPrefix, onAnimationStart, onAnimationEnd, ...props }) {
	const id = useId();
	const root = useRef(null);
	const renderer = useRef(void 0);
	const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
	const [mountedIslands, setMountedIslands] = useState(noIslands);
	const options = {
		components,
		plugins,
		islands: useMemo(() => islands === void 0 ? void 0 : Object.fromEntries(Object.entries(islands).map(([name, definition]) => [name, {
			inline: definition.inline,
			fallback: definition.fallback,
			pending: definition.pending,
			accepts: (data) => definition.render(data) !== null
		}])), [islands]),
		cjk,
		math,
		allowedHtml,
		escapeHtml,
		controls,
		lineNumbers,
		allowedElements,
		disallowedElements,
		unwrapDisallowed,
		urlTransform,
		idPrefix: idPrefix ?? `${id}-`
	};
	const active = mode === "streaming" && isAnimating;
	const incomplete = active && parseIncompleteMarkdown;
	const [initial] = useState(() => {
		const initial = createHtmlRenderer(options);
		try {
			return {
				markup: { __html: initial.render(children, incomplete, active).html },
				options,
				formatter: initial
			};
		} finally {
			initial.dispose();
		}
	});
	useIsomorphicLayoutEffect(() => {
		if (root.current === null) return;
		renderer.current ??= createDomRenderer(root.current, initial.options, initial.formatter);
		renderer.current.connect();
		return () => renderer.current?.disconnect();
	}, [initial]);
	useIsomorphicLayoutEffect(() => {
		renderer.current?.configure(options);
		renderer.current?.update(children, incomplete, active, hydrated ? animated : false, caret);
		if (islands !== void 0 || mountedIslands.length !== 0) {
			const next = renderer.current?.getIslands() ?? noIslands;
			if (next !== mountedIslands) setMountedIslands(next);
		}
	});
	const callbacks = useRef({
		onAnimationStart,
		onAnimationEnd
	});
	useEffect(() => {
		callbacks.current = {
			onAnimationStart,
			onAnimationEnd
		};
	}, [onAnimationStart, onAnimationEnd]);
	useEffect(() => {
		if (!active) return;
		callbacks.current.onAnimationStart?.();
		return () => callbacks.current.onAnimationEnd?.();
	}, [active]);
	const container = /* @__PURE__ */ jsx("div", {
		...props,
		ref: root,
		"data-markdown": "root",
		"data-streaming": active || void 0,
		dangerouslySetInnerHTML: initial.markup
	});
	if (mountedIslands.length === 0 || islands === void 0) return container;
	return /* @__PURE__ */ jsxs(Fragment, { children: [container, mountedIslands.map((island) => Object.hasOwn(islands, island.name) ? /* @__PURE__ */ jsx(IslandPortal, {
		island,
		definition: islands[island.name]
	}, island.key) : null)] });
}
//#endregion
export { Markdown, defaultUrlTransform };

//# sourceMappingURL=react.js.map