import { sync, tags } from "@purifyjs/core";
import { ChatMessageResponse } from "~/frontend/api.ts";
import { Markdown } from "~/frontend/components/Markdown.ts";
import { ToolCalls } from "~/frontend/components/ToolCalls.ts";
import { relativeDate } from "~/frontend/utils/date.ts";
import { css } from "~/frontend/kit/css.ts";
import { ChatAssistantMessageEmittter } from "~/frontend/events/ChatAssistantMessageEmittter.ts";

const RELATIVE_STEPS = [
    60 * 60 * 1000,
    60 * 1000,
];

export function ChatMessage(message: ChatMessageResponse) {
    const { article, header, strong, time, p } = tags;

    const relative = sync<string>((set) => {
        const created = message.created.getTime();
        let timeout!: number;
        const update = () => {
            set(relativeDate(message.created));
            const delta = Date.now() - created;
            for (const step of RELATIVE_STEPS) {
                if (delta < step) continue;
                timeout = setTimeout(update, step);
                break;
            }
        };
        update();
        return () => clearTimeout(timeout);
    });

    const self = article({ class: `role-${message.content.kind}` })
        .$bind(ChatMessageStyle.useScope())
        .append$(
            header().append$(
                strong().textContent(message.content.kind),
                time().dateTime(message.created.toISOString()).textContent(relative),
            ),
        );

    switch (message.content.kind) {
        case "assistant": {
            const content = message.content;

            let contentBuffer = content.value.content ?? "";
            let refusalBuffer = content.value.refusal ?? "";
            let toolCallsBuffer = content.value.tool_calls;

            let markdown = Markdown(refusalBuffer || contentBuffer);
            let toolCalls = ToolCalls(message.id, toolCallsBuffer);

            const updateMarkdown = () => {
                const newMarkdown = Markdown(refusalBuffer || contentBuffer);
                markdown.replaceWith$(newMarkdown);
                markdown = newMarkdown;
            };

            const updateToolCalls = () => {
                const newToolCalls = ToolCalls(message.id, toolCallsBuffer);
                toolCalls.replaceWith$(newToolCalls);
                toolCalls = newToolCalls;
            };

            return self.$bind(() => {
                return ChatAssistantMessageEmittter.subscribe(message.id, (event) => {
                    if (event.kind === "message") {
                        const message = event.value;
                        if (message.content.kind !== "assistant") return;
                        contentBuffer = message.content.value.content ?? "";
                        refusalBuffer = message.content.value.refusal ?? "";
                        toolCallsBuffer = message.content.value.tool_calls;
                        updateMarkdown();
                        updateToolCalls();
                        return;
                    }

                    if (event.kind === "stream") {
                        const stream = event.value;
                        if (stream.delta.kind === "text") {
                            contentBuffer += stream.delta.value;
                            return updateMarkdown();
                        }

                        if (stream.delta.kind === "refusal") {
                            refusalBuffer += stream.delta.value;
                            return updateMarkdown();
                        }
                    }
                });
            }).append$(markdown, toolCalls);
        }
        case "user": {
            return self.append$(
                p().textContent(message.content.value.content),
            );
        }
        case "system": {
            return self.append$(
                Markdown(message.content.value.content ?? ""),
            );
        }
    }

    throw new Error(`Unsupported message type ${message.content.kind}`);
}

const ChatMessageStyle = css`
    :scope {
        display: block grid;
        gap: 0.6em;
        border-radius: var(--layout-radius);
        padding: 0.75em 1em;
        max-inline-size: 98%;
    }

    :scope.role-user {
        justify-self: end;
        background-color: var(--base);
        color: var(--pop);

        p {
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            overflow: hidden;
        }
    }

    header {
        display: block grid;
        grid-auto-flow: column;
        gap: 0.6em;
        justify-content: start;
        align-items: baseline;

        time {
            display: block flow;
            font-size: var(--text-xs);
            color: var(--subtle);
        }

        strong {
            display: block flow;
            font-size: var(--text-sm);
            font-weight: var(--weight-medium);
            color: var(--muted);
            text-transform: capitalize;
            letter-spacing: 0.02em;
        }
    }
`;
