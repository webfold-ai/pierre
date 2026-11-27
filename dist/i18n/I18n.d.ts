import { DiffsI18nConfig, DiffsMessageKey } from "../types.js";
import { MessageValues } from "./compileMessage.js";
//#region src/i18n/I18n.d.ts
interface MessagesSubscriber {
  onMessagesChange(): void;
}
declare class I18n {
  #private;
  get version(): number;
  set({ locale, messages }?: DiffsI18nConfig): void;
  t(key: DiffsMessageKey, values?: MessageValues): string;
  formatNumber(value: number): string;
  subscribe(subscriber: MessagesSubscriber): () => void;
  unsubscribe(subscriber: MessagesSubscriber): void;
  /**
   * @internal Drops every subscriber. For test teardowns. Do not call this
   * normally
   */
  __clearSubscribers(): void;
}
declare const i18n: I18n;
//#endregion
export { MessagesSubscriber, i18n };
//# sourceMappingURL=I18n.d.ts.map