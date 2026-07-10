import { sync, tags, toChild } from "@purifyjs/core";
import { ChatMessageOutput } from "~/backend/handlers/chats/messages/ChatMessageOutput.ts";
import { ToolCall } from "~/backend/handlers/chats/messages/MessageContent.ts";
import { Markdown } from "~/frontend/components/Markdown.ts";
import { ToolCallWidget } from "~/frontend/components/ToolCallWidget.ts";
import { ChatAssistantStreamEmittter } from "~/frontend/events/ChatAssistantStreamEmittter.ts";
import { css } from "~/frontend/kit/css.ts";
import { relativeDate } from "~/frontend/utils/date.ts";

const RELATIVE_STEPS = [
    60 * 60 * 1000,
    60 * 1000,
];

export function ChatBubble(message: ChatMessageOutput) {
    const { content } = message;
    const { kind } = content;

    const { article, header, strong, time, p, ul, li, span } = tags;

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

    const self = article({ class: `role-${content.kind}` })
        .$bind(ChatMessageStyle.useScope())
        .append$(
            header().append$(
                strong().textContent(content.kind),
                time().dateTime(message.created.toISOString()).textContent(relative),
            ),
        );

    switch (kind) {
        case "assistant": {
            let contentBuffer = content.value.content ?? "";
            let refusalBuffer = content.value.refusal ?? "";
            const callBuffer = content.value.tool_calls;

            let markdown = Markdown(refusalBuffer || contentBuffer);
            const status = span().role("status").ariaBusy(content.value.partial ? "true" : "false").ariaLabel("Generating…");
            const tools = ul().ariaLabel("Tool calls").append$(content.value.tool_calls.map((call) => {
                return li().id(`tool-call-${call.value.id}`).append$(ToolCallWidget(call, { streaming: content.value.partial }));
            }));

            self.append$(markdown, tools, status);

            const updateMarkdown = () => {
                const newMarkdown = Markdown(refusalBuffer || contentBuffer);
                markdown.replaceWith$(newMarkdown);
                markdown = newMarkdown;
            };

            const updateCall = (call: ToolCall, streaming: boolean) => {
                const item = li().append$(ToolCallWidget(call, { streaming })).id(`tool-call-${call.value.id}`);
                const exist = tools.$node.querySelector(`#tool-call-${call.value.id}`);
                if (exist) exist.replaceWith(toChild(item));
                else tools.append$(item); // Visual order not that important
            };

            self.$bind(() => {
                const unsubscribe = ChatAssistantStreamEmittter.subscribe(message.id, (event) => {
                    if (event.delta.kind === "text") {
                        contentBuffer += event.delta.value;
                        return updateMarkdown();
                    }

                    if (event.delta.kind === "refusal") {
                        refusalBuffer += event.delta.value;
                        return updateMarkdown();
                    }

                    if (event.delta.kind === "tool_call_new") {
                        const delta = event.delta.value;
                        const call = callBuffer[delta.index] = {
                            kind: "function",
                            value: {
                                name: "",
                                arguments: "",
                                display: { summary: "", content: "" },
                                id: delta.id,
                                result: null,
                            },
                        };
                        return updateCall(call, true);
                    }

                    if (event.delta.kind === "tool_call_delta") {
                        const delta = event.delta.value;
                        const call = callBuffer[delta.index]!;

                        if (delta.name) call.value.name += delta.name;
                        if (delta.arguments) call.value.arguments += delta.arguments;
                        if (delta.display) call.value.display.summary = delta.display.summary;
                        return updateCall(call, true);
                    }

                    if (event.delta.kind === "tool_call_done") {
                        const delta = event.delta.value;
                        const call = callBuffer[delta.index]!;

                        call.value.display.content = delta.display.content;
                        return updateCall(call, false);
                    }

                    if (event.delta.kind === "tool_call_result") {
                        const delta = event.delta.value;
                        const call = callBuffer[delta.index]!;

                        call.value.result = delta.result;
                        return updateCall(call, false);
                    }

                    if (event.delta.kind === "done") {
                        tools.replaceChildren$(callBuffer.map((call) => {
                            return li().id(`tool-call-${call.value.id}`).append$(ToolCallWidget(call, { streaming: false }));
                        }));
                        status.ariaBusy("false");
                        return;
                    }
                });

                return () => {
                    unsubscribe();
                };
            });

            return self;
        }
        case "user": {
            return self.append$(
                p().textContent(content.value.content),
            );
        }
        case "system": {
            return self.append$(
                Markdown(content.value.content ?? ""),
            );
        }
    }

    throw new Error(`Unsupported message type ${kind}`);
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

    ul {
        display: block grid;
        gap: 0.4em;
        list-style: none;
        justify-items: start;
    }

    [role="status"][aria-busy="true"] {
        display: block grid;
        inline-size: 1em;
        aspect-ratio: 1;

        &::before {
            content: "";
            display: block flow;
            mask-image: url("/static/anim/busy.svg");
            mask-size: contain;
            mask-position: center;
            background-color: currentcolor;
        }
    }

    [role="status"][aria-busy="false"] {
        display: none;
    }
`;
