import { tags } from "@purifyjs/core";
import { css } from "~/frontend/kit/css.ts";
import { renderMarkdown } from "~/frontend/utils/markdown.ts";

export function Markdown(md: string) {
    const { div } = tags;
    const self = div();
    const shadow = self.$node.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets.push(MarkdownStyle.sheet());
    shadow.innerHTML = renderMarkdown(md);
    return self;
}

const MarkdownStyle = css`
    :host {
        display: block flow-root;
        overflow-wrap: break-word;
        overflow: hidden;
    }

    :first-child {
        margin-block-start: 0;
    }
    :last-child {
        margin-block-end: 0;
    }

    hr {
        border-width: 0;
        border-block-end-width: 1px;
        opacity: 0.25;
    }

    pre {
        background: #1d1d20;
        color: #cdd6f4;
        padding: 0.75em 1em;
        overflow-x: auto;
        border-radius: 0.5em;
    }
    pre code {
        background: none;
        padding: 0;
    }
    code {
        background: #1d1d20;
        padding: 0.1em 0.35em;
        font-family: monospace;
    }
    table {
        border-collapse: collapse;
        margin: 0.5em 0;
    }
    th, td {
        border: 1px solid #4a4a5a;
        padding: 0.3em 0.7em;
    }
    blockquote {
        border-left: 3px solid #7aa2f7;
        margin: 0.5em 0;
        padding: 0.1em 1em;
        opacity: 0.85;
    }
    .tok-kw {
        color: #cba6f7;
    }
    .tok-str {
        color: #a6e3a1;
    }
    .tok-num {
        color: #fab387;
    }
    .tok-lit {
        color: #f38ba8;
    }
    .tok-com {
        color: #6c7086;
        font-style: italic;
    }
    .tok-type {
        color: #f9e2af;
    }
    .tok-fn {
        color: #89b4fa;
    }
    .tok-key {
        color: #89dceb;
    }
`;
