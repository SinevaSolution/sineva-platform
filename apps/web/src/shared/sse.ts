// Server-Sent Events framing shared by the relay (server) and the stream
// helper (browser). Pure string handling, no DOM or Node APIs, so both sides
// parse and write exactly the same wire format.

export interface SseFrame {
  /** SSE `id:` (the per-run sequence). Absent on events the relay adds itself. */
  id?: string;
  event: string;
  /** Raw `data:` payload; multiple `data:` lines are joined with `\n`. */
  data: string;
}

export type SseItem =
  | { kind: 'frame'; frame: SseFrame }
  /** A `:` line. sineva-ai sends one every 15 s as a heartbeat. */
  | { kind: 'comment'; text: string };

/**
 * Incremental parser: feed it decoded text in any chunking and it returns the
 * frames and comments completed so far.
 *
 * Deviation from the SSE spec on purpose: `flush()` dispatches a final frame
 * that lacks its closing blank line. The spec discards it, but the sineva-ai
 * error transcript fixture ends that way and dropping it would hide the
 * terminal `error` event, which is the one frame that must never be lost.
 */
export class SseParser {
  private buffer = '';
  private id: string | undefined;
  private event = '';
  private data: string[] = [];
  private hasData = false;

  push(chunk: string): SseItem[] {
    this.buffer += chunk;
    const items: SseItem[] = [];
    for (;;) {
      const line = this.nextLine(false);
      if (line === null) break;
      this.consume(line, items);
    }
    return items;
  }

  flush(): SseItem[] {
    const items: SseItem[] = [];
    for (;;) {
      const line = this.nextLine(true);
      if (line === null) break;
      this.consume(line, items);
    }
    this.dispatch(items);
    return items;
  }

  // Lines end in \n, \r\n or a lone \r. A trailing \r is held back until the
  // next chunk shows whether a \n follows, unless the stream is ending.
  private nextLine(ending: boolean): string | null {
    const match = /\r\n|\n|\r/.exec(this.buffer);
    if (!match) {
      if (ending && this.buffer.length > 0) {
        const rest = this.buffer;
        this.buffer = '';
        return rest;
      }
      return null;
    }
    if (match[0] === '\r' && match.index === this.buffer.length - 1 && !ending) {
      return null;
    }
    const line = this.buffer.slice(0, match.index);
    this.buffer = this.buffer.slice(match.index + match[0].length);
    return line;
  }

  private consume(line: string, items: SseItem[]): void {
    if (line === '') {
      this.dispatch(items);
      return;
    }
    if (line.startsWith(':')) {
      items.push({ kind: 'comment', text: line.slice(1).trimStart() });
      return;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'id') {
      this.id = value;
    } else if (field === 'event') {
      this.event = value;
    } else if (field === 'data') {
      this.data.push(value);
      this.hasData = true;
    }
    // `retry:` and unknown fields are ignored: reconnect timing is the
    // client helper's own backoff.
  }

  private dispatch(items: SseItem[]): void {
    if (this.hasData) {
      const frame: SseFrame = {
        event: this.event || 'message',
        data: this.data.join('\n'),
      };
      if (this.id !== undefined) frame.id = this.id;
      items.push({ kind: 'frame', frame });
    }
    // The id persists across frames per spec only for reconnection purposes;
    // each frame here carries its own, so reset all per-frame state.
    this.id = undefined;
    this.event = '';
    this.data = [];
    this.hasData = false;
  }
}

export function encodeSseFrame(frame: SseFrame): string {
  const lines: string[] = [];
  if (frame.id !== undefined) lines.push(`id: ${frame.id}`);
  lines.push(`event: ${frame.event}`);
  for (const part of frame.data.split('\n')) lines.push(`data: ${part}`);
  return `${lines.join('\n')}\n\n`;
}

export function encodeSseComment(text: string): string {
  return `: ${text}\n\n`;
}
