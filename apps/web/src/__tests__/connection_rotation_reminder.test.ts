import { describe, expect, it } from 'vitest';
import { CONNECTION_JOBS, RotationReminderPlanner } from '@/server/application/connections/refresh/connection_jobs';
import { OWNER, WS_A } from './helpers/connections_world';
import { buildApiWorld, type ApiWorld } from './helpers/api_world';

// FR-CONN-30: a pasted key gets a reminder after 90 days, once per key.

const DAY = 86_400_000;
const KEY = 'xnd_development_CANARYabcdefghijklmnopqrstuv1234';

async function saveKey(world: ApiWorld, key = KEY) {
  world.keyHost.accepted.add(key);
  return (await world.saveKey.execute({ context: world.context(OWNER), provider_id: 'xendit', secret: { secret_key: key } })).connection;
}

const planner = (world: ApiWorld) => new RotationReminderPlanner({ connections: world.connections, queue: world.queue });

describe('pasted key rotation reminder (FR-CONN-30)', () => {
  it('does nothing for a key younger than 90 days, queues one job after it, and not twice', async () => {
    const world = buildApiWorld();
    await saveKey(world);
    world.clock.now = new Date(world.clock.now.getTime() + 89 * DAY);
    expect(await planner(world).plan(world.clock.now)).toBe(0);

    world.clock.now = new Date(world.clock.now.getTime() + 2 * DAY);
    expect(await planner(world).plan(world.clock.now)).toBe(1);
    expect(await planner(world).plan(world.clock.now)).toBe(0);
  });

  it('the job puts a system item in the Inbox for the person who set the key up, once per key', async () => {
    const world = buildApiWorld();
    const connection = await saveKey(world);
    world.clock.now = new Date(world.clock.now.getTime() + 91 * DAY);
    await planner(world).plan(world.clock.now);

    const result = await world.runner.runBatch(5);

    expect(result.succeeded).toBe(1);
    expect(world.inbox.items).toHaveLength(1);
    expect(world.inbox.items[0]).toMatchObject({
      kind: 'result',
      workspace_id: WS_A,
      recipient_user_id: OWNER,
      source: { type: 'system', id: connection.id },
      summary_key: 'inbox.sentence.connection_rotation_due',
      summary_params: { provider: 'Xendit' },
    });
    // No email: nothing is broken, it is only time to replace the key.
    expect(world.email.getSentEmails()).toHaveLength(0);
  });

  it('replacing the key restarts the clock', async () => {
    const world = buildApiWorld();
    const connection = await saveKey(world);
    world.clock.now = new Date(world.clock.now.getTime() + 91 * DAY);
    await planner(world).plan(world.clock.now);

    const newKey = 'xnd_development_ROTATEDabcdefghijklmnopqrstu9999';
    world.keyHost.accepted.add(newKey);
    await world.saveKey.execute({ context: world.context(OWNER), provider_id: 'xendit', connection_id: connection.id, secret: { secret_key: newKey } });

    // The pending reminder is for the old key; the new key is not due.
    expect(await planner(world).plan(world.clock.now)).toBe(0);
    world.clock.now = new Date(world.clock.now.getTime() + 91 * DAY);
    expect(await planner(world).plan(world.clock.now)).toBe(1);
  });

  it('skips sign-in connections, revoked connections and connections that need reconnecting', async () => {
    const world = buildApiWorld();
    const key = await saveKey(world);
    const google = await world.connectGoogle();
    await world.connections.update(WS_A, google, { status: 'connected' });
    world.clock.now = new Date(world.clock.now.getTime() + 100 * DAY);
    expect(await planner(world).plan(world.clock.now)).toBe(1); // the key only, not the OAuth connection
    await world.queue.cancel((await world.queue.claim('x', [CONNECTION_JOBS.ROTATION_REMINDER], world.clock.now, 1000))!.id, world.clock.now);

    await world.disconnect.execute({ context: world.context(OWNER), connection_id: key.id });
    const world2 = buildApiWorld();
    const key2 = await saveKey(world2);
    await world2.connections.update(WS_A, key2.id, { status: 'needs_reconnect' });
    world2.clock.now = new Date(world2.clock.now.getTime() + 100 * DAY);
    expect(await planner(world2).plan(world2.clock.now)).toBe(0);
  });

  it('a job for a connection revoked in the meantime sends nothing', async () => {
    const world = buildApiWorld();
    const connection = await saveKey(world);
    world.clock.now = new Date(world.clock.now.getTime() + 91 * DAY);
    await planner(world).plan(world.clock.now);
    await world.disconnect.execute({ context: world.context(OWNER), connection_id: connection.id });
    await world.runner.runBatch(5);
    expect(world.inbox.items).toHaveLength(0);
  });
});
