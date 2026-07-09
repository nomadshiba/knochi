import { tags } from "@purifyjs/core";
import { ToolCall } from "~/backend/handlers/chats/messages/MessageContent.ts";
import { Markdown } from "~/frontend/components/Markdown.ts";
import { css } from "~/frontend/kit/css.ts";
import { StatusTextMixin } from "~/frontend/styles/StatusMixin.ts";

export function ToolCallIndicator(
    call: ToolCall,
    options: { streaming: boolean },
) {
    const { button, dialog, header, section, span } = tags;

    const { summary, content } = call.value.display;

    const status = call.value.result ? "Done" : options.streaming ? `Generating…${call.value.arguments.slice(-16)}` : "Running…";
    const busy = call.value.result ? "false" : "true";

    const modal = !options.streaming
        ? dialog()
            .$bind(ToolCallsModalStyle.useScope())
            .onclick((event) => {
                if (event.target === event.currentTarget) event.currentTarget.close();
            })
            .onclose((event) => event.currentTarget.remove())
            .append$(
                header().append$(
                    Markdown(summary),
                    button().type("button").ariaLabel("Close").textContent("×").onclick(() => modal?.close()),
                ),
                section().ariaLabel("Call").append$(
                    span({ class: "label" }).textContent("Call"),
                    Markdown(content),
                ),
                section().ariaLabel("Result").ariaBusy(call.value.result ? "false" : "true").append$(
                    span({ class: "label" }).textContent("Result"),
                    call.value.result ? Markdown(call.value.result.display) : span().ariaBusy(busy).role("status").textContent(status),
                ),
            )
        : undefined;

    const self = button().type("button")
        .disabled(!modal)
        .$bind(ToolCallStyle.useScope())
        .append$(
            Markdown(summary),
            span().role("status").ariaBusy(busy).textContent(status),
        )
        .onclick(() => {
            if (!modal) return;
            document.body.append(modal.$node);
            modal.showModal();
        });

    return self;
}

const ToolCallStyle = css`
    :scope {
        all: unset;
        cursor: pointer;
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

    ${StatusTextMixin};
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

    ${StatusTextMixin};
`;
