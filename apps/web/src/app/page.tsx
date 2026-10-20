import { GetAgentsUseCase } from '@/application/use-cases/get_agents_use_case';
import { defaultCacheRepository } from '@/infrastructure/cache/redis_cache_repository';
import { defaultAgentRepository } from '@/infrastructure/database/client';
import { SinevaDashboard } from '@/presentation/components/sineva_dashboard';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const getAgentsUseCase = new GetAgentsUseCase(
    defaultAgentRepository,
    defaultCacheRepository,
  );
  const { items } = await getAgentsUseCase.execute({
    page: 1,
    per_page: 20,
  });

  return <SinevaDashboard initialAgents={items} />;
}
