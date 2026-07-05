import { ref, tags } from "@purifyjs/core";
import { useValue } from "~/frontend/kit/bind.ts";

export function ChatBox(onSend: (content: string) => void) {
    const { form, textarea, button, label, strong } = tags;
    const self = form().onsubmit((event) => {
        event.preventDefault();
        onSend(content.get());
        content.set("");
    });

    const content = ref("");

    self.append$(
        label().append$(
            strong().textContent("Compose Message"),
            textarea().placeholder("Say something...").$bind(useValue(content)),
        ),
        button().type("submit").ariaLabel("Send").textContent(">"),
    );

    return self;
}
