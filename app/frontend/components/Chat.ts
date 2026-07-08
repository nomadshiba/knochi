import { ref, tags, toChild } from "@purifyjs/core";
import { ChatStreamOutput } from "~/backend/handlers/chats/messages/ChatStreamOutput.ts";
import { api, ChatMessage } from "~/frontend/api.ts";
import { AgentPicker } from "~/frontend/components/AgentPicker.ts";
import { ChatBox } from "~/frontend/components/ChatBox.ts";
import { ChatNavigationItem } from "~/frontend/components/ChatNavigation.ts";
import { ModelPicker } from "~/frontend/components/ModelPicker.ts";
import { ChatAssistantMessageEmittter } from "~/frontend/events/ChatAssistantMessageEmittter.ts";
import { ChatToolMessageEmitter } from "~/frontend/events/ChatToolMessageEmitter.ts";
import { css } from "~/frontend/kit/css.ts";
import { PersistentSocket } from "~/frontend/utils/websocket.ts";
import { ChatBubble } from "~/frontend/components/ChatBubble.ts";

const scroller = document.scrollingElement ?? document.body;

export async function Chat(chatId: string) {
    const { section, ol, li, form, button, menu } = tags;
    const chat = await api.fetch("GET /v1/chats/:chatId", { params: { pathname: { chatId }, search: {} } });
    const self = section().id("chat").ariaLabel(`Chat Conversation: ${chat.name}`);
    self.$bind(ChatStyle.useScope());

    document.querySelector(`#chat-${chat.id}`)?.replaceWith(toChild(ChatNavigationItem(chat)));

    const log = ol().role("log").ariaLabel("Messages");

    const addMessage = (message: ChatMessage) => {
        if (message.content.kind === "tool") return;
        const domId = message.id.slice(-8);
        const exist = log.$node.querySelector<HTMLLIElement>(`li#chat-message-${domId}`);
        if (exist) return;
        log.append$(li().id(`chat-message-${domId}`).append$(ChatBubble(message)));
    };

    self.$bind(() => {
        const aborter = new AbortController();
        const socket = new PersistentSocket(`/v1/chats/${chatId}/stream`);

        socket.addEventListener("open", () => {
            // TODO: Don't download all of the history at once
            api.fetch("GET /v1/chats/:chatId/messages", { params: { pathname: { chatId }, search: {} } }).then((messages) => {
                const shouldScroll = scroller.scrollHeight - scroller.scrollTop - innerHeight < 50;
                for (const message of messages) {
                    if (message.content.kind === "assistant") {
                        // TODO: https://github.com/microsoft/TypeScript/issues/42384
                        ChatAssistantMessageEmittter.emit(message.id, { kind: "message", value: message as never });
                    }
                    if (message.content.kind === "tool") {
                        // TODO: https://github.com/microsoft/TypeScript/issues/42384
                        ChatToolMessageEmitter.emit(message.content.value.tool_call_id, message as never);
                    } else {
                        addMessage(message);
                    }
                }
                if (shouldScroll) {
                    scroller.scrollTop = scroller.scrollHeight - innerHeight;
                }
            });
        }, { signal: aborter.signal });

        socket.addEventListener("message", async (e) => {
            const blob = e.data as Blob;
            const [event] = ChatStreamOutput.decode(await blob.bytes());
            console.log("socket", `kind:${event.kind}`, event.value);

            let shouldScroll = scroller.scrollHeight - scroller.scrollTop - innerHeight < 50;

            if (event.kind === "message") {
                const message = event.value;
                if (message.content.kind === "assistant") {
                    // TODO: https://github.com/microsoft/TypeScript/issues/42384
                    ChatAssistantMessageEmittter.emit(event.value.id, { kind: "message", value: message as never });
                }
                if (message.content.kind === "tool") {
                    // TODO: https://github.com/microsoft/TypeScript/issues/42384
                    ChatToolMessageEmitter.emit(message.content.value.tool_call_id, message as never);
                } else {
                    if (message.content.kind === "user") shouldScroll = true;
                    addMessage(message);
                }
            } else if (event.kind === "stream") {
                ChatAssistantMessageEmittter.emit(event.value.id, event);
                addMessage({
                    id: event.value.id,
                    content: { kind: "assistant", value: { content: "", tool_calls: [] } },
                    created: new Date(),
                });
            }

            if (shouldScroll) {
                scroller.scrollTop = scroller.scrollHeight - innerHeight;
            }
        }, { signal: aborter.signal });

        return () => {
            aborter.abort();
            socket.close();
        };
    });

    const content = ref("");
    const agent = ref(chat.agent);
    const model = ref(chat.model);

    self.$bind(() =>
        agent.follow((agent) => api.fetch("PATCH /v1/chats/:chatId", { params: { pathname: { chatId }, search: {} }, data: { agent } }))
    );
    self.$bind(() =>
        model.follow((model) => api.fetch("PATCH /v1/chats/:chatId", { params: { pathname: { chatId }, search: {} }, data: { model } }))
    );

    return self.append$(
        log,
        form().onsubmit((event) => {
            event.preventDefault();
            api.fetch("POST /v1/chats/:chatId/messages", {
                params: { pathname: { chatId }, search: {} },
                data: { content: content.get() },
            });
            content.set("");
        }).append$(
            ChatBox(content),
            menu().append$(
                li().append$(AgentPicker(agent)),
                li().append$(ModelPicker(model)),
                li().append$(button().type("submit").ariaLabel("Send")),
            ),
        ),
    );
}

const ChatStyle = css`
    :scope {
        display: block grid;
        gap: var(--layout-gap);

        grid-template-columns: minmax(0, 60em);
        justify-content: center;
        align-content: end;
    }

    ol[role="log"] {
        display: block grid;
        gap: 2em;
        align-content: end;
        list-style: none;
    }

    ol[role="log"] li {
        display: contents;
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
