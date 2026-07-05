import { tags } from "@purifyjs/core";
import { Codec } from "@nomadshiba/codec";
import { api } from "~/frontend/api.ts";
import { ChatOutput } from "~/backend/handlers/chats/ChatOutput.ts";

export async function ChatNavigation() {
    const { nav } = tags;
    const self = nav().id("chats").ariaLabel("Chat Rooms");

    const chats = await api.fetch("GET /v1/chats", { params: { pathname: {}, search: {} } });

    self.append$(chats.map(ChatNavigationItem));

    return self;
}

export function ChatNavigationItem(chat: Codec.InferOutput<typeof ChatOutput>) {
    const { a } = tags;
    return a().href(`#${chat.id}`).id(`chat-${chat.id}`).textContent(chat.name);
}
