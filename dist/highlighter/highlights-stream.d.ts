import { ThemedToken } from "./types.js";
import { BaseStreamTokenizer } from "./stream-tokenizer.js";
import { LiveTokenizerOptions } from "@pierre/highlights";
//#region src/highlighter/highlights-stream.d.ts
/** Keeps the unfinished line editable so new chunks can recall provisional tokens. */
declare class HighlightsStreamTokenizer extends BaseStreamTokenizer {
  #private;
  private readonly options;
  constructor(options: LiveTokenizerOptions);
  protected tokenizeChunk(chunk: string, stable: ThemedToken[]): {
    unstable: ThemedToken[];
    tailLength: number;
  };
  clone(): HighlightsStreamTokenizer;
  protected resetSource(): void;
  protected releaseSource(): void;
}
//#endregion
export { HighlightsStreamTokenizer };
//# sourceMappingURL=highlights-stream.d.ts.map