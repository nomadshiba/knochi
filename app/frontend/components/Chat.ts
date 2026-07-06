import { Builder, ref, sync, tags, toChild } from "@purifyjs/core";
import { ChatStreamOutput } from "~/backend/handlers/chats/messages/ChatStreamOutput.ts";
import { api, MessageOutput } from "~/frontend/api.ts";
import { AgentPicker } from "~/frontend/components/AgentPicker.ts";
import { ChatBox } from "~/frontend/components/ChatBox.ts";
import { ChatNavigationItem } from "~/frontend/components/ChatNavigation.ts";
import { Markdown } from "~/frontend/components/Markdown.ts";
import { ModelPicker } from "~/frontend/components/ModelPicker.ts";
import { ToolCalls } from "~/frontend/components/ToolCalls.ts";
import { css } from "~/frontend/kit/css.ts";
import { relativeDate } from "~/frontend/utils/date.ts";
import { PersistentSocket } from "~/frontend/utils/websocket.ts";

const scroller = document.scrollingElement ?? document.body;

export async function Chat(chatId: string) {
    const { section, ol, li, article, header, strong, time, p, form, button, menu } = tags;
    const chat = await api.fetch("GET /v1/chats/:chatId", { params: { pathname: { chatId }, search: {} } });
    const self = section().id("chat").ariaLabel(`Chat Conversation: ${chat.name}`);
    self.$bind(ChatStyle.useScope());

    document.querySelector(`#chat-${chat.id}`)?.replaceWith(toChild(ChatNavigationItem(chat)));

    const agent = ref(chat.agent);
    const model = ref(chat.model);

    self.$bind(() =>
        agent.follow((agent) => api.fetch("PATCH /v1/chats/:chatId", { params: { pathname: { chatId }, search: {} }, data: { agent } }))
    );
    self.$bind(() =>
        model.follow((model) => api.fetch("PATCH /v1/chats/:chatId", { params: { pathname: { chatId }, search: {} }, data: { model } }))
    );

    const log = ol().role("log").ariaLabel("Messages");

    const RELATIVE_STEPS = [
        60 * 60 * 1000,
        60 * 1000,
    ];
    const addMessage = (message: MessageOutput) => {
        const relative = sync<string>((set) => {
            const created = message.created.getTime();
            let timeout!: number;
            const update = () => {
                set(relativeDate(message.created));
                const delta = Date.now() - created;
                for (const step of RELATIVE_STEPS) {
                    if (delta < step) continue;
                    timeout = setTimeout(update, step);
                    break;
                }
            };
            update();
            return () => clearTimeout(timeout);
        });

        const shouldScroll = message.content.kind === "user" || scroller.scrollHeight - scroller.scrollTop - innerHeight < 100;

        const exist = log.$node.querySelector<HTMLLIElement>(`li#chat-message-${message.id.slice(-8)}`);
        let item: Builder<HTMLLIElement>;
        if (exist) {
            item = new Builder(exist);
        } else {
            item = li().id(`chat-message-${message.id.slice(-8)}`);
            log.append$(item);
        }

        switch (message.content.kind) {
            case "assistant": {
                item.replaceChildren$(
                    article({ class: "role-assistant" }).append$(
                        header().append$(
                            strong().textContent(message.content.kind),
                            time().dateTime(message.created.toISOString()).textContent(relative),
                        ),
                        Markdown(message.content.value.content ?? message.content.value.refusal ?? ""),
                        ToolCalls(message.content.value.tool_calls),
                    ),
                );
                break;
            }
            case "user": {
                item.replaceChildren$(
                    article({ class: "role-user" }).append$(
                        header().append$(
                            strong().textContent(message.content.kind),
                            time().dateTime(message.created.toISOString()).textContent(relative),
                        ),
                        p().textContent(message.content.value.content),
                    ),
                );
                break;
            }
            case "system": {
                item.replaceChildren$(
                    article({ class: "role-system" }).append$(
                        header().append$(
                            strong().textContent(message.content.kind),
                            time().dateTime(message.created.toISOString()).textContent(relative),
                        ),
                        Markdown(message.content.value.content ?? ""),
                    ),
                );
                break;
            }
            case "tool": {
                const domId = message.content.value.tool_call_id.slice(-8);
                const result = toChild(
                    Markdown(message.content.value.display ?? "").id(`tool-result-${domId}`),
                );

                const existingResult = log.$node.querySelector(`#tool-result-${domId}`);
                if (existingResult) {
                    existingResult.replaceWith(result);
                } else {
                    const existingCall = log.$node.querySelector(`#tool-call-${domId}`)!;
                    existingCall.after(result);
                }

                break;
            }
        }

        if (shouldScroll) {
            scroller.scrollTop = scroller.scrollHeight - innerHeight;
        }
    };

    // In-progress assistant messages keyed by (not-yet-persisted) message id, accumulated from
    // "stream" delta events until the real "message" event supersedes them.
    const streamBuffers = new Map<string, {
        content: string;
        refusal: string;
        toolCalls: Map<number, { id: string; name: string; arguments: string }>;
    }>();

    self.$bind(() => {
        const aborter = new AbortController();
        const socket = new PersistentSocket(`/v1/chats/${chatId}/stream`);
        socket.addEventListener("open", () => {
            // TODO: Don't download all of the history at once
            api.fetch("GET /v1/chats/:chatId/messages", { params: { pathname: { chatId }, search: {} } }).then((messages) => {
                for (const message of messages) addMessage(message);
            });
        }, { signal: aborter.signal });
        socket.addEventListener("message", async (e) => {
            const blob = e.data as Blob;
            const [event] = ChatStreamOutput.decode(await blob.bytes());
            switch (event.kind) {
                case "message": {
                    // Real message arrived — drop any in-progress buffer for it, `addMessage` will
                    // replace the placeholder bubble in place (same DOM id, keyed off message id).
                    streamBuffers.delete(event.value.id);
                    addMessage(event.value);
                    break;
                }
                case "stream": {
                    const { id, delta } = event.value;
                    let buffer = streamBuffers.get(id);
                    if (!buffer) {
                        buffer = { content: "", refusal: "", toolCalls: new Map() };
                        streamBuffers.set(id, buffer);
                    }

                    switch (delta.kind) {
                        case "text": {
                            buffer.content += delta.value;
                            break;
                        }
                        case "refusal": {
                            buffer.refusal += delta.value;
                            break;
                        }
                        case "tool_call": {
                            const existing = buffer.toolCalls.get(delta.value.index) ??
                                { id: delta.value.id ?? "", name: "", arguments: "" };
                            if (delta.value.id) existing.id = delta.value.id;
                            if (delta.value.name) existing.name = delta.value.name;
                            if (delta.value.arguments) existing.arguments += delta.value.arguments;
                            buffer.toolCalls.set(delta.value.index, existing);
                            break;
                        }
                        case "done": {
                            // The real "message" event follows shortly after — no need to keep the buffer around.
                            streamBuffers.delete(id);
                            break;
                        }
                    }

                    // Render (or update) a placeholder bubble for the in-progress assistant message,
                    // reusing the exact same replace-or-append-by-id path as a real message.
                    addMessage({
                        id,
                        created: new Date(),
                        content: {
                            kind: "assistant",
                            value: {
                                content: buffer.content || undefined,
                                refusal: buffer.refusal || undefined,
                                tool_calls: [...buffer.toolCalls.entries()]
                                    .sort(([a], [b]) => a - b)
                                    .map(([, call]) => ({
                                        kind: "function" as const,
                                        value: { id: call.id, name: call.name, arguments: call.arguments, display: call.arguments },
                                    })),
                            },
                        },
                    });
                    break;
                }
            }
        }, { signal: aborter.signal });
        return () => {
            aborter.abort();
            socket.close();
        };
    });

    const content = ref("");

    return self.append$(
        log,
        form()
            .append$(
                ChatBox(content),
                menu().append$(
                    li().append$(AgentPicker(agent)),
                    li().append$(ModelPicker(model)),
                    li().append$(button().type("submit").ariaLabel("Send")),
                ),
            )
            .onsubmit((event) => {
                event.preventDefault();
                api.fetch("POST /v1/chats/:chatId/messages", {
                    params: { pathname: { chatId }, search: {} },
                    data: { content: content.get() },
                });
                content.set("");
            }),
    );
}

const ChatStyle = css`
    :scope {
        display: block grid;
        gap: var(--layout-gap);

        grid-template-columns: minmax(0, 60em);
        justify-content: center;
    }

    ol[role="log"] {
        display: block grid;
        gap: 2em;
        align-content: end;
        list-style: none;
        min-block-size: 100lvb;
    }

    ol[role="log"] li {
        display: contents;
    }

    ol[role="log"] article {
        display: block grid;
        gap: 0.6em;
        border-radius: var(--layout-radius);
        padding: 0.75em 1em;
        max-inline-size: 98%;

        header {
            display: block grid;
            grid-auto-flow: column;
            gap: 0.6em;
            justify-content: start;
            align-items: baseline;

            time {
                display: block flow;
                font-size: var(--text-xs);
                color: var(--subtle);
            }

            strong {
                display: block flow;
                font-size: var(--text-sm);
                font-weight: var(--weight-medium);
                color: var(--muted);
                text-transform: capitalize;
                letter-spacing: 0.02em;
            }
        }

        &.role-user {
            justify-self: end;
            background-color: var(--base);
            color: var(--pop);

            p {
                white-space: pre-wrap;
                overflow-wrap: break-word;
                overflow: hidden;
            }
        }
    }

    form {
        display: block grid;
        position: sticky;
        inset-block-end: var(--layout-gap);
        background-color: var(--base);
        border-radius: var(--layout-radius);
        padding: 0.85em 0.9em;
        box-shadow: 0 0 10px 5px var(--layout-base);

        gap: 0.85em;
        align-items: center;
    }

    form menu {
        display: block grid;
        gap: 0.6em;
        align-items: center;
        list-style: none;
        padding: 0;

        grid-template-columns: auto 1fr auto;
    }

    form menu button[type="submit"] {
        all: unset;
        cursor: pointer;
        display: block grid;
        aspect-ratio: 1;
        color: var(--accent-pop);
        background-color: var(--accent-base);
        border-radius: 50%;
        padding: 0.3em;
        inline-size: 1.85em;
        transition: background-color 0.15s ease, transform 0.1s ease;

        &:hover {
            background-color: color-mix(in srgb, var(--accent-base), white 10%);
        }

        &:active {
            transform: scale(0.94);
        }

        &::before {
            content: "";
            display: block flow;
            background-color: currentcolor;
            mask-image: url("/icons/send.svg");
            mask-size: contain;
            mask-position: center;
        }
    }
`;
