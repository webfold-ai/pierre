# Webfold fork of `pierrecomputer/pierre`

Upstream: `https://github.com/pierrecomputer/pierre`
Fork:     `https://github.com/webfold-ai/pierre`
Pin:      `2bfca54` (`chore: bump @pierre/highlights to 0.6.0`) — **upstream `main`, not a stale rev**
Forked:   2026-11-26

This fork exists to own three packages that we consume and, in places, re-implement on
our own foundations. Everything else in this monorepo (the three apps, `path-store`,
`trees`, `pipes`, `theme`, `icons`, `checkout`) is **not used by Webfold** and is carried
only because this is a monorepo fork; no patch is applied to it.

## The three packages we own here

| package | version at pin | files | licence | our decision |
|---|---|---|---|---|
| `packages/diffs` (`@pierre/diffs`) | 1.7.1 | 554 | Apache-2.0 (`LICENSE.md`) | **take** — the diff renderer |
| `packages/highlights` (`@pierre/highlights`) | 0.6.0 | 500 | Apache-2.0 (`NOTICE.md`) | **take** — the WASM highlighter |
| `packages/words` (`@pierre/words`) | 0.3.0 | 98 | Apache-2.0 (`NOTICE.md`) | **take** — the WASM markdown renderer |

`packages/patches` (1,387 WAT + 2,397 TS lines, `myers.wat` 431) is **not** forked as a dependency: its
job is a line differ, and `webfold-ai/difffold` already owns that, with an admissible-bound
optimality certificate and a `git apply` round-trip, which `patches` has no equivalent of.
`packages/highlights` IS forked, because 80,775 lines of hand-written WAT for per-grammar
tokenizing is real work with no substitute; the *diff* half is ours, the *highlight* half
is theirs.

## Licence obligations, as discharged here

Apache-2.0 §4 requires (a) a copy of the licence, (b) retention of `NOTICE` files, and
(c) a statement of significant changes. (a) and (b) are untouched in-tree. (c) is this
file: any Webfold change to the three packages is recorded in the "Change log" section
below, one entry per commit, naming the package and the behaviour changed.

Third-party material bundled inside the packages keeps its own notices — see
`packages/highlights/NOTICE.md` (bundled theme licences, pruned Zed/Shiki sources) and
`packages/words/NOTICE.md` (inline directive parsing). Neither is re-licensed by us.

## How Webfold consumes these

Built from this fork, pinned by commit, not by npm range:

```sh
pnpm install --filter @pierre/diffs --filter @pierre/highlights --filter @pierre/words
pnpm --filter @pierre/diffs --filter @pierre/highlights --filter @pierre/words build
```

The output is consumed by `webfold-webgui` (SvelteKit) as a **client-side island**: the
packages are React/Web-Components, the shell is Svelte, so the boundary is an element and
an event, never a shared component tree.

The Rust side (`webfold` DiffsHub routes, `difffold`) produces the **unified diff and the
AST mapping**; these packages only render it. That split is deliberate: the renderer is
given `(oldText, newText)` and must not be asked to compute the diff, because its differ
is line-granular and has no tree objective.

## What we remake, and why

| their piece | our replacement | reason |
|---|---|---|
| `packages/patches` (Myers in WAT) | `difffold` minimal Myers (1,036 lines) + Selkow + Zhang–Shasha | proved optimality, AST-aware, `git apply` round-trip |
| diff **rendering** | `@pierre/diffs` (this fork) | 73k lines of virtualised rendering; rewriting it is a year |
| **highlighting** | `@pierre/highlights` (this fork) | 80k lines of WAT grammars; no shortcut exists |
| **markdown** | `@pierre/words` (this fork) | 14,177 lines of WAT over CommonMark + directives |
| file tree / path store | `iotadb` path-tree face over `Lorelake` | the tree is a storage layout for us, not a widget |

## Change log

No source changes yet — this branch adds this file only. The pin is recorded so that a
later patch can be read against exactly one upstream revision.
