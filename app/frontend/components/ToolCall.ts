import { tags } from "@purifyjs/core";
import { ChatAssistantMessage, ChatToolMessage } from "~/frontend/api.ts";
import { Markdown } from "~/frontend/components/Markdown.ts";
import { css } from "~/frontend/kit/css.ts";

export function ToolCall(
    call: ChatAssistantMessage["content"]["value"]["tool_calls"][number],
    state:
        | { kind: "streaming" }
        | { kind: "running" }
        | { kind: "result"; message: ChatToolMessage },
) {
    const { ul, button, dialog, header, section, span } = tags;
    const self = ul().ariaLabel("Tool calls");
    self.$bind(ToolCallStyle.useScope());

    const { summary, content } = call.value.display;

    const modal = dialog()
        .$bind(ToolCallsModalStyle.useScope())
        .onclick((event) => {
            if (event.target === event.currentTarget) event.currentTarget.close();
        })
        .onclose((event) => event.currentTarget.remove())
        .append$(
            header().append$(
                Markdown(summary),
                button().type("button").ariaLabel("Close").textContent("×").onclick(() => modal.close()),
            ),
            section().ariaLabel("Call").append$(
                span({ class: "label" }).textContent("Call"),
                Markdown(content),
            ),
            section().ariaLabel("Result").append$(
                span({ class: "label" }).textContent("Result"),
                state.kind === "result"
                    ? Markdown(state.message.content.value.display)
                    : span({ class: "status pending" }).textContent(state.kind === "streaming" ? "Writing…" : "Running…"),
            ),
        );

    return button().type("button")
        .$bind(ToolCallStyle.useScope())
        .append$(
            Markdown(summary),
            state.kind === "result"
                ? null
                : span({ class: "status pending" }).textContent(state.kind === "streaming" ? "Writing…" : "Running…"),
        )
        .onclick(() => {
            document.body.append(modal.$node);
            modal.showModal();
        });
}

const ToolCallStyle = css`
    :scope {
        all: unset;
        display: block grid;
        gap: 0.3em;
        cursor: pointer;
        padding-inline: 0.6em;
        padding-block: 0.3em;
        border-radius: var(--radius);
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        color: var(--muted);
        background-color: var(--surface-hover);
        transition: background-color 0.12s ease;

        &:hover {
            background-color: var(--surface-hover-strong);
        }
    }

    x-markdown {
        display: inline;
    }

    .status {
        display: inline flow-root;
        max-inline-size: 64ch;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        font-weight: var(--weight-regular);
        color: var(--subtle);
    }

    .status.pending {
        animation: tool-pulse 1.4s ease-in-out infinite;
    }

    @keyframes tool-pulse {
        0%,
        100% {
            opacity: 0.45;
        }
        50% {
            opacity: 1;
        }
    }
`;

const ToolCallsModalStyle = css`
    :scope[open] {
        display: block grid;
        align-content: start;
        inline-size: min(44em, 92vi);
    }

    header {
        display: block grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 0.5em;
        padding: 0.85em 1em;
        border-block-end: 1px solid var(--border);
    }

    header button {
        all: unset;
        cursor: pointer;
        font-size: var(--text-lg);
        line-height: 1;
        color: var(--subtle);

        &:hover {
            color: var(--pop);
        }
    }

    section {
        display: block grid;
        gap: 0.5em;
        align-content: start;
        padding: 1em;

        &:not(:last-child) {
            border-block-end: 1px solid var(--border);
        }
    }

    .label {
        font-size: var(--text-xs);
        font-weight: var(--weight-medium);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--subtle);
    }

    .pending {
        color: var(--subtle);
        animation: tool-pulse 1.4s ease-in-out infinite;
    }
`;
