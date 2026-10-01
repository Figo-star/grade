#!/usr/bin/env node
// grade — deterministic 0-100 capability-hygiene score for MCP server configs.
// No LLM in the decision path: same rules, every server, every time.
// Zero dependencies, Node 18+.
// Usage: node bin/grade.mjs <mcp.json> [--json]
// Exit: 0 score>=60 · 1 score 30-59 · 2 score<30
import { readFileSync } from "node:fs";

const WRITE_RE = /(create|update|delete|remove|push|write|fork|merge|publish|send|deploy|run|exec|share|invite|approve|pay|transfer)/i;
const PENALTY = { critical: 25, high: 10, medium: 3 };

function grade(config) {
  const findings = [];
  const servers = config.mcpServers ?? config.servers ?? { default: config };
  for (const [name, srv] of Object.entries(servers)) {
    // G1: secrets baked into config (GitGuardian found 24k in public MCP configs)
    const blob = JSON.stringify(srv);
    if (/((AKIA[0-9A-Z]{16})|(ghp_[A-Za-z0-9]{20,})|(sk-ant-[A-Za-z0-9-]{10,})|(xox[bpas]-[A-Za-z0-9-]{10,}))/.test(blob))
      findings.push({ server: name, severity: "critical", rule: "G1", detail: "live secret baked into config" });
    // G2: stdio launching network fetchers (OX: arbitrary subprocess via STDIO)
    const cmd = `${srv.command ?? ""} ${(srv.args ?? []).join(" ")}`;
    if (/(curl|wget).*\|\s*(bash|sh)|npx\s+.*https?:|uvx\s+.*https?:/.test(cmd))
      findings.push({ server: name, severity: "high", rule: "G2", detail: "stdio executes remote-fetched code: " + cmd.slice(0, 80) });
    // G3/G4: declared tools — names implying mutation + unbounded string params
    for (const t of srv.tools ?? []) {
      if (WRITE_RE.test(t.name ?? ""))
        findings.push({ server: name, severity: "high", rule: "G3", detail: `write-implying tool with no side-effect declaration: ${t.name}` });
      const params = t.inputSchema?.properties ?? {};
      for (const [pname, p] of Object.entries(params)) {
        if (p.type === "string" && !p.maxLength && !p.enum && !p.pattern)
          findings.push({ server: name, severity: "medium", rule: "G4", detail: `unbounded string param (injection surface): ${t.name}.${pname}` });
      }
    }
    // G5: broad env passthrough (credential stores reachable)
    const envKeys = Object.keys(srv.env ?? {}).join(" ");
    if (/(AWS_|GITHUB_TOKEN|SSH_|NPM_TOKEN)/.test(envKeys))
      findings.push({ server: name, severity: "medium", rule: "G5", detail: "credential env passthrough: check scope" });
  }
  let score = 100;
  for (const f of findings) score -= PENALTY[f.severity];
  score = Math.max(0, score);
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 30 ? "D" : "F";
  return { score, grade, findings };
}

const [file, ...rest] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!file) {
  console.error("grade: usage: grade <mcp.json> [--json]");
  process.exit(1);
}
const asJson = process.argv.includes("--json");
const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
const r = grade(JSON.parse(text));
if (asJson) {
  console.log(JSON.stringify(r, null, 2));
} else {
  console.log(`grade: ${r.score}/100 (${r.grade}) — ${r.findings.length} finding(s)`);
  for (const f of r.findings) console.log(`  ${f.severity.toUpperCase().padEnd(8)} ${f.rule} [${f.server}] ${f.detail}`);
}
process.exit(r.score >= 60 ? 0 : r.score >= 30 ? 1 : 2);
