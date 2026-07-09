import { Codec, EnumCodec } from "@nomadshiba/codec";
import { ChatAssistantStream } from "~/backend/handlers/chats/messages/ChatAssistantStream.ts";
import { ChatMessageOutput } from "~/backend/handlers/chats/messages/ChatMessageOutput.ts";

export type ChatStreamOutput = Codec.InferOutput<typeof ChatStreamOutput>;
export const ChatStreamOutput = new EnumCodec({
    message: ChatMessageOutput,
    stream: ChatAssistantStream,
});
