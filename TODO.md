- [ ] Async tools (detachable tool calls — the tool result would simply return and say it's detached, the context suffix would constantly
      let the agent know about it (that it's running), and when it's done a system prompt would show the result, so the agent doesn't have
      to wait for the tool to complete)
- [ ] all tools should be terminatable/abortable
- [ ] when the script tool times out, give the agent 3 options it has to select from: terminate, wait longer, or detach (background). 3
      tools, agent has to select one.
- [+] script can call other tools
- [+] subagent task tool
- [ ] remote tools (browser fs api, and remote terminal)
- [ ] chat history query tool
- [+] frontend stream stuff.
- [ ] script tool, permission change request (user dialog)
- [ ] q&a tool
- [ ] include datetime in the context suffix.
- [+] more tool info within the chat
- [ ] nostr identity for auth is the easiest way to have authentication
- [ ] api endpoint encryption, https is not secure enough, especially with cf.
- [+] there is no indication that the agent is not done yet. should be.
- [ ] queue user messages after agent+tool messages, don't start another agent loop
- [ ] MessageBuffer can have a delta message array which gets appended at the end and encoded every time, until the same id is seen at
      add(), at which point it gets added to the regular json and buffer messages. this way we don't have to query the db at
      messages/many.ts
- [ ] we don't show fails on the ui; we should — they come with done with kind fail.
- [ ] remove suffixes like `Output` from things, more consistent naming.
- [ ] ability to queue a pause-agent command while typing something, instead of having to interrupt the agent.
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
- [ ] rebuilding tool call indicator objects causes modal to be recreated as well. create modal seperately. so it can update. or memoize it
      with an Map
- [ ] handle partial assitant messages and unfinished tool calls in db at startup. probably give an error for the tool call, and make the
      message non-partial.
