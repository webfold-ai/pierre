import { a as acquireHighlighterType, c as AttachedLanguages, d as ResolvedHighlightsLanguages, f as ResolvedLanguages, m as DEFAULT_THEMES, n as setDeferredArrayItem, o as releaseHighlighterType, r as appendItems, s as resolveHighlighterType, t as renderTokenLines } from "./renderTokenLines-BLZwGeIp.js";
import { normalizeThemeColors } from "@pierre/theming/color";
//#region src/highlighter/languages/attachResolvedLanguages.ts
/**
* Record resolved grammars in the shared language cache and attach them to a
* highlighter. Highlights attaches only the lexers registered for it.
*/
function attachResolvedLanguages(resolvedLanguages, highlighter) {
	const languages = Array.isArray(resolvedLanguages) ? resolvedLanguages : [resolvedLanguages];
	if (languages.length > 1 && highlighter.name !== "highlights") {
		for (const language of languages) {
			const lang = cacheResolvedLanguage(language);
			highlighter.attachLanguages([lang]);
			AttachedLanguages.add(lang.name);
		}
		return;
	}
	const langs = languages.map(cacheResolvedLanguage);
	highlighter.attachLanguages(langs);
	for (const lang of langs) AttachedLanguages.add(lang.name);
}
function cacheResolvedLanguage(language) {
	const cache = language.highlights == null ? ResolvedLanguages : ResolvedHighlightsLanguages;
	const cached = cache.get(language.name);
	if (cached != null) return cached;
	cache.set(language.name, language);
	return language;
}
//#endregion
//#region src/highlighter/shared_highlighter.ts
/**
* Creates an instance the caller must dispose. Defaults to the active type
* or DEFAULT_HIGHLIGHTER; rejects if a different type is already active.
*/
async function createHighlighter(type) {
	const resolvedType = resolveHighlighterType(type);
	acquireHighlighterType(resolvedType);
	try {
		if (resolvedType === "highlights") {
			const { HighlightsHighlighter } = await import("./highlights-CIgHM7EF.js");
			return new HighlightsHighlighter();
		}
		const { ShikiHighlighter } = await import("./shiki-DxP4sN1Z.js");
		return await ShikiHighlighter.create(resolvedType);
	} finally {
		releaseHighlighterType();
	}
}
//#endregion
//#region src/highlighter/themes/attachResolvedThemes.ts
/** Seed themes received from the main thread into the worker's backend resolver. */
function attachResolvedThemes(themes, highlighter) {
	for (const theme of Array.isArray(themes) ? themes : [themes]) {
		const resolved = typeof theme === "string" ? highlighter.themeResolver.getResolvedThemes([theme])[0] : theme;
		highlighter.themeResolver.seedResolvedTheme(resolved.name, resolved);
	}
}
//#endregion
//#region src/utils/getFiletypeFromFileName.ts
const CUSTOM_EXTENSION_TO_FILE_FORMAT = /* @__PURE__ */ new Map();
let customExtensionsVersion = 0;
const EXTENSION_TO_FILE_FORMAT = {
	"1c": "1c",
	abap: "abap",
	as: "actionscript-3",
	ada: "ada",
	adb: "ada",
	ads: "ada",
	adoc: "asciidoc",
	asciidoc: "asciidoc",
	"component.html": "angular-html",
	"component.ts": "angular-ts",
	conf: "nginx",
	htaccess: "apache",
	cls: "tex",
	trigger: "apex",
	apl: "apl",
	applescript: "applescript",
	scpt: "applescript",
	ara: "ara",
	asm: "asm",
	s: "riscv",
	astro: "astro",
	awk: "awk",
	bal: "ballerina",
	sh: "zsh",
	bash: "zsh",
	bat: "cmd",
	cmd: "cmd",
	be: "berry",
	beancount: "beancount",
	bib: "bibtex",
	bicep: "bicep",
	"blade.php": "blade",
	bsl: "bsl",
	c: "c",
	h: "objective-cpp",
	cs: "csharp",
	cpp: "cpp",
	cppm: "cpp",
	hpp: "cpp",
	cc: "cpp",
	cxx: "cpp",
	hh: "cpp",
	cdc: "cdc",
	cairo: "cairo",
	clar: "clarity",
	clj: "clojure",
	cljs: "clojure",
	cljc: "clojure",
	soy: "soy",
	cmake: "cmake",
	"CMakeLists.txt": "cmake",
	cob: "cobol",
	cbl: "cobol",
	cobol: "cobol",
	CODEOWNERS: "codeowners",
	ql: "ql",
	coffee: "coffeescript",
	lisp: "lisp",
	cl: "lisp",
	lsp: "lisp",
	log: "log",
	v: "verilog",
	cql: "cql",
	cr: "crystal",
	css: "css",
	csv: "csv",
	cue: "cue",
	cypher: "cypher",
	cyp: "cypher",
	d: "d",
	dart: "dart",
	dax: "dax",
	desktop: "desktop",
	diff: "diff",
	patch: "diff",
	Dockerfile: "dockerfile",
	dockerfile: "dockerfile",
	env: "dotenv",
	dm: "dream-maker",
	edge: "edge",
	el: "emacs-lisp",
	ex: "elixir",
	exs: "elixir",
	elm: "elm",
	erb: "erb",
	erl: "erlang",
	hrl: "erlang",
	f: "fortran-fixed-form",
	for: "fortran-fixed-form",
	fs: "fsharp",
	fsi: "fsharp",
	fsx: "fsharp",
	f03: "f03",
	f08: "f08",
	f18: "f18",
	f77: "f77",
	f90: "fortran-free-form",
	f95: "fortran-free-form",
	fnl: "fennel",
	fish: "fish",
	ftl: "ftl",
	tres: "gdresource",
	res: "gdresource",
	gd: "gdscript",
	gdshader: "gdshader",
	gs: "genie",
	feature: "gherkin",
	COMMIT_EDITMSG: "git-commit",
	"git-rebase-todo": "git-rebase",
	gjs: "glimmer-js",
	gleam: "gleam",
	gts: "glimmer-ts",
	glsl: "glsl",
	vert: "glsl",
	frag: "glsl",
	shader: "shaderlab",
	gp: "gnuplot",
	plt: "gnuplot",
	gnuplot: "gnuplot",
	go: "go",
	graphql: "graphql",
	gql: "graphql",
	groovy: "groovy",
	gvy: "groovy",
	hack: "hack",
	haml: "haml",
	hbs: "handlebars",
	handlebars: "handlebars",
	hs: "haskell",
	lhs: "haskell",
	hx: "haxe",
	hcl: "hcl",
	hjson: "hjson",
	hlsl: "hlsl",
	fx: "hlsl",
	html: "html",
	htm: "html",
	http: "http",
	rest: "http",
	hxml: "hxml",
	hy: "hy",
	imba: "imba",
	ini: "ini",
	cfg: "ini",
	jade: "pug",
	pug: "pug",
	java: "java",
	js: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	jinja: "jinja",
	jinja2: "jinja",
	j2: "jinja",
	jison: "jison",
	jl: "julia",
	json: "json",
	json5: "json5",
	jsonc: "jsonc",
	jsonl: "jsonl",
	jsonnet: "jsonnet",
	libsonnet: "jsonnet",
	jssm: "jssm",
	jsx: "jsx",
	kt: "kotlin",
	kts: "kts",
	kql: "kusto",
	tex: "tex",
	ltx: "tex",
	lean: "lean4",
	less: "less",
	liquid: "liquid",
	lit: "lit",
	ll: "llvm",
	logo: "logo",
	lua: "lua",
	luau: "luau",
	Makefile: "makefile",
	mk: "makefile",
	makefile: "makefile",
	md: "markdown",
	markdown: "markdown",
	marko: "marko",
	m: "wolfram",
	mat: "matlab",
	mdc: "mdc",
	mdx: "mdx",
	wiki: "wikitext",
	mediawiki: "wikitext",
	mmd: "mermaid",
	mermaid: "mermaid",
	mips: "mipsasm",
	mojo: "mojo",
	"🔥": "mojo",
	move: "move",
	nar: "narrat",
	nf: "nextflow",
	nim: "nim",
	nims: "nim",
	nimble: "nim",
	nix: "nix",
	nu: "nushell",
	mm: "objective-cpp",
	ml: "ocaml",
	mli: "ocaml",
	mll: "ocaml",
	mly: "ocaml",
	odin: "odin",
	pas: "pascal",
	p: "pascal",
	pl: "prolog",
	pm: "perl",
	t: "perl",
	raku: "raku",
	p6: "raku",
	pl6: "raku",
	php: "php",
	phtml: "php",
	pls: "plsql",
	sql: "sql",
	po: "po",
	polar: "polar",
	pcss: "postcss",
	pot: "pot",
	potx: "potx",
	pq: "powerquery",
	pqm: "powerquery",
	ps1: "powershell",
	psm1: "powershell",
	psd1: "powershell",
	prisma: "prisma",
	pro: "prolog",
	P: "prolog",
	properties: "properties",
	proto: "protobuf",
	pp: "puppet",
	purs: "purescript",
	py: "python",
	pyw: "python",
	pyi: "python",
	BUCK: "python",
	BUILD: "python",
	PACKAGE: "python",
	WORKSPACE: "python",
	Tiltfile: "python",
	bazel: "python",
	bxl: "python",
	bzl: "python",
	bzlmod: "python",
	star: "python",
	sky: "python",
	qml: "qml",
	qmldir: "qmldir",
	qss: "qss",
	r: "r",
	R: "r",
	rkt: "racket",
	rktl: "racket",
	razor: "razor",
	cshtml: "razor",
	rb: "ruby",
	rbw: "ruby",
	reg: "reg",
	regex: "regexp",
	rel: "rel",
	rs: "rust",
	rst: "rst",
	rake: "ruby",
	gemspec: "ruby",
	jbuilder: "ruby",
	builder: "ruby",
	rabl: "ruby",
	arb: "ruby",
	ru: "ruby",
	podspec: "ruby",
	Gemfile: "ruby",
	Rakefile: "ruby",
	Guardfile: "ruby",
	Capfile: "ruby",
	Berksfile: "ruby",
	Brewfile: "ruby",
	Vagrantfile: "ruby",
	Thorfile: "ruby",
	Appraisals: "ruby",
	Dangerfile: "ruby",
	sas: "sas",
	sass: "sass",
	scala: "scala",
	sc: "scala",
	scm: "scheme",
	ss: "scheme",
	sld: "scheme",
	scss: "scss",
	sdbl: "sdbl",
	shadergraph: "shader",
	st: "smalltalk",
	sol: "solidity",
	sparql: "sparql",
	rq: "sparql",
	spl: "splunk",
	config: "ssh-config",
	do: "stata",
	ado: "stata",
	dta: "stata",
	styl: "stylus",
	stylus: "stylus",
	svelte: "svelte",
	swift: "swift",
	sv: "system-verilog",
	svh: "system-verilog",
	service: "systemd",
	socket: "systemd",
	device: "systemd",
	timer: "systemd",
	talon: "talonscript",
	tasl: "tasl",
	tcl: "tcl",
	templ: "templ",
	tf: "tf",
	tfvars: "tfvars",
	toml: "toml",
	ts: "typescript",
	mts: "typescript",
	cts: "typescript",
	tsp: "typespec",
	tsv: "tsv",
	tsx: "tsx",
	ttl: "turtle",
	twig: "twig",
	typ: "typst",
	vv: "v",
	vala: "vala",
	vapi: "vala",
	vb: "vb",
	vbs: "vb",
	bas: "vb",
	vh: "verilog",
	vhd: "vhdl",
	vhdl: "vhdl",
	vim: "vimscript",
	vue: "vue",
	"vine.ts": "vue-vine",
	vy: "vyper",
	wasm: "wasm",
	wat: "wasm",
	wy: "文言",
	wgsl: "wgsl",
	wit: "wit",
	wl: "wolfram",
	nb: "wolfram",
	xml: "xml",
	xsl: "xsl",
	xslt: "xsl",
	yaml: "yaml",
	yml: "yml",
	zs: "zenscript",
	zig: "zig",
	zsh: "zsh",
	sty: "tex"
};
function getFiletypeFromFileName(fileName) {
	const format = matchFiletypeFromName(fileName);
	if (format != null) return format;
	const baseName = fileName.split(/[/\\]/).pop() ?? fileName;
	return baseName === fileName ? "text" : matchFiletypeFromName(baseName) ?? "text";
}
function matchFiletypeFromName(fileName) {
	if (CUSTOM_EXTENSION_TO_FILE_FORMAT.has(fileName)) return CUSTOM_EXTENSION_TO_FILE_FORMAT.get(fileName) ?? "text";
	if (Object.hasOwn(EXTENSION_TO_FILE_FORMAT, fileName)) return EXTENSION_TO_FILE_FORMAT[fileName] ?? null;
	const compoundMatch = fileName.match(/\.([^/\\]+\.[^/\\]+)$/);
	if (compoundMatch != null) {
		if (CUSTOM_EXTENSION_TO_FILE_FORMAT.has(compoundMatch[1])) return CUSTOM_EXTENSION_TO_FILE_FORMAT.get(compoundMatch[1]) ?? "text";
		if (Object.hasOwn(EXTENSION_TO_FILE_FORMAT, compoundMatch[1])) return EXTENSION_TO_FILE_FORMAT[compoundMatch[1]] ?? "text";
	}
	const simpleMatch = fileName.match(/\.([^.]+)$/)?.[1] ?? "";
	if (CUSTOM_EXTENSION_TO_FILE_FORMAT.has(simpleMatch)) return CUSTOM_EXTENSION_TO_FILE_FORMAT.get(simpleMatch) ?? "text";
	return Object.hasOwn(EXTENSION_TO_FILE_FORMAT, simpleMatch) ? EXTENSION_TO_FILE_FORMAT[simpleMatch] ?? "text" : null;
}
function replaceCustomExtensions(version, map) {
	if (version <= customExtensionsVersion) return false;
	CUSTOM_EXTENSION_TO_FILE_FORMAT.clear();
	for (const key in map) {
		const lang = map[key];
		if (lang != null) CUSTOM_EXTENSION_TO_FILE_FORMAT.set(key, lang);
	}
	customExtensionsVersion = version;
	return true;
}
//#endregion
//#region src/utils/cleanLastNewline.ts
function cleanLastNewline(contents) {
	let end = contents.length;
	if (contents.charCodeAt(end - 1) === 10) {
		end--;
		if (contents.charCodeAt(end - 1) === 13) end--;
	}
	return contents.slice(0, end);
}
//#endregion
//#region src/utils/endsWithNewline.ts
function endsWithNewline(diff, side) {
	const lines = side === "additions" ? diff.additionLines : diff.deletionLines;
	if (lines.length === 0) return false;
	if (diff.isPartial) {
		const lastHunk = diff.hunks.at(-1);
		return lastHunk != null && !(side === "additions" ? lastHunk.noEOFCRAdditions : lastHunk.noEOFCRDeletions);
	}
	return lines.at(-1)?.endsWith("\n") === true;
}
//#endregion
//#region src/utils/getHunkSideBoundaries.ts
/** Converts a unified hunk side's start/count into its consumed-file range. */
function getHunkSideStartBoundary(start, count) {
	return start - (count === 0 ? 0 : 1);
}
function getHunkSideEndBoundary(start, count) {
	return getHunkSideStartBoundary(start, count) + count;
}
//#endregion
//#region src/utils/virtualDiffLayout.ts
function getExpandedRegion({ isPartial, rangeSize, expandedHunks, hunkIndex, collapsedContextThreshold }) {
	const normalizedRangeSize = Math.max(rangeSize, 0);
	if (normalizedRangeSize === 0 || isPartial) return {
		fromStart: 0,
		fromEnd: 0,
		rangeSize: normalizedRangeSize,
		collapsedLines: normalizedRangeSize,
		renderAll: false
	};
	if (expandedHunks === true || normalizedRangeSize <= collapsedContextThreshold) return {
		fromStart: normalizedRangeSize,
		fromEnd: 0,
		rangeSize: normalizedRangeSize,
		collapsedLines: 0,
		renderAll: true
	};
	const region = expandedHunks?.get(hunkIndex);
	const fromStart = Math.min(Math.max(region?.fromStart ?? 0, 0), normalizedRangeSize);
	const fromEnd = Math.min(Math.max(region?.fromEnd ?? 0, 0), normalizedRangeSize);
	const expandedCount = fromStart + fromEnd;
	const renderAll = expandedCount >= normalizedRangeSize;
	return {
		fromStart: renderAll ? normalizedRangeSize : fromStart,
		fromEnd: renderAll ? 0 : fromEnd,
		rangeSize: normalizedRangeSize,
		collapsedLines: Math.max(normalizedRangeSize - expandedCount, 0),
		renderAll
	};
}
function getTrailingContextRangeSize({ fileDiff, errorPrefix }) {
	const lastHunk = fileDiff.hunks[fileDiff.hunks.length - 1];
	if (lastHunk == null || fileDiff.isPartial || fileDiff.additionLines.length === 0 || fileDiff.deletionLines.length === 0) return 0;
	const additionRemaining = fileDiff.additionLines.length - getHunkSideEndBoundary(lastHunk.additionStart, lastHunk.additionCount);
	const deletionRemaining = fileDiff.deletionLines.length - getHunkSideEndBoundary(lastHunk.deletionStart, lastHunk.deletionCount);
	if (additionRemaining <= 0 && deletionRemaining <= 0) return 0;
	if (additionRemaining !== deletionRemaining) throw new Error(`${errorPrefix}: trailing context mismatch (additions=${additionRemaining}, deletions=${deletionRemaining}) for ${fileDiff.name}`);
	return Math.min(additionRemaining, deletionRemaining);
}
function getTrailingExpandedRegion({ fileDiff, hunkIndex, expandedHunks, collapsedContextThreshold, errorPrefix }) {
	if (hunkIndex !== fileDiff.hunks.length - 1) return;
	const trailingRangeSize = getTrailingContextRangeSize({
		fileDiff,
		errorPrefix
	});
	if (trailingRangeSize <= 0) return;
	if (expandedHunks === true || trailingRangeSize <= collapsedContextThreshold) return {
		fromStart: trailingRangeSize,
		fromEnd: 0,
		rangeSize: trailingRangeSize,
		collapsedLines: 0,
		renderAll: true
	};
	const region = expandedHunks?.get(fileDiff.hunks.length);
	const fromStart = Math.min(Math.max(region?.fromStart ?? 0, 0), trailingRangeSize);
	return {
		fromStart,
		fromEnd: 0,
		rangeSize: trailingRangeSize,
		collapsedLines: trailingRangeSize - fromStart,
		renderAll: fromStart >= trailingRangeSize
	};
}
//#endregion
//#region src/utils/DiffRowCursor.ts
function throwMissingSide(side) {
	throw new Error(`DiffRowCursor: row has no ${side} line`);
}
const ENTER_HUNK = 0;
const LEADING_START = 1;
const LEADING_END = 2;
const CONTENT = 3;
const CHANGE_REST = 4;
const TRAILING = 5;
const TRAILING_NEWLINE = 6;
const DONE = 7;
var DiffRowCursor = class {
	diff;
	diffStyle;
	expandedHunks;
	collapsedContextThreshold;
	includeTrailingNewline;
	startingLine;
	windowEnd;
	unifiedCount = 0;
	splitCount = 0;
	rowType = "context";
	rowHunkIndex = 0;
	rowHunk = void 0;
	rowHasDeletion = false;
	rowHasAddition = false;
	index = -1;
	end = 0;
	secondStretchFirst = 0;
	secondStretchEnd = 0;
	deletionIndexStart = 0;
	deletionNumberStart = 0;
	deletionUnifiedStart = 0;
	additionIndexStart = 0;
	additionNumberStart = 0;
	additionUnifiedStart = 0;
	splitStart = 0;
	firstRowCollapsedBefore = 0;
	collapsedAfterValue = 0;
	collapsedAfterRow = -1;
	deletionNoEOFCRRow = -1;
	additionNoEOFCRRow = -1;
	part = ENTER_HUNK;
	walkHunkIndex = 0;
	walkHunk = void 0;
	contentIndex = 0;
	pendingCollapsed = 0;
	leadingStartRows = 0;
	leadingEndRows = 0;
	leadingRangeSize = 0;
	trailingRows = -1;
	trailingCollapsed = 0;
	unifiedAt = 0;
	splitAt = 0;
	deletionIndexAt = 0;
	additionIndexAt = 0;
	deletionNumberAt = 0;
	additionNumberAt = 0;
	collapsedAfterAt = -1;
	constructor({ diff, diffStyle, startingLine = 0, totalLines = Infinity, expandedHunks, collapsedContextThreshold = 1, includeTrailingNewline = false }) {
		this.diff = diff;
		this.diffStyle = diffStyle;
		this.startingLine = startingLine;
		this.windowEnd = startingLine + totalLines;
		this.expandedHunks = expandedHunks;
		this.collapsedContextThreshold = collapsedContextThreshold;
		this.includeTrailingNewline = includeTrailingNewline;
		if (totalLines === 0) this.part = DONE;
		else if (startingLine > 0) this.findStartingHunk();
	}
	next() {
		const { index, end } = this;
		const next = index + 1;
		if (next < end) {
			this.index = next;
			return true;
		}
		return this.nextRun();
	}
	get type() {
		return this.rowType;
	}
	get hunkIndex() {
		return this.rowHunkIndex;
	}
	get hunk() {
		return this.rowHunk;
	}
	get hasDeletion() {
		return this.rowHasDeletion;
	}
	get hasAddition() {
		return this.rowHasAddition;
	}
	get deletionLineIndex() {
		const { rowHasDeletion, deletionIndexStart, index } = this;
		if (!rowHasDeletion) throwMissingSide("deletion");
		return deletionIndexStart + index;
	}
	get deletionLineNumber() {
		const { rowHasDeletion, deletionNumberStart, index } = this;
		if (!rowHasDeletion) throwMissingSide("deletion");
		return deletionNumberStart + index;
	}
	get deletionUnifiedLineIndex() {
		const { rowHasDeletion, deletionUnifiedStart, index } = this;
		if (!rowHasDeletion) throwMissingSide("deletion");
		return deletionUnifiedStart + index;
	}
	get deletionNoEOFCR() {
		const { rowHasDeletion, deletionNoEOFCRRow, index } = this;
		if (!rowHasDeletion) throwMissingSide("deletion");
		return index === deletionNoEOFCRRow;
	}
	get additionLineIndex() {
		const { rowHasAddition, additionIndexStart, index } = this;
		if (!rowHasAddition) throwMissingSide("addition");
		return additionIndexStart + index;
	}
	get additionLineNumber() {
		const { rowHasAddition, additionNumberStart, index } = this;
		if (!rowHasAddition) throwMissingSide("addition");
		return additionNumberStart + index;
	}
	get additionUnifiedLineIndex() {
		const { rowHasAddition, additionUnifiedStart, index } = this;
		if (!rowHasAddition) throwMissingSide("addition");
		return additionUnifiedStart + index;
	}
	get additionNoEOFCR() {
		const { rowHasAddition, additionNoEOFCRRow, index } = this;
		if (!rowHasAddition) throwMissingSide("addition");
		return index === additionNoEOFCRRow;
	}
	get unifiedLineIndex() {
		const { rowHasAddition, additionUnifiedStart, deletionUnifiedStart, index } = this;
		return (rowHasAddition ? additionUnifiedStart : deletionUnifiedStart) + index;
	}
	get splitLineIndex() {
		const { splitStart, index } = this;
		return splitStart + index;
	}
	get collapsedBefore() {
		const { index, firstRowCollapsedBefore } = this;
		return index === 0 ? firstRowCollapsedBefore : 0;
	}
	get collapsedAfter() {
		const { index, collapsedAfterRow, collapsedAfterValue } = this;
		return index === collapsedAfterRow ? collapsedAfterValue : 0;
	}
	findStartingHunk() {
		const { diff, diffStyle, startingLine } = this;
		const lastHunkIndex = diff.hunks.length - 1;
		let hunkIndex = 0;
		for (const hunk of diff.hunks) {
			const leading = this.getLeadingRegion(hunk, hunkIndex);
			let contextRows = leading.fromStart + leading.fromEnd;
			if (hunkIndex === lastHunkIndex) {
				const trailing = this.getTrailingRegion();
				contextRows += (trailing?.fromStart ?? 0) + (trailing?.fromEnd ?? 0);
				if (this.hasTrailingNewlineRow(trailing?.collapsedLines ?? 0)) contextRows++;
			}
			const unifiedRows = contextRows + hunk.unifiedLineCount;
			const splitRows = contextRows + hunk.splitLineCount;
			const { unifiedCount, splitCount } = this;
			if ((diffStyle !== "split" ? unifiedCount + unifiedRows : splitCount + splitRows) > startingLine) break;
			this.unifiedCount += unifiedRows;
			this.splitCount += splitRows;
			hunkIndex++;
		}
		this.walkHunkIndex = hunkIndex;
	}
	getLeadingRegion(hunk, hunkIndex) {
		const { diff, expandedHunks, collapsedContextThreshold } = this;
		return getExpandedRegion({
			isPartial: diff.isPartial,
			rangeSize: hunk.collapsedBefore,
			expandedHunks,
			hunkIndex,
			collapsedContextThreshold
		});
	}
	getTrailingRegion() {
		const { diff, expandedHunks, collapsedContextThreshold } = this;
		return getTrailingExpandedRegion({
			fileDiff: diff,
			hunkIndex: diff.hunks.length - 1,
			expandedHunks,
			collapsedContextThreshold,
			errorPrefix: "DiffRowCursor"
		});
	}
	hasTrailingNewlineRow(trailingCollapsed) {
		const { diff, includeTrailingNewline } = this;
		return includeTrailingNewline && trailingCollapsed === 0 && endsWithNewline(diff, "additions");
	}
	clipRun(count, unifiedStart, splitStart, unifiedAdditionStart) {
		const { diffStyle, startingLine, windowEnd } = this;
		if (startingLine === 0 && windowEnd === Infinity) {
			this.index = 0;
			this.end = count;
			return count > 0;
		}
		if (diffStyle !== "both") {
			const start = diffStyle === "unified" ? unifiedStart : splitStart;
			this.index = Math.max(0, startingLine - start);
			this.end = Math.min(count, windowEnd - start);
			return this.index < this.end;
		}
		let first = Math.max(0, startingLine - unifiedStart);
		let end = Math.min(count, windowEnd - unifiedStart);
		const splitFirst = Math.max(0, startingLine - splitStart);
		const splitEnd = Math.min(count, windowEnd - splitStart);
		let secondFirst = 0;
		let secondEnd = 0;
		if (splitFirst < splitEnd) {
			if (first < end) {
				if (splitFirst <= end) end = Math.max(end, splitEnd);
				else {
					secondFirst = splitFirst;
					secondEnd = splitEnd;
				}
			} else {
				first = splitFirst;
				end = splitEnd;
			}
		}
		if (unifiedAdditionStart != null) {
			const additionFirst = Math.max(0, startingLine - unifiedAdditionStart);
			const additionEnd = Math.min(count, windowEnd - unifiedAdditionStart);
			if (additionFirst < additionEnd) {
				if (first < end) {
					if (additionEnd >= first) first = additionFirst;
					else {
						secondFirst = first;
						secondEnd = end;
						first = additionFirst;
						end = additionEnd;
					}
				} else {
					first = additionFirst;
					end = additionEnd;
				}
			}
		}
		if (first >= end) return false;
		this.index = first;
		this.end = end;
		if (secondFirst < secondEnd) {
			this.secondStretchFirst = secondFirst;
			this.secondStretchEnd = secondEnd;
		}
		return true;
	}
	isPastWindow() {
		const { diffStyle, unifiedCount, splitCount, windowEnd } = this;
		return diffStyle === "unified" ? unifiedCount >= windowEnd : diffStyle === "split" ? splitCount >= windowEnd : unifiedCount >= windowEnd && splitCount >= windowEnd;
	}
	nextRun() {
		const { diff, secondStretchFirst, secondStretchEnd } = this;
		if (secondStretchFirst < secondStretchEnd) {
			this.index = secondStretchFirst;
			this.end = secondStretchEnd;
			this.secondStretchFirst = 0;
			this.secondStretchEnd = 0;
			return true;
		}
		for (;;) {
			if (this.part === DONE || this.isPastWindow()) {
				this.part = DONE;
				return false;
			}
			switch (this.part) {
				case ENTER_HUNK: {
					const hunk = diff.hunks[this.walkHunkIndex];
					if (hunk == null) {
						this.part = DONE;
						return false;
					}
					this.enterHunk(hunk);
					this.part = LEADING_START;
					break;
				}
				case LEADING_START:
					this.part = LEADING_END;
					if (this.leadingStartRows > 0 && this.startExpandedRun(this.leadingStartRows, this.leadingRangeSize, 0)) return true;
					break;
				case LEADING_END:
					this.part = CONTENT;
					if (this.leadingEndRows > 0 && this.startExpandedRun(this.leadingEndRows, this.leadingEndRows, this.takePendingCollapsed())) return true;
					if (this.startingLine > 0) this.skipBlocksBeforeWindow();
					break;
				case CONTENT: {
					const { walkHunk: hunk } = this;
					if (hunk == null) throw new Error("DiffRowCursor: missing hunk");
					const content = hunk.hunkContent[this.contentIndex];
					if (content == null) {
						this.part = TRAILING;
						break;
					}
					const isLast = this.contentIndex === hunk.hunkContent.length - 1;
					if (content.type === "context") {
						this.contentIndex++;
						if (this.startContextRun(hunk, content, isLast)) return true;
						break;
					}
					this.part = CHANGE_REST;
					if (this.startChangeRun(hunk, content, isLast, false)) return true;
					break;
				}
				case CHANGE_REST: {
					const { walkHunk: hunk } = this;
					if (hunk == null) throw new Error("DiffRowCursor: missing hunk");
					const content = hunk.hunkContent[this.contentIndex];
					if (content == null || content.type !== "change") throw new Error("DiffRowCursor: missing change content");
					const isLast = this.contentIndex === hunk.hunkContent.length - 1;
					this.part = CONTENT;
					this.contentIndex++;
					const started = this.startChangeRun(hunk, content, isLast, true);
					const { deletions, additions } = content;
					this.unifiedCount += deletions + additions;
					this.splitCount += Math.max(deletions, additions);
					this.unifiedAt += deletions + additions;
					this.splitAt += Math.max(deletions, additions);
					this.deletionIndexAt += deletions;
					this.additionIndexAt += additions;
					this.deletionNumberAt += deletions;
					this.additionNumberAt += additions;
					if (started) return true;
					break;
				}
				case TRAILING:
					this.part = TRAILING_NEWLINE;
					if (this.trailingRows > 0 && this.startTrailingRun()) return true;
					break;
				case TRAILING_NEWLINE: {
					const isLastHunk = this.walkHunkIndex === diff.hunks.length - 1;
					this.walkHunkIndex++;
					this.part = ENTER_HUNK;
					if (isLastHunk && this.hasTrailingNewlineRow(this.trailingCollapsed) && this.startTrailingNewlineRun()) return true;
					break;
				}
			}
		}
	}
	skipBlocksBeforeWindow() {
		const { walkHunk, diffStyle, startingLine, unifiedCount } = this;
		if (walkHunk == null) throw new Error("DiffRowCursor: missing hunk");
		while (this.contentIndex < walkHunk.hunkContent.length) {
			const content = walkHunk.hunkContent[this.contentIndex];
			const deletions = content.type === "context" ? content.lines : content.deletions;
			const additions = content.type === "context" ? content.lines : content.additions;
			const unifiedRows = content.type === "context" ? content.lines : deletions + additions;
			const splitRows = Math.max(deletions, additions);
			const { unifiedCount, splitCount } = this;
			if ((diffStyle === "split" ? splitCount + splitRows : unifiedCount + unifiedRows) > startingLine) break;
			this.unifiedCount += unifiedRows;
			this.splitCount += splitRows;
			this.unifiedAt += unifiedRows;
			this.splitAt += splitRows;
			this.deletionIndexAt += deletions;
			this.additionIndexAt += additions;
			this.deletionNumberAt += deletions;
			this.additionNumberAt += additions;
			this.contentIndex++;
		}
		if (this.unifiedCount > unifiedCount) this.pendingCollapsed = 0;
	}
	enterHunk(hunk) {
		const { diff, diffStyle, walkHunkIndex } = this;
		const deletionBoundary = getHunkSideStartBoundary(hunk.deletionStart, hunk.deletionCount);
		const additionBoundary = getHunkSideStartBoundary(hunk.additionStart, hunk.additionCount);
		const leading = this.getLeadingRegion(hunk, walkHunkIndex);
		const trailing = walkHunkIndex === diff.hunks.length - 1 ? this.getTrailingRegion() : void 0;
		this.walkHunk = hunk;
		this.contentIndex = 0;
		this.leadingStartRows = leading.fromStart;
		this.leadingEndRows = leading.fromEnd;
		this.leadingRangeSize = leading.rangeSize;
		this.pendingCollapsed = leading.collapsedLines;
		this.trailingRows = trailing != null ? trailing.fromStart + trailing.fromEnd : -1;
		this.trailingCollapsed = trailing?.collapsedLines ?? 0;
		this.unifiedAt = hunk.unifiedLineStart;
		this.splitAt = hunk.splitLineStart;
		this.deletionIndexAt = !diff.isPartial && hunk.deletionCount === 0 ? deletionBoundary : hunk.deletionLineIndex;
		this.additionIndexAt = !diff.isPartial && hunk.additionCount === 0 ? additionBoundary : hunk.additionLineIndex;
		this.deletionNumberAt = deletionBoundary + 1;
		this.additionNumberAt = additionBoundary + 1;
		this.collapsedAfterAt = trailing != null && trailing.collapsedLines > 0 && trailing.fromStart + trailing.fromEnd === 0 ? diffStyle === "unified" ? hunk.unifiedLineStart + hunk.unifiedLineCount - 1 : hunk.splitLineStart + hunk.splitLineCount - 1 : -1;
	}
	takePendingCollapsed() {
		const { pendingCollapsed } = this;
		this.pendingCollapsed = 0;
		return pendingCollapsed;
	}
	startExpandedRun(count, back, collapsedBefore) {
		const { unifiedCount, splitCount, walkHunkIndex, walkHunk, deletionIndexAt, deletionNumberAt, additionIndexAt, additionNumberAt, unifiedAt, splitAt } = this;
		this.rowType = "context-expanded";
		this.rowHunkIndex = walkHunkIndex;
		this.rowHunk = walkHunk;
		this.rowHasDeletion = true;
		this.rowHasAddition = true;
		this.deletionIndexStart = deletionIndexAt - back;
		this.deletionNumberStart = deletionNumberAt - back;
		this.deletionUnifiedStart = unifiedAt - back;
		this.additionIndexStart = additionIndexAt - back;
		this.additionNumberStart = additionNumberAt - back;
		this.additionUnifiedStart = unifiedAt - back;
		this.splitStart = splitAt - back;
		this.firstRowCollapsedBefore = collapsedBefore;
		this.collapsedAfterRow = -1;
		this.deletionNoEOFCRRow = -1;
		this.additionNoEOFCRRow = -1;
		this.unifiedCount += count;
		this.splitCount += count;
		return this.clipRun(count, unifiedCount, splitCount);
	}
	startContextRun(hunk, content, isLast) {
		const { lines } = content;
		const { diffStyle, unifiedCount, splitCount, walkHunkIndex, deletionIndexAt, deletionNumberAt, additionIndexAt, additionNumberAt, unifiedAt, splitAt } = this;
		const started = lines > 0;
		if (started) {
			this.rowType = "context";
			this.rowHunkIndex = walkHunkIndex;
			this.rowHunk = hunk;
			this.rowHasDeletion = true;
			this.rowHasAddition = true;
			this.deletionIndexStart = deletionIndexAt;
			this.deletionNumberStart = deletionNumberAt;
			this.deletionUnifiedStart = unifiedAt;
			this.additionIndexStart = additionIndexAt;
			this.additionNumberStart = additionNumberAt;
			this.additionUnifiedStart = unifiedAt;
			this.splitStart = splitAt;
			this.firstRowCollapsedBefore = this.takePendingCollapsed();
			this.setCollapsedAfterRow(diffStyle === "unified" ? unifiedAt : splitAt);
			this.deletionNoEOFCRRow = isLast && hunk.noEOFCRDeletions ? lines - 1 : -1;
			this.additionNoEOFCRRow = isLast && hunk.noEOFCRAdditions ? lines - 1 : -1;
		}
		this.unifiedCount += lines;
		this.splitCount += lines;
		this.unifiedAt += lines;
		this.splitAt += lines;
		this.deletionIndexAt += lines;
		this.additionIndexAt += lines;
		this.deletionNumberAt += lines;
		this.additionNumberAt += lines;
		return started && this.clipRun(lines, unifiedCount, splitCount);
	}
	startChangeRun(hunk, content, isLast, rest) {
		const { deletions, additions } = content;
		const { diffStyle, unifiedCount, splitCount, walkHunkIndex, deletionIndexAt, deletionNumberAt, additionIndexAt, additionNumberAt, unifiedAt, splitAt } = this;
		const unified = diffStyle === "unified";
		const paired = Math.min(deletions, additions);
		const skipped = unified ? rest ? deletions : 0 : rest ? paired : 0;
		const count = unified ? rest ? additions : deletions : rest ? Math.max(deletions, additions) - paired : paired;
		if (count <= 0) return false;
		const hasDeletion = unified ? !rest : !rest || deletions > additions;
		const hasAddition = unified ? rest : !rest || additions > deletions;
		this.rowType = "change";
		this.rowHunkIndex = walkHunkIndex;
		this.rowHunk = hunk;
		this.rowHasDeletion = hasDeletion;
		this.rowHasAddition = hasAddition;
		const sideOffset = unified ? 0 : skipped;
		this.deletionIndexStart = deletionIndexAt + sideOffset;
		this.deletionNumberStart = deletionNumberAt + sideOffset;
		this.deletionUnifiedStart = unifiedAt + sideOffset;
		this.additionIndexStart = additionIndexAt + sideOffset;
		this.additionNumberStart = additionNumberAt + sideOffset;
		this.additionUnifiedStart = unifiedAt + deletions + sideOffset;
		this.splitStart = splitAt + sideOffset;
		this.firstRowCollapsedBefore = this.takePendingCollapsed();
		this.setCollapsedAfterRow(unified ? unifiedAt + skipped : splitAt + skipped);
		const endsBlock = unified || rest || deletions === additions;
		this.deletionNoEOFCRRow = isLast && hasDeletion && endsBlock && hunk.noEOFCRDeletions ? count - 1 : -1;
		this.additionNoEOFCRRow = isLast && hasAddition && endsBlock && hunk.noEOFCRAdditions ? count - 1 : -1;
		const unifiedDeletionStart = unifiedCount + skipped;
		const unifiedAdditionStart = unifiedCount + deletions + sideOffset;
		return this.clipRun(count, hasDeletion ? unifiedDeletionStart : unifiedAdditionStart, splitCount + skipped, hasDeletion && hasAddition ? unifiedAdditionStart : void 0);
	}
	startTrailingRun() {
		const { diff, trailingRows: count, trailingCollapsed, unifiedCount, splitCount, deletionIndexAt, deletionNumberAt, additionIndexAt, additionNumberAt, unifiedAt, splitAt } = this;
		this.rowType = "context-expanded";
		this.rowHunkIndex = diff.hunks.length;
		this.rowHunk = void 0;
		this.rowHasDeletion = true;
		this.rowHasAddition = true;
		this.deletionIndexStart = deletionIndexAt;
		this.deletionNumberStart = deletionNumberAt;
		this.deletionUnifiedStart = unifiedAt;
		this.additionIndexStart = additionIndexAt;
		this.additionNumberStart = additionNumberAt;
		this.additionUnifiedStart = unifiedAt;
		this.splitStart = splitAt;
		this.firstRowCollapsedBefore = 0;
		this.collapsedAfterValue = trailingCollapsed;
		this.collapsedAfterRow = count - 1;
		this.deletionNoEOFCRRow = -1;
		this.additionNoEOFCRRow = -1;
		this.unifiedCount += count;
		this.splitCount += count;
		return this.clipRun(count, unifiedCount, splitCount);
	}
	startTrailingNewlineRun() {
		const { diff, trailingRows, unifiedCount, splitCount, deletionIndexAt, deletionNumberAt, additionIndexAt, additionNumberAt, unifiedAt, splitAt } = this;
		const offset = Math.max(trailingRows, 0);
		const context = endsWithNewline(diff, "deletions");
		const additionLineIndex = additionIndexAt + offset;
		const deletionLineIndex = deletionIndexAt + offset;
		this.rowType = context ? "context" : "change";
		this.rowHunkIndex = diff.hunks.length;
		this.rowHunk = void 0;
		this.rowHasDeletion = context;
		this.rowHasAddition = true;
		this.deletionIndexStart = deletionLineIndex;
		this.deletionNumberStart = deletionNumberAt + offset;
		this.deletionUnifiedStart = unifiedAt + offset;
		this.additionIndexStart = additionLineIndex;
		this.additionNumberStart = additionNumberAt + offset;
		this.additionUnifiedStart = unifiedAt + offset;
		this.splitStart = splitAt + offset;
		this.firstRowCollapsedBefore = 0;
		this.collapsedAfterRow = -1;
		this.deletionNoEOFCRRow = -1;
		this.additionNoEOFCRRow = -1;
		this.unifiedCount++;
		this.splitCount++;
		return this.clipRun(1, unifiedCount, splitCount);
	}
	setCollapsedAfterRow(runStart) {
		const { collapsedAfterAt, trailingCollapsed } = this;
		if (collapsedAfterAt === -1) {
			this.collapsedAfterRow = -1;
			return;
		}
		this.collapsedAfterValue = trailingCollapsed;
		this.collapsedAfterRow = collapsedAfterAt - runStart;
	}
};
//#endregion
//#region src/utils/formatCSSVariablePrefix.ts
function formatCSSVariablePrefix(type) {
	return `--${type === "token" ? "diffs-token" : "diffs"}-`;
}
//#endregion
//#region src/utils/getHighlighterThemeStyles.ts
function getHighlighterThemeStyles({ theme = DEFAULT_THEMES, highlighter, prefix }) {
	let styles = "";
	if (typeof theme === "string") {
		const themeData = highlighter.getTheme(theme);
		const normalized = getThemeColors(themeData, highlighter);
		styles += `color:${normalized.fg};`;
		styles += `background-color:${normalized.bg};`;
		styles += `${formatCSSVariablePrefix("global")}fg:${normalized.fg};`;
		styles += `${formatCSSVariablePrefix("global")}bg:${normalized.bg};`;
		styles += getGitVariables(themeData, prefix);
		styles += getSearchVariables(themeData);
	} else {
		let themeData = highlighter.getTheme(theme.dark);
		let normalized = getThemeColors(themeData, highlighter);
		styles += `${formatCSSVariablePrefix("global")}dark:${normalized.fg};`;
		styles += `${formatCSSVariablePrefix("global")}dark-bg:${normalized.bg};`;
		styles += getGitVariables(themeData, "dark");
		styles += getSearchVariables(themeData, "dark");
		themeData = highlighter.getTheme(theme.light);
		normalized = getThemeColors(themeData, highlighter);
		styles += `${formatCSSVariablePrefix("global")}light:${normalized.fg};`;
		styles += `${formatCSSVariablePrefix("global")}light-bg:${normalized.bg};`;
		styles += getGitVariables(themeData, "light");
		styles += getSearchVariables(themeData, "light");
	}
	return styles;
}
function getThemeColors(theme, highlighter) {
	if (highlighter.name === "highlights" && theme.zed?.cssVariables === true) {
		const prefix = formatCSSVariablePrefix("token");
		return {
			fg: `var(${prefix}foreground)`,
			bg: `var(${prefix}background)`
		};
	}
	return normalizeThemeColors(theme);
}
function getGitVariables(themeData, modePrefix) {
	modePrefix = modePrefix != null ? `${modePrefix}-` : "";
	let styles = "";
	const additionGreen = themeData.colors?.["gitDecoration.addedResourceForeground"] ?? themeData.colors?.["terminal.ansiGreen"];
	if (additionGreen != null) styles += `${formatCSSVariablePrefix("global")}${modePrefix}addition-color:${additionGreen};`;
	const deletionRed = themeData.colors?.["gitDecoration.deletedResourceForeground"] ?? themeData.colors?.["terminal.ansiRed"];
	if (deletionRed != null) styles += `${formatCSSVariablePrefix("global")}${modePrefix}deletion-color:${deletionRed};`;
	const modifiedBlue = themeData.colors?.["gitDecoration.modifiedResourceForeground"] ?? themeData.colors?.["terminal.ansiBlue"];
	if (modifiedBlue != null) styles += `${formatCSSVariablePrefix("global")}${modePrefix}modified-color:${modifiedBlue};`;
	return styles;
}
function getSearchVariables(themeData, modePrefix) {
	modePrefix = modePrefix != null ? `${modePrefix}-` : "";
	const prefix = formatCSSVariablePrefix("global");
	const colors = themeData.colors;
	let styles = "";
	const matchBackground = colors?.["editor.findMatchHighlightBackground"];
	const matchForeground = colors?.["editor.findMatchHighlightForeground"];
	if (matchBackground != null && matchForeground != null) {
		styles += `${prefix}${modePrefix}bg-search-match-theme:${matchBackground};`;
		styles += `${prefix}${modePrefix}fg-search-match-theme:${matchForeground};`;
	}
	const currentBackground = colors?.["editor.findMatchBackground"];
	const currentForeground = colors?.["editor.findMatchForeground"];
	if (currentBackground != null && currentForeground != null) {
		styles += `${prefix}${modePrefix}bg-search-match-current-theme:${currentBackground};`;
		styles += `${prefix}${modePrefix}fg-search-match-current-theme:${currentForeground};`;
	}
	return styles;
}
//#endregion
//#region src/utils/getTokenOptions.ts
function getTokenOptions(lang, theme, tokenizeMaxLineLength) {
	return {
		lang,
		...typeof theme === "string" ? { theme } : { themes: theme },
		defaultColor: false,
		cssVariablePrefix: formatCSSVariablePrefix("token"),
		tokenizeMaxLineLength,
		tokenizeTimeLimit: 0
	};
}
//#endregion
//#region src/utils/renderDiffWithHighlighter.ts
const DEFAULT_PLAIN_TEXT_OPTIONS$1 = { forcePlainText: false };
function renderDiffWithHighlighter(diff, highlighter, options, { forcePlainText, lazyLineAST = false, startingLine, totalLines, expandedHunks, collapsedContextThreshold = 1 } = DEFAULT_PLAIN_TEXT_OPTIONS$1) {
	if (forcePlainText) {
		startingLine ??= 0;
		totalLines ??= Infinity;
	} else {
		startingLine = 0;
		totalLines = Infinity;
	}
	const isWindowedHighlight = startingLine > 0 || totalLines < Infinity;
	lazyLineAST &&= !forcePlainText && !options.useTokenTransformer;
	const baseThemeType = typeof options.theme === "string" ? highlighter.getTheme(options.theme).type : void 0;
	const themeStyles = getHighlighterThemeStyles({
		theme: options.theme,
		highlighter
	});
	const code = {
		deletionLines: [],
		additionLines: []
	};
	const shouldGroupAll = !forcePlainText && !diff.isPartial;
	const expandedHunksForIteration = forcePlainText ? expandedHunks : void 0;
	const buckets = /* @__PURE__ */ new Map();
	function getBucketForHunk(hunkIndex) {
		const index = shouldGroupAll ? 0 : hunkIndex;
		const bucket = buckets.get(index) ?? createBucket();
		buckets.set(index, bucket);
		return bucket;
	}
	function appendContent(lineContent, lineIndex, segments, contentWrapper) {
		if (isWindowedHighlight) {
			let segment = segments.at(-1);
			if (segment == null || segment.targetIndex + segment.count !== lineIndex) {
				segment = {
					targetIndex: lineIndex,
					originalOffset: contentWrapper.length,
					count: 0
				};
				segments.push(segment);
			}
			segment.count++;
		}
		contentWrapper.push(lineContent);
	}
	const rows = new DiffRowCursor({
		diff,
		diffStyle: "both",
		startingLine,
		totalLines,
		expandedHunks: isWindowedHighlight ? expandedHunksForIteration : true,
		collapsedContextThreshold
	});
	while (rows.next()) {
		const { hunkIndex, type, splitLineIndex } = rows;
		const bucket = getBucketForHunk(hunkIndex);
		if (rows.hasDeletion) {
			const { deletionLineIndex, deletionLineNumber, deletionUnifiedLineIndex } = rows;
			appendContent(diff.deletionLines[deletionLineIndex], deletionLineIndex, bucket.deletionSegments, bucket.deletionContent);
			bucket.deletionInfo.push({
				type: type === "change" ? "change-deletion" : type,
				lineNumber: deletionLineNumber,
				altLineNumber: type === "change" ? void 0 : rows.additionLineNumber,
				lineIndex: `${deletionUnifiedLineIndex},${splitLineIndex}`
			});
		}
		if (rows.hasAddition) {
			const { additionLineIndex, additionLineNumber, additionUnifiedLineIndex } = rows;
			appendContent(diff.additionLines[additionLineIndex], additionLineIndex, bucket.additionSegments, bucket.additionContent);
			bucket.additionInfo.push({
				type: type === "change" ? "change-addition" : type,
				lineNumber: additionLineNumber,
				altLineNumber: type === "change" ? void 0 : rows.deletionLineNumber,
				lineIndex: `${additionUnifiedLineIndex},${splitLineIndex}`
			});
		}
	}
	for (const bucket of buckets.values()) {
		if (bucket.deletionContent.length === 0 && bucket.additionContent.length === 0) continue;
		const deletionFile = {
			name: diff.prevName ?? diff.name,
			contents: bucket.deletionContent.value
		};
		const additionFile = {
			name: diff.name,
			contents: bucket.additionContent.value
		};
		const { deletionLines, additionLines } = renderTwoFiles({
			deletionFile,
			deletionInfo: bucket.deletionInfo,
			additionFile,
			additionInfo: bucket.additionInfo,
			highlighter,
			options,
			languageOverride: forcePlainText ? "text" : diff.lang,
			lazyLineAST
		});
		if (shouldGroupAll) {
			code.deletionLines = deletionLines;
			code.additionLines = additionLines;
			continue;
		}
		for (const [target, lines, segments] of [[
			code.deletionLines,
			deletionLines,
			bucket.deletionSegments
		], [
			code.additionLines,
			additionLines,
			bucket.additionSegments
		]]) if (segments.length > 0) for (const segment of segments) for (let index = 0; index < segment.count; index++) target[segment.targetIndex + index] = lines[segment.originalOffset + index];
		else if (lazyLineAST) {
			const offset = target.length;
			for (let index = 0; index < lines.length; index++) setDeferredArrayItem(target, offset + index, () => lines[index]);
		} else appendItems(target, lines);
	}
	return {
		code,
		themeStyles,
		baseThemeType
	};
}
function createBucket() {
	return {
		deletionContent: {
			push(value) {
				this.value += value;
				this.length++;
			},
			value: "",
			length: 0
		},
		additionContent: {
			push(value) {
				this.value += value;
				this.length++;
			},
			value: "",
			length: 0
		},
		deletionInfo: [],
		additionInfo: [],
		deletionSegments: [],
		additionSegments: []
	};
}
function renderTwoFiles({ lazyLineAST, deletionFile, additionFile, deletionInfo, additionInfo, highlighter, languageOverride, options: { theme, useTokenTransformer, tokenizeMaxLineLength } }) {
	const renderFile = (file, lineInfo) => {
		if (file.contents === "") return [];
		return renderTokenLines(highlighter.codeToTokens(cleanLastNewline(file.contents), getTokenOptions(languageOverride ?? getFiletypeFromFileName(file.name), theme, tokenizeMaxLineLength)).tokens, {
			state: { lineInfo },
			useTokenTransformer,
			lazyLineAST,
			cacheHtmlStyles: highlighter.name === "highlights"
		});
	};
	return {
		deletionLines: renderFile(deletionFile, deletionInfo),
		additionLines: renderFile(additionFile, additionInfo)
	};
}
//#endregion
//#region src/utils/computeFileOffsets.ts
const LINE_FEED = 10;
const CARRIAGE_RETURN = 13;
const DENSE_LINE_BREAK_BLOCK_SIZE = 4;
const DENSE_LINE_BREAK_BLOCK_SPAN = 40;
/**
* Computes line start offsets for a string.
*/
function computeLineOffsets(contents) {
	const offsets = [0];
	let carriageReturn = contents.indexOf("\r");
	let lineFeed = contents.indexOf("\n");
	let blockStart = 0;
	let blockBreaks = 0;
	while (carriageReturn !== -1 || lineFeed !== -1) {
		let nextOffset;
		if (carriageReturn !== -1 && (lineFeed === -1 || carriageReturn < lineFeed)) {
			if (lineFeed === carriageReturn + 1) {
				nextOffset = lineFeed + 1;
				carriageReturn = contents.indexOf("\r", nextOffset);
				lineFeed = contents.indexOf("\n", nextOffset);
			} else {
				nextOffset = carriageReturn + 1;
				carriageReturn = contents.indexOf("\r", nextOffset);
			}
		} else {
			nextOffset = lineFeed + 1;
			lineFeed = contents.indexOf("\n", nextOffset);
		}
		offsets.push(nextOffset);
		if (++blockBreaks === DENSE_LINE_BREAK_BLOCK_SIZE) {
			if (nextOffset - blockStart <= DENSE_LINE_BREAK_BLOCK_SPAN) {
				for (let i = nextOffset; i < contents.length; i++) {
					const char = contents.charCodeAt(i);
					if (char === LINE_FEED || char === CARRIAGE_RETURN) {
						if (char === CARRIAGE_RETURN && i + 1 < contents.length && contents.charCodeAt(i + 1) === LINE_FEED) i++;
						offsets.push(i + 1);
					}
				}
				return offsets;
			}
			blockStart = nextOffset;
			blockBreaks = 0;
		}
	}
	return offsets;
}
/**
* Splits file contents into lines aligned with {@link computeLineOffsets}.
* Unlike splitFileContents, a trailing newline produces a final empty line.
*/
function linesFromFileContents(contents) {
	const offsets = computeLineOffsets(contents);
	const lineCount = offsets.length;
	const lines = new Array(lineCount);
	for (let i = 0; i < lineCount; i++) {
		const end = i + 1 < lineCount ? offsets[i + 1] : contents.length;
		lines[i] = contents.slice(offsets[i], end);
	}
	return lines;
}
//#endregion
//#region src/utils/renderFileWithHighlighter.ts
const DEFAULT_PLAIN_TEXT_OPTIONS = { forcePlainText: false };
function renderFileWithHighlighter(file, highlighter, { theme, tokenizeMaxLineLength, useTokenTransformer }, { forcePlainText, lazyLineAST = false, startingLine, totalLines, lines } = DEFAULT_PLAIN_TEXT_OPTIONS) {
	if (forcePlainText) {
		startingLine ??= 0;
		totalLines ??= Infinity;
	} else {
		startingLine = 0;
		totalLines = Infinity;
	}
	const isWindowedHighlight = startingLine > 0 || totalLines < Infinity;
	const fileLines = isWindowedHighlight ? lines ?? linesFromFileContents(file.contents) : void 0;
	const state = { lineInfo: [] };
	const lang = forcePlainText ? "text" : file.lang ?? getFiletypeFromFileName(file.name);
	const baseThemeType = typeof theme === "string" ? highlighter.getTheme(theme).type : void 0;
	const themeStyles = getHighlighterThemeStyles({
		theme,
		highlighter
	});
	if (fileLines != null && Math.min(startingLine + totalLines, fileLines.length) <= startingLine) return {
		code: new Array(startingLine),
		themeStyles,
		baseThemeType
	};
	state.lineInfo = (shikiLineNumber) => ({
		type: "context",
		lineIndex: shikiLineNumber - 1 + startingLine,
		lineNumber: shikiLineNumber + startingLine
	});
	const highlightedLines = renderTokenLines(highlighter.codeToTokens(normalizeHighlightLineEndings(fileLines != null ? extractWindowedFileContent(fileLines, startingLine, totalLines) : file.contents), getTokenOptions(lang, theme, tokenizeMaxLineLength)).tokens, {
		state,
		useTokenTransformer,
		lazyLineAST: lazyLineAST && !forcePlainText && !useTokenTransformer,
		cacheHtmlStyles: highlighter.name === "highlights"
	});
	const code = isWindowedHighlight ? new Array(startingLine) : highlightedLines;
	if (isWindowedHighlight) appendItems(code, highlightedLines);
	return {
		code,
		themeStyles,
		baseThemeType
	};
}
function normalizeHighlightLineEndings(contents) {
	return contents.replace(/\r(?!\n)/g, "\n");
}
function extractWindowedFileContent(lines, startingLine, totalLines) {
	if (lines.length === 0) return "";
	const endLine = Math.min(startingLine + totalLines, lines.length);
	const contents = lines.slice(startingLine, endLine).join("");
	return endLine < lines.length ? cleanLastNewline(contents) : contents;
}
//#endregion
//#region src/worker/hastLinesTransport.ts
const HOLE = 0;
const TEXT = 1;
const ELEMENT = 2;
const OTHER = 3;
const UNDEFINED = 0;
const NULL = 1;
const TRUE = 2;
const FALSE = 3;
const STRING = 4;
const INTEGER = 5;
const EXTRA = 6;
function encodeHastLines(lines) {
	let ops = new Int32Array(Math.max(32, Math.min(65536, lines.length * 32)));
	let length = 0;
	const offsets = new Uint32Array(lines.length * 2);
	const strings = [];
	const stringIds = /* @__PURE__ */ new Map();
	const extras = [];
	let text = "";
	function push(value) {
		if (length === ops.length) {
			const next = new Int32Array(ops.length * 2);
			next.set(ops);
			ops = next;
		}
		ops[length++] = value;
	}
	function intern(value) {
		let id = stringIds.get(value);
		if (id == null) {
			id = strings.length;
			strings.push(value);
			stringIds.set(value, id);
		}
		return id;
	}
	function encodeNode(node) {
		let keys = 0;
		for (const _ in node) keys++;
		if (node?.type === "text" && keys === 2) {
			push(TEXT);
			push(node.value.length);
			text += node.value;
		} else if (node?.type === "element" && keys === 4 && node.properties != null && Object.getPrototypeOf(node.properties) === Object.prototype) {
			push(ELEMENT);
			push(intern(node.tagName));
			let count = 0;
			for (const _ in node.properties) count++;
			push(count);
			for (const key in node.properties) {
				const value = node.properties[key];
				push(intern(key));
				if (value === void 0) push(UNDEFINED);
				else if (value === null) push(NULL);
				else if (value === true) push(TRUE);
				else if (value === false) push(FALSE);
				else if (typeof value === "string") {
					push(STRING);
					push(intern(value));
				} else if (typeof value === "number" && (value | 0) === value && !Object.is(value, -0)) {
					push(INTEGER);
					push(value);
				} else {
					push(EXTRA);
					push(extras.length);
					extras.push(value);
				}
			}
			push(node.children.length);
			for (let index = 0; index < node.children.length; index++) if (index in node.children) encodeNode(node.children[index]);
			else push(HOLE);
		} else {
			push(OTHER);
			push(extras.length);
			extras.push(node);
		}
	}
	for (let index = 0; index < lines.length; index++) {
		offsets[index * 2] = length;
		offsets[index * 2 + 1] = text.length;
		if (index in lines) encodeNode(lines[index]);
		else push(HOLE);
	}
	return {
		ops: ops.subarray(0, length),
		offsets,
		strings,
		text,
		extras
	};
}
//#endregion
//#region src/worker/workerHandlers.ts
let highlighter;
let compactResults = false;
let renderOptions = {
	theme: DEFAULT_THEMES,
	useTokenTransformer: false,
	tokenizeMaxLineLength: 1e3,
	lineDiffType: "word-alt",
	maxLineDiffLength: 1e3
};
const EMPTY_REGEXP = /(?:)/;
function registerWorkerHandlers() {
	self.addEventListener("error", (event) => {
		console.error("[Diffs Worker] Unhandled error:", event.error);
	});
	self.addEventListener("message", (event) => {
		handleMessage(event.data);
	});
}
async function handleMessage(request) {
	try {
		switch (request.type) {
			case "initialize":
				await handleInitialize(request);
				break;
			case "set-render-options":
				await handleSetRenderOptions(request);
				break;
			case "file":
				await handleRenderFile(request);
				break;
			case "diff":
				await handleRenderDiff(request);
				break;
			default: throw new Error(`Unknown request type: ${request.type}`);
		}
	} catch (error) {
		console.error("Worker error:", error);
		sendError(request.id, error);
	} finally {
		EMPTY_REGEXP.exec("");
	}
}
async function handleInitialize({ id, renderOptions: options, preferredHighlighter, resolvedThemes, resolvedLanguages, customExtensionsVersion, customExtensionMap, resultFormat }) {
	let highlighter = getHighlighter(preferredHighlighter);
	if ("then" in highlighter) highlighter = await highlighter;
	syncCustomExtensionsFromRequest({
		customExtensionsVersion,
		customExtensionMap
	});
	attachResolvedThemes(resolvedThemes, highlighter);
	if (resolvedLanguages != null) attachResolvedLanguages(resolvedLanguages, highlighter);
	renderOptions = options;
	compactResults = resultFormat === "hast-ops-v1";
	postMessage({
		type: "success",
		id,
		requestType: "initialize",
		sentAt: Date.now()
	});
}
async function handleSetRenderOptions({ id, renderOptions: options, resolvedThemes }) {
	let highlighter = getHighlighter();
	if ("then" in highlighter) highlighter = await highlighter;
	attachResolvedThemes(resolvedThemes, highlighter);
	renderOptions = options;
	postMessage({
		type: "success",
		id,
		requestType: "set-render-options",
		sentAt: Date.now()
	});
}
async function handleRenderFile({ id, file, resolvedLanguages, customExtensionsVersion, customExtensionMap }) {
	let highlighter = getHighlighter();
	if ("then" in highlighter) highlighter = await highlighter;
	syncCustomExtensionsFromRequest({
		customExtensionsVersion,
		customExtensionMap
	});
	if (resolvedLanguages != null) attachResolvedLanguages(resolvedLanguages, highlighter);
	const fileOptions = {
		theme: renderOptions.theme,
		useTokenTransformer: renderOptions.useTokenTransformer,
		tokenizeMaxLineLength: renderOptions.tokenizeMaxLineLength
	};
	const result = renderFileWithHighlighter(file, highlighter, fileOptions);
	const code = compactResults ? encodeHastLines(result.code) : void 0;
	const response = {
		type: "success",
		requestType: "file",
		id,
		result,
		options: fileOptions,
		sentAt: Date.now()
	};
	postMessage(code == null ? response : {
		...response,
		result: {
			...result,
			code
		}
	}, code == null ? [] : [code.ops.buffer, code.offsets.buffer]);
}
async function handleRenderDiff({ id, diff, resolvedLanguages, customExtensionsVersion, customExtensionMap }) {
	let highlighter = getHighlighter();
	if ("then" in highlighter) highlighter = await highlighter;
	syncCustomExtensionsFromRequest({
		customExtensionsVersion,
		customExtensionMap
	});
	if (resolvedLanguages != null) attachResolvedLanguages(resolvedLanguages, highlighter);
	const result = renderDiffWithHighlighter(diff, highlighter, renderOptions);
	const code = compactResults ? {
		deletionLines: encodeHastLines(result.code.deletionLines),
		additionLines: encodeHastLines(result.code.additionLines)
	} : void 0;
	const response = {
		type: "success",
		requestType: "diff",
		id,
		result,
		options: renderOptions,
		sentAt: Date.now()
	};
	postMessage(code == null ? response : {
		...response,
		result: {
			...result,
			code
		}
	}, code == null ? [] : [
		code.deletionLines.ops.buffer,
		code.deletionLines.offsets.buffer,
		code.additionLines.ops.buffer,
		code.additionLines.offsets.buffer
	]);
}
function getHighlighter(preferredHighlighter) {
	highlighter ??= createHighlighter(preferredHighlighter);
	return highlighter;
}
function syncCustomExtensionsFromRequest({ customExtensionsVersion, customExtensionMap }) {
	if (customExtensionsVersion == null && customExtensionMap == null) return;
	if (customExtensionsVersion == null || customExtensionMap == null) throw new Error("Worker request must include both customExtensionsVersion and customExtensionMap");
	replaceCustomExtensions(customExtensionsVersion, customExtensionMap);
}
function sendError(id, error) {
	const response = {
		type: "error",
		id,
		error: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : void 0
	};
	postMessage(response);
}
//#endregion
export { formatCSSVariablePrefix as n, attachResolvedLanguages as r, registerWorkerHandlers as t };

//# sourceMappingURL=workerHandlers-D0wv5Hl_.js.map