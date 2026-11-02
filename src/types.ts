/**
 * stackconstruct types.
 *
 * A core subset of the AWS CDK MCP surface: guidance, documentation
 * search, constructs.dev lookup and local nag-style template checks.
 * HTTP access is described by a minimal response surface so tests can
 * inject a fake fetch.
 */

export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;

export interface Bases {
  docsBase: string;
  constructsBase: string;
}

export interface GetCdkBestPracticesOptions {
  topic?: string;
}

export interface SearchCdkDocsOptions {
  query: string;
  max_results?: number;
}

export interface GetCdkConceptOptions {
  concept: string;
}

export interface ListCdkPatternsOptions {
  category?: string;
}

export interface SearchConstructsOptions {
  query: string;
  max_results?: number;
}

export interface GetConstructDetailsOptions {
  name: string;
}

export interface ValidateStackNagOptions {
  template: Record<string, unknown>;
}

export interface GetMigrationGuideOptions {
  from_version: string;
  to_version?: string;
}

export interface ExplainErrorOptions {
  error: string;
}

export interface GetExamplePatternOptions {
  pattern: string;
}
