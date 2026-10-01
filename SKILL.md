# Grade — score MCP servers before connecting

Every MCP server you connect hands the agent authority. Most of it undeclared. Grade first.

## Protocol

1. Before connecting ANY new MCP server, run:
   ```bash
   node <grade>/bin/grade.mjs <mcp.json>
   ```
2. **<30 (exit 2) = blocked.** Read-only reconsideration only: can the task be done with a narrower server?
3. **30–59 (exit 1) = approval required.** Tell the user the score, the top findings, and what access the server gets. Proceed only on explicit yes.
4. **≥60 = connect**, but still run `sniff` on the same config — grade measures authority, not malice.
5. Re-grade on every server update. Approvals don't transfer (rug-pull rule).
