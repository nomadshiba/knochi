import { Sync, tags } from "@purifyjs/core";
import { useValue } from "~/frontend/kit/bind.ts";
import { css } from "~/frontend/kit/css.ts";

export function ChatBox(content: Sync.Ref<string>) {
    const { textarea, label, strong } = tags;

    return label().$bind(ChatBoxSheet.useScope()).append$(
        strong().textContent("Compose Message"),
        textarea().placeholder("Say something...").onkeydown((event) => {
            if (event.key !== "Enter") return;
            if (event.shiftKey) return;
            event.preventDefault();
            event.currentTarget.closest("form")?.dispatchEvent(new SubmitEvent("submit"));
        }).$bind(useValue(content))
            .$bind((element) => {
                const aborter = new AbortController();

                const resize = () => {
                    element.style.height = "0";
                    element.style.height = `${element.scrollHeight}px`;
                };

                element.addEventListener("input", resize, { signal: aborter.signal });
                const interval = setInterval(resize, 1000);
                resize();

                return () => {
                    aborter.abort();
                    clearInterval(interval);
                };
            }),
    );
}

const ChatBoxSheet = css`
    :scope {
        display: block grid;
    }

    strong {
        position: absolute;
        pointer-events: none;
        inline-size: 0;
        block-size: 0;
        contain: paint;
    }

    textarea {
        resize: none;
        display: block flow;
        inline-size: 100%;
        background-color: transparent;
        border: none;
        font: inherit;
        color: inherit;
        min-block-size: 2em;

        &:focus-visible {
            outline: none;
        }
    }
`;
