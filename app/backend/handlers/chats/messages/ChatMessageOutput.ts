import { Codec, StructCodec } from "@nomadshiba/codec";
import { MessageContent } from "~/backend/handlers/chats/messages/MessageContent.ts";
import { Timestamp } from "~/libs/codecs/Timestamp.ts";
import { UUID } from "~/libs/codecs/UUID.ts";

export type ChatMessageOutput<T extends MessageContent["kind"] = MessageContent["kind"]> =
    & Codec.InferOutput<typeof ChatMessageOutput>
    & { content: { kind: T } };
export const ChatMessageOutput = new StructCodec({
    id: UUID,
    content: MessageContent,
    created: Timestamp,
});
