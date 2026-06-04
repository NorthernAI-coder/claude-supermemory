---
description: Show Supermemory authentication status
allowed-tools: ["Bash"]
---

# Supermemory Status

Run the bundled status checker and show the output to the user.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/status.cjs"
```

If the command fails, show the error and suggest restarting Claude Code after rebuilding or reinstalling the plugin.
