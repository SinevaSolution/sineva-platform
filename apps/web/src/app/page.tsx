import { SinevaDashboard } from '@/client/components/sineva_dashboard';
import { getGetAgentsUseCase } from '@/server/container';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { items } = await getGetAgentsUseCase().execute({
    page: 1,
    per_page: 20,
  });

  return <SinevaDashboard initialAgents={items} />;
}
