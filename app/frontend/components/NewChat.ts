import { ref, Sync, tags, toChild } from "@purifyjs/core";
import { api } from "~/frontend/api.ts";
import { AgentPicker } from "~/frontend/components/AgentPicker.ts";
import { ChatBox } from "~/frontend/components/ChatBox.ts";
import { ChatNavigationItem } from "~/frontend/components/ChatNavigation.ts";
import { ModelPicker, SelectedModel } from "~/frontend/components/ModelPicker.ts";
import { css } from "~/frontend/kit/css.ts";

async function resolveDefaults(): Promise<{ agent: string; model: SelectedModel | undefined }> {
    const chats = await api.fetch("GET /v1/chats", { params: { pathname: {}, search: {} } });
    const lastChat = chats.reduce<typeof chats[number] | undefined>(
        (latest, chat) => !latest || chat.updated.getTime() > latest.updated.getTime() ? chat : latest,
        undefined,
    );

    if (lastChat) {
        return { agent: lastChat.agent, model: lastChat.model };
    }

    const [agents, models] = await Promise.all([
        api.fetch("GET /v1/agents", { params: { pathname: {}, search: {} } }),
        api.fetch("GET /v1/models", { params: { pathname: {}, search: {} } }),
    ]);

    return {
        agent: agents[0]?.name ?? "",
        model: models[0] ? { name: models[0].name, providerId: models[0].providerId } : undefined,
    };
}

export async function NewChat() {
    const { section, form, menu, li, button, p } = tags;
    const self = section().ariaLabel("New Chat").$bind(NewChatStyle.useScope());

    const defaults = await resolveDefaults();

    const content = ref("");
    const agent: Sync.Ref<string> = ref(defaults.agent);
    const model: Sync.Ref<SelectedModel | undefined> = ref(defaults.model);
    const sending = ref(false);
    const fail = ref<string | null>(null);

    return self.append$(
        p({ class: "hint" }).textContent("Start a new conversation"),
        form()
            .append$(
                ChatBox(content),
                menu().append$(
                    li().append$(AgentPicker(agent)),
                    li().append$(ModelPicker(model)),
                    li().append$(
                        button().type("submit").ariaLabel("Send").disabled(sending)
                            .ariaBusy(sending.derive((sending) => `${sending}` as const)),
                    ),
                ),
            )
            .onsubmit(async (event) => {
                event.preventDefault();
                const value = content.get().trim();
                if (!value || sending.get()) return;

                sending.set(true);
                fail.set(null);
                try {
                    const name = value.split("\n", 1)[0]!.slice(0, 60) || "New chat";
                    const chat = await api.fetch("POST /v1/chats", { params: { pathname: {}, search: {} }, data: { name } });
                    document.querySelector("#chats")!.prepend(toChild(ChatNavigationItem({ id: chat.id, name })));

                    // Only patch what actually changed from what the chat was created with,
                    // so we don't fire pointless requests when the user kept the defaults.
                    const currentAgent = agent.get();
                    const currentModel = model.get();
                    const agentChanged = currentAgent !== defaults.agent;
                    const modelChanged = currentModel?.name !== defaults.model?.name ||
                        currentModel?.providerId !== defaults.model?.providerId;

                    if (agentChanged || modelChanged) {
                        await api.fetch("PATCH /v1/chats/:chatId", {
                            params: { pathname: { chatId: chat.id }, search: {} },
                            data: {
                                ...(agentChanged ? { agent: currentAgent } : {}),
                                ...(modelChanged && currentModel ? { model: currentModel } : {}),
                            },
                        });
                    }

                    await api.fetch("POST /v1/chats/:chatId/messages", {
                        params: { pathname: { chatId: chat.id }, search: {} },
                        data: { content: value },
                    });

                    location.hash = chat.id;
                } catch (cause) {
                    console.error(cause);
                    fail.set("Failed to send message. Please try again.");
                    sending.set(false);
                }
            }),
        p({ class: "error" }).textContent(fail.derive((reason) => reason ?? "")).$bind((element) =>
            fail.follow((reason) => element.hidden = !reason, true)
        ),
    );
}

const NewChatStyle = css`
    :scope {
        display: block grid;
        gap: var(--layout-gap);
        place-content: center;

        grid-template-columns: minmax(0, 60em);
        min-block-size: calc(100dvb - var(--layout-gap) - var(--layout-gap));
    }

    .hint {
        justify-self: center;
        color: var(--muted);
        font-size: var(--text-lg);
    }

    .error {
        justify-self: center;
        color: hsl(0, 70%, 65%);
        font-size: var(--text-sm);
    }

    form {
        display: block grid;
        background-color: var(--base);
        border-radius: var(--layout-radius);
        padding: 0.85em 0.9em;

        gap: 0.85em;
        align-items: center;
    }

    form menu {
        display: block grid;
        gap: 0.6em;
        align-items: center;
        list-style: none;
        padding: 0;

        grid-template-columns: auto 1fr auto;
    }

    form menu button[type="submit"] {
        all: unset;
        cursor: pointer;
        display: block grid;
        aspect-ratio: 1;
        color: var(--accent-pop);
        background-color: var(--accent-base);
        border-radius: 50%;
        padding: 0.3em;
        inline-size: 1.85em;
        transition: background-color 0.15s ease, transform 0.1s ease;

        &:hover {
            background-color: color-mix(in srgb, var(--accent-base), white 10%);
        }

        &:active {
            transform: scale(0.94);
        }

        &[aria-busy="true"] {
            cursor: progress;
            opacity: 0.7;
        }

        &::before {
            content: "";
            display: block flow;
            background-color: currentcolor;
            mask-image: url("/static/icons/send.svg");
            mask-size: contain;
            mask-position: center;
        }
    }
`;
