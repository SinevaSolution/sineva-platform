'use client';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import {
  Bot,
  FileCode2,
  Search,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Badge } from '@sineva/ui';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  setCommandPaletteOpen,
  setSelectedAgentSlug,
} from '../store/slices/agent_slice';
import { setOrchestratorMode } from '../store/slices/workspace_slice';

export function CommandPalette() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const open = useAppSelector(
    (state) => state.agent_companion.command_palette_open,
  );
  const agents = useAppSelector(
    (state) => state.agent_companion.agents_catalog,
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        dispatch(setCommandPaletteOpen(!open));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch, open]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => dispatch(setCommandPaletteOpen(nextOpen))}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs" />
        <Dialog.Content
          aria-label="Sineva Companion Command Palette"
          className="fixed top-[16%] left-1/2 z-50 w-[92vw] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] shadow-2xl focus:outline-hidden"
        >
          <Dialog.Title className="sr-only">
            Sineva Companion Command Palette
          </Dialog.Title>
          <Command className="w-full">
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3.5">
              <Search className="h-4 w-4 text-[var(--color-text-muted)]" />
              <Command.Input
                placeholder="Jump to @SinoFinance, @SinoPeople, switch orchestrator mode, or inspect OpenAPI..."
                className="w-full bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-hidden"
              />
              <button
                type="button"
                onClick={() => dispatch(setCommandPaletteOpen(false))}
                className="rounded-lg p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
                aria-label="Close command palette"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <Command.List className="max-h-80 overflow-y-auto p-2">
              <Command.Empty className="py-8 text-center text-sm text-[var(--color-text-muted)]">
                No matching Sineva companions or commands found.
              </Command.Empty>

              <Command.Group
                heading="Specialized AI Companions"
                className="px-2 py-1.5 text-xs font-semibold tracking-wider text-[var(--color-text-subtle)] uppercase"
              >
                {agents.map((agent) => (
                  <Command.Item
                    key={agent.agent_slug}
                    value={`${agent.display_name} ${agent.agent_slug} ${agent.role_title}`}
                    onSelect={() => {
                      dispatch(setSelectedAgentSlug(agent.agent_slug));
                      dispatch(setCommandPaletteOpen(false));
                    }}
                    className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-sm text-[var(--color-text)] aria-selected:bg-[var(--color-surface-muted)]"
                  >
                    <div className="flex items-center gap-2.5">
                      <Bot className="h-4 w-4 text-[var(--color-action-primary)]" />
                      <div>
                        <span className="font-semibold">
                          @{agent.display_name}
                        </span>
                        <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                          {agent.role_title}
                        </span>
                      </div>
                    </div>
                    <Badge tone="teal">{agent.avg_latency_ms}ms</Badge>
                  </Command.Item>
                ))}
              </Command.Group>

              <Command.Group
                heading="Orchestrator & Developer Tools"
                className="mt-2 px-2 py-1.5 text-xs font-semibold tracking-wider text-[var(--color-text-subtle)] uppercase"
              >
                <Command.Item
                  value="Switch to Autonomous Multi-Agent Handoff"
                  onSelect={() => {
                    dispatch(setOrchestratorMode('autonomous_handoff'));
                    dispatch(setCommandPaletteOpen(false));
                  }}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-[var(--color-text)] aria-selected:bg-[var(--color-surface-muted)]"
                >
                  <Sparkles className="h-4 w-4 text-[var(--color-action-primary)]" />
                  <span>Enable Autonomous Multi-Agent Handoff</span>
                </Command.Item>

                <Command.Item
                  value="Open Swagger UI OpenAPI 3.1 Documentation"
                  onSelect={() => {
                    dispatch(setCommandPaletteOpen(false));
                    router.push('/api-docs');
                  }}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-[var(--color-text)] aria-selected:bg-[var(--color-surface-muted)]"
                >
                  <FileCode2 className="h-4 w-4 text-[var(--color-action-primary)]" />
                  <span>Open Swagger UI (/api-docs)</span>
                </Command.Item>

                <Command.Item
                  value="Inspect Raw Health Check Endpoint /api/v1/health"
                  onSelect={() => {
                    dispatch(setCommandPaletteOpen(false));
                    window.open('/api/v1/health', '_blank');
                  }}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-[var(--color-text)] aria-selected:bg-[var(--color-surface-muted)]"
                >
                  <Terminal className="h-4 w-4 text-[var(--color-action-primary)]" />
                  <span>Inspect /api/v1/health JSON Envelope</span>
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
