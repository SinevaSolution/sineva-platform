import { describe, expect, it } from 'vitest';
import { getActionType, validatePayload } from '@/server/domain/approvals/action_types';
import { gatewayApprovalPayloadSchema } from '@/server/domain/toolgateway/gmail_approval';
const payload = {
  gateway_call_id: '11111111-1111-4111-8111-111111111111',
  connection_id: '22222222-2222-4222-8222-222222222222',
  request: {
    tool_name: 'gmail_send_message',
    arguments: { to: ['you@example.com'], subject: 'Hello', body_text: 'Test email' },
    run_id: 'run_33333333-3333-4333-8333-333333333333',
    call_id: 'call-1',
    mode: 'live',
  },
};
describe('Gmail approvals are executable types with sealed gateway bindings', () => {
  it.each(['email.send', 'email.draft.create', 'email.read', 'email.search'])(
    'registers %s as an executing action',
    (type) => {
      expect(getActionType(type)).toMatchObject({
        executes: true,
        autonomy_eligible: false,
        editable_fields: [],
      });
    },
  );
  it('validates the gateway binding and rejects changed action types', () => {
    expect(validatePayload('email.send', payload)).toEqual({ ok: true });
    expect(validatePayload('email.read', payload).ok).toBe(false);
    expect(
      gatewayApprovalPayloadSchema.safeParse({ ...payload, credentials: 'not allowed' }).success,
    ).toBe(false);
  });
});
