import 'server-only';
import type { NewOAuthFlow, OAuthFlowEntity } from '@/server/domain/connections/oauth_flow';
import type { OwnerScope } from '@/server/domain/connections/connection';
import type { OAuthFlowRepository } from '@/server/domain/repositories/oauth_flow_repository';
import type { PrismaClient } from './generated/client';

interface Row {
  id: string;
  workspace_id: string;
  user_id: string;
  provider_id: string;
  connection_id: string | null;
  owner_scope: string;
  scope_bundle: string;
  scopes: string[] | null;
  state_hash: string;
  nonce: string;
  redirect_uri: string;
  issuer: string;
  session_hash: string;
  return_to: string;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
}

function map(row: Row): OAuthFlowEntity {
  return { ...row, owner_scope: row.owner_scope as OwnerScope, scopes: row.scopes ?? [] };
}

export class PrismaOAuthFlowRepository implements OAuthFlowRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: NewOAuthFlow): Promise<OAuthFlowEntity> {
    return map(await this.prisma.oAuthFlow.create({ data: input }));
  }

  async consume(stateHash: string, now: Date): Promise<OAuthFlowEntity | null> {
    // The whole single-use guarantee is this one statement: of two callbacks
    // racing on one state, Postgres lets exactly one satisfy `consumed_at IS NULL`.
    const rows = await this.prisma.$queryRaw<Row[]>`
      UPDATE "platform"."oauth_flows"
      SET "consumed_at" = ${now}
      WHERE "state_hash" = ${stateHash} AND "consumed_at" IS NULL
      RETURNING *`;
    return rows[0] ? map(rows[0]) : null;
  }

  async remove(id: string): Promise<void> {
    await this.prisma.oAuthFlow.deleteMany({ where: { id } });
  }
}
