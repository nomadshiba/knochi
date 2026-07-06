import { ChatClient } from "~/backend/chats/ChatClient.ts";
import { ChatStreamOutput } from "~/backend/handlers/chats/messages/ChatStreamOutput.ts";

export async function handleChatStream(request: Request, chatId: string): Promise<Response> {
    const { socket, response } = Deno.upgradeWebSocket(request, { idleTimeout: 0 });
    const chat = await ChatClient.getOrLoad(chatId);

    socket.onopen = () =>
        socket.onclose = chat.emitter.subscribe((event) => {
            socket.send(ChatStreamOutput.encode(event));
        });
    return response;
}
