import { ChatAssistantMessage, ChatAssistantMessageStream } from "~/frontend/api.ts";
import { EmitterTopic } from "~/libs/events/EmitterTopic.ts";

export const ChatAssistantMessageEmittter = new EmitterTopic<
    | { kind: "message"; value: ChatAssistantMessage }
    | { kind: "stream"; value: ChatAssistantMessageStream }
>();
