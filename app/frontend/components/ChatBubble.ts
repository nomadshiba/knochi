import { sync, tags, toChild } from "@purifyjs/core";
import { Markdown } from "~/frontend/components/Markdown.ts";
import { ToolCallIndicator } from "~/frontend/components/ToolCallIndicator.ts";
import { ChatAssistantMessageEmittter } from "~/frontend/events/ChatAssistantMessageEmittter.ts";
import { css } from "~/frontend/kit/css.ts";
import { relativeDate } from "~/frontend/utils/date.ts";
import { ChatMessageOutput } from "~/backend/handlers/chats/messages/ChatMessageOutput.ts";

const RELATIVE_STEPS = [
    60 * 60 * 1000,
    60 * 1000,
];

export function ChatBubble(message: ChatMessageOutput) {
    const { content } = message;
    const { kind } = content;

    const { article, header, strong, time, p, ul, li } = tags;

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

            // TODO: dont forget to nice scrolling arguments text next to the Writing...

            const list = ul().ariaLabel("Tool calls").append$(content.value.tool_calls.map((call) => {
                const domId = call.value.id.slice(-8);
                return li().id(`tool-call-${domId}`)
                    .append$(ToolCallIndicator(call, { streaming: false }));
            }));

            const updateMarkdown = () => {
                const newMarkdown = Markdown(refusalBuffer || contentBuffer);
                markdown.replaceWith$(newMarkdown);
                markdown = newMarkdown;
            };

            self.$bind(() => {
                const unsubscribe = ChatAssistantMessageEmittter.subscribe(message.id, (event) => {
                    if (event.delta.kind === "done") {
                        console.log(list);
                        list.replaceChildren$(callBuffer.map((call) => {
                            const domId = call.value.id.slice(-8);
                            return li().id(`tool-call-${domId}`)
                                .append$(ToolCallIndicator(call, { streaming: false }));
                        }));
                        return;
                    }

                    if (event.delta.kind === "text") {
                        contentBuffer += event.delta.value;
                        return updateMarkdown();
                    }

                    if (event.delta.kind === "refusal") {
                        refusalBuffer += event.delta.value;
                        return updateMarkdown();
                    }

                    if (event.delta.kind === "tool_call") {
                        const delta = event.delta.value;
                        const call = callBuffer[delta.index] ??= {
                            kind: "function",
                            value: {
                                name: "",
                                arguments: "",
                                display: { summary: "", content: "" },
                                id: "",
                                result: null,
                            },
                        };

                        if (delta.id) call.value.id = delta.id;
                        if (delta.name) call.value.name += delta.name;
                        if (delta.arguments) call.value.arguments += delta.arguments;
                        if (delta.display?.summary) call.value.display.summary = delta.display.summary;
                        if (delta.display?.content) call.value.display.content = delta.display.content;
                        if (delta.result) call.value.result = delta.result;

                        const domId = call.value.id.slice(-8);
                        const item = li().append$(ToolCallIndicator(call, { streaming: !call.value.result })).id(`tool-call-${domId}`);
                        const exist = list.$node.querySelector(`#tool-call-${domId}`);
                        if (exist) exist.replaceWith(toChild(item));
                        else list.append$(item); // Visual order not that important
                    }
                });

                return () => {
                    unsubscribe();
                };
            });

            return self.append$(markdown, list);
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
`;
