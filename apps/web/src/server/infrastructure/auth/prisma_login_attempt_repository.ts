import 'server-only';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import type { LoginAttemptRepository } from '@/server/domain/auth/login_attempt_repository';

export class PrismaLoginAttemptRepository implements LoginAttemptRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async recordAttempt(
    emailHash: string,
    ipAddress: string,
    successful: boolean,
  ): Promise<void> {
    await this.prisma.authLoginAttempt.create({
      data: {
        identifier: emailHash,
        ip_address: ipAddress,
        success: successful,
      },
    });
  }

  async getConsecutiveFailures(emailHash: string): Promise<number> {
    const attempts = await this.prisma.authLoginAttempt.findMany({
      where: { identifier: emailHash },
      orderBy: { attempted_at: 'desc' },
      take: 20,
    });

    let consecutiveFailures = 0;
    for (const attempt of attempts) {
      if (attempt.success) {
        break;
      }
      consecutiveFailures++;
    }

    return consecutiveFailures;
  }

  async getLockoutHistoryCount(emailHash: string): Promise<number> {
    // Count how many failed attempts exist in windows of 5
    const totalFailures = await this.prisma.authLoginAttempt.count({
      where: {
        identifier: emailHash,
        success: false,
      },
    });

    return Math.floor(totalFailures / 5);
  }

  async clearAttempts(emailHash: string): Promise<void> {
    await this.prisma.authLoginAttempt.deleteMany({
      where: { identifier: emailHash },
    });
  }
}
