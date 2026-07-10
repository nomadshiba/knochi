- [ ] Async tools (detachable tool calls — the tool result would simply return and say it's detached, the context suffix would constantly
      let the agent know about it (that it's running), and when it's done a system prompt would show the result, so the agent doesn't have
      to wait for the tool to complete)
- [ ] when the script tool times out, give the agent 3 options it has to select from: terminate, wait longer, or detach (background). 3
      tools, agent has to select one.
- [ ] remote tools (browser fs api, and remote terminal)
- [ ] chat history query tool
- [ ] script tool, permission change request (user dialog)
- [ ] q&a tool
- [ ] include datetime in the context suffix.
- [ ] nostr identity for auth is the easiest way to have authentication
- [ ] api endpoint encryption, https is not secure enough, especially with cf.
- [ ] we don't show fails on the ui; we should — they come with done with kind fail.
- [ ] remove suffixes like `Output` from things, more consistent naming.
- [ ] ability to queue a `pause-agent` command while typing something, instead of having to interrupt the agent.
- [ ] add agent interrupt
- [ ] all above applies to subagent chats as well, ability to pause, interrupt, and inject user message to subagents.
- [ ] we also need subagent chat view on the ui
- [ ] reasoning is not handled
- [ ] copy, edit buttons
- [ ] scroll down button
- [ ] bucket based storage for scopes, (chat, user), only primary agents can see the user's bucket, for subagents to see them they have to
      give them permission as well. or copy it to their chat bucket. buckets similar to s3 api, but on disk.
- [ ] agents can use the buckets for note taking, but as i said i want an obsidian like notepad for the agent. this can be a seperate tool
      or not.
- [ ] handle partial assitant messages and unfinished tool calls in db at startup. probably give an error for the tool call, and make the
      message non-partial.
- [/] mobile responsive tweaks
- [ ] auto focus on related text field.
