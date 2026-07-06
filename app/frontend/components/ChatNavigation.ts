import { tags } from "@purifyjs/core";
import { api } from "~/frontend/api.ts";
import { css } from "~/frontend/kit/css.ts";
import { ProviderManager } from "~/frontend/components/ProviderManager.ts";

export async function ChatNavigation() {
    const { nav, ul } = tags;
    const self = nav().id("primary-nav").ariaLabel("Primary Navigation");
    self.$bind(ChatNavigationSheet.useScope());

    const chats = await api.fetch("GET /v1/chats", { params: { pathname: {}, search: {} } });

    self.append$(NewChatLink(), ul().id("chats").ariaLabel("Chat Rooms").append$(chats.map(ChatNavigationItem)), ProviderManager());

    return self;
}

export function NewChatLink() {
    const { a } = tags;
    // Bare `#` clears location.hash, which routes App() back to the NewChat view.
    return a().href("#").id("new-chat").textContent("+ New Chat");
}

export function ChatNavigationItem(chat: { id: string; name: string }) {
    const { a, li } = tags;
    return li().append$(a().href(`#${chat.id}`).id(`chat-${chat.id}`).textContent(chat.name));
}

const ChatNavigationSheet = css`
    :scope {
        display: block grid;
        grid-template-rows: auto 1fr auto;
        gap: 0.3em;

        padding-inline: 0.6em;
        padding-block: 1em;
    }

    ul {
        list-style: none;
        display: block grid;
        gap: 0.3em;
        align-content: start;
    }

    li {
        display: contents;
    }

    a {
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
