# Baton: start in this chat

The user dropped this file into the chat to turn on the Baton plugin (https://github.com/moramadan91/baton). Do these steps in order, then follow the Baton skill for the rest of the chat.

1. Check whether Baton is installed: run `claude plugin list` and look for `baton@baton` with `✔ enabled`.
2. If it is missing, install it:
   - `claude plugin marketplace add moramadan91/baton`
   - `claude plugin install baton@baton`
   Then tell the user: "Baton is installed. Open a new chat (or run /reload-plugins) and drop this file again." Stop here.
3. If it is installed but `/baton` is not in this chat's skills list, tell the user to run `/reload-plugins` or open a new chat. Stop here.
4. Check that `codex --version` and `gemini --version` both work. If one is missing, tell the user which one, and that its steps will go to a Claude subagent instead.
5. Invoke the `baton:baton` skill and follow it from now on. Load its tools in one ToolSearch call: `select:mcp__baton__plan,mcp__baton__step,mcp__baton__codex,mcp__baton__gemini`.
6. Tell the user in one line that Baton is on, and ask what to build.
