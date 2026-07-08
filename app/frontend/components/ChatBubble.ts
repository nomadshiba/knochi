import { sync, tags, toChild } from "@purifyjs/core";
import { ChatMessage } from "~/frontend/api.ts";
import { Markdown } from "~/frontend/components/Markdown.ts";
import { ToolCall } from "~/frontend/components/ToolCall.ts";
import { ChatAssistantMessageEmittter } from "~/frontend/events/ChatAssistantMessageEmittter.ts";
import { css } from "~/frontend/kit/css.ts";
import { relativeDate } from "~/frontend/utils/date.ts";

const RELATIVE_STEPS = [
    60 * 60 * 1000,
    60 * 1000,
];

export function ChatBubble(message: ChatMessage) {
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
            const content = message.content.value;

            let contentBuffer = content.content ?? "";
            let refusalBuffer = content.refusal ?? "";

            let markdown = Markdown(refusalBuffer || contentBuffer);

            // TODO: better streaming on the backend.
            // Include tool result in the tool call return value and streaming
            // Result should be included within the tool call response. both for streaming and normal return.

            // Logic:
            // Tool Call should include the result, which can be undefined if not done yet. we should treat tool result like a seperate message.
            // Before sending delta we should backend should first send an empty message for assistant with the id.
            // assistant message content and refusal shouldnt be optional, at least should be empty string.
            // then incoming delta would fill in the space without need for a seperate buffer.
            // remove `done` kind from streaming, instead in the end send the message. which would replace the old one.
            // also update the db with deltas, probably with 1 second buffers or something.
            // tool result should be part of the same message's stream basically.
            // stream display paramters only if they changed, if not they are undefined
            // also on db and responses assistant message needs to have partial flag.

            // dont forget to nice scrolling arguments text next to the Writing...

            const toolCalls = ul().ariaLabel("Tool calls").append$(content.tool_calls.map((call) => {
                const domId = call.value.id.slice(-8);
                return li().id(`tool-call-${domId}`)
                    .append$(ToolCall(call, { kind: "running" }));
            }));
            const toolCallBuffer = content.tool_calls;

            const updateMarkdown = () => {
                const newMarkdown = Markdown(refusalBuffer || contentBuffer);
                markdown.replaceWith$(newMarkdown);
                markdown = newMarkdown;
            };

            self.$bind(() => {
                const unsubscribe = ChatAssistantMessageEmittter.subscribe(message.id, (event) => {
                    if (event.kind === "message") {
                        const content = event.value.content.value;
                        contentBuffer = content.content ?? "";
                        refusalBuffer = content.refusal ?? "";
                        updateMarkdown();
                        toolCalls.replaceChildren$(content.tool_calls.map((call) => {
                            const domId = call.value.id.slice(-8);
                            return li().id(`tool-call-${domId}`)
                                .append$(ToolCall(call, { kind: "running" }));
                        }));
                        unsubscribe();
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

                        if (stream.delta.kind === "tool_call") {
                            const delta = stream.delta.value;
                            const call = toolCallBuffer[delta.index] ??= {
                                kind: "function",
                                value: {
                                    name: "",
                                    arguments: "",
                                    display: { summary: "", content: "" },
                                    id: "",
                                },
                            };

                            if (delta.id) call.value.id += delta.id;
                            if (delta.name) call.value.name += delta.name;
                            if (delta.arguments) call.value.arguments += delta.arguments;
                            call.value.display.summary = delta.display.summary;

                            const domId = call.value.id.slice(-8);
                            const item = li().append$(ToolCall(call, { kind: "streaming" })).id(`tool-call-${domId}`);
                            const exist = toolCalls.$node.querySelector(`#tool-call-${domId}`);
                            if (exist) exist.replaceWith(toChild(item));
                            else toolCalls.append$(item); // Visual order not that important
                        }
                    }
                });

                return () => {
                    unsubscribe();
                };
            });

            return self.append$(markdown, toolCalls);
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

    ul {
        display: block grid;
        gap: 0.4em;
        list-style: none;
        justify-items: start;
    }
`;
