/**
 * stackconstruct core: a 10-tool core subset of the AWS CDK MCP
 * surface, implemented clean-room from public CDK knowledge.
 *
 * Two kinds of tools:
 * - Knowledge tools are REAL local deterministic content and logic
 *   written fresh for this rebuild: a curated best-practices set, a
 *   concept glossary, a pattern catalogue, migration guides, an error
 *   explainer, and nag-style validation that runs local checks over a
 *   supplied stack-template JSON.
 * - Lookup tools go through an injectable FetchFn to public sources:
 *   the AWS documentation site (docs.aws.amazon.com) for doc search
 *   and the constructs.dev public API for construct search/details.
 *   Tests use a fake fetch only; nothing here claims fetched content
 *   it did not fetch.
 */
import type {
  Bases,
  ExplainErrorOptions,
  FetchFn,
  GetCdkBestPracticesOptions,
  GetCdkConceptOptions,
  GetConstructDetailsOptions,
  GetExamplePatternOptions,
  GetMigrationGuideOptions,
  ListCdkPatternsOptions,
  SearchCdkDocsOptions,
  SearchConstructsOptions,
  ValidateStackNagOptions,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_DOCS_BASE = "https://docs.aws.amazon.com";
export const DEFAULT_CONSTRUCTS_BASE = "https://constructs.dev";

export function basesFromEnv(
  env: Record<string, string | undefined> = process.env,
): Bases {
  const docs = typeof env.CDK_DOCS_URL === "string" ? env.CDK_DOCS_URL.trim() : "";
  const constructs = typeof env.CONSTRUCTS_API_URL === "string" ? env.CONSTRUCTS_API_URL.trim() : "";
  return {
    docsBase: (docs || DEFAULT_DOCS_BASE).replace(/\/+$/, ""),
    constructsBase: (constructs || DEFAULT_CONSTRUCTS_BASE).replace(/\/+$/, ""),
  };
}

const enc = encodeURIComponent;

/* ------------------------------------------------------------------ */
/* Local knowledge: best practices                                     */
/* ------------------------------------------------------------------ */

const BEST_PRACTICES: Record<string, { topic: string; practices: string[] }> = {
  general: {
    topic: "general",
    practices: [
      "Model infrastructure as constructs: compose reusable L2/L3 constructs instead of repeating raw CloudFormation resources.",
      "Keep stacks small and single-purpose; split stateful resources (databases, buckets) from stateless compute so either can be replaced safely.",
      "Pin the CDK library version and the CLI version together, and commit the lockfile so synth output is reproducible.",
      "Synthesize and review the CloudFormation template diff in code review, not just the TypeScript diff.",
      "Tag every resource with owner, environment and cost-centre tags applied at the app or stack level.",
    ],
  },
  security: {
    topic: "security",
    practices: [
      "Grant least privilege: prefer grant* methods on constructs over hand-written wildcard IAM policies.",
      "Never hardcode secrets; reference Secrets Manager or SSM Parameter Store values and let CDK inject them at deploy time.",
      "Enable encryption at rest by default (S3, EBS, RDS, DynamoDB) and block public access on every bucket.",
      "Run cdk-nag (or the validate_stack_nag tool) in CI and treat high-severity findings as build failures.",
    ],
  },
  testing: {
    topic: "testing",
    practices: [
      "Write fine-grained assertions against the synthesized template for security-critical properties (encryption, public access, IAM scope).",
      "Use snapshot tests sparingly: they catch change, but they do not say whether the change is correct.",
      "Test constructs in isolation with a bare stack before composing them into the full application.",
    ],
  },
  deployment: {
    topic: "deployment",
    practices: [
      "Deploy through CDK Pipelines or CI with an explicit approval step for production stages.",
      "Bootstrap each environment once with a qualifier per team or account to avoid bootstrap stack collisions.",
      "Prefer resource replacement awareness: know which property changes force replacement before approving a deploy.",
    ],
  },
  cost: {
    topic: "cost",
    practices: [
      "Set log retention explicitly; the default keeps logs forever and the bill grows quietly.",
      "Right-size NAT gateways: one per environment for dev, one per availability zone only where production availability requires it.",
      "Apply lifecycle rules to versioned buckets and snapshot volumes so old artifacts expire automatically.",
    ],
  },
};

export function getCdkBestPractices(opts: GetCdkBestPracticesOptions): unknown {
  const topic = (opts.topic ?? "general").toLowerCase();
  const entry = BEST_PRACTICES[topic];
  if (!entry) {
    throw new Error(
      `Unknown best-practices topic: ${opts.topic}. Known topics: ${Object.keys(BEST_PRACTICES).join(", ")}`,
    );
  }
  return entry;
}

/* ------------------------------------------------------------------ */
/* Local knowledge: concepts                                           */
/* ------------------------------------------------------------------ */

const CONCEPTS: Record<string, { concept: string; summary: string; details: string }> = {
  app: {
    concept: "app",
    summary: "The App is the root of the construct tree and the entry point of a CDK program.",
    details: "An App owns every stack in the deployment. Synthesis walks the tree from the App, resolves tokens, and emits one CloudFormation template per stack plus the cloud assembly.",
  },
  stack: {
    concept: "stack",
    summary: "A Stack is a unit of deployment that synthesizes to exactly one CloudFormation template.",
    details: "Everything inside a stack deploys and rolls back together. Stacks are scoped to one account/region pair per environment; cross-stack references create explicit dependencies between templates.",
  },
  construct: {
    concept: "construct",
    summary: "A Construct is a reusable component that represents one or more cloud resources.",
    details: "L1 constructs map one-to-one to CloudFormation resources, L2 constructs add defaults and helper methods for a single service, and L3 constructs (patterns) combine several services into an opinionated architecture.",
  },
  asset: {
    concept: "asset",
    summary: "An Asset is local content (code, files, container images) that CDK uploads for deployment.",
    details: "At synthesis, asset content is hashed; the hash names the staged object in the bootstrap bucket or registry, so unchanged code is never re-uploaded and a code change produces a new deployment artifact.",
  },
  context: {
    concept: "context",
    summary: "Context is cached lookup data (VPCs, AZs, AMIs) stored in cdk.context.json.",
    details: "Provider lookups run at synthesis time and cache their results so later syntheses are deterministic. Commit cdk.context.json; clear it when the underlying environment changes.",
  },
  aspect: {
    concept: "aspect",
    summary: "An Aspect is a visitor applied to every construct in a scope, used for cross-cutting changes and checks.",
    details: "Aspects run after the tree is built and before synthesis completes. cdk-nag is implemented as an aspect pack that annotates resources violating its rules.",
  },
  token: {
    concept: "token",
    summary: "A Token is a placeholder for a value that only exists at deploy time, such as a resource ARN.",
    details: "Tokens are encoded into strings, lists or numbers at synthesis and resolved by CloudFormation during deployment. Comparing token values with equality in code is unreliable; use the construct's grant and reference APIs instead.",
  },
};

export function getCdkConcept(opts: GetCdkConceptOptions): unknown {
  const entry = CONCEPTS[opts.concept.toLowerCase()];
  if (!entry) {
    throw new Error(
      `Unknown CDK concept: ${opts.concept}. Known concepts: ${Object.keys(CONCEPTS).join(", ")}`,
    );
  }
  return entry;
}

/* ------------------------------------------------------------------ */
/* Local knowledge: pattern catalogue                                  */
/* ------------------------------------------------------------------ */

interface PatternEntry {
  name: string;
  category: string;
  description: string;
  services: string[];
  notes: string;
}

const PATTERNS: PatternEntry[] = [
  {
    name: "static-site",
    category: "hosting",
    description: "An S3 bucket fronted by a CloudFront distribution serving a static website over HTTPS.",
    services: ["S3", "CloudFront", "ACM", "Route 53"],
    notes: "Keep the bucket private and grant read access only to the distribution's origin access identity.",
  },
  {
    name: "serverless-api",
    category: "compute",
    description: "API Gateway routes invoking Lambda functions backed by a DynamoDB table.",
    services: ["API Gateway", "Lambda", "DynamoDB"],
    notes: "Grant the function read/write access to the table with grant methods instead of a hand-written policy.",
  },
  {
    name: "event-pipeline",
    category: "integration",
    description: "Producers publish to an event bus or queue; consumers process asynchronously with a dead-letter queue.",
    services: ["EventBridge", "SQS", "Lambda"],
    notes: "Always configure a DLQ and an alarm on its depth so failed events are visible instead of silently dropped.",
  },
  {
    name: "container-service",
    category: "compute",
    description: "An ECS Fargate service behind an application load balancer with autoscaling on CPU.",
    services: ["ECS", "Fargate", "ALB", "ECR"],
    notes: "Build the image from a local asset so the image hash participates in synthesis and rollouts track code changes.",
  },
  {
    name: "scheduled-job",
    category: "compute",
    description: "A scheduled rule triggers a containerised or Lambda batch job on a cron cadence.",
    services: ["EventBridge Scheduler", "ECS", "Lambda"],
    notes: "Set a maximum event age and a DLQ on the target so a broken job does not retry forever.",
  },
  {
    name: "data-lake",
    category: "storage",
    description: "Tiered S3 buckets (raw, curated, published) with lifecycle transitions to colder storage classes.",
    services: ["S3", "Glue", "Lake Formation"],
    notes: "Enable bucket encryption and block public access on every tier; expire raw data on a documented retention schedule.",
  },
];

export function listCdkPatterns(opts: ListCdkPatternsOptions): unknown {
  const category = opts.category?.toLowerCase();
  const patterns = category
    ? PATTERNS.filter((p) => p.category === category)
    : PATTERNS;
  return { patterns, count: patterns.length };
}

export function getExamplePattern(opts: GetExamplePatternOptions): unknown {
  const entry = PATTERNS.find((p) => p.name === opts.pattern.toLowerCase());
  if (!entry) {
    throw new Error(
      `Unknown pattern: ${opts.pattern}. Known patterns: ${PATTERNS.map((p) => p.name).join(", ")}`,
    );
  }
  return entry;
}

/* ------------------------------------------------------------------ */
/* Local knowledge: migration guides                                   */
/* ------------------------------------------------------------------ */

function major(version: string): number {
  const m = version.trim().replace(/^v/i, "").split(".")[0];
  const n = Number.parseInt(m, 10);
  if (Number.isNaN(n)) throw new Error(`Unparseable version: ${version}`);
  return n;
}

export function getMigrationGuide(opts: GetMigrationGuideOptions): unknown {
  const from = opts.from_version;
  const to = opts.to_version ?? "v2";
  const fromMajor = major(from);
  const toMajor = major(to);
  if (fromMajor === toMajor) {
    return {
      from, to,
      steps: [`Both versions are major version ${fromMajor}; no migration is required. Apply regular minor/patch upgrades and re-run the test suite.`],
    };
  }
  if (fromMajor === 1 && toMajor === 2) {
    return {
      from, to,
      steps: [
        "Replace the v1 module layout (@aws-cdk/aws-*) with the single aws-cdk-lib package plus aws-cdk-lib/assertions for tests.",
        "Move from @aws-cdk/core constructs to the constructs package's Construct base class and update import paths.",
        "Update the CLI to the v2 cdk command and re-bootstrap environments with the v2 bootstrap template.",
        "Replace removed APIs: e.g. use grant methods and the new assertions Template API instead of SynthUtils snapshots for fine-grained checks.",
        "Re-run synthesis and diff every template; expect identifier changes where v2 renames logical IDs, and plan for possible resource replacement.",
      ],
    };
  }
  throw new Error(`No migration guide for ${from} -> ${to}. Available: v1 -> v2.`);
}

/* ------------------------------------------------------------------ */
/* Local knowledge: error explainer                                    */
/* ------------------------------------------------------------------ */

const ERROR_RULES: Array<{ match: RegExp; explanation: string; likelyCause: string; remediation: string }> = [
  {
    match: /already exists/i,
    explanation: "CloudFormation tried to create a resource whose physical name is already taken in the account/region.",
    likelyCause: "A hardcoded physical name (bucket, role, queue) collides with an existing resource, often from a previous stack or a parallel environment.",
    remediation: "Let CloudFormation generate physical names, or include the stack/environment in the name. Import or delete the orphaned resource if it belongs to a dead stack.",
  },
  {
    match: /no export named|export .* cannot be (deleted|updated)/i,
    explanation: "A cross-stack reference points at an export that is missing or still in use by another stack.",
    likelyCause: "The exporting stack was changed or deleted while importing stacks still reference its outputs.",
    remediation: "Deploy the exporting stack first, update importers to stop using the export, and only then change or remove it.",
  },
  {
    match: /validationerror|validation error/i,
    explanation: "CloudFormation rejected the template or a parameter before provisioning began.",
    likelyCause: "An invalid property value, an unsatisfied resource dependency, or a parameter outside its allowed range.",
    remediation: "Read the first validation message literally, run cdk synth and validate the template, and check the resource's documented property constraints.",
  },
  {
    match: /accessdenied|not authorized|access denied/i,
    explanation: "The deploying identity lacks permission for an API call made during deployment.",
    likelyCause: "The CDK bootstrap execution role or the caller's policy is missing a service action introduced by a newer construct.",
    remediation: "Re-bootstrap the environment to refresh the execution role, and check which action the error names before widening any policy.",
  },
  {
    match: /throttl|rate exceeded|too many requests/i,
    explanation: "An AWS API rate limit was hit during synthesis lookups or deployment.",
    likelyCause: "Parallel stack deployments or context lookups burst against the same service endpoint.",
    remediation: "Retry with backoff, reduce deployment parallelism, and commit cdk.context.json so lookups are not repeated on every run.",
  },
  {
    match: /rollback/i,
    explanation: "A stack operation failed and CloudFormation is returning resources to the previous known-good state.",
    likelyCause: "One resource in the change set failed to create or update; the rollback itself is the symptom, not the cause.",
    remediation: "Open the stack events and find the FIRST resource failure before the rollback started; fix that resource and redeploy.",
  },
];

export function explainError(opts: ExplainErrorOptions): unknown {
  for (const rule of ERROR_RULES) {
    if (rule.match.test(opts.error)) {
      return {
        matched: true,
        error: opts.error,
        explanation: rule.explanation,
        likelyCause: rule.likelyCause,
        remediation: rule.remediation,
      };
    }
  }
  return {
    matched: false,
    error: opts.error,
    explanation: "No curated explanation matched this error text.",
    likelyCause: "Unknown from the message alone.",
    remediation: "Synthesize the app locally, read the earliest failing stack event, and search the CDK documentation for the exact service error code.",
  };
}

/* ------------------------------------------------------------------ */
/* Local logic: nag-style template validation                          */
/* ------------------------------------------------------------------ */

export interface NagFinding {
  ruleId: string;
  resource: string;
  severity: "high" | "medium";
  message: string;
}

function walk(value: unknown, visit: (obj: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
  } else if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    visit(obj);
    for (const item of Object.values(obj)) walk(item, visit);
  }
}

function isWildcard(value: unknown): boolean {
  return value === "*" || (Array.isArray(value) && value.includes("*"));
}

export function validateStackNag(opts: ValidateStackNagOptions): unknown {
  const template = opts.template;
  if (
    template === null || typeof template !== "object" || Array.isArray(template) ||
    template.Resources === null || typeof template.Resources !== "object" ||
    Array.isArray(template.Resources)
  ) {
    throw new Error("template must be an object with a Resources object");
  }
  const findings: NagFinding[] = [];
  const resources = template.Resources as Record<string, Record<string, unknown>>;
  for (const [logicalId, resource] of Object.entries(resources)) {
    const type = typeof resource?.Type === "string" ? resource.Type : "";
    const props = (resource?.Properties ?? {}) as Record<string, unknown>;

    // IAM wildcard checks over every policy document in the resource.
    if (type.startsWith("AWS::IAM::")) {
      walk(props, (obj) => {
        if (isWildcard(obj.Action)) {
          findings.push({
            ruleId: "IAM-WILDCARD-ACTION", resource: logicalId, severity: "high",
            message: `${logicalId}: IAM policy grants Action "*" (all actions). Scope actions to the services the workload uses.`,
          });
        } else if (obj.Action !== undefined && isWildcard(obj.Resource)) {
          findings.push({
            ruleId: "IAM-WILDCARD-RESOURCE", resource: logicalId, severity: "medium",
            message: `${logicalId}: IAM policy applies actions to Resource "*". Scope resources to specific ARNs where the API supports it.`,
          });
        }
      });
    }

    if (type === "AWS::S3::Bucket") {
      if (props.BucketEncryption === undefined) {
        findings.push({
          ruleId: "S3-UNENCRYPTED", resource: logicalId, severity: "high",
          message: `${logicalId}: S3 bucket has no BucketEncryption. Enable server-side encryption.`,
        });
      }
      const block = props.PublicAccessBlockConfiguration as Record<string, unknown> | undefined;
      if (!block || block.BlockPublicAcls !== true || block.BlockPublicPolicy !== true) {
        findings.push({
          ruleId: "S3-PUBLIC-ACCESS", resource: logicalId, severity: "high",
          message: `${logicalId}: S3 bucket does not fully block public access. Set PublicAccessBlockConfiguration with all four flags true.`,
        });
      }
    }

    if (type === "AWS::EC2::Volume" && props.Encrypted !== true) {
      findings.push({
        ruleId: "EBS-UNENCRYPTED", resource: logicalId, severity: "high",
        message: `${logicalId}: EBS volume is not encrypted. Set Encrypted to true.`,
      });
    }

    if (type === "AWS::EC2::SecurityGroup") {
      const ingress = Array.isArray(props.SecurityGroupIngress) ? props.SecurityGroupIngress : [];
      for (const rule of ingress as Array<Record<string, unknown>>) {
        if (rule.CidrIp === "0.0.0.0/0" || rule.CidrIpv6 === "::/0") {
          findings.push({
            ruleId: "SG-OPEN-INGRESS", resource: logicalId, severity: "high",
            message: `${logicalId}: security group ingress is open to the world. Restrict the CIDR range or reference a source security group.`,
          });
        }
      }
    }
  }
  return { findings, findingCount: findings.length, compliant: findings.length === 0 };
}

/* ------------------------------------------------------------------ */
/* Fetched lookups (injectable FetchFn, fake in tests)                 */
/* ------------------------------------------------------------------ */

async function fetchText(fetchFn: FetchFn, url: string): Promise<string> {
  const res = await fetchFn(url, { method: "GET", headers: { Accept: "application/json, text/html" } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Request to ${url} failed with status ${res.status}: ${text.slice(0, 200)}`);
  }
  return text;
}

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function searchCdkDocs(
  fetchFn: FetchFn, bases: Bases, opts: SearchCdkDocsOptions,
): Promise<unknown> {
  const url = `${bases.docsBase}/search/doc-search.html?q=${enc(opts.query)}`;
  const text = await fetchText(fetchFn, url);
  return {
    query: opts.query,
    source: url,
    maxResults: opts.max_results ?? null,
    content: text.slice(0, 8000),
  };
}

export async function searchConstructs(
  fetchFn: FetchFn, bases: Bases, opts: SearchConstructsOptions,
): Promise<unknown> {
  const url = `${bases.constructsBase}/api/search?q=${enc(opts.query)}`;
  const parsed = parseMaybeJson(await fetchText(fetchFn, url));
  if (
    opts.max_results !== undefined && parsed !== null &&
    typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).results)
  ) {
    const obj = parsed as Record<string, unknown>;
    return { ...obj, results: (obj.results as unknown[]).slice(0, opts.max_results) };
  }
  return parsed;
}

export async function getConstructDetails(
  fetchFn: FetchFn, bases: Bases, opts: GetConstructDetailsOptions,
): Promise<unknown> {
  const url = `${bases.constructsBase}/api/packages/${enc(opts.name)}`;
  return parseMaybeJson(await fetchText(fetchFn, url));
}

/** Dispatch a tool call by name. Used by both the MCP server and the CLI. */
export async function callTool(
  fetchFn: FetchFn,
  bases: Bases,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "get_cdk_best_practices":
      return getCdkBestPractices(args as unknown as GetCdkBestPracticesOptions);
    case "search_cdk_docs":
      return searchCdkDocs(fetchFn, bases, args as unknown as SearchCdkDocsOptions);
    case "get_cdk_concept":
      return getCdkConcept(args as unknown as GetCdkConceptOptions);
    case "list_cdk_patterns":
      return listCdkPatterns(args as unknown as ListCdkPatternsOptions);
    case "search_constructs":
      return searchConstructs(fetchFn, bases, args as unknown as SearchConstructsOptions);
    case "get_construct_details":
      return getConstructDetails(fetchFn, bases, args as unknown as GetConstructDetailsOptions);
    case "validate_stack_nag":
      return validateStackNag(args as unknown as ValidateStackNagOptions);
    case "get_migration_guide":
      return getMigrationGuide(args as unknown as GetMigrationGuideOptions);
    case "explain_error":
      return explainError(args as unknown as ExplainErrorOptions);
    case "get_example_pattern":
      return getExamplePattern(args as unknown as GetExamplePatternOptions);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
