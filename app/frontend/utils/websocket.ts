export type PersistentSocketOptions = {
    protocols?: string | string[];
    /** First retry delay. Doubles each attempt. Default 500ms. */
    minDelayMs?: number;
    /** Backoff ceiling. Default 30_000ms. */
    maxDelayMs?: number;
};

type EventMap = {
    open: Event;
    message: MessageEvent;
    /** An unexpected disconnect happened; a retry is scheduled. */
    reconnecting: CustomEvent<{ attempt: number; delayMs: number; cause: CloseEvent }>;
    /** Fired exactly once: the socket was closed on purpose and will not retry. */
    close: CloseEvent;
};

export class PersistentSocket extends EventTarget implements Disposable {
    private url: string | URL;
    private opts: Required<Pick<PersistentSocketOptions, "minDelayMs" | "maxDelayMs">> & PersistentSocketOptions;
    private ws: WebSocket | null = null;
    private timer: number | undefined;
    private attempt = 0;
    private disposed = false;

    constructor(url: string | URL, options: PersistentSocketOptions = {}) {
        super();
        this.url = url;
        this.opts = { minDelayMs: 500, maxDelayMs: 30_000, ...options };
        this.connect();
    }

    get connected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    /** Sends if currently connected. Returns false (drops the message) otherwise. */
    send(data: string | ArrayBufferLike | Blob | ArrayBufferView): boolean {
        if (!this.connected) return false;
        this.ws!.send(data);
        return true;
    }

    /** Close on purpose: stops all retries and fires a final `close` event. */
    close(code = 1000, reason = ""): void {
        if (this.disposed) return;
        this.disposed = true;
        clearTimeout(this.timer);
        const ws = this.ws;
        this.ws = null;
        if (ws) {
            ws.onopen =
                ws.onmessage =
                ws.onerror =
                ws.onclose =
                    null;
            try {
                ws.close(code, reason);
            } catch { /* some runtimes throw on close() while CONNECTING */ }
        }
        this.dispatch("close", new CloseEvent("close", { code, reason, wasClean: true }));
    }

    [Symbol.dispose](): void {
        this.close();
    }

    private connect(): void {
        const ws = new WebSocket(this.url, this.opts.protocols);
        this.ws = ws;
        ws.onopen = () => {
            this.attempt = 0;
            this.dispatch("open", new Event("open"));
        };
        ws.onmessage = (e) => this.dispatch("message", new MessageEvent("message", { data: e.data }));
        ws.onclose = (e) => this.onDrop(ws, e);
        // Per spec `error` is always followed by `close`, but Node's undici fires
        // ONLY `error` on a refused connection — so treat both as a drop; the
        // stale-socket guard makes handling idempotent on compliant runtimes.
        ws.onerror = () => this.onDrop(ws, new CloseEvent("close", { code: 1006, reason: "connection error", wasClean: false }));
    }

    private onDrop(ws: WebSocket, cause: CloseEvent): void {
        if (this.ws !== ws) return; // stale socket from a previous generation, or already handled
        this.ws = null;
        ws.onopen =
            ws.onmessage =
            ws.onerror =
            ws.onclose =
                null;
        try {
            ws.close();
        } catch { /* already closed / CONNECTING */ }
        const backoff = Math.min(this.opts.maxDelayMs, this.opts.minDelayMs * 2 ** this.attempt);
        const delayMs = Math.round(backoff * (0.5 + Math.random() * 0.5)); // jitter
        this.attempt++;
        this.dispatch(
            "reconnecting",
            new CustomEvent("reconnecting", { detail: { attempt: this.attempt, delayMs, cause } }),
        );
        this.timer = setTimeout(() => this.connect(), delayMs);
    }

    private dispatch<K extends keyof EventMap>(_type: K, event: EventMap[K]): void {
        this.dispatchEvent(event);
    }

    // typed listener overloads
    override addEventListener<K extends keyof EventMap>(
        type: K,
        listener: (event: EventMap[K]) => void,
        options?: AddEventListenerOptions | boolean,
    ): void;
    override addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: AddEventListenerOptions | boolean,
    ): void {
        super.addEventListener(type, listener, options);
    }
}
