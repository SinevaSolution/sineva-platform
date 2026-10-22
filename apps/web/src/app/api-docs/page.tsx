import Link from 'next/link';
import { ArrowLeft, FileCode2 } from 'lucide-react';
import { Badge, Button, Card, Container } from '@sineva/ui';
import { getOpenApiSpec } from '@/server/infrastructure/openapi/spec';

export default function ApiDocsPage() {
  const spec = getOpenApiSpec();
  const paths = Object.entries(
    (spec.paths ?? {}) as Record<string, Record<string, { summary?: string; operationId?: string; tags?: string[] }>>,
  );

  return (
    <div className="min-h-screen bg-[var(--color-canvas)] py-10 text-[var(--color-text)]">
      <Container size="wide" className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-border)] pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileCode2 className="h-6 w-6 text-[var(--color-action-primary)]" />
              <h1 className="text-2xl font-bold tracking-tight">
                Sineva Platform OpenAPI 3.1 Explorer
              </h1>
              <Badge tone="teal">OAS 3.1.0</Badge>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              All endpoints enforce the standardized `snake_case` response
              envelope from `@sineva/shared`.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" asChild>
              <a
                href="/api/openapi.json"
                target="_blank"
                rel="noopener noreferrer"
              >
                Raw /api/openapi.json
              </a>
            </Button>
            <Button variant="primary" size="sm" asChild>
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Companion Hub</span>
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-5">
            <h2 className="text-lg font-bold">Registered BFF Endpoints</h2>
            {paths.map(([routePath, methods]) => (
              <Card key={routePath} elevated className="space-y-3">
                <code className="text-sm font-bold text-[var(--color-action-primary)]">
                  {routePath}
                </code>
                <div className="space-y-2">
                  {Object.entries(methods).map(([httpVerb, meta]) => (
                    <div
                      key={httpVerb}
                      className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)]/60 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Badge tone="teal">{httpVerb.toUpperCase()}</Badge>
                        <span className="font-medium">{meta.summary}</span>
                      </div>
                      <span className="font-mono text-[var(--color-text-muted)]">
                        {meta.operationId}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          <Card elevated className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                Full OpenAPI 3.1 Specification JSON
              </h2>
              <Badge tone="neutral">snake_case schema</Badge>
            </div>
            <pre className="max-h-[680px] overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--ink-950)] p-4 font-mono text-xs text-emerald-300 leading-relaxed">
              {JSON.stringify(spec, null, 2)}
            </pre>
          </Card>
        </div>
      </Container>
    </div>
  );
}
