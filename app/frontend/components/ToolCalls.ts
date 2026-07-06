import { tags } from "@purifyjs/core";
import { ToolCallOutput } from "~/frontend/api.ts";
import { css } from "~/frontend/kit/css.ts";
import { Markdown } from "~/frontend/components/Markdown.ts";

export function ToolCalls(calls: ToolCallOutput[]) {
    const { ol, li, button, dialog } = tags;
    const self = ol().ariaLabel("Tool calls");
    self.$bind(ToolCallsSheet.useScope());

    self.append$(calls.map((call) => {
        const modal = dialog().append$(
            Markdown(call.value.display).id(`tool-call-${call.value.id}`),
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
        list-style: none;
    }

    dialog {
        padding: 1em;
    }

    button {
        all: unset;
        cursor: pointer;
    }
`;
