#!/usr/bin/env node
/**
 * stackconstruct CLI.
 *   stackconstruct <tool-name> '<json args>'
 *   stackconstruct mcp
 * Keyless: guidance tools are local; doc/construct lookups use public
 * endpoints. Exit codes: 0 success, 1 error, 2 usage.
 */
import { basesFromEnv, callTool, VERSION } from "./cdk.js";
import type { FetchFn } from "./types.js";

const TOOL_NAMES = [
  "get_cdk_best_practices", "search_cdk_docs", "get_cdk_concept",
  "list_cdk_patterns", "search_constructs", "get_construct_details",
  "validate_stack_nag", "get_migration_guide", "explain_error",
  "get_example_pattern",
];

function usage(): never {
  console.error(`Usage:
  stackconstruct <tool> '<json args>'   tools: ${TOOL_NAMES.join(", ")}
  stackconstruct mcp
  stackconstruct --version`);
  process.exit(2);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") { console.log(VERSION); return; }
  if (cmd === "mcp") { await import("./mcp.js"); return; }
  if (!cmd || !TOOL_NAMES.includes(cmd)) usage();
  let args: Record<string, unknown> = {};
  const raw = rest.join(" ").trim();
  if (raw) {
    try {
      args = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      console.error("error: args must be a JSON object");
      process.exit(1);
    }
  }
  try {
    const fetchFn = globalThis.fetch as unknown as FetchFn;
    const out = await callTool(fetchFn, basesFromEnv(), cmd, args);
    console.log(typeof out === "string" ? out : JSON.stringify(out, null, 2));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
void main();
