import { sync, tags, toChild } from "@purifyjs/core";
import { ChatNavigation } from "~/frontend/components/ChatNavigation.ts";
import { awaited } from "~/frontend/kit/awaited.ts";
import { Chat } from "~/frontend/components/Chat.ts";
import { unroll } from "~/frontend/kit/unroll.ts";
import { useReplaceChildren } from "~/frontend/kit/bind.ts";
import { css } from "~/frontend/kit/css.ts";

function App() {
    const { body, header, main, progress } = tags;
    const self = body().$bind(AppStyle.useScope());

    const navigation = awaited(ChatNavigation(), progress());

    const chatId = sync<string>((set) => {
        set(location.hash);
        const interval = setInterval(() => set(location.hash), 100);
        return () => clearInterval(interval);
    }).derive((hash) => hash.slice(1) || undefined);

    const chat = chatId.derive((chatId) => chatId ? awaited(Chat(chatId), progress()) : "new chat").pipe(unroll);

    self.append$(
        header().$bind(useReplaceChildren(navigation)),
        main().$bind(useReplaceChildren(chat)),
    );

    return self;
}

const AppStyle = css`
    :scope {
        display: block grid;
        grid-template-columns: 15em 1fr;
        color: var(--pop);
        background-color: var(--layout-base);
        gap: var(--layout-gap);
        padding: var(--layout-gap);
    }

    header {
        display: block grid;
        position: sticky;
        inset-block-start: var(--layout-gap);
        block-size: calc(100dvb - var(--layout-gap) - var(--layout-gap));

        background-color: var(--base);
        border-radius: var(--layout-radius);
        z-index: 1;
    }

    main {}
`;

const GlobalStyle = css`
    :root {
        --base: hsl(240, 12%, 11%);
        --pop: hsl(0, 0%, 96%);
        --accent-base: hsl(240, 50%, 50%);
        --accent-pop: hsl(240, 50%, 98%);

        --layout-base: hsl(240, 12%, 12%);
        --layout-gap: 0.5em;
        --layout-radius: 0.75em;

        --spacing: 0.5em;
        --radius: 0.25em;

        accent-color: var(--accent-base);
        /* font-family: system-ui; */
        font-family: monospace;
        font-size: 1rem;
        line-height: 1.25;
    }

    /* layout default not article/document, put articles/documents in shadow dom */
    *, *::before, *::after {
        box-sizing: border-box !important;
        margin: 0;
        text-box-trim: trim-both;
    }

    ol, ul {
        padding: 0;
    }

    dialog[open] {
        all: unset;
        display: block grid;
        align-content: start;
        position: fixed;
        inset-block: 0;
        inset-inline-end: 0;
        inline-size: min(100%, 30em);
        background-color: var(--base);

        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-gutter: stable;
        scrollbar-width: thin;
    }
`;

document.adoptedStyleSheets.push(GlobalStyle.sheet());
document.body.replaceWith(toChild(App()));
