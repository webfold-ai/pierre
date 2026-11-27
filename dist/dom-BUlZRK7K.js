import { createHtmlSession } from "@pierre/words";
//#region lib/internal.ts
const delta = Symbol.for("@pierre/words/stream-delta/v1");
const format = Symbol.for("@pierre/words/html-format/v1");
const formatFlags = {
	on: 1,
	numbers: 2,
	copy: 4,
	download: 8,
	active: 16,
	slots: 32,
	rawUrls: 64,
	islands: 128
};
//#endregion
//#region lib/utils.ts
function escapeHtml(value) {
	let result = "";
	let from = 0;
	for (let at = 0; at < value.length; at++) {
		let entity;
		switch (value.charCodeAt(at)) {
			case 34:
				entity = "&quot;";
				break;
			case 38:
				entity = "&amp;";
				break;
			case 39:
				entity = "&#39;";
				break;
			case 60:
				entity = "&lt;";
				break;
			case 62:
				entity = "&gt;";
				break;
			default: continue;
		}
		result += value.slice(from, at) + entity;
		from = at + 1;
	}
	return from === 0 ? value : result + value.slice(from);
}
/** Decode only the entities that Wasm writes. The result is text, not HTML. */
function decodeHtml(value) {
	let result = "";
	let from = 0;
	for (let at = value.indexOf("&"); at !== -1; at = value.indexOf("&", at + 1)) {
		let character;
		let end = at + 3;
		while (end < at + 6 && value.charCodeAt(end) !== 59) end++;
		switch (value.slice(at + 1, end)) {
			case "amp":
				character = "&";
				break;
			case "lt":
				character = "<";
				break;
			case "gt":
				character = ">";
				break;
			case "quot":
				character = "\"";
				break;
			case "#39":
			case "#x27":
				character = "'";
				break;
			default: continue;
		}
		result += value.slice(from, at) + character;
		from = end + 1;
	}
	return from === 0 ? value : result + value.slice(from);
}
/**
* Return `url` if it is relative or uses http, https, mailto, tel, or a scheme
* the parser autolinks (ftp, xmpp). Reject network paths.
*/
function defaultUrlTransform(url) {
	let normalized = "";
	let from = 0;
	for (let at = 0; at < url.length; at++) {
		const code = url.charCodeAt(at);
		if (code <= 32 || code >= 127 && code <= 159) {
			normalized += url.slice(from, at);
			from = at + 1;
		}
	}
	normalized = from === 0 ? url : normalized + url.slice(from);
	const second = normalized.charCodeAt(1);
	if (normalized.charCodeAt(0) === 92 || normalized.charCodeAt(0) === 47 && (second === 47 || second === 92)) return void 0;
	let colon = -1;
	scheme: for (let at = 0; at < normalized.length; at++) switch (normalized.charCodeAt(at)) {
		case 35:
		case 47:
		case 63: break scheme;
		case 58: colon = at;
	}
	if (colon >= 0) switch (normalized.slice(0, colon).toLowerCase()) {
		case "http":
		case "https":
		case "ftp":
		case "mailto":
		case "tel":
		case "xmpp": break;
		default: return;
	}
	return url;
}
/** Whether a character code continues a tag name, as `\w` does. */
const isNameCode = (code) => code >= 48 && code <= 57 || code >= 65 && code <= 90 || code === 95 || code >= 97 && code <= 122;
/** Find the first changed range: native string compares first, then the short tail. */
function unchangedEnd(a, b, start, end) {
	let step = end - start;
	while (step > 32) if (a.slice(start, start + step) === b.slice(start, start + step)) {
		start += step;
		step = end - start;
	} else step = Math.floor(step / 2);
	while (start < end && a.charCodeAt(start) === b.charCodeAt(start)) start++;
	return start;
}
//#endregion
//#region html/islands.ts
const islandSelector = "[data-words-island]";
const islandHostStart = " data-words-island=\"";
function readIslandData(code) {
	let data;
	try {
		data = JSON.parse(code);
	} catch {
		return;
	}
	if (data !== null && typeof data === "object" && Object.hasOwn(data, "id") && "id" in data && typeof data.id === "string" && data.id.trim() !== "") return data;
}
function islandFor(islands, language) {
	if (islands === void 0 || !language.startsWith("island-")) return;
	const name = language.slice(7);
	return Object.hasOwn(islands, name) ? islands[name] : void 0;
}
/** Show an app-defined placeholder without reading the incomplete fence payload. */
function formatIslandPending(pending, tag = "div") {
	if (pending === void 0 || pending === "") return "";
	const open = `<${tag} data-markdown="island-pending"`;
	if (typeof pending === "string") return open + " role=\"status\">" + escapeHtml(pending) + `</${tag}>`;
	const accessibility = pending.label ? " role=\"status\" aria-label=\"" + escapeHtml(pending.label) + "\"" : " aria-hidden=\"true\"";
	return open + " class=\"" + escapeHtml(pending.className) + "\"" + accessibility + `></${tag}>`;
}
/** Serialize the host for an accepted island, or keep the fence as code. */
function formatIsland(island, language, code) {
	const name = language.slice(7);
	const data = readIslandData(code);
	if (data === void 0 || !island.accepts(data)) return;
	return islandHost("div", name, JSON.stringify(data.id), code, island.fallback ?? "Interactive content");
}
/** Serialize the same portal and fallback nodes for server and client rendering. */
function islandHost(tag, name, key, code, fallback) {
	return "<" + tag + islandHostStart + escapeHtml(name) + "\" data-words-island-id=\"" + escapeHtml(key) + "\" data-words-island-data=\"" + escapeHtml(code) + `"><${tag} data-words-island-content></${tag}><${tag} data-words-island-fallback>` + escapeHtml(fallback) + `</${tag}></${tag}>`;
}
/** Pack the registry once so ordinary colons stay on the parser's literal path. */
function inlineIslandNames(islands) {
	let packed = "";
	for (const [name, definition] of Object.entries(islands ?? {})) {
		if (definition.inline !== true) continue;
		if (name.length > 255 || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) throw new TypeError(`Invalid inline island name: ${name}`);
		packed += String.fromCharCode(name.length) + name;
	}
	return packed;
}
const punctuationEscape = /\\([!-/:-@[-`{-~])/g;
const attribute = /[ \t]*([A-Za-z_][\w-]*)(?:[ \t]*=[ \t]*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|((?:\\.|[^\s"'={}`\\])+)))?(?=[ \t]|$)/y;
/** Expand only opaque spans identified by the inline parser. Labels are plain text. */
function formatInlineIslands(html, islands) {
	return html.replace(/<w-i ([lp])="([^"]*)">([^<]*)<\/w-i>/g, (_, kind, head, attrs) => {
		const open = head.indexOf("[");
		const name = head.slice(1, open);
		const raw = head + attrs;
		if (!Object.hasOwn(islands, name) || islands[name].inline !== true) return raw;
		const island = islands[name];
		if (kind === "p") return formatIslandPending(island.pending, "span");
		const label = decodeHtml(head.slice(open + 1, -1)).replace(punctuationEscape, "$1");
		const fields = Object.create(null);
		const body = decodeHtml(attrs.slice(1, -1)).trim();
		let at = 0;
		while (at < body.length) {
			attribute.lastIndex = at;
			const match = attribute.exec(body);
			if (match === null || match[1] === "label" || Object.hasOwn(fields, match[1])) return raw;
			fields[match[1]] = (match[2] ?? match[3] ?? match[4] ?? "").replace(punctuationEscape, "$1");
			at = attribute.lastIndex;
		}
		if (fields.id?.trim() === "") return raw;
		const id = fields.id ?? JSON.stringify([
			name,
			label,
			fields
		]);
		const data = {
			...fields,
			label,
			id
		};
		if (!island.accepts(data)) return raw;
		return islandHost("span", name, fields.id === void 0 ? id : JSON.stringify(id), JSON.stringify(data), island.fallback ?? label);
	});
}
const noIslands = [];
function isIsland(node) {
	return node?.nodeType === 1 && node.hasAttribute("data-words-island");
}
/** Collect hosts only from the top-level siblings just patched into the document. */
function appendIslandHosts(hosts, first, end) {
	for (let node = first; node !== end && node !== null; node = node.nextSibling) {
		if (node.nodeType !== 1) continue;
		if (isIsland(node)) {
			hosts.push(node);
			continue;
		}
		const nested = node.querySelectorAll(islandSelector);
		for (const host of nested) hosts.push(host);
	}
}
/** Resolve hosts in document order and move portal targets only if an island moved. */
function collectIslands(root, hosts, previous) {
	const next = [];
	const old = new Map(previous.map((island) => [island.key, island]));
	const seen = /* @__PURE__ */ new Set();
	const occurrences = /* @__PURE__ */ new Map();
	const enclosingIsland = root.closest(islandSelector);
	for (const host of hosts) {
		if (host.parentElement?.closest(islandSelector) !== enclosingIsland) continue;
		if (host.closest("[data-markdown=\"root\"]") !== root) continue;
		const name = host.dataset.wordsIsland;
		let key = host.dataset.wordsIslandId;
		if (key?.startsWith("[") === true) {
			const count = occurrences.get(key) ?? 0;
			occurrences.set(key, count + 1);
			key += ":" + count;
		}
		const source = host.dataset.wordsIslandData;
		if (key === void 0 || source === void 0 || seen.has(key)) continue;
		let content = host.firstElementChild;
		const fallback = host.lastElementChild;
		if (content?.hasAttribute("data-words-island-content") !== true || fallback?.hasAttribute("data-words-island-fallback") !== true) continue;
		const existing = old.get(key);
		const prior = existing?.name === name && existing.content.tagName === content.tagName ? existing : void 0;
		const data = source === prior?.source ? prior.data : readIslandData(source);
		if (data === void 0) continue;
		seen.add(key);
		if (prior !== void 0 && prior.content !== content) {
			prior.content.replaceWith(content.cloneNode(false));
			content.replaceWith(prior.content);
			content = prior.content;
		}
		next.push(prior !== void 0 && prior.source === source && prior.fallback === fallback ? prior : {
			key,
			name,
			data,
			content,
			fallback,
			source
		});
	}
	return next.length === previous.length && next.every((entry, at) => entry === previous[at]) ? previous : next;
}
//#endregion
//#region html/render.ts
const lineGroup = "<span data-markdown=\"code-lines\">";
const paragraphStart = "<p data-markdown=\"p\">";
const codeEnd = "</code></pre></div>";
const codeBlockOpen = "<div data-markdown=\"code-block\"";
/**
* Wrap code in groups of 64 lines, so the browser lays out only the last group
* when a streamed line changes. Each LF stays inside its group, so `textContent`
* does not change. An LF inside an element never splits a group.
*/
function groupLines(body) {
	let result = "";
	let start = 0;
	let lines = 0;
	let depth = 0;
	let tag = body.indexOf("<");
	for (let at = body.indexOf("\n"); at !== -1; at = body.indexOf("\n", at + 1)) {
		for (; tag !== -1 && tag < at; tag = body.indexOf("<", tag + 1)) if (body.charCodeAt(tag + 1) === 47) depth--;
		else if (body.charCodeAt(body.indexOf(">", tag) - 1) !== 47) depth++;
		if (++lines >= 64 && depth === 0) {
			result += lineGroup + body.slice(start, at + 1) + "</span>";
			start = at + 1;
			lines = 0;
		}
	}
	return result === "" || start < body.length ? result + lineGroup + body.slice(start) + "</span>" : result;
}
/** The gutter of an open fence, in the same 64-line groups as the code. Wasm writes it for other blocks. */
function lineNumbers(count) {
	let html = "<span data-markdown=\"line-numbers\" aria-hidden=\"true\">";
	for (let line = 1; line <= count; line += 64) {
		html += lineGroup + line;
		for (let next = line + 1; next < line + 64 && next <= count; next++) html += "\n" + next;
		html += (line + 64 <= count ? "\n" : "") + "</span>";
	}
	return html + "</span>";
}
/** Whether a filter or hook can rewrite formatted HTML, so output cannot be extended in place. */
const rewritesElements = (options) => options.allowedElements !== void 0 || options.disallowedElements !== void 0 || options.components !== void 0 && Object.values(options.components).some((hook) => hook !== void 0);
/** The code buttons as bits: 1 for copy, 2 for download. Equal inline option objects give equal bits. */
const controlFlags = (controls) => {
	const code = typeof controls === "object" ? controls.code : controls;
	return code === false ? 0 : typeof code === "object" ? (code.copy === false ? 0 : 1) | (code.download === false ? 0 : 2) : 3;
};
/** Hooks can come from untyped code, and a non-string would print as text. */
function hookHtml(html) {
	if (typeof html !== "string") throw new TypeError("HTML hooks must return strings");
	return html;
}
/** The plugin that renders code blocks of `language`, if any. */
const rendererFor = (plugins, language) => (language === "mermaid" ? plugins?.mermaid : void 0) ?? plugins?.renderers?.find((renderer) => typeof renderer.language === "string" ? renderer.language === language : renderer.language.includes(language));
const voidTags = /* @__PURE__ */ new Set([
	"br",
	"hr",
	"img",
	"input"
]);
/**
* Whether the formatted tag in [at, end) has no closing tag: an HTML void tag
* or a self-closing SVG tag. Every formatted tag has an attribute after its name.
*/
const isVoidAt = (html, at, end) => html.charCodeAt(end - 2) === 47 || html.startsWith("br ", at + 1) || html.startsWith("hr ", at + 1) || html.startsWith("img ", at + 1) || html.startsWith("input ", at + 1);
/**
* The start of the open fence in session HTML, or -1. A code block in slots
* starts with a NUL and its state, which is not "0" for the open fence, and
* has five NULs.
*/
function openFence(html, from) {
	let start = html.indexOf("\0", from);
	while (start !== -1 && html.charCodeAt(start + 1) === 48) {
		for (let slot = 0; slot < 4; slot++) start = html.indexOf("\0", start + 1);
		start = html.indexOf("\0", start + 1);
	}
	return start;
}
/**
* Run `transform` on each `tag` element, without a syntax tree. Inner elements
* run first, and each element runs once.
*/
function mapElements(html, tag, transform) {
	const expression = new RegExp(`<(/?)${tag}(?=[ />])[^>]*>`, "g");
	const voidTag = voidTags.has(tag);
	const open = [];
	let result = "";
	let cursor = 0;
	for (let match = expression.exec(html); match !== null; match = expression.exec(html)) {
		let piece = html.slice(cursor, match.index);
		cursor = expression.lastIndex;
		const isVoid = voidTag || match[0].endsWith("/>");
		if (match[1] === "" && !isVoid) {
			if (open.length === 0) result += piece;
			else open[open.length - 1] += piece;
			open.push(match[0]);
			continue;
		}
		if (match[1] !== "" && (isVoid || open.length === 0)) piece += match[0];
		else {
			const replacement = hookHtml(transform(match[1] === "" ? match[0] : open.pop() + piece + match[0]));
			piece = match[1] === "" ? piece + replacement : replacement;
		}
		if (open.length === 0) result += piece;
		else open[open.length - 1] += piece;
	}
	return result + open.join("") + html.slice(cursor);
}
/**
* Run the URL hook on each link and image of formatted HTML. With a hook,
* Wasm leaves these URLs unchecked and footnote links without the id prefix.
*/
function transformUrls(html, options) {
	let result = "";
	let from = 0;
	for (let at = html.indexOf("<"), end = 0; at !== -1; at = html.indexOf("<", end)) {
		end = at + 1;
		const first = html.charCodeAt(end);
		const image = first === 105 && html.startsWith("img data-markdown=\"img\" src=\"", end);
		if (!image && (first !== 97 || !html.startsWith("a data-markdown=\"a\" href=\"", end))) continue;
		const key = image ? "src" : "href";
		const start = end + (image ? 29 : 26);
		const close = html.indexOf("\"", start);
		end = html.indexOf(">", close) + 1;
		const transformed = options.urlTransform(decodeHtml(html.slice(start, close)), key);
		let url = transformed == null ? "" : defaultUrlTransform(transformed) ?? "";
		if (url === "" && transformed !== "") {
			result += html.slice(from, image ? at : start - 7);
			from = image ? end : close + 1;
			continue;
		}
		if (!image && url.startsWith("#")) {
			const rest = html.slice(close, end);
			const note = rest.indexOf("\" data-footnote-");
			if (note === 0 || note > 0 && rest.charCodeAt(note - 1) !== 61) url = "#" + (options.idPrefix ?? "") + url.slice(1);
		}
		result += html.slice(from, start) + escapeHtml(url);
		from = close;
	}
	return from === 0 ? html : result + html.slice(from);
}
/** Format session output with HTML options. Keeps at most one live highlighter. */
function createHtmlRenderer(options = {}) {
	let parser = createHtmlSession();
	let inlineNames = inlineIslandNames(options.islands);
	let sawInlineIsland = false;
	let stable = "";
	let stableRaw = "";
	let nextCode = 0;
	let live;
	let liveUses = 0;
	let previousUpdate;
	let result;
	let revision = 0;
	let pendingRaw = "";
	let pendingSlots = false;
	let pendingSource;
	let pendingInput;
	let pendingActive = false;
	let partial = false;
	let pendingPartial = false;
	let pendingCode = -1;
	let pendingHtml = "";
	let pendingParagraph;
	let pendingFence;
	let closedSlots = false;
	let pendingFences = [];
	let codeCache = /* @__PURE__ */ new Map();
	let oldCodeCache = /* @__PURE__ */ new Map();
	let fenceKey = 0;
	let fence;
	const dispose = () => {
		const session = live?.session;
		live = void 0;
		session?.dispose();
	};
	/** Drop all state after an option change or a hook error. */
	const resetState = () => {
		dispose();
		parser = createHtmlSession();
		sawInlineIsland = false;
		stable = "";
		stableRaw = "";
		nextCode = 0;
		previousUpdate = void 0;
		result = void 0;
		pendingInput = void 0;
		pendingSource = void 0;
		pendingHtml = "";
		pendingParagraph = void 0;
		pendingActive = false;
		pendingPartial = false;
		pendingCode = -1;
		pendingFence = void 0;
		pendingFences = [];
		codeCache = /* @__PURE__ */ new Map();
		oldCodeCache = /* @__PURE__ */ new Map();
		fence = void 0;
	};
	/**
	* Run the host-only steps on session HTML: element filters, the URL hook,
	* code plugins, and element hooks. Code blocks for a plugin or filter, and
	* the open fence of an active stream, come in slots, each after a NUL: the
	* state ("0" closed, "1" open fence, "2" open fence of an active stream) and
	* language, the markup before `<code>`, the `<code>` tag, and the escaped
	* code. An open fence has no gutter yet. Without `slots` there is no such
	* block, so the search is skipped.
	*/
	const format$1 = (input, firstCode, fences, slots = true) => {
		const { allowedElements, disallowedElements } = options;
		if (allowedElements !== void 0 && disallowedElements !== void 0) throw new Error("Use either allowedElements or disallowedElements");
		const filtered = allowedElements !== void 0 || disallowedElements !== void 0;
		const excluded = (tag) => allowedElements !== void 0 ? !allowedElements.includes(tag) : disallowedElements.includes(tag);
		if (rewritesElements(options)) fences = void 0;
		let dropped = 0;
		/** Apply the element filters, then the URL hook, to HTML between code blocks. */
		const pass = (html) => {
			if (sawInlineIsland && options.islands !== void 0) html = formatInlineIslands(html, options.islands);
			if (filtered) {
				let result = "";
				let from = 0;
				for (let at = html.indexOf("<"), end = 0; at !== -1; at = html.indexOf("<", end)) {
					const closing = html.charCodeAt(at + 1) === 47;
					end = html.indexOf(">", at) + 1;
					if (dropped > 0) {
						if (!closing) dropped += isVoidAt(html, at, end) ? 0 : 1;
						else if (--dropped === 0) from = end;
						continue;
					}
					let space = at + (closing ? 2 : 1);
					for (let code = html.charCodeAt(space); code !== 32 && code !== 62; code = html.charCodeAt(++space));
					const tag = html.slice(at + (closing ? 2 : 1), space);
					if (!excluded(tag)) continue;
					if (closing && options.unwrapDisallowed !== true) continue;
					result += html.slice(from, at);
					from = end;
					if (options.unwrapDisallowed !== true && !voidTags.has(tag) && html.charCodeAt(end - 2) !== 47) dropped = 1;
				}
				html = dropped > 0 ? result : result + html.slice(from);
			}
			return options.urlTransform === void 0 ? html : transformUrls(html, options);
		};
		let html = "";
		let index = firstCode;
		let cursor = 0;
		for (let at = slots ? input.indexOf("\0") : -1; at !== -1; at = input.indexOf("\0", cursor)) {
			const open = input.indexOf("\0", at + 2);
			const tag = input.indexOf("\0", open + 1);
			const body = input.indexOf("\0", tag + 1);
			const end = input.indexOf("\0", body + 1);
			html += pass(input.slice(cursor, at));
			cursor = end + 1 + 19;
			if (dropped > 0) continue;
			const content = input.slice(body + 1, end);
			if (filtered && (excluded("pre") || excluded("code"))) {
				html += pass(`<pre data-markdown="pre"${input.charCodeAt(at + 1) === 48 ? "" : " data-markdown-incomplete"}>${input.slice(tag + 1, body)}${content}</code></pre>`);
				continue;
			}
			const isIncomplete = input.charCodeAt(at + 1) === 50;
			const space = input.indexOf(" ", at + 2);
			const split = space === -1 || space > open ? open : space;
			const language = split === at + 2 ? "text" : decodeHtml(input.slice(at + 2, split));
			const meta = split === open ? "" : decodeHtml(input.slice(split + 1, open));
			const number = index++;
			const island = filtered && excluded("div") ? void 0 : islandFor(options.islands, language);
			if (island !== void 0) {
				if (isIncomplete) {
					html += formatIslandPending(island.pending);
					continue;
				}
				if (input.charCodeAt(at + 1) === 48) {
					const block = formatIsland(island, language, decodeHtml(content));
					if (block !== void 0) {
						html += block;
						fences?.push(cursor, html.length, index);
						continue;
					}
				}
			}
			const custom = rendererFor(options.plugins, language);
			if (custom !== void 0) {
				let code = decodeHtml(content);
				if (isIncomplete && partial) code = code.slice(0, -1);
				const key = "\0" + language + "\0" + meta + "\0" + code;
				let block = isIncomplete ? void 0 : codeCache.has(key) ? codeCache.get(key) : oldCodeCache.get(key);
				if (block === void 0) block = custom.render({
					code,
					language,
					meta,
					isIncomplete
				});
				if (!isIncomplete) codeCache.set(key, block);
				if (block !== null) {
					block = hookHtml(block);
					if (block !== "" && (custom === options.plugins?.mermaid || custom.frame === true)) {
						const start = open + 1 + 31;
						const pre = input.indexOf("<pre", start);
						if (pre !== -1 && pre < tag) block = `${codeBlockOpen}${isIncomplete ? "" : ` data-code="${content}"`}${input.slice(start, pre)}${block}</div>`;
					}
					html += block;
					fences?.push(cursor, html.length, index);
					continue;
				}
			}
			const plugin = options.plugins?.code;
			if (isIncomplete) {
				if (live !== void 0 && (live.index !== number || live.language !== language || live.meta !== meta)) dispose();
				if (live === void 0) {
					const session = plugin?.createSession?.();
					if (session !== void 0) live = {
						session,
						index: number,
						language,
						meta
					};
				}
			}
			let highlighted;
			if (live !== void 0 && live.index === number) {
				liveUses++;
				highlighted = live.session.highlight({
					code: decodeHtml(content),
					language,
					meta,
					isIncomplete
				});
			} else if (plugin !== void 0) {
				const code = decodeHtml(content);
				const key = language + "\0" + meta + "\0" + code;
				highlighted = isIncomplete ? void 0 : codeCache.get(key) ?? oldCodeCache.get(key);
				if (highlighted === void 0) {
					highlighted = plugin.highlight({
						code,
						language,
						meta,
						isIncomplete
					});
					if (!isIncomplete && typeof highlighted === "string") codeCache.set(key, highlighted);
				} else codeCache.set(key, highlighted);
			}
			if (highlighted != null && typeof highlighted !== "string") throw new TypeError("Code highlighters must return HTML strings");
			if (!isIncomplete && live?.index === number) dispose();
			html += input.slice(open + 1, tag);
			if (input.charCodeAt(at + 1) !== 48 && options.lineNumbers !== false) {
				let count = 1;
				for (let line = content.indexOf("\n"); line !== -1 && line < content.length - 1; line = content.indexOf("\n", line + 1)) count++;
				html += lineNumbers(count);
			}
			html += input.slice(tag + 1, body) + groupLines(highlighted ?? content) + codeEnd;
			fences?.push(cursor, html.length, index);
		}
		html += pass(input.slice(cursor));
		for (const [tag, render] of Object.entries(options.components ?? {})) {
			let named = tag !== "";
			for (let at = 0; named && at < tag.length; at++) {
				const code = tag.charCodeAt(at);
				named = code >= 97 && code <= 122 || at > 0 && (code >= 48 && code <= 57 || code === 45);
			}
			if (render === void 0 || !named && tag !== "inlineCode") continue;
			const inline = tag === "inlineCode";
			if (!inline && (tag !== "code" || options.components?.inlineCode === void 0)) {
				html = mapElements(html, tag, render);
				continue;
			}
			let result = "";
			let from = 0;
			let pre = html.indexOf("<pre");
			let code = inline ? html.indexOf("<code") : -1;
			while (inline ? code !== -1 : pre !== -1) {
				const isPre = pre !== -1 && (!inline || pre < code);
				const at = isPre ? pre : code;
				const name = at + (isPre ? 4 : 5);
				const open = isNameCode(html.charCodeAt(name)) ? -1 : html.indexOf(">", name);
				const close = open < 0 ? -1 : html.indexOf(isPre ? "</pre>" : "</code>", open + 1);
				const next = close < 0 ? name : close + (isPre ? 6 : 7);
				if (close >= 0 && isPre !== inline) {
					const element = html.slice(at, next);
					result += html.slice(from, at) + (inline ? hookHtml(render(element)) : mapElements(element, "code", render));
					from = next;
				}
				if (pre !== -1 && pre < next) pre = html.indexOf("<pre", next);
				if (inline && code < next) code = html.indexOf("<code", next);
			}
			html = result + html.slice(from);
		}
		return [html, index];
	};
	/** Move formatted pending fences into completed output without highlighting them again. */
	const formatAddition = (input, firstCode, active) => {
		if (pendingInput !== void 0 && pendingCode === firstCode && pendingActive === active && pendingInput.slice(0, input.length) === input) for (let at = pendingFences.length - 3; at >= 0; at -= 3) {
			if (pendingFences[at] > input.length) continue;
			const [tail, next] = format$1(input.slice(pendingFences[at]), pendingFences[at + 2], void 0, closedSlots);
			return [pendingHtml.slice(0, pendingFences[at + 1]) + tail, next];
		}
		return format$1(input, firstCode, void 0, closedSlots);
	};
	/**
	* Format the last open fence as changed lines when no hook or filter needs
	* its full element. Reuses the HTML around it, so this works in lists and quotes too.
	*/
	const formatFence = (input, firstCode, active) => {
		if (!active || rewritesElements(options)) return;
		const start = openFence(input, 0);
		if (start < 0) return;
		const open = input.indexOf("\0", start + 2);
		const tag = input.indexOf("\0", open + 1);
		const body = input.indexOf("\0", tag + 1) + 1;
		const end = input.indexOf("\0", body);
		const space = input.indexOf(" ", start + 2);
		const split = space === -1 || space > open ? open : space;
		const language = split === start + 2 ? "text" : decodeHtml(input.slice(start + 2, split));
		const meta = split === open ? "" : decodeHtml(input.slice(split + 1, open));
		if (islandFor(options.islands, language) !== void 0 || rendererFor(options.plugins, language) !== void 0) return;
		const plugin = options.plugins?.code;
		const prefix = input.slice(0, start);
		const suffix = input.slice(end + 1 + 19);
		const head = input.slice(open + 1, tag);
		const codeTag = input.slice(tag + 1, body - 1);
		if (fence === void 0 || prefix !== fence.prefix || suffix !== fence.suffix || head !== fence.open || codeTag !== fence.code || firstCode !== fence.firstCode) {
			const [before, index] = format$1(prefix, firstCode, void 0, closedSlots);
			fence = {
				key: ++fenceKey,
				prefix,
				suffix,
				open: head,
				code: codeTag,
				firstCode,
				index,
				before,
				after: format$1(suffix, index + 1, void 0, closedSlots)[0],
				highlighted: false,
				escaped: void 0,
				start: 0,
				line: 0,
				text: "",
				textStart: 0
			};
		}
		if (live !== void 0 && (live.index !== fence.index || live.language !== language || live.meta !== meta)) dispose();
		if (live === void 0 && plugin !== void 0) {
			const session = plugin.createSession?.();
			if (session !== void 0) live = {
				session,
				index: fence.index,
				language,
				meta
			};
		}
		if (plugin !== void 0 && live?.session.highlightLines === void 0) return;
		const escaped = input.slice(body, end);
		const length = escaped.endsWith("\n") ? escaped.length - 1 : escaped.length;
		const lastStart = length === 0 ? 0 : escaped.lastIndexOf("\n", length - 1) + 1;
		const unchanged = escaped === fence.escaped;
		const from = fence.escaped !== void 0 && lastStart >= fence.start && escaped.slice(0, fence.start) === fence.escaped.slice(0, fence.start) ? fence.start : 0;
		const firstLine = from === 0 ? 0 : fence.line;
		let lineCount = firstLine + 1;
		for (let at = escaped.indexOf("\n", from); at !== -1; at = escaped.indexOf("\n", at + 1)) lineCount++;
		let code = escaped;
		let codeStart = lastStart;
		if (plugin !== void 0) {
			const head = (from === 0 ? "" : fence.text.slice(0, fence.textStart)) + decodeHtml(escaped.slice(from, lastStart));
			code = head + decodeHtml(escaped.slice(lastStart));
			codeStart = head.length;
		}
		if (live !== void 0) liveUses++;
		let lines = live?.session.highlightLines?.({
			code,
			language,
			meta,
			isIncomplete: true
		}) ?? null;
		if (fence.highlighted !== (lines !== null)) {
			fence.highlighted = lines !== null;
			fence.key = ++fenceKey;
		}
		lines ??= {
			firstLine: unchanged ? lineCount : firstLine,
			lineCount,
			html: unchanged ? "" : escaped.slice(from),
			lastLineOffset: unchanged ? 0 : lastStart - from,
			fullHtml: escaped
		};
		fence.escaped = escaped;
		fence.start = lastStart;
		fence.line = Math.max(0, lineCount - (escaped.endsWith("\n") ? 2 : 1));
		fence.text = code;
		fence.textStart = codeStart;
		const update = lines;
		const count = Math.max(1, update.lineCount - (code.endsWith("\n") ? 1 : 0));
		const numbers = options.lineNumbers === false ? void 0 : count;
		const context = fence;
		let fullPending;
		return {
			key: context.key,
			firstLine: update.firstLine,
			lineCount: update.lineCount,
			lastLine: Math.max(0, update.lineCount - (code.endsWith("\n") ? 2 : 1)),
			lastLineOffset: update.lastLineOffset,
			html: update.html,
			numbers,
			get pending() {
				return fullPending ??= context.before + context.open + (numbers === void 0 ? "" : lineNumbers(numbers)) + context.code + groupLines(update.fullHtml) + codeEnd + context.after;
			}
		};
	};
	/** Use the parser's changed lines without scanning the preceding code again. */
	const formatFenceDelta = (update, firstCode, active) => {
		if (!active || fence === void 0 || fence.firstCode !== firstCode || options.plugins !== void 0 || rewritesElements(options)) return;
		const escaped = update.fullHtml;
		const lastLine = Math.max(0, update.lineCount - 2);
		const numbers = options.lineNumbers === false ? void 0 : Math.max(1, update.lineCount - 1);
		fence.escaped = escaped;
		fence.start = escaped.length - update.html.length + update.lastLineOffset;
		fence.line = lastLine;
		fence.text = escaped;
		fence.textStart = fence.start;
		const context = fence;
		let fullPending;
		const result = Object.create(Object.prototype);
		result.key = context.key;
		result[delta] = update;
		result.firstLine = update.firstLine;
		result.lineCount = update.lineCount;
		result.lastLine = lastLine;
		result.lastLineOffset = update.lastLineOffset;
		result.html = update.html;
		result.numbers = numbers;
		return Object.defineProperty(result, "pending", {
			enumerable: true,
			configurable: true,
			get() {
				return fullPending ??= context.before + context.open + (numbers === void 0 ? "" : lineNumbers(numbers)) + context.code + groupLines(update.fullHtml) + codeEnd + context.after;
			}
		});
	};
	return {
		/** Change options. A reset discards completed output and reformats it. */
		configure(next, reset = true) {
			if (reset) resetState();
			if (next.islands !== options.islands) inlineNames = inlineIslandNames(next.islands);
			options = next;
		},
		render(source, incomplete, active = false) {
			try {
				const wasPartial = partial;
				const last = source.charCodeAt(source.length - 1);
				partial = incomplete && last !== 10 && last !== 13;
				const controls = controlFlags(options.controls);
				const plugins = options.plugins;
				const allSlots = plugins?.code !== void 0 || plugins?.mermaid !== void 0 || (plugins?.renderers?.length ?? 0) > 0 || options.allowedElements !== void 0 || options.disallowedElements !== void 0;
				closedSlots = allSlots || options.islands !== void 0;
				const sessionOptions = {
					incomplete,
					cjk: options.cjk,
					math: options.math,
					allowedHtml: options.allowedHtml,
					escapeHtml: options.escapeHtml,
					[format]: {
						flags: formatFlags.on | (options.lineNumbers === false ? 0 : formatFlags.numbers) | ((controls & 1) === 0 ? 0 : formatFlags.copy) | ((controls & 2) === 0 ? 0 : formatFlags.download) | (active ? formatFlags.active : 0) | (allSlots ? formatFlags.slots : options.islands !== void 0 ? formatFlags.islands : 0) | (options.urlTransform === void 0 ? 0 : formatFlags.rawUrls),
						idPrefix: escapeHtml(options.idPrefix ?? ""),
						inlineNames
					}
				};
				const update = parser.render(source, sessionOptions);
				if (update.hasInlineIslands === true) sawInlineIsland = true;
				const change = update[delta];
				const slots = closedSlots || update[format] === true;
				const fenceDelta = typeof change === "object" ? change : void 0;
				const paragraphDelta = typeof change === "string" ? change : void 0;
				if (update === previousUpdate && active === pendingActive && partial === wasPartial && result !== void 0) return result;
				const changed = update !== previousUpdate;
				let reset = false;
				let addition = "";
				if (changed && previousUpdate?.stable === stableRaw && !update.reset) {
					if (update.addition !== "") {
						[addition, nextCode] = formatAddition(update.addition, nextCode, active);
						stable += addition;
					}
					stableRaw = update.stable;
					pendingSource = fenceDelta === void 0 && paragraphDelta === void 0 ? void 0 : update;
					if (pendingSource === void 0) {
						pendingRaw = update.pending;
						pendingSlots = slots;
					}
				} else if (changed) {
					const raw = update.stable + update.pending;
					if (previousUpdate === void 0 || raw.slice(0, stableRaw.length) !== stableRaw) {
						reset = true;
						dispose();
						pendingInput = void 0;
						fence = void 0;
						stable = "";
						stableRaw = "";
						nextCode = 0;
						oldCodeCache = codeCache;
						codeCache = /* @__PURE__ */ new Map();
					}
					let cut = Math.max(update.stable.length, stableRaw.length);
					if (update.reset && cut === stableRaw.length) {
						const previousRaw = previousUpdate === void 0 ? "" : previousUpdate.stable + previousUpdate.pending;
						const open = slots ? openFence(raw, cut) : -1;
						const limit = Math.min(open < 0 ? raw.length : open, previousRaw.length);
						const same = unchangedEnd(raw, previousRaw, cut, limit);
						let depth = 0;
						for (let at = same < raw.length ? raw.indexOf("<", cut) : -1, end = 0; at !== -1; at = raw.indexOf("<", end)) {
							end = raw.indexOf(">", at) + 1;
							if (end === 0 || end >= same) break;
							if (raw.charCodeAt(at + 1) === 47) depth--;
							else if (!isVoidAt(raw, at, end)) depth++;
							if (depth === 0 && raw.charCodeAt(end) === 10) cut = end + 1;
						}
					}
					const whole = cut === update.stable.length;
					if (cut > stableRaw.length) {
						[addition, nextCode] = formatAddition(whole && stableRaw === "" ? update.stable : raw.slice(stableRaw.length, cut), nextCode, active);
						stable += addition;
					}
					stableRaw = whole ? update.stable : raw.slice(0, cut);
					pendingRaw = whole ? update.pending : raw.slice(cut);
					pendingSlots = slots;
					pendingSource = void 0;
				}
				previousUpdate = update;
				if (addition !== "") {
					fence = void 0;
					pendingInput = void 0;
				}
				const textAppend = changed && paragraphDelta !== void 0 && !rewritesElements(options) && (pendingParagraph !== void 0 || pendingFence === void 0 && pendingHtml.startsWith(paragraphStart) && pendingHtml.endsWith("</p>\n")) ? paragraphDelta : void 0;
				if (textAppend !== void 0) {
					pendingParagraph = { body: (pendingParagraph?.body ?? pendingHtml.slice(21, -5)) + textAppend };
					pendingFence = void 0;
					pendingFences = [];
					pendingInput = void 0;
					pendingActive = active;
					pendingCode = nextCode;
				} else {
					pendingParagraph = void 0;
					const fenceUpdate = changed && fenceDelta !== void 0 ? formatFenceDelta(fenceDelta, nextCode, active) : void 0;
					if (fenceUpdate !== void 0) {
						pendingFence = fenceUpdate;
						pendingFences = [];
						pendingInput = void 0;
						pendingActive = active;
						pendingCode = nextCode;
					} else {
						if (pendingSource !== void 0) {
							pendingRaw = pendingSource.pending;
							pendingSlots = closedSlots || pendingSource[format] === true;
							pendingSource = void 0;
						}
						if (pendingInput !== pendingRaw || pendingActive !== active || pendingPartial !== partial || pendingCode !== nextCode) {
							const uses = liveUses;
							pendingFences = [];
							pendingFence = pendingSlots ? formatFence(pendingRaw, nextCode, active) : void 0;
							if (pendingFence === void 0) {
								[pendingHtml] = format$1(pendingRaw, nextCode, pendingFences, pendingSlots);
								fence = void 0;
							}
							if (liveUses === uses) dispose();
							pendingInput = pendingRaw;
							pendingActive = active;
							pendingPartial = partial;
							pendingCode = nextCode;
						}
					}
				}
				const completedHtml = stable;
				const code = pendingFence;
				const pending = pendingHtml;
				const paragraph = pendingParagraph;
				let fullPending;
				let fullHtml;
				const getPending = () => {
					if (fullPending !== void 0) return fullPending;
					if (paragraph !== void 0) {
						fullPending = paragraphStart + paragraph.body + "</p>\n";
						paragraph.body = fullPending.slice(21, -5);
					} else fullPending = code?.pending ?? pending;
					return fullPending;
				};
				result = {
					get html() {
						return fullHtml ??= completedHtml + getPending();
					},
					stable: completedHtml,
					addition,
					get pending() {
						return getPending();
					},
					code,
					reset,
					revision: ++revision
				};
				if (textAppend !== void 0) result[delta] = textAppend;
				return result;
			} catch (error) {
				resetState();
				throw error;
			}
		},
		dispose
	};
}
//#endregion
//#region html/dom.ts
const isFade = (node) => node.nodeType === 1 && node.getAttribute("data-markdown") === "token";
const isText = (node) => node.nodeType === 3 || isFade(node);
const passiveText = "[data-animated=\"true\"], [data-markdown=\"token\"], [data-markdown=\"code-header\"], [data-markdown=\"line-numbers\"], [data-markdown=\"caret\"], [data-words-island], svg";
const svgSources = /* @__PURE__ */ new WeakMap();
const fadeDuration = 180;
/** Wrap new text in fade spans, and unwrap each span when its animation ends. */
function createFades(root) {
	const nodes = [];
	const deadlines = [];
	const document = root.ownerDocument;
	const query = document.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)");
	let timer;
	let timerDeadline = Infinity;
	let requested = false;
	let duration = fadeDuration;
	const enabled = () => requested && duration > 0 && query?.matches !== true;
	const arm = (next) => {
		if (Number.isFinite(next) && timer !== void 0 && next >= timerDeadline) return;
		if (timer !== void 0) clearTimeout(timer);
		timer = void 0;
		timerDeadline = next;
		if (Number.isFinite(next)) timer = setTimeout(() => flush(), Math.max(0, next - performance.now()));
	};
	const flush = (all = false) => {
		timer = void 0;
		timerDeadline = Infinity;
		const now = performance.now();
		let next = Infinity;
		let kept = 0;
		for (let at = 0; at < nodes.length; at++) {
			const span = nodes[at];
			const value = deadlines[at];
			const deadline = Math.abs(value);
			if (!all && deadline > now) {
				nodes[kept] = span;
				deadlines[kept++] = value;
				next = Math.min(next, deadline);
				continue;
			}
			const parent = span.parentNode;
			if (parent !== null && root.contains(span)) {
				if (value < 0) {
					span.removeAttribute("data-animated");
					span.style.removeProperty("animation-duration");
					if (span.getAttribute("style") === "") span.removeAttribute("style");
					continue;
				}
				const first = span.firstChild;
				let last = span.lastChild;
				while (span.firstChild !== null) parent.insertBefore(span.firstChild, span);
				parent.removeChild(span);
				if (first?.nodeType === 3) {
					const previous = first.previousSibling;
					if (previous?.nodeType === 3 && previous.length > 0) {
						previous.appendData(first.data);
						if (last === first) last = null;
						first.remove();
					}
				}
				if (last?.nodeType === 3) {
					const after = last.nextSibling;
					if (after?.nodeType === 3 && after.length > 0) {
						after.insertData(0, last.data);
						last.remove();
					}
				}
			}
		}
		nodes.length = deadlines.length = kept;
		arm(next);
	};
	const stop = () => {
		arm(Infinity);
		if (nodes.length > 0) flush(true);
	};
	const motionChanged = () => {
		if (query?.matches === true) stop();
	};
	const animate = (text) => {
		if (!enabled() || text.data.trim() === "" || text.parentElement === null) return;
		if (text.parentElement.closest(passiveText) !== null) return;
		if (text.data.endsWith("\n") && text.data.length > 1 && text.parentElement.closest("pre code") !== null) text.splitText(text.data.length - 1);
		const span = document.createElement("span");
		span.dataset.markdown = "token";
		span.dataset.animated = "true";
		if (duration !== fadeDuration) span.style.animationDuration = `${duration}ms`;
		text.replaceWith(span);
		span.append(text);
		nodes.push(span);
		deadlines.push(performance.now() + duration);
	};
	return {
		connect() {
			query?.addEventListener("change", motionChanged);
		},
		disconnect() {
			stop();
			query?.removeEventListener("change", motionChanged);
		},
		finish() {
			let next = Infinity;
			let kept = 0;
			for (let at = 0; at < nodes.length; at++) {
				const node = nodes[at];
				if (!root.contains(node)) continue;
				nodes[kept] = node;
				const deadline = deadlines[at];
				deadlines[kept++] = deadline;
				next = Math.min(next, Math.abs(deadline));
			}
			nodes.length = deadlines.length = kept;
			arm(next);
		},
		update(active, options) {
			requested = active && options !== false;
			const value = typeof options === "object" ? options.duration ?? fadeDuration : fadeDuration;
			duration = Number.isFinite(value) ? Math.max(0, value) : fadeDuration;
			if (!enabled()) stop();
		},
		tree(node, completed = false) {
			if (!enabled()) return;
			if (completed && node.nodeType === 1) {
				const visit = (node) => {
					if (node.nodeType === 3) {
						animate(node);
						return;
					}
					if (node.nodeType !== 1) return;
					const element = node;
					const kind = element.getAttribute("data-markdown");
					if (element.hasAttribute("data-words-island") || kind === "code-header" || kind === "line-numbers" || kind === "caret" || kind === "token") return;
					if (!element.hasAttribute("style") && (kind === "p" || kind?.length === 2 && kind[0] === "h" && kind[1] >= "1" && kind[1] <= "6" || kind === "code-lines")) {
						element.setAttribute("data-animated", "true");
						if (duration !== fadeDuration) element.style.animationDuration = `${duration}ms`;
						nodes.push(element);
						deadlines.push(-(performance.now() + duration));
						return;
					}
					for (let child = node.firstChild; child !== null;) {
						const next = child.nextSibling;
						visit(child);
						child = next;
					}
				};
				visit(node);
				return;
			}
			if (node.nodeType === 3) animate(node);
			else {
				const walker = document.createTreeWalker(node, 4);
				let text = walker.nextNode();
				while (text !== null) {
					const next = walker.nextNode();
					animate(text);
					text = next;
				}
			}
		},
		append(parent, value, before) {
			const previous = before === null ? parent.lastChild : before.previousSibling;
			if (!(enabled() && value.trim() !== "" && parent.nodeType === 1 && parent.closest(passiveText) === null) && previous?.nodeType === 3) {
				previous.appendData(value);
				return;
			}
			const text = document.createTextNode(value);
			parent.insertBefore(text, before);
			animate(text);
		}
	};
}
/** Update existing nodes directly and let the native parser build batches of new blocks. */
function patchHtml(root, html, first, committed, template) {
	const document = root.ownerDocument;
	let at = 0;
	let firstPending = null;
	const children = (parent, current) => {
		while (at < html.length && !html.startsWith("</", at)) {
			if (parent === root && current === null && html.length - at >= 1024 && html.charCodeAt(at) === 60) {
				const split = committed > at && committed < html.length;
				template.innerHTML = split ? html.slice(at, committed) + "<!--markdown-->" + html.slice(committed) : html.slice(at);
				const fragment = template.content;
				if (split) {
					for (let node = fragment.firstChild; node !== null; node = node.nextSibling) if (node.nodeType === 8) {
						firstPending = node.nextSibling;
						fragment.removeChild(node);
						break;
					}
				} else if (at >= committed && firstPending === null) firstPending = fragment.firstChild;
				if (html.includes("<svg ", at)) {
					const svgs = fragment.querySelectorAll("svg");
					for (let open = html.indexOf("<svg ", at), index = 0; open >= 0;) {
						const end = html.indexOf("</svg>", open) + 6;
						svgSources.set(svgs[index++], html.slice(open, end));
						open = html.indexOf("<svg ", end);
					}
				}
				parent.appendChild(fragment);
				at = html.length;
				return;
			}
			const pending = parent === root && at >= committed;
			let actual;
			if (html.charCodeAt(at) !== 60) {
				let end = html.indexOf("<", at);
				if (end < 0) end = html.length;
				if (parent === root && at < committed && committed < end) end = committed;
				const value = decodeHtml(html.slice(at, end));
				if (current?.nodeType === 3) {
					let last = current;
					let next = last.nextSibling;
					if (next?.nodeType === 3) {
						let previous = last.data;
						do {
							last = next;
							previous += last.data;
							next = last.nextSibling;
						} while (next?.nodeType === 3);
						const append = value.startsWith(previous);
						const lineAppend = !append && previous.endsWith("\n") && value.endsWith("\n") && value.slice(0, -1).startsWith(previous.slice(0, -1));
						if (append || lineAppend) {
							if (value !== previous) {
								if (append) last.appendData(value.slice(previous.length));
								else {
									while (last.length === 0) last = last.previousSibling;
									last.insertData(last.length - 1, value.slice(previous.length - 1, -1));
								}
							}
							if (pending && firstPending === null) firstPending = current;
							at = end;
							current = next;
							continue;
						}
					}
					actual = current;
					const text = current;
					const previous = text.data;
					if (previous !== value) {
						if (value.startsWith(previous)) text.appendData(value.slice(previous.length));
						else if (previous.endsWith("\n") && value.endsWith("\n") && value.slice(0, -1).startsWith(previous.slice(0, -1))) text.insertData(previous.length - 1, value.slice(previous.length - 1, -1));
						else text.data = value;
					}
				} else actual = document.createTextNode(value);
				at = end;
			} else if (html.startsWith("<svg ", at)) {
				const end = html.indexOf("</svg>", at) + 6;
				const source = html.slice(at, end);
				if (current !== null && svgSources.get(current) === source) actual = current;
				else {
					template.innerHTML = source;
					actual = template.content.firstChild;
					svgSources.set(actual, source);
				}
				at = end;
			} else {
				const end = html.indexOf(">", at);
				const selfClosing = html.charCodeAt(end - 1) === 47;
				let nameEnd = html.indexOf(" ", at);
				if (nameEnd < 0 || nameEnd > end) nameEnd = end;
				const name = html.slice(at + 1, nameEnd);
				const element = current?.nodeType === 1 && current.localName === name ? current : document.createElement(name);
				const names = [];
				for (let pos = nameEnd; pos < end - (selfClosing ? 1 : 0);) {
					if (html.charCodeAt(pos) === 32) {
						pos++;
						continue;
					}
					const start = pos;
					while (pos < end && html.charCodeAt(pos) !== 32 && html.charCodeAt(pos) !== 61) pos++;
					const attribute = html.slice(start, pos);
					let value = "";
					if (html.charCodeAt(pos) === 61) {
						const close = html.indexOf("\"", pos + 2);
						value = decodeHtml(html.slice(pos + 2, close));
						pos = close + 1;
					}
					names.push(attribute);
					if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
				}
				for (let index = element.attributes.length - 1; index >= 0; index--) {
					const name = element.attributes[index].name;
					if (!names.includes(name)) element.removeAttribute(name);
				}
				at = end + 1;
				if (!selfClosing && name !== "br" && name !== "hr" && name !== "img" && name !== "input") {
					children(element, element.firstChild);
					at = html.indexOf(">", at) + 1;
				}
				actual = element;
			}
			if (actual !== current) {
				parent.insertBefore(actual, current);
				if (current !== null) {
					const next = current.nextSibling;
					parent.removeChild(current);
					current = next;
				}
			} else current = current.nextSibling;
			if (pending && firstPending === null) firstPending = actual;
		}
		while (current !== null) {
			const next = current.nextSibling;
			parent.removeChild(current);
			current = next;
		}
	};
	children(root, first);
	return firstPending;
}
/** Patch `parent` to match `incoming`, reusing nodes. A fade span counts as text. Returns the node at `committed`. */
function patchChildren(parent, incoming, first, fades, committed = -1, marker, revising = false) {
	const previousText = revising ? parent.textContent ?? "" : void 0;
	let current = first;
	let target = incoming.firstChild;
	let index = 0;
	let firstPending = null;
	while (target !== null) {
		if (current === null && incoming.nodeType === 11 && target.nextSibling !== null) {
			while (incoming.firstChild !== target) incoming.removeChild(incoming.firstChild);
			for (let node = target; node !== null;) {
				const next = node.nextSibling;
				if (node !== marker && (previousText === void 0 || !previousText.includes(node.textContent ?? ""))) fades.tree(node, index < committed);
				if (index === committed) firstPending = node.parentNode === incoming ? node : node.parentNode;
				index++;
				node = next;
			}
			parent.appendChild(incoming);
			return firstPending;
		}
		const nextTarget = target.nextSibling;
		let actual;
		if (target === marker) {
			actual = target;
			parent.insertBefore(target, current);
		} else if (target.nodeType === 3) {
			const value = target.nodeValue ?? "";
			let previous = "";
			let end = current;
			while (end !== null && isText(end)) {
				previous += end.textContent ?? "";
				end = end.nextSibling;
			}
			const append = value.startsWith(previous);
			const lineAppend = !append && previous.endsWith("\n") && value.endsWith("\n") && value.slice(0, -1).startsWith(previous.slice(0, -1));
			if (current !== end && (append || lineAppend)) {
				actual = current;
				const suffix = append ? value.slice(previous.length) : value.slice(previous.length - 1, -1);
				if (suffix !== "") {
					const lead = current.previousSibling;
					let before = end;
					if (lineAppend) {
						let last = end === null ? parent.lastChild : end.previousSibling;
						while (last !== null && last.nodeType === 1) last = last.lastChild;
						if (last !== null) {
							const text = last;
							before = text.length === 1 ? text : text.splitText(text.length - 1);
							if (before.parentNode !== parent) parent.insertBefore(before, end);
						}
					}
					fades.append(parent, suffix, before);
					actual = lead === null ? parent.firstChild : lead.nextSibling;
				}
			} else {
				while (current !== end) {
					const next = current.nextSibling;
					parent.removeChild(current);
					current = next;
				}
				actual = target;
				parent.insertBefore(target, end);
				if (previous === "") {
					if (previousText === void 0 || !previousText.includes(target.textContent ?? "")) fades.tree(target);
					actual = target.parentNode === parent ? target : target.parentNode;
				}
			}
			current = end;
		} else if (isIsland(current) || isIsland(target)) {
			if (isIsland(current) && isIsland(target) && current.tagName === target.tagName && current.dataset.wordsIsland === target.dataset.wordsIsland && current.dataset.wordsIslandId === target.dataset.wordsIslandId) {
				current.dataset.wordsIslandData = target.dataset.wordsIslandData;
				const fallback = current.lastElementChild;
				const text = target.lastElementChild.textContent;
				if (fallback.textContent !== text) fallback.textContent = text;
				actual = current;
				current = current.nextSibling;
			} else {
				actual = target;
				const next = current?.nextSibling ?? null;
				parent.insertBefore(target, current);
				if (current !== null) parent.removeChild(current);
				current = next;
			}
		} else if (current?.nodeType === 1 && target.nodeType === 1 && current.tagName === target.tagName && !isFade(current)) {
			actual = current;
			const element = current;
			const wanted = target;
			if (wanted.nextElementSibling === null || !element.isEqualNode(wanted)) {
				for (let at = element.attributes.length - 1; at >= 0; at--) {
					const attribute = element.attributes[at];
					if (!wanted.hasAttribute(attribute.name)) element.removeAttribute(attribute.name);
				}
				for (const attribute of wanted.attributes) if (element.getAttribute(attribute.name) !== attribute.value) element.setAttribute(attribute.name, attribute.value);
				patchChildren(element, wanted, element.firstChild, fades, -1, marker, revising);
			}
			current = element.nextSibling;
		} else {
			actual = target;
			const next = current?.nextSibling ?? null;
			parent.insertBefore(target, current);
			if (current !== null) parent.removeChild(current);
			if (previousText === void 0 || !previousText.includes(target.textContent ?? "")) fades.tree(target, index < committed);
			current = next;
		}
		if (index === committed) firstPending = actual;
		index++;
		target = nextTarget;
	}
	while (current !== null) {
		const next = current.nextSibling;
		parent.removeChild(current);
		current = next;
	}
	return firstPending;
}
/** Separate the last code line, so later updates patch only that line. */
function lastCodeLine(code, trailingNewline) {
	let before = code.firstChild;
	for (let node = code.lastChild; node !== null; node = node.previousSibling) {
		if (node.nodeType !== 3) continue;
		const text = node;
		let end = text.data.length;
		if (trailingNewline && text.data.endsWith("\n")) {
			end--;
			trailingNewline = false;
		}
		if (end === 0) continue;
		const at = text.data.lastIndexOf("\n", end - 1);
		if (at < 0) continue;
		before = at + 1 === text.data.length ? text.nextSibling : text.splitText(at + 1);
		break;
	}
	return before;
}
/** Keep a physical boundary while fade cleanup can merge neighboring text nodes. */
function markLastCodeLine(code, trailingNewline) {
	const marker = code.ownerDocument.createComment("markdown-code");
	code.insertBefore(marker, lastCodeLine(code, trailingNewline));
	return marker;
}
/** Append literal code into 64-line groups, retaining the last text node and its selections. */
function appendCodeText(code, lines, text, replaceNewline) {
	let group = code.lastElementChild ?? code;
	const value = text.endsWith("\n") ? text : text + "\n";
	for (let from = 0; from < value.length;) {
		if (!replaceNewline && lines > 0 && lines % 64 === 0) {
			group = code.ownerDocument.createElement("span");
			group.setAttribute("data-markdown", "code-lines");
			code.append(group);
		}
		let end = from;
		for (let left = 64 - lines % 64; left > 0; left--) {
			const at = value.indexOf("\n", end);
			if (at < 0) break;
			end = at + 1;
			lines++;
		}
		const last = group.lastChild;
		if (replaceNewline && last?.nodeType === 3) {
			const node = last;
			node.insertData(node.length - 1, value.slice(from, end - 1));
			replaceNewline = false;
		} else if (last?.nodeType === 3) last.appendData(value.slice(from, end));
		else group.append(value.slice(from, end));
		from = end;
	}
	return group;
}
/** Render Markdown into `root`, and patch its DOM nodes on each update. */
function createDomRenderer(root, options = {}, formatter = createHtmlRenderer(options)) {
	const document = root.ownerDocument;
	const checkpoint = document.createComment("markdown");
	let pending = root.firstChild;
	const template = document.createElement("template");
	const tail = document.createElement("template");
	const caret = document.createElement("span");
	const fades = createFades(root);
	let revision = 0;
	let islands = noIslands;
	const committedHosts = [];
	let pendingHasIslands = false;
	let initialized = false;
	let previousCaret;
	let codeState;
	root.dataset.markdown = "root";
	caret.dataset.markdown = "caret";
	caret.setAttribute("aria-hidden", "true");
	const click = (event) => {
		const button = event.target?.closest("button[data-code-action]");
		if (button == null || button.disabled || !root.contains(button)) return;
		const block = button.closest("[data-markdown=\"code-block\"]");
		const code = block?.dataset.code ?? block?.querySelector("pre code")?.textContent ?? "";
		if (button.dataset.codeAction === "copy") document.defaultView?.navigator.clipboard?.writeText(code).then(() => {
			button.textContent = "Copied";
			setTimeout(() => {
				button.textContent = "Copy";
			}, 2e3);
		}).catch(() => {
			button.textContent = "Copy";
		});
		else {
			const url = URL.createObjectURL(new Blob([code], { type: "text/plain;charset=utf-8" }));
			const link = document.createElement("a");
			link.href = url;
			let language = block?.getAttribute("data-language") ?? "";
			for (let at = 0; at < language.length; at++) {
				const code = language.charCodeAt(at);
				if (((code | 32) < 97 || (code | 32) > 122) && (code < 48 || code > 57)) language = "";
			}
			link.download = `code.${language === "" ? "txt" : language}`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 3e4);
		}
	};
	return {
		getIslands: () => islands,
		connect() {
			fades.connect();
			root.addEventListener("click", click);
		},
		disconnect() {
			fades.disconnect();
			formatter.dispose();
			root.removeEventListener("click", click);
		},
		/**
		* Reformat completed output only when an option value changes, so inline
		* option objects stay cheap. New hook and `urlTransform` functions apply to
		* later output. A changed set of hook names reformats everything. Plugins
		* compare by their parts, because a wrapper object is often written inline.
		*/
		configure(next) {
			if (next === options) return;
			const hooks = (value) => Object.keys(value ?? {}).filter((tag) => value?.[tag] !== void 0).join(" ");
			const samePlugins = (a, b) => {
				const left = a?.renderers ?? [];
				const right = b?.renderers ?? [];
				return a?.code === b?.code && a?.mermaid === b?.mermaid && left.length === right.length && left.every((renderer, at) => renderer.render === right[at].render && renderer.frame === right[at].frame && String(renderer.language) === String(right[at].language));
			};
			let reset = false;
			const keys = /* @__PURE__ */ new Set([...Object.keys(options), ...Object.keys(next)]);
			for (const key of keys) {
				const previous = options[key];
				const value = next[key];
				reset ||= !(previous === value || (key === "controls" ? controlFlags(previous) === controlFlags(value) : key === "components" ? hooks(previous) === hooks(value) : key === "urlTransform" ? previous === void 0 === (value === void 0) : key === "allowedHtml" ? JSON.stringify(previous) === JSON.stringify(value) : key === "plugins" ? samePlugins(previous, value) : Array.isArray(previous) && Array.isArray(value) && previous.length === value.length && previous.every((tag, at) => tag === value[at])));
			}
			formatter.configure(next, reset);
			options = next;
		},
		update(source, incomplete, active = false, animated = false, shape) {
			root.toggleAttribute("data-streaming", active);
			const update = formatter.render(source, incomplete, active);
			const changed = update.revision !== revision;
			const reset = !initialized || changed && (update.reset || update.revision !== revision + 1);
			fades.update(active, animated);
			const nextCaret = active ? shape : void 0;
			if (!changed && nextCaret === previousCaret) return;
			caret.remove();
			const codeUpdate = update.code;
			const append = update[delta];
			const textAppend = typeof append === "string" ? append : void 0;
			const codeAppend = codeUpdate?.[delta];
			const direct = animated === false && options.plugins === void 0 && !pendingHasIslands && !rewritesElements(options);
			if (changed && !reset && textAppend !== void 0 && update.addition === "" && pending?.parentNode === root && pending.nodeName === "P" && pending.lastChild !== null && isText(pending.lastChild)) {
				if (textAppend !== "") {
					if (animated !== false) fades.append(pending, textAppend, null);
					else pending.lastChild.appendData(textAppend);
				}
			} else if (changed && !reset && codeUpdate !== void 0 && codeState !== void 0 && update.addition === "" && codeState.key === codeUpdate.key && direct === (codeState.marker === void 0) && (codeState.marker !== void 0 ? root.contains(codeState.marker) : root.contains(codeState.group) && (codeState.first === null || codeState.first.parentNode === codeState.group)) && (codeUpdate.firstLine === codeUpdate.lineCount || codeUpdate.firstLine === codeState.line && codeUpdate.firstLine <= codeUpdate.lastLine) && codeUpdate.numbers === void 0 === (codeState.numbers === null) && (codeUpdate.numbers ?? 0) >= codeState.numberCount) {
				if (direct && codeAppend !== void 0) {
					const group = appendCodeText(codeState.code, codeState.lineCount - 1 - (codeAppend.replaceNewline === true ? 1 : 0), codeAppend.text, codeAppend.replaceNewline === true);
					codeState.group = group;
					codeState.first = lastCodeLine(group, true);
					codeState.line = codeUpdate.lastLine;
				} else if (codeUpdate.firstLine < codeUpdate.lineCount) {
					const { html, lastLineOffset } = codeUpdate;
					const marker = codeState.marker;
					let group = marker?.parentNode ?? codeState.group;
					let first = marker === void 0 ? codeState.first : marker.nextSibling;
					marker?.remove();
					for (let start = 0, line = codeUpdate.firstLine;;) {
						let end = start;
						let left = 64 - line % 64;
						for (; left > 0; left--) {
							const at = html.indexOf("\n", end);
							if (at < 0) break;
							end = at + 1;
						}
						if (left > 0) end = html.length;
						if (group === null) {
							if (start === end) break;
							group = document.createElement("span");
							group.setAttribute("data-markdown", "code-lines");
							codeState.code.append(group);
							first = null;
						}
						const at = lastLineOffset >= start && (lastLineOffset < end || end === html.length) ? lastLineOffset : -1;
						if (direct) {
							const next = patchHtml(group, html.slice(start, end), first, at < 0 ? end - start : at - start, template);
							if (at >= 0) {
								codeState.first = next;
								codeState.group = group;
							}
						} else {
							template.innerHTML = html.slice(start, at < 0 ? end : at);
							const fragment = template.content;
							if (at >= 0) {
								fragment.append(marker);
								tail.innerHTML = html.slice(at, end);
								fragment.append(tail.content);
							}
							patchChildren(group, fragment, first, fades, -1, at < 0 ? void 0 : marker);
						}
						if (end === html.length) break;
						line += 64 - line % 64;
						start = end;
						group = null;
					}
					codeState.marker = marker;
					codeState.line = codeUpdate.lastLine;
				}
				codeState.lineCount = codeUpdate.lineCount;
				const count = codeUpdate.numbers ?? 0;
				if (codeState.numbers !== null && count > codeState.numberCount) {
					let group = codeState.numbers.lastElementChild;
					const append = (text) => {
						const last = group.lastChild;
						if (last?.nodeType === 3) last.appendData(text);
						else group.append(text);
					};
					let text = "";
					for (let line = codeState.numberCount + 1; line <= count; line++) {
						if (line % 64 !== 1) {
							text += "\n" + line;
							continue;
						}
						append(text + "\n");
						group = document.createElement("span");
						group.setAttribute("data-markdown", "code-lines");
						codeState.numbers.append(group);
						text = String(line);
					}
					append(text);
					codeState.numberCount = count;
				}
			} else if (changed) {
				codeState?.marker?.remove();
				codeState = void 0;
				if (checkpoint.parentNode !== null) {
					pending = checkpoint.nextSibling;
					checkpoint.remove();
				}
				if (reset) pending = root.firstChild;
				const addition = reset ? update.stable : update.addition;
				const pendingHtml = update.pending;
				const additionHasIslands = options.islands !== void 0 && addition.includes(" data-words-island=\"");
				const tailHasIslands = options.islands !== void 0 && pendingHtml.includes(" data-words-island=\"");
				const patchIslands = additionHasIslands || tailHasIslands || pendingHasIslands || reset && committedHosts.length !== 0;
				pendingHasIslands = tailHasIslands;
				if (direct && !patchIslands) {
					const firstPending = patchHtml(root, addition + pendingHtml, pending, addition.length, template);
					pending = firstPending;
					if (codeUpdate !== void 0) {
						let code = null;
						for (let node = firstPending; node !== null; node = node.nextSibling) {
							if (node.nodeType === 1) code = node.querySelector("[data-incomplete] > pre > code");
							if (code !== null) break;
						}
						if (code !== null) {
							const group = code.lastElementChild ?? code;
							const first = lastCodeLine(group, codeUpdate.lastLine < codeUpdate.lineCount - 1);
							const numbers = code.previousElementSibling;
							codeState = {
								code,
								marker: void 0,
								group,
								first,
								line: codeUpdate.lastLine,
								lineCount: codeUpdate.lineCount,
								key: codeUpdate.key,
								numbers: numbers?.getAttribute("data-markdown") === "line-numbers" ? numbers : null,
								numberCount: codeUpdate.numbers ?? 0
							};
						}
					}
				} else {
					template.innerHTML = addition;
					const fragment = template.content;
					const count = fragment.childNodes.length;
					tail.innerHTML = pendingHtml;
					const incomingCode = codeUpdate === void 0 ? null : tail.content.querySelector("[data-incomplete] > pre > code");
					const codeMarker = incomingCode === null || codeUpdate === void 0 ? void 0 : markLastCodeLine(incomingCode.lastElementChild ?? incomingCode, codeUpdate.lastLine < codeUpdate.lineCount - 1);
					fragment.append(tail.content);
					const previousSibling = pending === null ? root.lastChild : pending.previousSibling;
					const firstPending = patchChildren(root, fragment, pending, fades, count, codeMarker, initialized && reset);
					pending = firstPending;
					if (patchIslands) {
						if (reset) committedHosts.length = 0;
						if (additionHasIslands) {
							const first = previousSibling === null ? root.firstChild : previousSibling.nextSibling;
							appendIslandHosts(committedHosts, first, firstPending);
						}
						let hosts = committedHosts;
						if (pendingHasIslands) {
							hosts = [...committedHosts];
							appendIslandHosts(hosts, firstPending, null);
						}
						islands = collectIslands(root, hosts, islands);
					}
					if (firstPending !== null && isText(firstPending)) root.insertBefore(checkpoint, firstPending);
					if (codeUpdate !== void 0 && codeMarker?.parentNode != null) {
						const code = codeMarker.parentNode.parentNode;
						const numbers = code.previousElementSibling;
						codeState = {
							code,
							marker: codeMarker,
							group: codeMarker.parentNode,
							first: codeMarker.nextSibling,
							line: codeUpdate.lastLine,
							lineCount: codeUpdate.lineCount,
							key: codeUpdate.key,
							numbers: numbers?.getAttribute("data-markdown") === "line-numbers" ? numbers : null,
							numberCount: codeUpdate.numbers ?? 0
						};
					}
					if (!initialized) fades.tree(root);
				}
				initialized = true;
			}
			revision = update.revision;
			previousCaret = nextCaret;
			if (nextCaret !== void 0) {
				caret.dataset.shape = nextCaret;
				let parent = root;
				let before = null;
				for (let node = root.lastChild; node !== null;) {
					if (node.nodeType === 8 || node.nodeType === 3 && node.data.trim() === "" || node.nodeType === 1 && node.hasAttribute("data-footnotes")) {
						node = node.previousSibling;
						continue;
					}
					let block = false;
					if (node.nodeType === 1 && !isIsland(node)) switch (node.nodeName) {
						case "BLOCKQUOTE":
						case "DIV":
						case "H1":
						case "H2":
						case "H3":
						case "H4":
						case "H5":
						case "H6":
						case "LI":
						case "OL":
						case "P":
						case "PRE":
						case "SECTION":
						case "TABLE":
						case "TBODY":
						case "TD":
						case "TH":
						case "THEAD":
						case "TR":
						case "UL": block = true;
					}
					if (!block) {
						before = node.nextSibling;
						break;
					}
					parent = node;
					if (node.nodeName === "PRE") {
						const code = node.lastElementChild;
						parent = code?.lastElementChild ?? code ?? node;
						let last = parent.lastChild;
						while (last?.nodeType === 1 && last.lastChild !== null) last = last.lastChild;
						if (last?.nodeType === 3 && last.data.endsWith("\n")) {
							const text = last;
							before = text.length > 1 ? text.splitText(text.length - 1) : text;
							parent = before.parentNode;
						}
						break;
					}
					node = node.lastChild;
				}
				parent.insertBefore(caret, before);
			}
			fades.finish();
		}
	};
}
//#endregion
export { escapeHtml as a, defaultUrlTransform as i, createHtmlRenderer as n, noIslands as r, createDomRenderer as t };

//# sourceMappingURL=dom-BUlZRK7K.js.map