import { Builder, WithLifecycle } from "@purifyjs/core";
import { css } from "~/frontend/kit/css.ts";
import { renderMarkdown } from "~/frontend/utils/markdown.ts";

class MarkdownElement extends WithLifecycle(HTMLElement) {
    static {
        customElements.define("x-markdown", this);
    }

    constructor(md: string) {
        super();
        const shadow = this.attachShadow({ mode: "open" });
        shadow.adoptedStyleSheets.push(MarkdownStyle.sheet());
        shadow.innerHTML = renderMarkdown(md);
    }
}

export function Markdown(md: string) {
    return new Builder(new MarkdownElement(md));
}

const MarkdownGlobalStyle = css`
    x-markdown {
        all: unset;
        display: block flow-root;
        line-height: 1.6;
        font-size: 0.9em;
        overflow-wrap: anywhere;
        overflow-x: hidden;
        contain: paint;
    }
`;

document.adoptedStyleSheets.push(MarkdownGlobalStyle.sheet());

const MarkdownStyle = css`
    *, *::before, *::after {
        box-sizing: border-box;
    }

    :first-child {
        margin-block-start: 0;
    }
    :last-child {
        margin-block-end: 0;
    }

    h1, h2, h3, h4, h5, h6 {
        line-height: 1.3;
        font-weight: var(--weight-medium, 600);
        margin-block: 1em 0.5em;
    }

    p, ul, ol {
        margin-block: 0.75em;
    }

    hr {
        border-width: 0;
        border-block-end-width: 1px;
        border-color: var(--faint, currentcolor);
        opacity: 0.6;
        margin-block: 1em;
    }

    pre {
        background: #1d1d20;
        color: #cdd6f4;
        padding: 0.75em 1em;

        border-radius: 0.5em;
        line-height: 1.5;
        margin-block: 0.75em;
    }
    pre:has(code) {
        overflow-x: auto;
    }
    pre code {
        background: none;
        padding: 0;
    }
    code {
        background: #1d1d20;
        padding: 0.1em 0.35em;
        border-radius: 0.25em;
        font-family: monospace;
        font-size: 0.9em;
    }
    table {
        border-collapse: collapse;
        margin: 0.75em 0;
    }
    th, td {
        border: 1px solid #6b6b85;
        padding: 0.4em 0.8em;
    }
    th {
        font-weight: var(--weight-medium, 600);
        background: color-mix(in srgb, #6b6b85, transparent 75%);
    }
    blockquote {
        border-left: 3px solid #7aa2f7;
        margin: 0.75em 0;
        padding: 0.1em 1em;
        color: color-mix(in srgb, currentcolor, transparent 12%);
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
        color: #8f97b8;
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
