import { Codec, EnumCodec } from "@nomadshiba/codec";
import { ChatAssistantMessageDelta } from "~/backend/handlers/chats/messages/ChatAssistantMessageDelta.ts";
import { ChatMessageOutput } from "~/backend/handlers/chats/messages/ChatMessageOutput.ts";

export type ChatStreamOutput = Codec.InferOutput<typeof ChatStreamOutput>;
export const ChatStreamOutput = new EnumCodec({
    message: ChatMessageOutput,
    delta: ChatAssistantMessageDelta,
});
