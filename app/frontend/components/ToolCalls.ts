import { tags } from "@purifyjs/core";
import { ToolCallOutput } from "~/frontend/api.ts";
import { Markdown } from "~/frontend/components/Markdown.ts";
import { css } from "~/frontend/kit/css.ts";

export function ToolCalls(calls: ToolCallOutput[]) {
    const { ol, li, button, dialog } = tags;
    const self = ol().ariaLabel("Tool calls");
    self.$bind(ToolCallsSheet.useScope());

    self.append$(calls.map((call) => {
        const modal = dialog().append$(
            Markdown(call.value.display).id(`tool-call-${call.value.id.slice(-8)}`),
        );

        return li().append$(
            button().type("button").textContent(call.value.name).onclick(() => modal.showModal()),
            modal,
        );
    }));

    return self;
}

const ToolCallsSheet = css`
    :scope {
        display: block grid;
        gap: 0.4em;
        list-style: none;
        justify-items: start;
    }

    dialog {
        padding: 1em;
    }

    li {
        display: contents;
    }

    button {
        all: unset;
        cursor: pointer;
        display: inline flow-root;
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
`;
