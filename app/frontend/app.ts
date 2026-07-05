import { RouterClient } from "~/libs/routing/RouterClient.ts";
import { RoutesSchema } from "~/routes.ts";
import { renderMarkdown } from "~/frontend/markdown.ts";
import { Codec } from "@nomadshiba/codec";
import { ChatMessageOutput } from "~/backend/handlers/chats/messages/ChatMessageOutput.ts";

const client = RouterClient.create<RoutesSchema>({
    baseUrl: new URL("/", location.origin),
    schema: RoutesSchema,
    fetch: fetch.bind(window),
});

type Chat = Awaited<ReturnType<typeof client.fetch<"GET /v1/chats/:chatId">>>;
type ChatMessage = Codec.InferOutput<typeof ChatMessageOutput>;
type Provider = Awaited<ReturnType<typeof client.fetch<"GET /v1/providers">>>[number];
type Model = Awaited<ReturnType<typeof client.fetch<"GET /v1/models">>>[number];
type Agent = Awaited<ReturnType<typeof client.fetch<"GET /v1/agents">>>[number];

type StreamEvent =
    | {
        type: "messsage";
        data: { role: "user"; content: string } | { role: "system"; content: string } | {
            role: "assistant";
            content?: string | null;
            refusal?: string | null;
            tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
        } | { role: "tool"; content: string; tool_call_id: string; display: string };
    }
    | { type: "stream"; data: StreamDelta };

type StreamDelta =
    | { kind: "text"; value: string }
    | { kind: "refusal"; value: string }
    | { kind: "tool_call"; value: { index: number; id?: string; name?: string; arguments?: string; display?: string } }
    | { kind: "done"; value: { finish_reason: string | null } };

type LiveEntry =
    | { kind: "user"; text: string }
    | { kind: "assistant"; text: string; refusal?: string }
    | { kind: "tool_call"; name: string; arguments: string; display: string }
    | { kind: "tool_result"; text: string };

const state = {
    chats: [] as Chat[],
    currentChat: null as Chat | null,
    messages: [] as ChatMessage[],
    providers: [] as Provider[],
    models: [] as Model[],
    agents: [] as Agent[],
    ws: null as WebSocket | null,
    liveEntries: [] as LiveEntry[],
    liveAssistant: null as null | LiveEntry & { kind: "assistant" },
};

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const el = (tag: string, cls?: string) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
};

const msgInput = $<HTMLInputElement>("#msg-input");
const sendBtn = $<HTMLButtonElement>("#send-btn");
const agentSelect = $<HTMLSelectElement>("#agent-select");
const providerSelect = $<HTMLSelectElement>("#provider-select");
const modelSelect = $<HTMLSelectElement>("#model-select");
const chatList = $<HTMLDivElement>("#chat-list");
const providersList = $<HTMLDivElement>("#providers-list");
const provName = $<HTMLInputElement>("#prov-name");
const provBase = $<HTMLInputElement>("#prov-base");
const provKey = $<HTMLInputElement>("#prov-key");
const messagesEl = $<HTMLDivElement>("#messages");

async function loadChats() {
    state.chats = await client.fetch("GET /v1/chats", { params: { pathname: {}, search: {} } });
    if (state.currentChat) {
        const refreshed = state.chats.find((c) => c.id === state.currentChat!.id);
        if (refreshed) state.currentChat = refreshed;
    }
    renderChatList();
    renderTopbar();
}

async function loadProviders() {
    state.providers = await client.fetch("GET /v1/providers", { params: { pathname: {}, search: {} } });
    renderProviders();
    renderProviderSelect();
}

async function loadAgents() {
    state.agents = await client.fetch("GET /v1/agents", { params: { pathname: {}, search: {} } });
    renderAgentSelect();
}

async function loadModels(providerId?: string) {
    if (providerId) {
        state.models = await client.fetch("GET /v1/models?provider=:provider", {
            params: { pathname: {}, search: { provider: providerId } },
        });
    } else {
        state.models = await client.fetch("GET /v1/models", { params: { pathname: {}, search: {} } });
    }
    renderModelSelect();
}

async function loadMessages(chatId: string) {
    state.messages = await client.fetch("GET /v1/chats/:chatId/messages", {
        params: { pathname: { chatId }, search: {} },
    });
    state.liveEntries = [];
    state.liveAssistant = null;
    currentToolCalls = [];
    renderMessages();
}

let wsReconnectTimer: ReturnType<typeof setTimeout> | undefined;
let wsReconnectAttempts = 0;
let wsChatId: string | null = null;

function connectWS(chatId: string) {
    wsChatId = chatId;

    if (wsReconnectTimer !== undefined) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = undefined;
    }
    if (state.ws) {
        state.ws.onclose = null;
        state.ws.close();
        state.ws = null;
    }

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/v1/chats/${chatId}/stream`);

    ws.onopen = () => {
        wsReconnectAttempts = 0;
        loadMessages(chatId).catch((err) => console.error("failed to refresh messages", err));
    };

    ws.onmessage = (e) => {
        const event: StreamEvent = JSON.parse(e.data);
        handleEvent(event);
    };

    ws.onerror = () => console.error("ws error");

    ws.onclose = () => {
        if (wsChatId !== chatId) return;
        state.ws = null;
        const delay = Math.min(1000 * 2 ** wsReconnectAttempts, 10_000);
        wsReconnectAttempts++;
        wsReconnectTimer = setTimeout(() => connectWS(chatId), delay);
    };

    state.ws = ws;
}

// Tool-call entries for the turn currently in flight, indexed by stream delta
// index. Only one stream runs per chat at a time, so plain positional
// tracking (no ids) is enough to correlate deltas with their tool call.
let currentToolCalls: (LiveEntry & { kind: "tool_call" })[] = [];

function handleEvent(event: StreamEvent) {
    if (event.type === "messsage") {
        const msg = event.data;
        if (msg.role === "user") {
            state.liveAssistant = null;
            currentToolCalls = [];
            state.liveEntries.push({ kind: "user", text: msg.content });
        } else if (msg.role === "assistant") {
            ensureLiveAssistant();
            state.liveAssistant!.text = msg.content ?? "";
            state.liveAssistant!.refusal = msg.refusal ?? undefined;
            (msg.tool_calls ?? []).forEach((tc, index) => {
                let entry = currentToolCalls[index];
                if (!entry) {
                    entry = { kind: "tool_call", name: "", arguments: "", display: "" };
                    currentToolCalls[index] = entry;
                    state.liveEntries.push(entry);
                }
                entry.name = tc.function.name;
                entry.arguments = tc.function.arguments;
                // display is only carried by "tool_call" stream deltas; keep whatever was last
                // computed during streaming, falling back to raw arguments if none arrived.
                if (!entry.display) entry.display = tc.function.arguments;
            });
            state.liveAssistant = null;
        } else if (msg.role === "tool") {
            state.liveEntries.push({ kind: "tool_result", text: msg.display });
        }
        renderLive();
        return;
    }

    const delta = event.data;
    if (delta.kind === "text") {
        ensureLiveAssistant();
        state.liveAssistant!.text += delta.value;
        renderLive();
    } else if (delta.kind === "refusal") {
        ensureLiveAssistant();
        state.liveAssistant!.refusal = (state.liveAssistant!.refusal ?? "") + delta.value;
        renderLive();
    } else if (delta.kind === "tool_call") {
        const index = delta.value.index;
        let entry = currentToolCalls[index];
        if (!entry) {
            entry = { kind: "tool_call", name: "", arguments: "", display: "" };
            currentToolCalls[index] = entry;
            state.liveEntries.push(entry);
        }
        if (delta.value.name) entry.name = delta.value.name;
        if (delta.value.arguments) entry.arguments += delta.value.arguments;
        if (delta.value.display !== undefined) entry.display = delta.value.display;
        renderLive();
    } else if (delta.kind === "done") {
        state.liveAssistant = null;
        currentToolCalls = [];
        renderLive();
    }
}

function ensureLiveAssistant() {
    if (state.liveAssistant) return;
    const entry: LiveEntry & { kind: "assistant" } = { kind: "assistant", text: "" };
    state.liveEntries.push(entry);
    state.liveAssistant = entry;
}

function renderChatList() {
    chatList.innerHTML = "";
    for (const chat of state.chats) {
        const item = el("div", "chat-item" + (state.currentChat?.id === chat.id ? " active" : ""));
        item.textContent = chat.name;
        item.onclick = () => selectChat(chat);
        chatList.appendChild(item);
    }
}

function renderProviders() {
    providersList.innerHTML = "";
    for (const p of state.providers) {
        const row = el("div", "provider-row");
        const name = el("span");
        name.textContent = p.name;
        const del = el("button", "");
        del.textContent = "x";
        del.onclick = async () => {
            await client.fetch("DELETE /v1/providers/:providerId", {
                params: { pathname: { providerId: p.id }, search: {} },
            });
            await loadProviders();
            if (state.currentChat?.model?.providerId === p.id) {
                await loadChats();
                renderTopbar();
            }
        };
        row.appendChild(name);
        row.appendChild(del);
        providersList.appendChild(row);
    }
}

function renderProviderSelect() {
    providerSelect.innerHTML = "";
    if (!state.currentChat) {
        providerSelect.disabled = true;
        return;
    }
    providerSelect.disabled = false;
    for (const p of state.providers) {
        const opt = el("option") as HTMLOptionElement;
        opt.value = p.id;
        opt.textContent = p.name;
        if (state.currentChat.model?.providerId === p.id) opt.selected = true;
        providerSelect.appendChild(opt);
    }
}

function renderAgentSelect() {
    agentSelect.innerHTML = "";
    if (!state.currentChat) {
        agentSelect.disabled = true;
        return;
    }
    agentSelect.disabled = false;
    for (const a of state.agents) {
        const opt = el("option") as HTMLOptionElement;
        opt.value = a.name;
        opt.textContent = a.name;
        if (state.currentChat.agent === a.name) opt.selected = true;
        agentSelect.appendChild(opt);
    }
}

function renderModelSelect() {
    modelSelect.innerHTML = "";
    if (!state.currentChat) {
        modelSelect.disabled = true;
        return;
    }
    modelSelect.disabled = false;
    for (const m of state.models) {
        const opt = el("option") as HTMLOptionElement;
        opt.value = m.id;
        opt.textContent = m.name;
        if (state.currentChat.model?.name === m.id) opt.selected = true;
        modelSelect.appendChild(opt);
    }
}

function renderTopbar() {
    renderAgentSelect();
    renderProviderSelect();
    renderModelSelect();
    const hasChat = Boolean(state.currentChat);
    msgInput.disabled = !hasChat;
    sendBtn.disabled = !hasChat;
}

function renderMessages() {
    renderLive();
}

function renderLive() {
    messagesEl.innerHTML = "";

    const hasStored = state.messages.length > 0;
    const hasLive = state.liveEntries.length > 0;
    if (!hasStored && !hasLive) {
        const empty = el("div", "empty");
        empty.textContent = "no messages yet. send one below.";
        messagesEl.appendChild(empty);
        return;
    }

    for (const msg of state.messages) {
        if (msg.content.kind === "user") {
            appendBubble("user", "user", msg.content.value.content);
        } else if (msg.content.kind === "system") {
            appendBubble("system", "system", msg.content.value.content, true);
        } else if (msg.content.kind === "assistant") {
            if (msg.content.value.content) appendBubble("assistant", "assistant", msg.content.value.content, true);
            if (msg.content.value.refusal) appendBubble("assistant", "assistant", `**refused:** ${msg.content.value.refusal}`, true);
            for (const tc of msg.content.value.tool_calls) {
                appendBubble("tool_call", `${tc.value.name} ${tc.value.id}`, tc.value.display, true);
            }
        } else if (msg.content.kind === "tool") {
            appendBubble("tool", `result ${msg.content.value.tool_call_id}`, msg.content.value.content, true);
        }
    }

    for (const entry of state.liveEntries) {
        if (entry.kind === "user") {
            appendBubble("user", "user", entry.text);
        } else if (entry.kind === "assistant") {
            if (entry.text) appendBubble("assistant", "assistant", entry.text, true);
            if (entry.refusal) appendBubble("assistant", "assistant", `**refused:** ${entry.refusal}`, true);
            if (!entry.text && !entry.refusal && state.liveAssistant === entry) appendBubble("assistant", "assistant", "...", true);
        } else if (entry.kind === "tool_call") {
            appendBubble("tool_call", entry.name || "tool_call", entry.display || entry.arguments, true);
        } else if (entry.kind === "tool_result") {
            appendBubble("tool", "result", entry.text, true);
        }
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendBubble(cls: string, label: string, content: string, markdown = false) {
    const wrap = el("div", "msg " + cls);
    const role = el("div", "role");
    role.textContent = label;
    const bubble = el("div", "bubble");
    if (markdown) {
        bubble.innerHTML = renderMarkdown(content);
    } else {
        bubble.textContent = content;
    }
    wrap.appendChild(role);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
}

async function selectChat(chat: Chat) {
    state.currentChat = chat;
    state.messages = [];
    state.liveEntries = [];
    state.liveAssistant = null;
    renderChatList();
    renderTopbar();
    renderLive();
    connectWS(chat.id);
    await loadModels(chat.model?.providerId);
    renderModelSelect();
}

async function createChat() {
    const name = prompt("chat name?");
    if (!name) return;
    const result = await client.fetch("POST /v1/chats", {
        params: { pathname: {}, search: {} },
        data: { name },
    });
    await loadChats();
    const chat = state.chats.find((c) => c.id === result.id);
    if (chat) await selectChat(chat);
}

async function addProvider() {
    const name = provName.value.trim();
    const base = provBase.value.trim();
    const key = provKey.value.trim();
    if (!name || !base || !key) return;
    await client.fetch("POST /v1/providers", {
        params: { pathname: {}, search: {} },
        data: { name, base: new URL(base), key },
    });
    provName.value = "";
    provBase.value = "";
    provKey.value = "";
    await loadProviders();
}

async function patchChat(data: { name?: string; agent?: string; model?: { name: string; providerId: string } }) {
    if (!state.currentChat) return;
    await client.fetch("PATCH /v1/chats/:chatId", {
        params: { pathname: { chatId: state.currentChat.id }, search: {} },
        data,
    });
    await loadChats();
}

async function selectProvider(id: string) {
    if (!state.currentChat || state.models.length === 0) {
        await patchChat({ model: { name: "", providerId: id } });
        await loadModels(id);
        return;
    }
    await patchChat({ model: { name: state.models[0].id, providerId: id } });
    await loadModels(id);
    renderModelSelect();
}

async function selectModel(id: string) {
    if (!state.currentChat) return;
    const providerId = state.currentChat.model?.providerId ?? state.providers[0]?.id;
    if (!providerId) return;
    await patchChat({ model: { name: id, providerId } });
}

async function selectAgent(name: string) {
    if (!state.currentChat) return;
    await patchChat({ agent: name });
}

async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || !state.currentChat) return;
    msgInput.value = "";
    await client.fetch("POST /v1/chats/:chatId/messages", {
        params: { pathname: { chatId: state.currentChat.id }, search: {} },
        data: { content: text },
    });
}

$<HTMLButtonElement>("#new-chat").onclick = createChat;
$<HTMLButtonElement>("#add-prov").onclick = addProvider;
sendBtn.onclick = sendMessage;
msgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
});
providerSelect.addEventListener("change", (e) => {
    selectProvider((e.target as HTMLSelectElement).value);
});
modelSelect.addEventListener("change", (e) => {
    selectModel((e.target as HTMLSelectElement).value);
});
agentSelect.addEventListener("change", (e) => {
    selectAgent((e.target as HTMLSelectElement).value);
});

await loadProviders();
await loadAgents();
await loadChats();
if (state.chats.length) {
    await selectChat(state.chats[0]);
} else {
    renderTopbar();
}
