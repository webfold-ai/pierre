import { DEFAULT_MESSAGES } from "../constants.js";
import { areObjectsEqual } from "../utils/areObjectsEqual.js";
import { compileMessage } from "./compileMessage.js";
//#region src/i18n/I18n.ts
function isMessageKey(key) {
	return Object.hasOwn(DEFAULT_MESSAGES, key);
}
function resolveMessages(messages) {
	const resolved = { ...DEFAULT_MESSAGES };
	if (messages == null) return resolved;
	for (const [key, value] of Object.entries(messages)) {
		if (!isMessageKey(key)) throw new Error(`i18n: unknown message "${key}"`);
		if (value != null) resolved[key] = value;
	}
	return resolved;
}
function compileMessages(messages, locale, numberFormat) {
	const pluralRules = new Intl.PluralRules(locale);
	const compiledMessages = /* @__PURE__ */ new Map();
	for (const [key, template] of Object.entries(messages)) compiledMessages.set(key, compileMessage(template, pluralRules, numberFormat));
	return compiledMessages;
}
var I18n = class {
	#locale = "en";
	#messages = DEFAULT_MESSAGES;
	#numberFormat = new Intl.NumberFormat("en");
	#compiledMessages = compileMessages(DEFAULT_MESSAGES, "en", this.#numberFormat);
	#subscribers = /* @__PURE__ */ new Set();
	#version = 0;
	get version() {
		return this.#version;
	}
	set({ locale = "en", messages } = {}) {
		const resolved = resolveMessages(messages);
		if (locale === this.#locale && areObjectsEqual(resolved, this.#messages)) return;
		const numberFormat = new Intl.NumberFormat(locale);
		this.#compiledMessages = compileMessages(resolved, locale, numberFormat);
		this.#numberFormat = numberFormat;
		this.#locale = locale;
		this.#messages = resolved;
		this.#version++;
		for (const subscriber of this.#subscribers) subscriber.onMessagesChange();
	}
	t(key, values) {
		const message = this.#compiledMessages.get(key);
		if (message == null) throw new Error(`i18n: unknown message "${key}"`);
		return message(values);
	}
	formatNumber(value) {
		return this.#numberFormat.format(value);
	}
	subscribe(subscriber) {
		this.#subscribers.add(subscriber);
		return () => {
			this.unsubscribe(subscriber);
		};
	}
	unsubscribe(subscriber) {
		this.#subscribers.delete(subscriber);
	}
	/**
	* @internal Drops every subscriber. For test teardowns. Do not call this
	* normally
	*/
	__clearSubscribers() {
		this.#subscribers.clear();
	}
};
const i18n = new I18n();
//#endregion
export { i18n };

//# sourceMappingURL=I18n.js.map