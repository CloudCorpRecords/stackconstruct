/**
 * stackconstruct MCP server. Core subset: 10 tools.
 *
 * Low-level Server API with explicit inputSchema literals (the
 * McpServer+zod path injects $schema/additionalProperties and breaks
 * parity). Zod still validates call args. The literals match the
 * labelled core-subset fixture exactly.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { basesFromEnv, callTool, VERSION } from "./cdk.js";
import type { FetchFn } from "./types.js";

const ARG_SCHEMAS: Record<string, z.ZodTypeAny> = {
  get_cdk_best_practices: z.object({ topic: z.string().optional() }),
  search_cdk_docs: z.object({
    query: z.string(),
    max_results: z.number().optional(),
  }),
  get_cdk_concept: z.object({ concept: z.string() }),
  list_cdk_patterns: z.object({ category: z.string().optional() }),
  search_constructs: z.object({
    query: z.string(),
    max_results: z.number().optional(),
  }),
  get_construct_details: z.object({ name: z.string() }),
  validate_stack_nag: z.object({ template: z.record(z.unknown()) }),
  get_migration_guide: z.object({
    from_version: z.string(),
    to_version: z.string().optional(),
  }),
  explain_error: z.object({ error: z.string() }),
  get_example_pattern: z.object({ pattern: z.string() }),
};

export const TOOLS = [
  {
    name: "get_cdk_best_practices",
    description: "Get curated AWS CDK best practices, optionally for a topic.",
    inputSchema: {
      type: "object" as const,
      properties: { topic: { type: "string", description: "Optional best-practices topic to retrieve, one of general, security, testing, deployment, or cost (matched case-insensitively); defaults to general." } },
      required: [] as string[],
    },
  },
  {
    name: "search_cdk_docs",
    description: "Search the public AWS CDK documentation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The search text to look up in the AWS CDK documentation." },
        max_results: { type: "number", description: "Optional maximum number of results to return; recorded in the result, with fetched content truncated locally." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_cdk_concept",
    description: "Explain a core AWS CDK concept.",
    inputSchema: {
      type: "object" as const,
      properties: { concept: { type: "string", description: "The CDK concept to explain, one of app, stack, construct, asset, context, aspect, or token (matched case-insensitively)." } },
      required: ["concept"],
    },
  },
  {
    name: "list_cdk_patterns",
    description: "List curated CDK patterns, optionally filtered by category.",
    inputSchema: {
      type: "object" as const,
      properties: { category: { type: "string", description: "Optional pattern category to filter by, such as hosting, compute, integration, or storage (matched case-insensitively); when omitted, all patterns are listed." } },
      required: [] as string[],
    },
  },
  {
    name: "search_constructs",
    description: "Search constructs.dev for reusable constructs.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The search text to look up on constructs.dev." },
        max_results: { type: "number", description: "Optional maximum number of results to return; when given, the returned results array is sliced to this size." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_construct_details",
    description: "Get details for a construct package on constructs.dev.",
    inputSchema: {
      type: "object" as const,
      properties: { name: { type: "string", description: "The name of the construct package on constructs.dev to retrieve details for." } },
      required: ["name"],
    },
  },
  {
    name: "validate_stack_nag",
    description: "Check a stack template JSON against local nag-style rules.",
    inputSchema: {
      type: "object" as const,
      properties: { template: { type: "object", description: "The CloudFormation stack template JSON object to validate; it must be an object containing a Resources object." } },
      required: ["template"],
    },
  },
  {
    name: "get_migration_guide",
    description: "Get a migration guide between CDK versions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        from_version: { type: "string", description: "The CDK version to migrate from, for example v1; only the major version is parsed." },
        to_version: { type: "string", description: "Optional CDK version to migrate to, for example v2; defaults to v2." },
      },
      required: ["from_version"],
    },
  },
  {
    name: "explain_error",
    description: "Explain a common CDK or CloudFormation error message.",
    inputSchema: {
      type: "object" as const,
      properties: { error: { type: "string", description: "The CDK or CloudFormation error message text to explain; matched against curated patterns such as already exists, access denied, throttling, and rollback." } },
      required: ["error"],
    },
  },
  {
    name: "get_example_pattern",
    description: "Get an example pattern from the curated pattern catalogue.",
    inputSchema: {
      type: "object" as const,
      properties: { pattern: { type: "string", description: "The name of the catalogue pattern to retrieve, such as static-site, serverless-api, or data-lake (matched case-insensitively)." } },
      required: ["pattern"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    }],
  };
}
function errorResult(err: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: err instanceof Error ? err.message : String(err),
    }],
    isError: true,
  };
}

const server = new Server(
  { name: "stackconstruct", version: VERSION },
  { capabilities: { tools: {} } },
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const schema = ARG_SCHEMAS[name];
  if (!schema) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  try {
    const parsed = schema.parse(args ?? {}) as Record<string, unknown>;
    const fetchFn = globalThis.fetch as unknown as FetchFn;
    return textResult(await callTool(fetchFn, basesFromEnv(), name, parsed));
  } catch (err) {
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}
void main();
