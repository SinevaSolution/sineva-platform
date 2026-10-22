import 'server-only';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import type { MemberAccount, MemberAccountLookup } from '@/server/domain/members/member_ports';
import { activeClient } from './prisma_transaction_runner';

const SELECT = {
  id: true,
  email: true,
  email_verified: true,
  full_name: true,
  preferred_name: true,
  locale: true,
} as const;

export class PrismaMemberAccountLookup implements MemberAccountLookup {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(userId: string): Promise<MemberAccount | null> {
    return activeClient(this.prisma).user.findUnique({ where: { id: userId }, select: SELECT });
  }

  async findByEmail(email: string): Promise<MemberAccount | null> {
    // Emails are stored lowercase (sign-up normalizes), and the column is
    // unique, so an equality match on the lowercased address is exact.
    return activeClient(this.prisma).user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: SELECT,
    });
  }
}
