import { Builder, ref, tags, toChild } from "@purifyjs/core";
import { api, ChatStreamEvent, MessageOutput } from "~/frontend/api.ts";
import { ChatBox } from "~/frontend/components/ChatBox.ts";
import { ChatNavigationItem } from "~/frontend/components/ChatNavigation.ts";
import { relativeDate } from "~/frontend/utils/date.ts";
import { renderMarkdown } from "~/frontend/utils/markdown.ts";
import { PersistentSocket } from "~/frontend/utils/websocket.ts";

export async function Chat(chatId: string) {
    const { section, ol, li, article, header, strong, time, p, div } = tags;
    const chat = await api.fetch("GET /v1/chats/:chatId", { params: { pathname: { chatId }, search: {} } });
    const self = section().id("chat").ariaLabel(`Chat Conversation: ${chat.name}`);

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

    const addMessage = (message: MessageOutput) => {
        const date = new Date(message.created);

        const exist = log.$node.querySelector<HTMLLIElement>(`li#chat-message-${message.id}`);
        let item: Builder<HTMLLIElement>;
        if (exist) {
            item = new Builder(exist);
        } else {
            item = li().id(`chat-message-${message.id}`);
            log.append$(item);
        }

        switch (message.content.kind) {
            case "assistant": {
                item.replaceChildren$(
                    article().append$(
                        header().append$(
                            strong().textContent(message.content.kind),
                            time().dateTime(date.toISOString()).textContent(relativeDate(date)),
                        ),
                        Array.from(
                            div({ style: "display:contents" })
                                .innerHTML(renderMarkdown(message.content.value.content ?? message.content.value.refusal ?? "")).$node
                                .childNodes,
                        ),
                        JSON.stringify(message.content.value.tool_calls),
                    ),
                );
                break;
            }
            case "user": {
                item.replaceChildren$(
                    article().append$(
                        header().append$(
                            strong().textContent(message.content.kind),
                            time().dateTime(date.toISOString()).textContent(relativeDate(date)),
                        ),
                        p().textContent(message.content.value.content),
                    ),
                );
                break;
            }
            case "system": {
                item.replaceChildren$(
                    article().append$(
                        header().append$(
                            strong().textContent(message.content.kind),
                            time().dateTime(date.toISOString()).textContent(relativeDate(date)),
                        ),
                        div({ style: "display:contents" }).innerHTML(renderMarkdown(message.content.value.content ?? "")),
                    ),
                );
                break;
            }
            case "tool": {
                item.replaceChildren$(
                    article().append$(
                        header().append$(
                            strong().textContent(message.content.kind),
                            time().dateTime(date.toISOString()).textContent(relativeDate(date)),
                        ),
                        div({ style: "display:contents" }).innerHTML(renderMarkdown(message.content.value.display ?? "")),
                    ),
                );
                break;
            }
        }
    };

    self.$bind(() => {
        const aborter = new AbortController();
        const socket = new PersistentSocket(`/v1/chats/${chatId}/stream`);
        socket.addEventListener("open", () => {
            // TODO: Don't download all of the history at once
            api.fetch("GET /v1/chats/:chatId/messages", { params: { pathname: { chatId }, search: {} } }).then((messages) => {
                for (const message of messages) addMessage(message);
            });
        }, { signal: aborter.signal });
        socket.addEventListener("message", (e) => {
            const event = JSON.parse(e.data) as ChatStreamEvent;
            switch (event.type) {
                case "message": {
                    addMessage(event.data);
                    break;
                }
            }
        }, { signal: aborter.signal });
        return () => {
            aborter.abort();
            socket.close();
        };
    });

    return self.append$(
        log,
        ChatBox((content) =>
            api.fetch("POST /v1/chats/:chatId/messages", { params: { pathname: { chatId }, search: {} }, data: { content } })
        ),
    );
}
