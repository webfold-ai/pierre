import tokenTypes from "./token-types.js";
import { escapeAttribute, prepareTheme, resolveTheme } from "./theme.js";
import { lineRecordsToTokens, multiThemeBlob, multiThemeHtmlOpeners, resolveOptionThemes, themeMeta } from "./tokens.js";
import { AnsiState, ansiTokens, isAnsi } from "./ansi.js";
import languages from "./languages.js";
//#region lib/highlighter.ts
const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { ignoreBOM: true });
const pageSize = 65536;
const idClassRegex = [/^\p{ID_Start}$/u, /^[\u200C\u200D\p{ID_Continue}]$/u];
let idClassCache;
/**
* Language names and Wasm IDs, sorted by ID and then name.
*/
const LANGS = languages;
/** Resolve the Wasm language ID for a name or alias, or throw. */
function langIdOf(lang) {
	const langId = LANGS[String(lang).toLowerCase()];
	if (typeof langId !== "number") throw new RangeError(`unknown lang: ${lang}`);
	return langId;
}
/**
* Check whether a name or alias has a built-in lexer, including `plain`/`text`,
* or is `ansi`. Names from `registerLanguages` are not built in; use
* `isRegisteredLanguage` for them.
*/
function isSupportedLanguage(lang) {
	return typeof LANGS[String(lang).toLowerCase()] === "number" || isAnsi(lang);
}
/**
* Check whether `registerLanguages` added a name or alias. The shared
* `codeToHtml` and `codeToTokens` use its lexer. `StreamTokenizer` and
* `LiveTokenizer` use it too, unless it is a built-in language module. Code
* blocks in Markdown, MDX, and Org use it in all of them.
*/
function isRegisteredLanguage(lang) {
	return registeredLexers.has(String(lang).toLowerCase());
}
var HighlightsHighlighter = class {
	#highlight;
	#highlightStream;
	#themeWritten;
	#htmlPrefix;
	#htmlPrefixBytes = /* @__PURE__ */ new Uint8Array(0);
	#beforeRun;
	#languageIds;
	inputPtr;
	themePtr;
	wasmModule;
	instance;
	memory;
	buffer;
	dv;
	pageN;
	constructor(wasmModule, beforeRun, imports = {}, emitter = false, languageIds) {
		this.#beforeRun = beforeRun;
		this.#languageIds = languageIds;
		this.wasmModule = wasmModule;
		const env = {
			lex_line: () => 0,
			fence_language: () => 0,
			fence_lex: () => 0,
			...imports,
			is_id_start: (ptr, len) => this.#idClass(ptr, len, 0),
			is_id_continue: (ptr, len) => this.#idClass(ptr, len, 2)
		};
		const instance = new WebAssembly.Instance(wasmModule, { env });
		this.instance = instance;
		this.memory = instance.exports.memory;
		this.inputPtr = Number(instance.exports.inputPtr.value);
		this.themePtr = Number(instance.exports.themePtr?.value ?? 0);
		const emit = emitter ? instance.exports.emit : void 0;
		this.#highlight = emit ?? instance.exports.highlight ?? instance.exports.lex;
		this.#highlightStream = emit ?? instance.exports.highlightStream ?? instance.exports.lexStream;
		this.pageN = this.memory.buffer.byteLength / pageSize;
		this.buffer = new Uint8Array(this.memory.buffer);
		this.dv = new DataView(this.memory.buffer);
	}
	/** Write input at a byte offset in the text buffer and return its byte length. */
	writeInput(input, offset = 0) {
		if (typeof input === "string") {
			this.grow(this.inputPtr + offset + input.length + 96);
			let { read, written } = enc.encodeInto(input, this.buffer.subarray(this.inputPtr + offset, this.buffer.length - 96));
			if (read < input.length) {
				const rest = input.slice(read);
				this.grow(this.inputPtr + offset + written + rest.length * 3 + 96);
				written += enc.encodeInto(rest, this.buffer.subarray(this.inputPtr + offset + written, this.buffer.length - 96)).written;
			}
			return written;
		}
		if (input instanceof ArrayBuffer) input = new Uint8Array(input);
		if (!(input instanceof Uint8Array)) throw new TypeError("input must be a string, Uint8Array, or ArrayBuffer");
		this.grow(this.inputPtr + offset + input.length + 96);
		this.buffer.set(input, this.inputPtr + offset);
		return input.length;
	}
	/**
	* Lex the first `inputLength` bytes. Output modes:
	* 0 inline colors, 1 CSS variables, 2 packed themes, 3 UTF-16 line records,
	* 4 prepared HTML openers. `reset` selects streaming mode.
	*/
	#run(langId, mode, inputLength, reset) {
		this.#beforeRun?.(langId, mode, inputLength, reset);
		this.dv.setUint8(0, langId);
		this.dv.setUint8(1, mode);
		this.dv.setUint32(2, inputLength, true);
		this.buffer[this.inputPtr + inputLength] = 0;
		try {
			if (reset === void 0) this.#highlight();
			else this.#highlightStream(reset);
		} finally {
			this.bindMemory();
		}
	}
	/**
	* Return highlighted HTML bytes.
	* The bytes can reference Wasm memory that the next call overwrites.
	*/
	codeToHtml(input, options) {
		const cssVariablePrefix = options.cssVariablePrefix ?? "--hls-";
		if (isAnsi(options.lang)) {
			const themes = resolveOptionThemes(options);
			const { fg, bg, rootStyle } = themeMeta(themes, cssVariablePrefix);
			const code = toCode(input);
			const lines = ansiTokens(code, themes[0].role === "single" ? [{
				...themes[0],
				role: "default"
			}] : themes, cssVariablePrefix);
			let html = `<pre class="highlights" style="${escapeAttribute(rootStyle ?? (bg === void 0 ? "" : `background-color:${bg};`) + (fg === void 0 ? "" : `color:${fg}`))}"><code>`;
			for (let i = 0, lf = -1; i < lines.length; i++) {
				if (i > 0) {
					lf = code.indexOf("\n", lf + 1);
					html += code.charCodeAt(lf - 1) === 13 ? "\r\n" : "\n";
				}
				for (const { content, htmlStyle } of lines[i]) {
					let css = "";
					for (const property in htmlStyle) css += `${css === "" ? "" : ";"}${property}:${htmlStyle[property]}`;
					html += `<span style="${escapeAttribute(css)}">${content.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</span>`;
				}
			}
			return enc.encode(`${html}</code></pre>`);
		}
		const langId = this.#languageIds?.get(String(options.lang).toLowerCase()) ?? langIdOf(options.lang);
		let table;
		let blob;
		let mode = 0;
		if (options.themes != null) {
			const themes = resolveOptionThemes(options);
			blob = multiThemeBlob(themes, cssVariablePrefix);
			mode = 2;
			if (blob === void 0) {
				blob = multiThemeHtmlOpeners(themes, cssVariablePrefix);
				mode = 4;
			}
		} else {
			const prepared = prepareTheme(options.theme, cssVariablePrefix);
			table = prepared.table;
			blob = prepared.htmlOpeners;
			if (blob !== void 0) mode = 4;
		}
		const inputLength = this.writeInput(input);
		if (blob !== void 0) {
			this.grow(this.inputPtr + inputLength + blob.length + 96);
			const blobPtr = this.inputPtr + inputLength + 47 & -16;
			this.buffer.set(blob, blobPtr);
			this.dv.setUint32(14, blobPtr, true);
			this.dv.setUint32(18, blob.length, true);
		} else if (table === void 0) {
			if (this.#htmlPrefix !== cssVariablePrefix) {
				this.#htmlPrefixBytes = enc.encode(escapeAttribute(cssVariablePrefix));
				this.#htmlPrefix = cssVariablePrefix;
			}
			const bytes = this.#htmlPrefixBytes;
			this.grow(this.inputPtr + inputLength + bytes.length + 96);
			const prefixPtr = this.inputPtr + inputLength + 47 & -16;
			this.buffer.set(bytes, prefixPtr);
			this.dv.setUint32(14, prefixPtr, true);
			this.dv.setUint32(18, bytes.length, true);
			mode = 1;
		} else {
			if (this.#themeWritten !== table) {
				this.buffer.set(table, this.themePtr);
				this.buffer.fill(0, this.themePtr + table.length, this.themePtr + 384);
				this.#themeWritten = table;
			}
			mode = 0;
		}
		this.#run(langId, mode, inputLength);
		const outStart = this.dv.getUint32(6, true);
		const outLength = this.dv.getUint32(10, true);
		return this.buffer.subarray(outStart, outStart + outLength);
	}
	/**
	* Run record output and return the address of the records. Control word 10
	* holds their byte length. `reset` starts or continues a stream. Mode 5
	* makes the combined module return byte records, as a lexer module does.
	*/
	lexRecords(langId, inputLength, reset, mode = 3) {
		this.#run(langId, mode, inputLength, reset);
		return this.dv.getUint32(6, true);
	}
	/**
	* Lex this emitter's input with `lexer` and copy the records here. Only the
	* first record can be a leading gap (0xffff). The document root has no
	* previous token for it, so it becomes plain text.
	*/
	lexWith(lexer, langId, mode, length, reset, lexerMode) {
		const at = lexer.lexRecords(langId, lexer.writeInput(this.buffer.subarray(this.inputPtr, this.inputPtr + length)), reset, lexerMode);
		const bytes = lexer.dv.getUint32(10, true);
		if (bytes > 0 && lexer.dv.getUint16(at + 4, true) === 65535) lexer.dv.setUint16(at + 4, 0, true);
		this.writeRecords(mode, length, lexer.buffer.subarray(at, at + bytes));
	}
	/** Copy lexer records to this emitter, after the input and the theme data. */
	writeRecords(mode, length, records) {
		const blobEnd = mode === 0 || mode === 3 ? 0 : this.dv.getUint32(14, true) + this.dv.getUint32(18, true);
		const recordsPtr = Math.ceil(Math.max(this.inputPtr + length + 96, blobEnd) / 16) * 16;
		this.grow(recordsPtr + records.length + 96);
		this.buffer.set(records, recordsPtr);
		this.dv.setUint32(22, recordsPtr, true);
		this.dv.setUint32(26, records.length, true);
	}
	/** Return UTF-16 token records; `reset` starts or continues a stream. */
	tokenizeLineRecords(langId, inputLength, reset) {
		const outStart = this.lexRecords(langId, inputLength, reset);
		return new Uint32Array(this.buffer.buffer, outStart, this.dv.getUint32(10, true) >> 2);
	}
	/**
	* Tokenize code into Shiki-compatible themed tokens, one array per line.
	*/
	codeToTokens(input, options) {
		const code = toCode(input);
		if (typeof input !== "string" && (code.includes("�") || input === this.memory.buffer || input instanceof Uint8Array && input.buffer === this.memory.buffer)) input = code;
		const themes = resolveOptionThemes(options);
		const cssVariablePrefix = options.cssVariablePrefix ?? "--hls-";
		return {
			tokens: isAnsi(options.lang) ? ansiTokens(code, themes, cssVariablePrefix, options.tokenizeMaxLineLength) : lineRecordsToTokens(code, this.tokenizeLineRecords(this.#languageIds?.get(String(options.lang).toLowerCase()) ?? langIdOf(options.lang), this.writeInput(input)), themes, cssVariablePrefix, options.tokenizeMaxLineLength),
			...themeMeta(themes, cssVariablePrefix)
		};
	}
	/** Grow the Wasm memory to hold `end` bytes. */
	grow(end) {
		const pages = Math.ceil(end / pageSize);
		if (pages > this.pageN) {
			this.memory.grow(pages - this.pageN);
			this.bindMemory();
		}
	}
	/**
	* Check `is_id_start` or `is_id_continue` for the code point at `ptr`.
	* `len` is its UTF-8 byte length. `shift` is 0 for ID_Start or 2 for
	* ID_Continue. Each BMP code point uses two cache bits per class:
	* 0 unknown, 1 no, 2 yes. Use the Unicode regex for cache misses and
	* astral code points.
	*/
	#idClass(ptr, len, shift) {
		this.bindMemory();
		const b = this.buffer;
		let cp;
		if (len === 2) cp = (b[ptr] & 31) << 6 | b[ptr + 1] & 63;
		else if (len === 3) cp = (b[ptr] & 15) << 12 | (b[ptr + 1] & 63) << 6 | b[ptr + 2] & 63;
		else cp = (b[ptr] & 7) << 18 | (b[ptr + 1] & 63) << 12 | (b[ptr + 2] & 63) << 6 | b[ptr + 3] & 63;
		if (cp > 1114111) return 0;
		if (cp > 65535 || cp >= 55296 && cp <= 57343) return idClassRegex[shift >> 1].test(String.fromCodePoint(cp)) ? 1 : 0;
		idClassCache ??= /* @__PURE__ */ new Uint8Array(65536);
		const known = idClassCache[cp] >> shift & 3;
		if (known !== 0) return known - 1;
		const yes = idClassRegex[shift >> 1].test(String.fromCharCode(cp));
		idClassCache[cp] |= (yes ? 2 : 1) << shift;
		return yes ? 1 : 0;
	}
	/** Rebind views after growing wasm memory. */
	bindMemory() {
		if (this.buffer.length !== 0) return;
		this.pageN = this.memory.buffer.byteLength / pageSize;
		this.buffer = new Uint8Array(this.memory.buffer);
		this.dv = new DataView(this.memory.buffer);
	}
};
/** Decode bytes for token content; keep string input's original UTF-16. */
function toCode(input) {
	if (typeof input === "string") return input;
	if (input instanceof Uint8Array || input instanceof ArrayBuffer) return dec.decode(input);
	throw new TypeError("input must be a string, Uint8Array, or ArrayBuffer");
}
/** The shared highlighter instance created by `init`. */
let shared;
/** The compiled Wasm module required by the shared highlighter. */
let wasmModule;
let loadModule;
/** Set the module that the first call compiles when `init` has not run. */
function initLazy(load) {
	loadModule = load;
}
let pooledStreamHighlighter;
let streamEmitter;
let streamLexer;
const idleStreamLexers = /* @__PURE__ */ new WeakMap();
function oversized(hl, input) {
	return hl.pageN > 128 && (typeof input === "number" ? input : typeof input === "string" ? input.length : input.byteLength) <= pageSize;
}
/** The shared highlighter, or throw when no module is set. */
function assertShared(input) {
	if (shared == null) assertWasmModule();
	const hl = shared;
	return oversized(hl, input) ? shared = createShared(hl.wasmModule) : hl;
}
/**
* A combined-module instance for the shared `codeToHtml` and `codeToTokens`.
* Once `registerLanguages` has added lexers, its Markdown fences run them.
*/
function createShared(wasm) {
	const hl = new HighlightsHighlighter(wasm, void 0, registeredLexers.size > 0 ? fenceImports(() => hl, false) : void 0);
	return hl;
}
const fenceHosts = new Set([
	"markdown",
	"mdx",
	"org"
].map((name) => LANGS[name]));
let fenceEmitter;
/** An emitter that converts the records of the shared instance to HTML. */
function assertFenceEmitter(input) {
	const lexer = assertShared(input);
	if (fenceEmitter?.wasmModule !== lexer.wasmModule || oversized(fenceEmitter, input)) {
		const emitter = new HighlightsHighlighter(lexer.wasmModule, (id, mode, length) => emitter.lexWith(shared, id, mode, length, void 0, 5), void 0, true);
		fenceEmitter = emitter;
	}
	return fenceEmitter;
}
/** Whether `registerLanguages` has added any name. */
function hasRegisteredLanguages() {
	return registeredLexers.size > 0;
}
/** The compiled Wasm module required by isolated tokenizers. */
function assertWasmModule() {
	if (wasmModule == null) {
		if (loadModule === void 0) throw new Error("highlights is not initialized");
		init(loadModule());
	}
	return wasmModule;
}
/**
* Initialize the shared highlighter from a compiled WebAssembly module.
*/
function init(wasm) {
	wasmModule = wasm;
	pooledStreamHighlighter = void 0;
	if (registered !== void 0) {
		const langs = registeredLangs;
		registered = void 0;
		registeredLangs = [];
		registerLanguages(langs);
	}
	return shared = createShared(wasm);
}
const lexerModules = /* @__PURE__ */ new WeakMap();
let emitterModule;
function compileLexer(language, sync) {
	const { wasm } = language;
	if (typeof wasm !== "string") return wasm;
	let compiled = lexerModules.get(language);
	if (compiled === void 0 || sync && !(compiled instanceof WebAssembly.Module)) {
		compiled = sync ? new WebAssembly.Module(wasmBytes(wasm)) : WebAssembly.compile(wasmBytes(wasm)).then((module) => {
			lexerModules.set(language, module);
			return module;
		});
		lexerModules.set(language, compiled);
	}
	return compiled;
}
/**
* Supply a compiled emitter module. Use it where the runtime cannot compile
* WebAssembly from bytes, such as Cloudflare Workers.
*/
function initEmitter(wasm) {
	emitterModule = Promise.resolve(wasm);
}
/** Decode base64 Wasm. */
function wasmBytes(wasm) {
	const native = globalThis;
	if (native.Uint8Array.fromBase64 !== void 0) return native.Uint8Array.fromBase64(wasm);
	if (native.Buffer !== void 0) {
		const buffer = native.Buffer.from(wasm, "base64");
		return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length);
	}
	const binary = atob(wasm);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
async function createHighlighter(options) {
	emitterModule ??= import("./emitter.wasm.mjs").then(({ default: wasm }) => WebAssembly.compile(wasmBytes(wasm))).catch((error) => {
		emitterModule = void 0;
		throw error;
	});
	const languages = [...new Set(options.langs)];
	const [emitter, ...compiled] = await Promise.all([emitterModule, ...languages.map((language) => compileLexer(language, false))]);
	const [highlighter, add] = buildHighlighter(emitter, options.themes, false);
	add(languages, compiled);
	return highlighter;
}
/**
* Create a highlighter for an emitter and themes, and a function that adds
* compiled lexers to it. Shared by `createHighlighter` and
* `registerLanguages`. With `combined`, the emitter is the combined module,
* and it lexes the embedded built-in languages that have no registered lexer.
* The function also records each name in `lexers`; see `registeredLexer`.
*/
function buildHighlighter(emitter, themeOptions, combined) {
	const registrations = /* @__PURE__ */ new Map();
	const languageIds = /* @__PURE__ */ new Map([
		["plain", 0],
		["plaintext", 0],
		["text", 0],
		["txt", 0],
		["ansi", -1]
	]);
	let nextLanguageId = 256;
	const externalIds = /* @__PURE__ */ new Map();
	const add = (languages, compiled, lexers) => {
		const builtins = compiled.map((module, i) => {
			const exports = WebAssembly.Module.exports(module);
			if (!exports.some(({ name }) => name === "recordBytes")) throw new TypeError(`${languages[i].name}: unsupported token record format; rebuild the lexer with buildHighlightsLexer`);
			for (const [alias, id] of Object.entries(languages[i].aliases)) {
				if (!Number.isInteger(id) || id < 0 || id > 255) throw new RangeError(`invalid lexer entry: ${alias}`);
				if (alias.toLowerCase() === "ansi") throw new RangeError("reserved language name: ansi");
			}
			const builtin = exports.some(({ name }) => name === "reserve");
			if (lexers !== void 0 && !builtin && !exports.some(({ name }) => name === "saveState")) throw new TypeError(`${languages[i].name}: the lexer cannot save its state; build it with buildHighlightsLexer`);
			return builtin;
		});
		for (let i = 0; i < languages.length; i++) {
			let localIds = externalIds.get(compiled[i]);
			if (localIds === void 0) externalIds.set(compiled[i], localIds = /* @__PURE__ */ new Map());
			for (const [alias, id] of Object.entries(languages[i].aliases)) {
				const name = alias.toLowerCase();
				let externalId;
				if (builtins[i] && id > 0 && id === LANGS[name]) {
					registrations.set(id, {
						module: compiled[i],
						id
					});
					externalId = id;
				} else {
					externalId = localIds.get(id);
					if (externalId === void 0) {
						externalId = nextLanguageId++;
						if (externalId > 32767) throw new RangeError("too many registered languages");
						localIds.set(id, externalId);
						registrations.set(externalId, {
							module: compiled[i],
							id
						});
					}
				}
				languageIds.set(name, externalId);
				lexers?.set(name, {
					module: builtins[i] ? void 0 : compiled[i],
					id
				});
			}
		}
	};
	const roots = /* @__PURE__ */ new Map();
	function createLexer(compiledModule, depth) {
		const streams = /* @__PURE__ */ new Map();
		const idle = [/* @__PURE__ */ new Map(), /* @__PURE__ */ new Map()];
		const release = (module, child) => {
			if (child.pageN > 16) return;
			const free = idle[1].get(module);
			if (free === void 0) idle[1].set(module, [child]);
			else free.push(child);
		};
		const lexer = new HighlightsHighlighter(compiledModule, (_id, _mode, _length, reset) => {
			if (reset !== false && streams.size > 0) {
				for (const child of streams.values()) release(child.module, child.lexer);
				streams.clear();
			}
		}, {
			language: (ptr, length) => {
				lexer.bindMemory();
				const bytes = lexer.buffer;
				let name = "";
				for (let i = ptr; i < ptr + length; i++) {
					if (bytes[i] > 127) {
						name = dec.decode(bytes.subarray(ptr, ptr + length));
						break;
					}
					name += String.fromCharCode(bytes[i]);
				}
				name = name.toLowerCase();
				const id = languageIds.get(name) ?? (combined ? LANGS[name] : void 0);
				return id !== void 0 && id > 0 ? id : 0;
			},
			embed: (id, from, to, reset, context, out, cap) => {
				if (reset === 2) {
					const child = streams.get(context);
					if (child !== void 0) {
						streams.delete(context);
						release(child.module, child.lexer);
					}
					return 0;
				}
				if (to <= from && reset !== 1) return context;
				let registration = registrations.get(id);
				if (registration === void 0 && combined && id > 0 && id < 256) {
					registration = {
						module: emitter,
						id
					};
					registrations.set(id, registration);
				}
				if (registration === void 0 || depth >= 64) return context;
				const { module } = registration;
				let child;
				let free;
				if (reset < 0) {
					free = idle[0].get(module);
					child = free?.pop() ?? createLexer(module, depth + 1);
				} else {
					if (context === 0) do
						context++;
					while (streams.has(context));
					const open = streams.get(context);
					if (open?.module === module) child = open.lexer;
					else {
						if (open !== void 0) release(open.module, open.lexer);
						child = idle[1].get(module)?.pop() ?? createLexer(module, depth + 1);
						streams.set(context, {
							module,
							lexer: child
						});
						if (reset === 0) child.lexRecords(registration.id, 0, true, 5);
					}
				}
				lexer.bindMemory();
				let length = to - from;
				let at = child.inputPtr;
				if (length <= 96 && at + 192 <= child.buffer.length) for (let i = 0; i < length; i += 4) child.dv.setUint32(at + i, lexer.dv.getUint32(from + i, true), true);
				else length = child.writeInput(lexer.buffer.subarray(from, to));
				at = child.lexRecords(registration.id, length, reset < 0 ? void 0 : reset !== 0, 5);
				length = child.dv.getUint32(10, true);
				if (length > 0) {
					if (out + length + 16 > cap) {
						out = reserve(length);
						lexer.bindMemory();
					}
					if (length <= 96) for (let i = 0; i < length; i += 4) lexer.dv.setUint32(out + i, child.dv.getUint32(at + i, true), true);
					else lexer.buffer.set(child.buffer.subarray(at, at + length), out);
					lexer.dv.setUint32(10, length, true);
				}
				if (reset < 0 && child.pageN <= 16) {
					if (free === void 0) idle[0].set(module, [child]);
					else free.push(child);
				}
				return context;
			}
		});
		lexer.buffer[14] = depth;
		const reserve = lexer.instance.exports.reserve;
		return lexer;
	}
	const themes = /* @__PURE__ */ new Map();
	for (const value of themeOptions) {
		const first = resolveTheme(value);
		let names = first === value || !value.name ? [] : [value.name];
		for (const member of first === value ? [first] : value.themes) {
			const theme = resolveTheme(member);
			if (theme.id !== void 0) themes.set(theme.id, theme);
			names.push(theme.name);
			for (const name of names) {
				themes.set(name, theme);
				themes.set(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), theme);
			}
			names = [];
		}
	}
	const plainRecord = /* @__PURE__ */ new Uint32Array(2);
	const plainBytes = new Uint8Array(plainRecord.buffer, 0, 6);
	const beforeEmit = (id, mode, length) => {
		if (id === 0) {
			plainRecord[0] = length;
			highlighter.writeRecords(mode, length, length === 0 ? plainBytes.subarray(0, 0) : plainBytes);
			return;
		}
		const registration = registrations.get(id);
		let lexer = roots.get(registration.module);
		if (lexer === void 0 || oversized(lexer, length)) {
			lexer = createLexer(registration.module, 0);
			roots.set(registration.module, lexer);
		}
		highlighter.lexWith(lexer, registration.id, mode, length);
	};
	let highlighter;
	const resolveOptions = (input, value) => {
		const lang = String(value.lang).toLowerCase();
		if (!languageIds.has(lang)) throw new RangeError(`language is not loaded: ${value.lang}`);
		const resolved = {};
		const entries = value.themes === void 0 ? [["theme", value.theme]] : Object.entries(value.themes);
		for (const [key, reference] of entries) {
			if (typeof reference !== "string") {
				resolved[key] = reference;
				continue;
			}
			const theme = themes.get(reference);
			if (theme === void 0) throw new RangeError(`theme is not loaded: ${reference}`);
			resolved[key] = theme;
		}
		if (highlighter === void 0 || oversized(highlighter, input)) highlighter = new HighlightsHighlighter(emitter, beforeEmit, void 0, true, languageIds);
		return value.themes === void 0 ? {
			...value,
			theme: resolved.theme,
			themes: void 0
		} : {
			...value,
			theme: void 0,
			themes: resolved
		};
	};
	return [{
		codeToHtml: (input, value) => {
			const resolved = resolveOptions(input, value);
			return highlighter.codeToHtml(input, resolved);
		},
		codeToTokens: (input, value) => {
			const resolved = resolveOptions(input, value);
			return highlighter.codeToTokens(input, resolved);
		},
		getLoadedLanguages: () => [...languageIds.keys()]
	}, add];
}
let registered;
let registeredLangs = [];
let registeredLexers = /* @__PURE__ */ new Map();
/**
* The lexer that `StreamTokenizer` and `LiveTokenizer` use for a name from
* `registerLanguages`. A lexer from `@pierre/wat-tools` has `module`. A
* built-in language module has none, and `id` selects the built-in lexer:
* its own lexer calls the host for embedded code and cannot save its state.
* The built-in lexer runs the registered lexers in its fences; see
* `fenceImports`.
*/
function registeredLexer(lang) {
	return registeredLexers.get(String(lang).toLowerCase());
}
/**
* The `fence_language` and `fence_lex` imports of a combined-module instance
* (`hl` returns it) that tokenizes a registered built-in language module.
* They run the registered lexers for its Markdown, MDX, Org, and Wikitext
* code blocks, as `codeToTokens` does. Each call makes its own lexer
* instances. With `live`, the instance tokenizes one line at a time and can
* start at any line: every lexer state gets an ID that the line state of the
* instance keeps, and the lexer loads it again from that ID.
*/
function fenceImports(hl, live) {
	const lexers = [];
	const states = [];
	const stateIds = /* @__PURE__ */ new Map();
	return {
		fence_language: (ptr, length) => {
			const host = hl();
			host.bindMemory();
			const found = registeredLexers.get(dec.decode(host.buffer.subarray(ptr, ptr + length)).toLowerCase());
			if (found === void 0) return 0;
			const { module, id } = found;
			if (module === void 0) return id;
			let index = lexers.findIndex((entry) => entry.module === module && entry.id === id);
			if (index < 0) index = lexers.push({
				module,
				id,
				state: 0
			}) - 1;
			return 256 + index;
		},
		fence_lex: (lang, from, to, reset, state, out) => {
			const host = hl();
			host.bindMemory();
			const entry = lexers[lang - 256];
			const lexer = entry.lexer ??= new HighlightsHighlighter(entry.module);
			const exports = lexer.instance.exports;
			if (live && reset === 0 && state !== entry.state) {
				if (state === 0) reset = 1;
				else {
					lexer.writeInput(states[state - 1]);
					exports.loadState();
				}
			}
			const at = lexer.lexRecords(entry.id, lexer.writeInput(host.buffer.subarray(from, to)), reset !== 0);
			const bytes = lexer.dv.getUint32(10, true);
			for (let i = at + 4; i < at + bytes; i += 6) {
				const type = lexer.dv.getUint16(i, true);
				if (type >= tokenTypes.length && type !== 65535) lexer.dv.setUint16(i, 0, true);
			}
			if (live) {
				const length = exports.saveState();
				lexer.bindMemory();
				const saved = lexer.buffer.subarray(at + bytes, at + bytes + length);
				let key = String.fromCharCode(lang);
				for (let i = 0; i < saved.length; i += 8192) key += String.fromCharCode.apply(null, saved.subarray(i, i + 8192));
				let id = stateIds.get(key);
				if (id === void 0) {
					id = states.push(saved.slice());
					stateIds.set(key, id);
				}
				entry.state = id;
			}
			host.grow(out + bytes + 96);
			host.dv.setUint32(10, entry.state, true);
			host.buffer.set(lexer.buffer.subarray(at, at + bytes), out);
			return bytes;
		}
	};
}
/**
* Add lexers to `codeToHtml` and `codeToTokens`. Their names and aliases
* override built-in names there. Call `init` first; the combined module emits
* their HTML, so no other Wasm loads.
*/
function registerLanguages(langs) {
	let added = [];
	for (const language of langs) {
		const aliases = JSON.stringify(language.aliases);
		const all = [...registeredLangs, ...added];
		const old = all.find((old) => old === language || old.name === language.name && old.wasm === language.wasm && JSON.stringify(old.aliases) === aliases);
		if (old === void 0) {
			added.push(language);
			continue;
		}
		const later = new Set(all.slice(all.lastIndexOf(old) + 1).flatMap((lang) => Object.keys(lang.aliases)).map((alias) => alias.toLowerCase()));
		if (Object.keys(old.aliases).some((a) => later.has(a.toLowerCase()))) added.push(old);
	}
	if (registered !== void 0 && added.length === 0) return;
	added = added.filter((lang, i) => added.lastIndexOf(lang) === i);
	const compiled = added.map((language) => compileLexer(language, true));
	if (registered === void 0) {
		registered = buildHighlighter(assertWasmModule(), [], true);
		registeredLexers = /* @__PURE__ */ new Map();
	}
	registered[1](added, compiled, registeredLexers);
	registeredLangs = [...registeredLangs.filter((lang) => !added.includes(lang)), ...added];
	if (shared !== void 0 && wasmModule !== void 0) shared = createShared(wasmModule);
	pooledStreamHighlighter = void 0;
}
/**
* Return a `<pre class="highlights">` fragment with inline colors.
* With `themes`, each span uses the default theme inline and CSS custom
* properties for the other themes, as in `codeToTokens`'s `htmlStyle`.
*/
function codeToHtml(input, options) {
	if (registered !== void 0 && registeredLexers.has(String(options.lang).toLowerCase())) return registered[0].codeToHtml(input, options);
	if (registeredLexers.size > 0 && fenceHosts.has(LANGS[String(options.lang).toLowerCase()])) return assertFenceEmitter(input).codeToHtml(input, options);
	return assertShared(input).codeToHtml(input, options);
}
/**
* Return Shiki-compatible tokens, grouped by line.
* WebAssembly lexes the input and splits lines. JavaScript converts the
* style records to tokens.
*/
function codeToTokens(input, options) {
	if (registered !== void 0 && registeredLexers.has(String(options.lang).toLowerCase())) return registered[0].codeToTokens(input, options);
	return assertShared(input).codeToTokens(input, options);
}
/**
* Convert UTF-8 chunks to themed token arrays, one per completed line.
* Use synchronous `pushCode` and `end` calls for strings or UTF-8 bytes.
* An isolated Wasm instance scans each completed chunk once and keeps
* lexer state between chunks.
*/
var StreamTokenizer = class extends TransformStream {
	#hl;
	#langId;
	#ansi;
	#themes;
	#cssVariablePrefix;
	#maxLineLength;
	#pendingBytes = /* @__PURE__ */ new Uint8Array(0);
	#pendingByteLength = 0;
	#pendingSurrogate = "";
	#tail = "";
	#streamChar = 0;
	#streamStarted = false;
	#lexer;
	#fences = false;
	constructor(options) {
		super({
			transform: (chunk, controller) => {
				try {
					for (const line of this.pushCode(chunk)) controller.enqueue(line);
				} catch (error) {
					this.dispose();
					throw error;
				}
			},
			flush: (controller) => {
				for (const line of this.end()) controller.enqueue(line);
			},
			cancel: () => this.dispose()
		});
		const registered = registeredLexer(options.lang);
		this.#ansi = isAnsi(options.lang) ? new AnsiState() : void 0;
		this.#langId = registered?.id ?? (this.#ansi === void 0 ? langIdOf(options.lang) : 0);
		this.#themes = resolveOptionThemes(options);
		const compiledWasm = assertWasmModule();
		if (registered === void 0 && registeredLexers.size === 0) {
			this.#hl = pooledStreamHighlighter?.wasmModule === compiledWasm ? pooledStreamHighlighter : new HighlightsHighlighter(compiledWasm);
			pooledStreamHighlighter = void 0;
		} else if (registered?.module === void 0) {
			this.#fences = true;
			this.#hl = new HighlightsHighlighter(compiledWasm, void 0, fenceImports(() => this.#hl, false));
		} else {
			this.#lexer = idleStreamLexers.get(registered.module) ?? new HighlightsHighlighter(registered.module);
			idleStreamLexers.delete(registered.module);
			if (streamEmitter?.wasmModule !== compiledWasm) {
				const emitter = new HighlightsHighlighter(compiledWasm, (id, mode, length, reset) => emitter.lexWith(streamLexer, id, mode, length, reset), void 0, true);
				streamEmitter = emitter;
			}
			this.#hl = streamEmitter;
		}
		this.#cssVariablePrefix = options.cssVariablePrefix ?? "--hls-";
		this.#maxLineLength = options.tokenizeMaxLineLength;
	}
	/**
	* Append text or UTF-8 bytes. Return tokens for each completed line,
	* with offsets relative to the full input.
	* Incomplete UTF-8 stays buffered between byte chunks. A nonempty
	* string flushes those bytes first. The final line stays buffered
	* until a newline or `end()`.
	*/
	pushCode(chunk) {
		if (this.#hl == null) throw new Error("stream has ended");
		if (chunk.length === 0) return [];
		if (typeof chunk !== "string") {
			let end = chunk.lastIndexOf(10) + 1;
			if (end === 0) {
				this.#bufferBytes(chunk);
				return [];
			}
			if (this.#pendingByteLength > 0) {
				end += this.#pendingByteLength;
				chunk = this.#bufferBytes(chunk);
			}
			const lines = this.#tokenizeChunk(chunk.subarray(0, end), this.#tail + this.#pendingSurrogate);
			this.#tail = "";
			this.#pendingSurrogate = "";
			this.#pendingByteLength = 0;
			if (end < chunk.length) this.#bufferBytes(chunk.subarray(end));
			lines.pop();
			return lines;
		}
		if (this.#pendingByteLength > 0) {
			chunk = dec.decode(this.#pendingBytes.subarray(0, this.#pendingByteLength)) + chunk;
			this.#pendingByteLength = 0;
		}
		chunk = this.#pendingSurrogate + chunk;
		this.#pendingSurrogate = "";
		const lastCode = chunk.charCodeAt(chunk.length - 1);
		if (lastCode >= 55296 && lastCode <= 56319) {
			this.#pendingSurrogate = chunk.slice(-1);
			chunk = chunk.slice(0, -1);
		}
		const end = chunk.lastIndexOf("\n") + 1;
		if (end === 0) {
			this.#tail += chunk;
			return [];
		}
		const code = this.#tail + chunk.slice(0, end);
		this.#tail = chunk.slice(end);
		const lines = this.#tokenizeChunk(code);
		lines.pop();
		return lines;
	}
	/**
	* Finish UTF-8 decoding and return the remaining lines.
	* A trailing line terminator produces a final empty line, as in
	* `codeToTokens`.
	*/
	end() {
		if (this.#hl == null) throw new Error("stream has ended");
		try {
			if (this.#pendingByteLength > 0) return this.#tokenizeChunk(this.#pendingBytes.subarray(0, this.#pendingByteLength), this.#tail + this.#pendingSurrogate);
			this.#tail += this.#pendingSurrogate;
			this.#pendingSurrogate = "";
			if (this.#tail === "") return [[]];
			const code = this.#tail;
			this.#tail = "";
			return this.#tokenizeChunk(code);
		} finally {
			this.dispose();
		}
	}
	/** Release the Wasm instance and discard buffered input; later calls throw. */
	dispose() {
		const hl = this.#hl;
		if (hl == null) return;
		if (this.#lexer !== void 0) {
			if (streamLexer === this.#lexer) streamLexer = void 0;
			if (this.#lexer.pageN <= 16) idleStreamLexers.set(this.#lexer.wasmModule, this.#lexer);
			if (streamEmitter === hl && hl.pageN > 16) streamEmitter = void 0;
			this.#lexer = void 0;
		} else if (!this.#fences && pooledStreamHighlighter == null && hl.wasmModule === wasmModule && hl.pageN <= 16) pooledStreamHighlighter = hl;
		this.#hl = void 0;
		this.#pendingBytes = /* @__PURE__ */ new Uint8Array(0);
		this.#pendingByteLength = 0;
		this.#pendingSurrogate = "";
		this.#tail = "";
	}
	/** Own unfinished bytes so callers can reuse chunks; grow geometrically for long lines. */
	#bufferBytes(chunk) {
		const length = this.#pendingByteLength + chunk.length;
		if (length > this.#pendingBytes.length) {
			const buffer = new Uint8Array(Math.max(length, this.#pendingBytes.length * 2, 1024));
			buffer.set(this.#pendingBytes.subarray(0, this.#pendingByteLength));
			this.#pendingBytes = buffer;
		}
		this.#pendingBytes.set(chunk, this.#pendingByteLength);
		this.#pendingByteLength = length;
		return this.#pendingBytes.subarray(0, length);
	}
	/** Tokenize completed input; a string prefix preserves original UTF-16 when mixing inputs. */
	#tokenizeChunk(input, prefix = "") {
		const hl = this.#hl;
		if (hl == null) throw new Error("stream has ended");
		let code = toCode(input);
		if (typeof input !== "string" && code.includes("�")) input = code;
		code = prefix + code;
		let lines;
		if (this.#ansi === void 0) {
			let byteLen = prefix === "" ? 0 : hl.writeInput(prefix);
			byteLen += hl.writeInput(input, byteLen);
			streamLexer = this.#lexer;
			const recs = hl.tokenizeLineRecords(this.#langId, byteLen, !this.#streamStarted);
			this.#streamStarted = true;
			lines = lineRecordsToTokens(code, recs, this.#themes, this.#cssVariablePrefix, this.#maxLineLength, this.#streamChar);
		} else lines = ansiTokens(code, this.#themes, this.#cssVariablePrefix, this.#maxLineLength, this.#ansi, this.#streamChar);
		this.#streamChar += code.length;
		return lines;
	}
};
//#endregion
export { HighlightsHighlighter, LANGS, StreamTokenizer, assertWasmModule, codeToHtml, codeToTokens, createHighlighter, fenceImports, hasRegisteredLanguages, init, initEmitter, initLazy, isRegisteredLanguage, isSupportedLanguage, langIdOf, registerLanguages, registeredLexer, wasmBytes };

//# sourceMappingURL=highlighter.js.map