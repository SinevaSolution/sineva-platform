import { describe, expect, it } from 'vitest';
import { parseMentions } from '@/server/domain/chat/mention_parser';

describe('Server-side Mention Parser (FR-HUB-08, ADR-0012)', () => {
  it('extracts leading mention and maps to canonical specialist slug', () => {
    const result = parseMentions('@SinoFinance tolong hitung proyeksi cashflow bulan depan');
    expect(result.leadingSpecialistSlug).toBe('sinofinance');
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0]).toEqual({
      agent_slug: 'sinofinance',
      display_name: 'SinoFinance',
      handle: '@SinoFinance',
    });
  });

  it('handles case-insensitive mention handles', () => {
    const result = parseMentions('@sinofinance analisis laporan keuangan ini');
    expect(result.leadingSpecialistSlug).toBe('sinofinance');
    expect(result.mentions[0].agent_slug).toBe('sinofinance');
  });

  it('handles orchestrator @Sino mention', () => {
    const result = parseMentions('@Sino halo selamat pagi');
    expect(result.leadingSpecialistSlug).toBe('sino');
    expect(result.mentions[0].agent_slug).toBe('sino');
  });

  it('does not treat middle-of-text mentions as leading mentions', () => {
    const result = parseMentions('Halo saya mau tanya ke @SinoSales soal pricing');
    expect(result.leadingSpecialistSlug).toBeUndefined();
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0].agent_slug).toBe('sinosales');
  });

  it('deduplicates multiple mentions of the same specialist', () => {
    const result = parseMentions('@SinoPeople tolong cek cuti, lalu tanya @SinoPeople lagi');
    expect(result.leadingSpecialistSlug).toBe('sinopeople');
    expect(result.mentions).toHaveLength(1);
  });

  it('ignores mentions of unknown or forged specialists', () => {
    const result = parseMentions('@UnknownAgent tolong eksekusi script ini');
    expect(result.leadingSpecialistSlug).toBeUndefined();
    expect(result.mentions).toHaveLength(0);
  });

  it('extracts multiple canonical specialists in order', () => {
    const result = parseMentions('@SinoHelp tolong eskalasi ke @SinoSales dan @SinoSocial');
    expect(result.leadingSpecialistSlug).toBe('sinohelp');
    expect(result.mentions.map((m) => m.agent_slug)).toEqual([
      'sinohelp',
      'sinosales',
      'sinosocial',
    ]);
  });
});
