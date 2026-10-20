import { describe, it, expect } from 'vitest';
import { formatDate } from './constants';

describe('formatDate', () => {
  it('mostra data só-dia sem voltar um dia no fuso local', () => {
    expect(formatDate('2026-10-19')).toBe('19/10/2026');
  });

  it('formata data com hora', () => {
    expect(formatDate('2026-11-01T09:00:00')).toBe('01/11/2026');
  });

  it('mostra traço quando vazio', () => {
    expect(formatDate(null)).toBe('—');
  });
});
