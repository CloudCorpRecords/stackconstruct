# stackconstruct — BUILD REPORT

Original: aws-cdk → Rebuild: stackconstruct
Tier C core subset. Local only, nothing pushed or published.

## Scope
10 tools, keyless-first. Local deterministic tools (curated content
and logic written fresh for this rebuild): get_cdk_best_practices
(topic-keyed rule sets: general, security, testing, deployment,
cost), get_cdk_concept (glossary: app, stack, construct, asset,
context, aspect, token), list_cdk_patterns and get_example_pattern
(6-entry pattern catalogue), get_migration_guide (v1 -> v2 steps,
same-major no-op, unsupported pairs rejected), explain_error
(pattern-matched explanations with an honest unmatched fallback),
validate_stack_nag (local checks over a supplied stack-template
JSON: IAM wildcard actions, IAM wildcard resources, unencrypted S3,
S3 without a full public-access block, unencrypted EBS volumes,
world-open security group ingress; returns findings + compliant
flag). Fetched tools go through an injectable FetchFn:
search_cdk_docs (GET https://docs.aws.amazon.com/search/doc-search.html?q=...),
search_constructs (GET https://constructs.dev/api/search?q=...,
max_results slices the results array), get_construct_details
(GET https://constructs.dev/api/packages/<name>). Bases are
overridable via CDK_DOCS_URL / CONSTRUCTS_API_URL.

Omitted groups (fixture `_source` lists them): project bootstrap
and initialisation, stack deployment and synthesis execution, CDK
Pipelines management, context and feature-flag administration,
construct code generation, and anything that mutates an AWS account
or a local project.

Ground truth: tool schemas are docs-derived from the public CDK
documentation surface; all guidance prose is original to this
rebuild. Fixture: harness/fixtures/aws-cdk-tools-original.json
(labelled core-subset).

## Verified (foreground, from disk)
- Tools: 10/10 — parity.json identical_tools = 10 = total.
- Unit tests: 15/15 pass (fake FetchFn only; URL shaping for docs
  search and both constructs.dev endpoints, upstream error
  surfacing, every local knowledge tool, nag validation for every
  rule plus the compliant case and the invalid-template error,
  migration and error-explainer paths, env base overrides).
- tsc: exit 0. dist/cli.js present; `node dist/cli.js --version`
  prints 0.1.0.
- Parity: harness/parity.py vs the fixture → PASS, parity_pct 100.0
  (parity-out/parity.json).
- Env check: this build is keyless — no environment variable is
  required. CLI `get_cdk_best_practices {"topic":"security"}` with
  lookup env unset returned the curated security practices; unknown
  topics/concepts/patterns fail with errors listing the known values
  (unit-tested).
- server.json description 63 chars (≤100); OCI entry has no version
  field; npm entry carries version 0.1.0; Dockerfile label
  io.github.CloudCorpRecords/stackconstruct; full 19-file factory
  set present (node_modules is a symlink to the reference build for
  local build/test only).

## Honest gaps
- No live fetch was made — docs/constructs behaviour is fake-fetch
  proven only; the live response shapes of docs.aws.amazon.com
  search and constructs.dev may differ from the fake payloads.
- search_cdk_docs returns the fetched page text truncated to 8000
  chars; it does not parse result links out of the HTML.
- The nag validator is a small local rule set (6 rules), not the
  full cdk-nag rule packs.
- The knowledge catalogues are curated subsets, not the full CDK
  documentation.
- Lockfile is a copied fleet lockfile with identity fields edited —
  clean lockfile regeneration is REQUIRED before publish.
- mcpaudit / mcpvet / shipcheck not yet run — pre-publish gate.
