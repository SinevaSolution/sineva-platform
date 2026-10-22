import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SseParser, encodeSseComment, encodeSseFrame } from '@/shared/sse';

const FIXTURES = resolve(import.meta.dirname, 'contract/fixtures');

function itemsOf(chunks: string[]) {
  const parser = new SseParser();
  const items = chunks.flatMap((c) => parser.push(c));
  items.push(...parser.flush());
  return items;
}

function framesOf(chunks: string[]) {
  return itemsOf(chunks).flatMap((i) => (i.kind === 'frame' ? [i.frame] : []));
}

describe('SseParser and encoder (WP-M0-30, FR-AIR-10)', () => {
  it('parses sse_transcript_text_only.txt into ordered frames with ids', () => {
    const text = readFileSync(resolve(FIXTURES, 'sse_transcript_text_only.txt'), 'utf8');
    const frames = framesOf([text]);
    expect(frames.map((f) => [f.id, f.event])).toEqual([
      ['1', 'token'],
      ['2', 'token'],
      ['3', 'token'],
      ['4', 'done'],
    ]);
    expect(JSON.parse(frames[0]!.data)).toEqual({ token: 'Halo' });
  });

  it('gives the same frames when the stream is split at every character boundary', () => {
    const text = readFileSync(resolve(FIXTURES, 'sse_transcript_with_card.txt'), 'utf8');
    expect(itemsOf(text.split(''))).toEqual(itemsOf([text]));
  });

  it('dispatches a last frame that has no closing blank line (the error fixture ends that way)', () => {
    const text = readFileSync(resolve(FIXTURES, 'sse_transcript_error.txt'), 'utf8');
    const frames = framesOf([text]);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.event).toBe('error');
    expect(JSON.parse(frames[0]!.data).code).toBe('model_unavailable');
  });

  it('surfaces comment lines (heartbeat) separately from frames', () => {
    const items = itemsOf([': heartbeat\n\nid: 1\nevent: token\ndata: {"token":"a"}\n\n']);
    expect(items[0]).toEqual({ kind: 'comment', text: 'heartbeat' });
    expect(items[1]!.kind).toBe('frame');
  });

  it('handles CRLF, multi-line data and a missing event name', () => {
    expect(framesOf(['id: 9\r\ndata: a\r\ndata: b\r\n\r\n'])).toEqual([
      { id: '9', event: 'message', data: 'a\nb' },
    ]);
  });

  it('round-trips through the encoder without changing id, event or data', () => {
    const text = readFileSync(resolve(FIXTURES, 'sse_transcript_text_only.txt'), 'utf8');
    const original = framesOf([text]);
    const encoded = original.map(encodeSseFrame).join('');
    expect(framesOf([encoded])).toEqual(original);
  });

  it('encodes a comment as a single colon line', () => {
    expect(encodeSseComment('heartbeat')).toBe(': heartbeat\n\n');
  });
});
