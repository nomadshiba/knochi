import { ChatToolMessage } from "~/frontend/api.ts";
import { EmitterTopic } from "~/libs/events/EmitterTopic.ts";

export const ChatToolMessageEmitter = new EmitterTopic<ChatToolMessage>();
