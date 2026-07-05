import { ChatClient } from "~/backend/chats/ChatClient.ts";

// TODO: Use Codec
export async function handleChatStream(request: Request, chatId: string): Promise<Response> {
    const { socket, response } = Deno.upgradeWebSocket(request, { idleTimeout: 0 });
    const chat = await ChatClient.getOrLoad(chatId);

    socket.onopen = () => socket.onclose = chat.emitter.subscribe((event) => socket.send(JSON.stringify(event)));
    return response;
}
