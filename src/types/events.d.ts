/**
 * Type declarations for the `events` package.
 *
 * The project depends on the standalone `node_modules/events` package (used by
 * the scratch-render / twgl ecosystem), which ships no type declarations. Under
 * `moduleResolution: "bundler"` this package shadows `@types/node`'s ambient
 * `events` module, leaving `EventEmitter` untyped and hiding all of its methods
 * (`on`, `emit`, `addListener`, `removeListener`, `setMaxListeners`, ...).
 *
 * Declaring the module here guarantees `import EventEmitter from "events"`
 * yields a fully-typed emitter no matter which package TS resolves to.
 */
declare module "events" {
  interface EventEmitterOptions {
    captureRejections?: boolean;
  }

  class EventEmitter {
    static defaultMaxListeners: number;
    static listenerCount(emitter: EventEmitter, eventName: string | symbol): number;
    static once(
      emitter: EventEmitter,
      eventName: string | symbol,
    ): Promise<any[]>;
    static getEventListeners(
      emitter: EventEmitter | { listeners(eventName: string | symbol): Function[] },
      eventName: string | symbol,
    ): Function[];
    static on(
      emitter: EventEmitter,
      eventName: string | symbol,
    ): AsyncIterableIterator<any>;

    constructor(options?: EventEmitterOptions);

    addListener(eventName: string | symbol, listener: (...args: any[]) => void): this;
    on(eventName: string | symbol, listener: (...args: any[]) => void): this;
    once(eventName: string | symbol, listener: (...args: any[]) => void): this;
    prependListener(eventName: string | symbol, listener: (...args: any[]) => void): this;
    prependOnceListener(eventName: string | symbol, listener: (...args: any[]) => void): this;
    removeListener(eventName: string | symbol, listener: (...args: any[]) => void): this;
    off(eventName: string | symbol, listener: (...args: any[]) => void): this;
    removeAllListeners(event?: string | symbol): this;
    setMaxListeners(n: number): this;
    getMaxListeners(): number;
    listeners(eventName: string | symbol): Function[];
    rawListeners(eventName: string | symbol): Function[];
    emit(eventName: string | symbol, ...args: any[]): boolean;
    eventNames(): Array<string | symbol>;
    listenerCount(eventName: string | symbol): number;
  }

  export = EventEmitter;
}
