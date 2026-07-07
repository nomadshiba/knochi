import { sync, tags, toChild } from "@purifyjs/core";
import { ChatNavigation } from "~/frontend/components/ChatNavigation.ts";
import { awaited } from "~/frontend/kit/awaited.ts";
import { Chat } from "~/frontend/components/Chat.ts";
import { NewChat } from "~/frontend/components/NewChat.ts";
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

    const chat = chatId.derive((chatId) => awaited(chatId ? Chat(chatId) : NewChat(), progress())).pipe(unroll);

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

    main {
        display: block grid;
    }
`;

const GlobalStyle = css`
    :root {
        /* Core palette */
        --base: hsl(240, 12%, 11%);
        --pop: hsl(0, 0%, 96%);
        --accent-base: hsl(240, 50%, 50%);
        --accent-pop: hsl(240, 50%, 98%);

        /* Foreground scale, derived from --pop so contrast stays predictable
        against --base (16:1). Use these instead of ad-hoc opacity. */
        --muted: color-mix(in srgb, currentcolor, transparent 35%); /* ~7.4:1 on base, secondary text */
        --subtle: color-mix(in srgb, currentcolor, transparent 45%); /* ~5.7:1 on base, meta/timestamps */
        --faint: color-mix(in srgb, currentcolor, transparent 88%); /* decorative only, not text */

        /* Surfaces & structure */
        --layout-base: hsl(240, 12%, 12%);
        --layout-gap: 0.625em;
        --layout-radius: 0.75em;

        --surface-hover: color-mix(in srgb, var(--base), var(--pop) 8%);
        --surface-hover-strong: color-mix(in srgb, var(--base), var(--pop) 14%);

        --border: color-mix(in srgb, currentcolor, transparent 88%);
        --radius: 0.35em;

        /* Type scale (em-relative so it composes with component font-size) */
        --text-xs: 0.75em;
        --text-sm: 0.8125em;
        --text-md: 0.875em;
        --text-lg: 1.125em;

        --weight-regular: 400;
        --weight-medium: 600;
        --weight-bold: 700;

        accent-color: var(--accent-base);
        /* font-family: system-ui; */
        font-family: monospace;
        font-size: 1rem;
        line-height: 1.55;
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

    dialog:where([open]) {
        all: unset;
        position: fixed;
        inset-block: 0;
        inset-inline-end: 0;
        inline-size: min(100%, 30em);
        background-color: var(--base);

        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-gutter: stable;
        scrollbar-width: thin;

        &::backdrop {
            background-color: color-mix(in srgb, black, transparent 45%);
        }
    }
`;

document.adoptedStyleSheets.push(GlobalStyle.sheet());
document.body.replaceWith(toChild(App()));
