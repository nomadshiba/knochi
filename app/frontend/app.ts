import { sync, tags, toChild } from "@purifyjs/core";
import { ChatNavigation } from "~/frontend/components/ChatNavigation.ts";
import { awaited } from "~/frontend/kit/awaited.ts";
import { Chat } from "~/frontend/components/Chat.ts";
import { unroll } from "~/frontend/kit/unroll.ts";
import { useReplaceChildren } from "~/frontend/kit/bind.ts";
import { MarkdownSheet } from "~/frontend/utils/markdown.ts";

function App() {
    const { body, header, main, progress } = tags;
    const self = body();

    const navigation = awaited(ChatNavigation(), progress());

    const chatId = sync<string>((set) => {
        set(location.hash);
        const interval = setInterval(() => set(location.hash), 100);
        return () => clearInterval(interval);
    }).derive((hash) => hash.slice(1) || undefined);

    const chat = chatId.derive((chatId) => chatId ? awaited(Chat(chatId), progress()) : "new chat").pipe(unroll);

    self.append$(
        header().$bind(useReplaceChildren(navigation)),
        main().$bind(useReplaceChildren(chat)),
    );

    return self;
}

document.adoptedStyleSheets.push(MarkdownSheet.sheet());
document.body.replaceWith(toChild(App()));
