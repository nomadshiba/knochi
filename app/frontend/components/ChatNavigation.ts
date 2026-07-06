import { tags } from "@purifyjs/core";
import { api } from "~/frontend/api.ts";
import { css } from "~/frontend/kit/css.ts";
import { ProviderManager } from "~/frontend/components/ProviderManager.ts";

export async function ChatNavigation() {
    const { nav } = tags;
    const self = nav().id("chats").ariaLabel("Chat Rooms");
    self.$bind(ChatNavigationSheet.useScope());

    const chats = await api.fetch("GET /v1/chats", { params: { pathname: {}, search: {} } });

    self.append$(NewChatLink(), chats.map(ChatNavigationItem), ProviderManager());

    return self;
}

export function NewChatLink() {
    const { a } = tags;
    // Bare `#` clears location.hash, which routes App() back to the NewChat view.
    return a().href("#").id("new-chat").textContent("+ New Chat");
}

export function ChatNavigationItem(chat: { id: string; name: string }) {
    const { a } = tags;
    return a().href(`#${chat.id}`).id(`chat-${chat.id}`).textContent(chat.name);
}

const ChatNavigationSheet = css`
    :scope {
        display: flex;
        flex-direction: column;
        gap: 0.3em;

        padding-inline: 0.6em;
        padding-block: 1em;
    }

    a {
        display: block grid;
        align-items: center;
        padding-inline: 0.7em;
        padding-block: 0.55em;
        border-radius: var(--radius);
        background-color: color-mix(in srgb, var(--base), var(--pop) 5%);
        color: var(--pop);
        font-size: var(--text-md);

        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-decoration: none;
        transition: background-color 0.12s ease;

        &:hover {
            background-color: var(--surface-hover-strong);
        }
    }

    #new-chat {
        font-weight: var(--weight-medium);
        color: var(--accent-pop);
        background-color: var(--accent-base);
        margin-block-end: 0.35em;

        &:hover {
            background-color: color-mix(in srgb, var(--accent-base), white 10%);
        }
    }
`;
