# Hive: start in this chat

The user dropped this file into the chat to turn on the Hive plugin (https://github.com/moramadan91/hive). Do these steps in order, then follow the Hive skill for the rest of the chat.

1. Check whether Hive is installed: run `claude plugin list` and look for `hive@hive` with `✔ enabled`.
2. If it is missing, install it:
   - `claude plugin marketplace add moramadan91/hive`
   - `claude plugin install hive@hive`
   Then tell the user: "Hive is installed. Open a new chat (or run /reload-plugins) and drop this file again." Stop here.
3. If it is installed but `/hive` is not in this chat's skills list, tell the user to run `/reload-plugins` or open a new chat. Stop here.
4. Check that `codex --version` works. If it is missing, tell the user that Codex steps will go to a Claude subagent instead.
5. Invoke the `hive:hive` skill and follow it from now on. Load its tools in one ToolSearch call: `select:mcp__hive__plan,mcp__hive__step,mcp__hive__codex`.
6. Tell the user in one line that Hive is on, and ask what to build.
