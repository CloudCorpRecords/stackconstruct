import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  basesFromEnv,
  explainError,
  getCdkBestPractices,
  getCdkConcept,
  getConstructDetails,
  getExamplePattern,
  getMigrationGuide,
  listCdkPatterns,
  searchCdkDocs,
  searchConstructs,
  validateStackNag,
} from "../src/cdk.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

interface Recorded { url: string; method: string }

function fakeFetch(handler: (url: string) => { payload: unknown; status?: number; rawText?: string }) {
  const calls: Recorded[] = [];
  const fn: FetchFn = async (url, init) => {
    calls.push({ url, method: init?.method ?? "GET" });
    const step = handler(url);
    const res: HttpResponse = {
      ok: (step.status ?? 200) < 300,
      status: step.status ?? 200,
      headers: { get: () => null },
      text: async () => step.rawText ?? (typeof step.payload === "string" ? step.payload : JSON.stringify(step.payload)),
    };
    return res;
  };
  return { fn, calls };
}

const BASES = { docsBase: "https://docs.aws.amazon.com", constructsBase: "https://constructs.dev" };

describe("stackconstruct core", () => {
  it("best practices default to general and serve known topics", () => {
    const general = getCdkBestPractices({}) as { topic: string; practices: string[] };
    assert.equal(general.topic, "general");
    assert.ok(general.practices.length >= 3);
    const security = getCdkBestPractices({ topic: "security" }) as { topic: string; practices: string[] };
    assert.equal(security.topic, "security");
    assert.ok(security.practices.some((p) => p.toLowerCase().includes("least privilege")));
  });

  it("best practices reject unknown topics with the known list", () => {
    assert.throws(() => getCdkBestPractices({ topic: "cooking" }), /Unknown best-practices topic: cooking/);
  });

  it("search_cdk_docs shapes the docs search URL and returns fetched content", async () => {
    const { fn, calls } = fakeFetch(() => ({ payload: "<html>CDK docs result</html>" }));
    const out = (await searchCdkDocs(fn, BASES, { query: "lambda asset bundling", max_results: 3 })) as Record<string, unknown>;
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].url, "https://docs.aws.amazon.com/search/doc-search.html?q=lambda%20asset%20bundling");
    assert.equal(out.query, "lambda asset bundling");
    assert.equal(out.maxResults, 3);
    assert.ok(String(out.content).includes("CDK docs result"));
  });

  it("search_cdk_docs surfaces upstream error status", async () => {
    const { fn } = fakeFetch(() => ({ payload: "boom", status: 503 }));
    await assert.rejects(() => searchCdkDocs(fn, BASES, { query: "x" }), /failed with status 503/);
  });

  it("get_cdk_concept explains known concepts and rejects unknown ones", () => {
    const stack = getCdkConcept({ concept: "Stack" }) as { concept: string; summary: string };
    assert.equal(stack.concept, "stack");
    assert.ok(stack.summary.length > 10);
    assert.throws(() => getCdkConcept({ concept: "wizardry" }), /Unknown CDK concept: wizardry/);
  });

  it("list_cdk_patterns lists all and filters by category", () => {
    const all = listCdkPatterns({}) as { count: number; patterns: Array<{ category: string }> };
    assert.ok(all.count >= 5);
    const compute = listCdkPatterns({ category: "compute" }) as { count: number; patterns: Array<{ category: string }> };
    assert.ok(compute.count >= 2);
    assert.ok(compute.patterns.every((p) => p.category === "compute"));
    const none = listCdkPatterns({ category: "quantum" }) as { count: number };
    assert.equal(none.count, 0);
  });

  it("search_constructs hits the constructs.dev search API and slices results", async () => {
    const payload = { results: [{ name: "a" }, { name: "b" }, { name: "c" }] };
    const { fn, calls } = fakeFetch(() => ({ payload }));
    const out = (await searchConstructs(fn, BASES, { query: "queue", max_results: 2 })) as { results: unknown[] };
    assert.equal(calls[0].url, "https://constructs.dev/api/search?q=queue");
    assert.equal(out.results.length, 2);
    const full = (await searchConstructs(fn, BASES, { query: "queue" })) as { results: unknown[] };
    assert.equal(full.results.length, 3);
  });

  it("get_construct_details fetches the package endpoint with an encoded name", async () => {
    const { fn, calls } = fakeFetch(() => ({ payload: { name: "@aws-cdk/aws-sqs", version: "1.0.0" } }));
    const out = (await getConstructDetails(fn, BASES, { name: "@aws-cdk/aws-sqs" })) as Record<string, unknown>;
    assert.equal(calls[0].url, "https://constructs.dev/api/packages/%40aws-cdk%2Faws-sqs");
    assert.equal(out.name, "@aws-cdk/aws-sqs");
  });

  it("validate_stack_nag flags wildcard IAM, unencrypted S3/EBS and open ingress", () => {
    const template = {
      Resources: {
        Role: {
          Type: "AWS::IAM::Role",
          Properties: {
            Policies: [{
              PolicyDocument: {
                Statement: [{ Action: "*", Resource: "*", Effect: "Allow" }],
              },
            }],
          },
        },
        Bucket: { Type: "AWS::S3::Bucket", Properties: {} },
        Volume: { Type: "AWS::EC2::Volume", Properties: { Encrypted: false } },
        Sg: {
          Type: "AWS::EC2::SecurityGroup",
          Properties: { SecurityGroupIngress: [{ CidrIp: "0.0.0.0/0", IpProtocol: "tcp" }] },
        },
      },
    };
    const out = validateStackNag({ template }) as {
      compliant: boolean; findingCount: number; findings: Array<{ ruleId: string }>;
    };
    assert.equal(out.compliant, false);
    const rules = out.findings.map((f) => f.ruleId);
    assert.ok(rules.includes("IAM-WILDCARD-ACTION"));
    assert.ok(rules.includes("S3-UNENCRYPTED"));
    assert.ok(rules.includes("S3-PUBLIC-ACCESS"));
    assert.ok(rules.includes("EBS-UNENCRYPTED"));
    assert.ok(rules.includes("SG-OPEN-INGRESS"));
    assert.equal(out.findingCount, out.findings.length);
  });

  it("validate_stack_nag passes a compliant template and flags scoped-resource wildcards", () => {
    const good = {
      Resources: {
        Bucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketEncryption: { ServerSideEncryptionConfiguration: [] },
            PublicAccessBlockConfiguration: {
              BlockPublicAcls: true, BlockPublicPolicy: true,
              IgnorePublicAcls: true, RestrictPublicBuckets: true,
            },
          },
        },
        Volume: { Type: "AWS::EC2::Volume", Properties: { Encrypted: true } },
      },
    };
    const out = validateStackNag({ template: good }) as { compliant: boolean; findingCount: number };
    assert.equal(out.compliant, true);
    assert.equal(out.findingCount, 0);

    const scoped = {
      Resources: {
        Policy: {
          Type: "AWS::IAM::Policy",
          Properties: {
            PolicyDocument: { Statement: [{ Action: ["s3:GetObject"], Resource: "*" }] },
          },
        },
      },
    };
    const out2 = validateStackNag({ template: scoped }) as { findings: Array<{ ruleId: string }> };
    assert.deepEqual(out2.findings.map((f) => f.ruleId), ["IAM-WILDCARD-RESOURCE"]);
  });

  it("validate_stack_nag rejects templates without a Resources object", () => {
    assert.throws(() => validateStackNag({ template: {} }), /Resources object/);
    assert.throws(() => validateStackNag({ template: { Resources: [] } as unknown as Record<string, unknown> }), /Resources object/);
  });

  it("get_migration_guide covers v1 to v2 and the no-op same-major case", () => {
    const guide = getMigrationGuide({ from_version: "v1", to_version: "v2" }) as { steps: string[] };
    assert.ok(guide.steps.length >= 3);
    assert.ok(guide.steps.join(" ").includes("aws-cdk-lib"));
    const noop = getMigrationGuide({ from_version: "2.100.0" }) as { steps: string[] };
    assert.ok(noop.steps[0].includes("no migration is required"));
    assert.throws(() => getMigrationGuide({ from_version: "v2", to_version: "v9" }), /No migration guide/);
  });

  it("explain_error matches curated patterns and falls back honestly", () => {
    const matched = explainError({ error: "BucketName already exists" }) as { matched: boolean; remediation: string };
    assert.equal(matched.matched, true);
    assert.ok(matched.remediation.length > 10);
    const rollback = explainError({ error: "Stack is in ROLLBACK_IN_PROGRESS state" }) as { matched: boolean; explanation: string };
    assert.equal(rollback.matched, true);
    const unknown = explainError({ error: "something entirely novel happened" }) as { matched: boolean };
    assert.equal(unknown.matched, false);
  });

  it("get_example_pattern returns catalogue entries and rejects unknown names", () => {
    const pattern = getExamplePattern({ pattern: "serverless-api" }) as { name: string; services: string[] };
    assert.equal(pattern.name, "serverless-api");
    assert.ok(pattern.services.includes("Lambda"));
    assert.throws(() => getExamplePattern({ pattern: "moon-base" }), /Unknown pattern: moon-base/);
  });

  it("bases default to the public endpoints and honour env overrides", () => {
    assert.deepEqual(basesFromEnv({}), BASES);
    assert.deepEqual(
      basesFromEnv({ CDK_DOCS_URL: "https://docs.example.test/", CONSTRUCTS_API_URL: "https://constructs.example.test" }),
      { docsBase: "https://docs.example.test", constructsBase: "https://constructs.example.test" },
    );
  });
});
