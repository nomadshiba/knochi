import { tags } from "@purifyjs/core";
import { ChatAssistantMessage } from "~/frontend/api.ts";
import { Markdown } from "~/frontend/components/Markdown.ts";
import { css } from "~/frontend/kit/css.ts";
import { ChatAssistantMessageEmittter } from "~/frontend/events/ChatAssistantMessageEmittter.ts";

export function ToolCalls(messageId: string, toolCalls: ChatAssistantMessage["content"]["tool_calls"]) {
    const { ul, li, button, dialog, header, section, span, pre } = tags;
    const self = ul().ariaLabel("Tool calls");
    self.$bind(ToolCallsStyle.useScope());

    self.append$(toolCalls.map((call) => {
        const domId = call.value.id.slice(-8);
        const { summary, content } = call.value.display;

        const modal = dialog()
            .$bind(ToolCallsModalStyle.useScope())
            .onclick((event) => {
                if (event.target === event.currentTarget) modal.close();
            })
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
                    span({ class: "status pending" }).textContent("Running…"),
                ),
            );

        return li().append$(
            button().type("button").id(`tool-call-${domId}`)
                .append$(
                    Markdown(summary),
                    span({ class: "status pending" }).textContent("Running…"),
                    pre().$bind((element) => {
                        return ChatAssistantMessageEmittter.subscribe(messageId, (result) => {
                            // TODO: arguments scrolling terminal during progress
                        });
                    }),
                )
                .onclick(() => modal.showModal()),
            modal,
        );
    }));

    return self;
}

const ToolCallsStyle = css`
    :scope {
        display: block grid;
        gap: 0.4em;
        list-style: none;
        justify-items: start;
    }

    button {
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

        x-markdown {
            display: inline;
        }
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

    pre {
        display: block flow-root;
        max-block-size: 4.2em;
        overflow-y: auto;
        padding: 0.5em 0.7em;
        border-radius: var(--radius);
        background-color: #1d1d20;
        color: #cdd6f4;
        font-family: monospace;
        font-size: var(--text-xs);
        line-height: 1.4;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
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
