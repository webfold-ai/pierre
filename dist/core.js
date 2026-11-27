//#region lib/core.ts
const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { ignoreBOM: true });
const lineKeys = ["ignoreWhitespace", "stripTrailingCr"];
const patchKeys = [
	...lineKeys,
	"context",
	"headerOptions"
];
let load;
let wasm;
let memory;
let diffCall;
let u8;
let dv;
let maxBytes = 32 << 20;
let wtf8;
/**
* Set the function that returns the compiled wasm module (the index and
* workerd entries call it). The first diff call runs it, so importing the
* package works where WebAssembly is unavailable. A new call drops the current
* instance; the next diff call starts with empty wasm memory.
*/
function init(loadModule) {
	load = loadModule;
	wasm = void 0;
}
/** Create a wasm instance, compiling the module first if needed. */
function start() {
	const compiled = wasm ?? load();
	const { exports } = new WebAssembly.Instance(compiled, {});
	wasm = compiled;
	memory = exports.memory;
	diffCall = exports.diff;
	bind();
	try {
		crypto.getRandomValues(u8.subarray(1016, 1024));
		u8[1016] |= 1;
	} catch {}
}
/**
* Set how much wasm memory, in bytes, stays allocated between calls (default
* 32 MB). Wasm memory cannot shrink, so when a call grows it past the limit,
* a new wasm instance replaces it after the call, and the garbage collector
* frees the old memory. `Infinity` keeps all memory for the next calls.
*/
function setMemoryLimit(bytes) {
	if (!(bytes >= 0)) throw new RangeError("the memory limit must be a non-negative number");
	maxBytes = bytes;
	if (wasm !== void 0) release();
}
/** Diff two texts, treating each Unicode code point as a token. */
function diffChars(oldStr, newStr, options) {
	check(options, "diffChars");
	return run(1, oldStr, newStr);
}
/**
* Diff two texts, treating each word, run of spaces, newline, and other
* character as a token.
*/
function diffWordsWithSpace(oldStr, newStr, options) {
	check(options, "diffWordsWithSpace");
	return run(2, oldStr, newStr);
}
/**
* Diff two texts, treating each line as a token. A line's trailing `\n` (or
* `\r\n`) belongs to its token, as in jsdiff.
*/
function diffLines(oldStr, newStr, options) {
	check(options, "diffLines", lineKeys);
	return run(4, oldStr, newStr, options);
}
/** Create a unified diff of one file: `createTwoFilesPatch` with one name on both sides. */
function createPatch(fileName, oldStr, newStr, oldHeader, newHeader, options) {
	return createTwoFilesPatch(fileName, fileName, oldStr, newStr, oldHeader, newHeader, options);
}
/** Create a unified diff of two files, byte-identical to jsdiff. */
function createTwoFilesPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, options) {
	if (options?.newlineIsToken ?? false) throw new Error("newlineIsToken may not be used with patch-generation functions, only with diffing functions");
	check(options, "createTwoFilesPatch", patchKeys);
	const h = options?.headerOptions;
	const c = options?.context;
	const context = c === void 0 ? 4 : c === null || c === false ? 0 : c;
	if (!(Number.isInteger(context) && context >= 0) && context !== Infinity) throw new Error("options.context must be a non-negative integer");
	return run(3, oldStr, newStr, options, Math.min(context, 268435455), (Boolean(h) === false ? 7 : (h.includeIndex ?? false ? 1 : 0) | (h.includeUnderline ?? false ? 2 : 0) | (h.includeFileHeaders ?? false ? 4 : 0)) | (oldFileName !== void 0 ? 8 : 0) | (newFileName !== void 0 ? 16 : 0), [
		oldFileName === void 0 ? "" : String(oldFileName),
		newFileName === void 0 ? "" : String(newFileName),
		oldHeader ? String(oldHeader) : "",
		newHeader ? String(newHeader) : ""
	]);
}
/**
* Throw for callbacks and for options outside `allowed` that would change the
* result. Like jsdiff, an option set to `undefined`, `null`, or `false` is off,
* so it is accepted.
*/
function check(options, api, allowed) {
	if (typeof options === "function") throw new Error("callbacks are not supported by @pierre/patches");
	if (options == null) return;
	for (const [key, value] of Object.entries(options)) if (value != null && value !== false && !(allowed?.includes(key) ?? false)) throw new Error(`options.${key} is not supported by @pierre/patches ${api}`);
}
/**
* Run op [0] (src/mem.wat) and read its result: the change objects, or the
* patch text for op 3. `headers` are the filenames and headers of op 3.
*/
function run(op, oldStr, newStr, options, context = 0, headerFlags = 0, headers) {
	if (typeof oldStr !== "string" || typeof newStr !== "string") throw new TypeError("expected the texts to diff to be strings");
	if (options?.stripTrailingCr ?? false) {
		oldStr = oldStr.replaceAll("\r\n", "\n");
		newStr = newStr.replaceAll("\r\n", "\n");
	}
	if (oldStr.length >= 268435456 || newStr.length >= 268435456) throw new Error("out of memory");
	if (wasm === void 0) start();
	let need = 65600 + (oldStr.length + newStr.length) * 3;
	if (headers !== void 0) for (const s of headers) need += s.length * 3;
	if (need > u8.length) {
		try {
			memory.grow(Math.ceil((need - u8.length) / 65536));
		} catch {
			throw new Error("out of memory");
		}
		bind();
	}
	wtf8 = false;
	const oldLen = encode(oldStr, 65536);
	const newLen = encode(newStr, 65536 + oldLen);
	if (headers !== void 0) {
		let p = 65536 + oldLen + newLen;
		for (let i = 0; i < 4; i++) {
			const n = encode(headers[i], p);
			dv.setUint32(28 + i * 4, n, true);
			p += n;
		}
	}
	dv.setUint32(0, op | headerFlags << 16 | (oldLen === oldStr.length ? 1 << 24 : 0) | (newLen === newStr.length ? 2 << 24 : 0) | (options?.ignoreWhitespace ?? false ? 4 << 24 : 0), true);
	dv.setUint32(4, oldLen, true);
	dv.setUint32(8, newLen, true);
	dv.setUint32(24, context, true);
	diffCall();
	if (u8.length === 0) bind();
	let ptr = dv.getUint32(16, true);
	if (u8[1] === 0) {
		const message = dec.decode(u8.subarray(ptr, ptr + dv.getUint32(12, true)));
		release();
		throw new Error(message);
	}
	let result;
	if (op === 3) {
		const bytes = u8.subarray(ptr, ptr + dv.getUint32(20, true));
		result = "";
		let from = 0;
		if (wtf8) for (let i = bytes.indexOf(237); i !== -1; i = bytes.indexOf(237, i + 1)) {
			if (bytes[i + 1] < 160) continue;
			result += dec.decode(bytes.subarray(from, i)) + String.fromCharCode(53248 | (bytes[i + 1] & 63) << 6 | bytes[i + 2] & 63);
			from = i + 3;
		}
		result += dec.decode(bytes.subarray(from));
	} else {
		const count = dv.getUint32(12, true);
		result = new Array(count);
		for (let i = 0; i < count; i++, ptr += 16) {
			const removed = u8[ptr] === 1;
			result[i] = {
				count: dv.getUint32(ptr + 4, true),
				added: u8[ptr] === 2,
				removed,
				value: (removed ? oldStr : newStr).slice(dv.getUint32(ptr + 8, true), dv.getUint32(ptr + 12, true))
			};
		}
	}
	release();
	return result;
}
/**
* Write `s` at `p` as WTF-8 and return the byte count. Short texts and texts
* with lone surrogates go through the JS encoder: encodeInto costs more per
* call, and it writes lone surrogates as U+FFFD.
*/
function encode(s, p) {
	if (s.length < 256) return encodeJS(s, p);
	const written = enc.encodeInto(s, u8.subarray(p)).written;
	return written === s.length || (s.isWellFormed?.() ?? false) ? written : encodeJS(s, p);
}
/** Write `s` at `p` as WTF-8 and return the byte count; lone surrogates set `wtf8`. */
function encodeJS(s, p) {
	let q = p;
	for (let i = 0; i < s.length; i++) {
		const c = s.codePointAt(i);
		if (c < 128) {
			u8[q++] = c;
			continue;
		}
		if (c < 2048) u8[q++] = 192 | c >> 6;
		else {
			if (c < 65536) {
				u8[q++] = 224 | c >> 12;
				if ((c & 63488) === 55296) wtf8 = true;
			} else {
				u8[q++] = 240 | c >> 18;
				u8[q++] = 128 | c >> 12 & 63;
				i++;
			}
			u8[q++] = 128 | c >> 6 & 63;
		}
		u8[q++] = 128 | c & 63;
	}
	return q - p;
}
/** Bind the views to the current wasm memory. */
function bind() {
	u8 = new Uint8Array(memory.buffer);
	dv = new DataView(memory.buffer);
}
/** Replace the instance when its memory passed the limit; the GC frees the old one. */
function release() {
	if (u8.length > maxBytes) try {
		start();
	} catch {}
}
//#endregion
export { createPatch, createTwoFilesPatch, diffChars, diffLines, diffWordsWithSpace, init, setMemoryLimit };

//# sourceMappingURL=core.js.map