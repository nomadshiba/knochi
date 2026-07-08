import { combine, ref, tags } from "@purifyjs/core";
import { Provider } from "~/backend/handlers/providers/ProviderOutput.ts";
import { api } from "~/frontend/api.ts";
import { useReplaceChildren, useValue } from "~/frontend/kit/bind.ts";
import { css } from "~/frontend/kit/css.ts";

export function ProviderManager() {
    const { span, dialog, header, strong, small, form, fieldset, legend, label, input, button, ul, li, menu, p } = tags;
    const self = span({ class: "provider-manager" }).$bind(ProviderManagerStyle.useScope());

    const providers = ref<Provider[] | null>(null);
    const loading = ref(false);
    const fail = ref("");
    const editingId = ref<string | null>(null);

    const name = ref("");
    const base = ref("");
    const key = ref("");

    const refresh = async () => {
        loading.set(true);
        try {
            providers.set(await api.fetch("GET /v1/providers", { params: { pathname: {}, search: {} } }));
        } catch (cause) {
            fail.set(cause instanceof Error ? cause.message : String(cause));
        } finally {
            loading.set(false);
        }
    };

    const resetForm = () => {
        editingId.set(null);
        name.set("");
        base.set("");
        key.set("");
    };

    const startEdit = (provider: Provider) => {
        editingId.set(provider.id);
        name.set(provider.name);
        base.set(provider.base.toString());
        key.set("");
    };

    const submit = async () => {
        fail.set("");
        loading.set(true);
        try {
            const id = editingId.get();
            const data = { name: name.get().trim(), base: base.get().trim(), key: key.get().trim() };
            if (id) {
                await api.fetch("PATCH /v1/providers/:providerId", { params: { pathname: { providerId: id }, search: {} }, data });
            } else {
                await api.fetch("POST /v1/providers", { params: { pathname: {}, search: {} }, data });
            }
            resetForm();
            await refresh();
        } catch (cause) {
            fail.set(cause instanceof Error ? cause.message : String(cause));
        } finally {
            loading.set(false);
        }
    };

    const remove = async (id: string) => {
        if (!confirm("Delete this provider? Chats using it will fail.")) return;
        loading.set(true);
        try {
            await api.fetch("DELETE /v1/providers/:providerId", { params: { pathname: { providerId: id }, search: {} } });
            await refresh();
        } catch (cause) {
            fail.set(cause instanceof Error ? cause.message : String(cause));
        } finally {
            loading.set(false);
        }
    };

    const items = combine({ providers, editingId }).derive(({ providers, editingId }) => {
        if (!providers) {
            return p({ class: "hint" }).textContent(
                loading.derive((loading) => loading ? "Loading providers..." : "Failed to load providers."),
            );
        }
        if (!providers.length) {
            return p({ class: "hint" }).textContent("No providers yet. Add one below.");
        }
        return providers.map((provider) =>
            li().ariaCurrent(provider.id === editingId ? "true" : null).append$(
                span().append$(
                    strong().textContent(provider.name),
                    small().textContent(provider.base.toString()),
                ),
                menu().append$(
                    li().append$(button().type("button").textContent("Edit").onclick(() => startEdit(provider))),
                    li().append$(button({ class: "danger" }).type("button").textContent("Delete").onclick(() => remove(provider.id))),
                ),
            )
        );
    });

    const modal = dialog().$bind(ProviderModalStyle.useScope())
        .onclose(resetForm)
        .append$(
            header().append$(
                strong().textContent("Providers"),
                button({ class: "close" }).type("button").ariaLabel("Close").textContent("×").onclick(() => modal.close()),
            ),
            p({ class: "error" }).textContent(fail),
            ul().$bind(useReplaceChildren(items)),
            form()
                .onsubmit((event) => {
                    event.preventDefault();
                    submit();
                })
                .append$(
                    fieldset().append$(
                        legend().textContent(editingId.derive((id) => id ? "Edit Provider" : "Add Provider")),
                        label().append$(
                            small().textContent("Name"),
                            input().type("text").placeholder("Ollama Cloud").$bind(useValue(name)),
                        ),
                        label().append$(
                            small().textContent("Base URL"),
                            input().type("url").placeholder("https://ollama.com/v1").$bind(useValue(base)),
                        ),
                        label().append$(
                            small().textContent("API Key"),
                            input().type("password").placeholder("sk-...").$bind(useValue(key)),
                        ),
                        menu().append$(
                            li().append$(
                                button().type("submit").disabled(loading).textContent(editingId.derive((id) => id ? "Update" : "Create")),
                            ),
                            li().append$(button().type("button").textContent("Cancel").onclick(resetForm)),
                        ),
                    ),
                ),
        );

    const trigger = button({ class: "trigger" }).type("button")
        .textContent("Providers")
        .onclick(() => {
            modal.showModal();
            if (!providers.get()) refresh();
        });

    return self.append$(trigger, modal);
}

const ProviderManagerStyle = css`
    :scope {
        display: contents;
    }

    .trigger {
        all: unset;
        cursor: pointer;
        display: block flow;
        margin-block-start: auto;
        padding-inline: 0.7em;
        padding-block: 0.55em;
        border-radius: var(--radius);
        color: var(--subtle);
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        border: 1px solid var(--border);
        transition: background-color 0.12s ease, color 0.12s ease;

        &:hover {
            background-color: var(--surface-hover);
            color: var(--pop);
        }
    }
`;

const ProviderModalStyle = css`
    :scope[open] {
        display: block grid;
        gap: 1em;
        align-content: start;
        padding: 1em;
        max-inline-size: 40em;
    }

    header {
        display: block grid;
        grid-template-columns: 1fr auto;
        align-items: center;

        strong {
            font-size: var(--text-lg);
            font-weight: var(--weight-medium);
        }
    }

    .close {
        all: unset;
        cursor: pointer;
        font-size: var(--text-lg);
        color: var(--subtle);

        &:hover {
            color: var(--pop);
        }
    }

    .error:empty {
        display: none;
    }

    .error {
        color: #ff6b6b;
        font-size: var(--text-sm);
    }

    ul {
        display: block grid;
        gap: 0.4em;
        list-style: none;
        padding: 0;
    }

    ul > li {
        display: block grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 0.5em;
        padding-inline: 0.75em;
        padding-block: 0.55em;
        border-radius: var(--radius);
        background-color: var(--surface-hover);

        strong {
            display: block flow;
            font-weight: var(--weight-medium);
        }

        small {
            color: var(--muted);
            font-size: var(--text-sm);
        }

        &[aria-current="true"] {
            outline: 2px solid var(--accent-base);
            outline-offset: -2px;
        }
    }

    .hint {
        color: var(--muted);
    }

    fieldset {
        display: block grid;
        gap: 0.75em;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 1em;
    }

    legend {
        font-weight: var(--weight-medium);
        padding-inline: 0.4em;
    }

    label {
        display: block grid;
        gap: 0.3em;

        small {
            color: var(--subtle);
            font-size: var(--text-sm);
        }
    }

    input {
        all: unset;
        cursor: auto;
        padding-inline: 0.75em;
        padding-block: 0.5em;
        border-radius: var(--radius);
        background-color: color-mix(in srgb, var(--base), var(--pop) 6%);

        &::placeholder {
            color: var(--subtle);
        }

        &:focus-visible {
            outline: 2px solid var(--accent-base);
            outline-offset: -2px;
        }
    }

    menu {
        display: block grid;
        grid-auto-flow: column;
        gap: 0.5em;
        justify-content: start;
        list-style: none;
        margin: 0;
        padding: 0;

        li {
            display: contents;
        }
    }

    button:not(.close):not(.trigger) {
        all: unset;
        cursor: pointer;
        padding-inline: 0.9em;
        padding-block: 0.45em;
        border-radius: var(--radius);
        background-color: var(--accent-base);
        color: var(--accent-pop);
        font-size: var(--text-sm);
        transition: background-color 0.12s ease;

        &:hover {
            background-color: color-mix(in srgb, var(--accent-base), white 10%);
        }

        &[type="button"] {
            background-color: var(--surface-hover);
            color: var(--pop);

            &:hover {
                background-color: var(--surface-hover-strong);
            }
        }

        &.danger {
            background-color: transparent;
            color: #ff6b6b;

            &:hover {
                background-color: color-mix(in srgb, red 12%, transparent);
            }
        }

        &:disabled {
            opacity: 0.5;
            cursor: default;
        }
    }
`;
