import { ChatClient } from "~/backend/chats/ChatClient.ts";
import { renderToolCall, renderToolResult } from "~/backend/handlers/chats/messages/utils.ts";

export async function handleChatStream(request: Request, chatId: string): Promise<Response> {
    const { socket, response } = Deno.upgradeWebSocket(request, { idleTimeout: 0 });
    const chat = await ChatClient.getOrLoad(chatId);

    socket.onopen = () =>
        socket.onclose = chat.emitter.subscribe(async (event) => {
            if (event.type === "messsage" && event.data.role === "tool") {
                const content = await renderToolResult(event.data);
                event = {
                    type: "messsage",
                    data: { role: "tool", content, tool_call_id: event.data.tool_call_id },
                };
            } else if (event.type === "messsage" && event.data.role === "assistant") {
                event = {
                    type: "messsage",
                    data: {
                        ...event.data,
                        tool_calls: event.data.tool_calls?.map((call) => ({
                            ...call,
                            display: renderToolCall(call),
                        })),
                    },
                };
            }
            socket.send(JSON.stringify(event));
        });
    return response;
}
