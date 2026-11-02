# stackconstruct

AWS CDK guidance as MCP tools. stackconstruct is a clean-room rebuild
of the core surface of the AWS CDK MCP server, under a new name: fresh
curated guidance content and fresh code, no copied branding and no
copied documentation text.

## Tools (core subset, 10)

`get_cdk_best_practices`, `search_cdk_docs`, `get_cdk_concept`,
`list_cdk_patterns`, `search_constructs`, `get_construct_details`,
`validate_stack_nag`, `get_migration_guide`, `explain_error`,
`get_example_pattern`.

Keyless-first: the guidance tools (best practices, concepts,
patterns, migration guides, error explanations) are local
deterministic content written for this rebuild, and
`validate_stack_nag` runs local checks over a stack-template JSON you
supply — wildcard IAM actions/resources, unencrypted S3 buckets and
EBS volumes, buckets without a full public-access block, and security
groups open to the world. Only `search_cdk_docs`, `search_constructs`
and `get_construct_details` fetch, from the public AWS documentation
site and the constructs.dev public API.

Not in this subset: project bootstrap and initialisation, stack
deployment or synthesis execution, CDK Pipelines management, context
and feature-flag administration, construct code generation, and
anything that mutates an AWS account or a local project.

## Setup

No credentials are required. Optionally override the lookup bases:

```bash
export CDK_DOCS_URL=https://docs.aws.amazon.com        # default
export CONSTRUCTS_API_URL=https://constructs.dev       # default
```

## CLI

```bash
npx @reneturcios/stackconstruct get_cdk_best_practices '{"topic":"security"}'
npx @reneturcios/stackconstruct validate_stack_nag '{"template":{"Resources":{}}}'
npx @reneturcios/stackconstruct mcp        # stdio MCP server
```

Each tool name is a subcommand taking one JSON object argument.

## MCP client config

```json
{
  "mcpServers": {
    "stackconstruct": {
      "command": "npx",
      "args": ["-y", "@reneturcios/stackconstruct", "mcp"]
    }
  }
}
```

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/stackconstruct
```

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
