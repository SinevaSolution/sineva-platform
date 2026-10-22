'use client';

import { apiRequest } from '@/client/lib/api';
import type { SquadView } from '@/shared/squad_view';

export interface SquadFormValues {
  name: string;
  goal: string;
  member_slugs: string[];
  lead_type: 'sino' | 'member';
  lead_agent_slug: string | null;
  /** Set when the squad was started from a template; the server links it. */
  template_slug: string | null;
}

/** The squad calls, in one place so the list, the page and the dialog save the same way. */
export function squadApi(workspaceId: string) {
  const base = `/api/v1/workspaces/${workspaceId}`;
  return {
    async create(values: SquadFormValues): Promise<SquadView> {
      return apiRequest<SquadView>(`${base}/squads`, {
        method: 'POST',
        body: {
          name: values.name,
          goal: values.goal,
          member_slugs: values.member_slugs,
          lead_type: values.lead_type,
          lead_agent_slug: values.lead_type === 'member' ? values.lead_agent_slug : null,
          ...(values.template_slug ? { template_slug: values.template_slug } : {}),
        },
      });
    },

    /** Members and lead travel together, so the server can judge them as one squad. */
    async update(squad: SquadView, values: SquadFormValues): Promise<SquadView> {
      const before = squad.members.map((member) => member.agent_slug);
      const membersChanged = before.join(',') !== values.member_slugs.join(',');
      const leadChanged = squad.lead_type !== values.lead_type || (squad.lead_agent_slug ?? null) !== (values.lead_type === 'member' ? values.lead_agent_slug : null);
      let latest = squad;
      if (membersChanged || leadChanged) {
        latest = await apiRequest<SquadView>(`${base}/squads/${squad.id}/members`, {
          method: 'PUT',
          body: {
            member_slugs: values.member_slugs,
            lead_type: values.lead_type,
            lead_agent_slug: values.lead_type === 'member' ? values.lead_agent_slug : null,
          },
        });
      }
      const text: Record<string, string> = {};
      if (values.name !== squad.name) text.name = values.name;
      if (values.goal !== squad.goal) text.goal = values.goal;
      if (Object.keys(text).length > 0) {
        latest = await apiRequest<SquadView>(`${base}/squads/${squad.id}`, { method: 'PATCH', body: text });
      }
      return latest;
    },

    useTemplate(slug: string, overrides: { name?: string; goal?: string }): Promise<SquadView> {
      return apiRequest<SquadView>(`${base}/squad-templates/${slug}/use`, { method: 'POST', body: overrides });
    },

    setStatus(squadId: string, status: 'active' | 'archived'): Promise<SquadView> {
      return apiRequest<SquadView>(`${base}/squads/${squadId}`, { method: 'PATCH', body: { status } });
    },

    remove(squadId: string): Promise<{ id: string; deleted: true }> {
      return apiRequest(`${base}/squads/${squadId}`, { method: 'DELETE' });
    },
  };
}
