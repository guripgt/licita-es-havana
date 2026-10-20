import { describe, it, expect } from 'vitest';
import { situationBadge } from './situation';

const now = new Date('2026-10-19T22:30:00'); // 22h30 em Brasília: em UTC já seria dia 20

describe('situationBadge', () => {
  it('prazo futuro → recebendo propostas', () => {
    expect(situationBadge({ status_id: 1, status: 'Divulgada no PNCP', closing_date: '2026-11-03T08:29' }, now))
      .toMatchObject({ label: 'Recebendo propostas', tone: 'open' });
  });

  it('prazo ainda hoje à noite continua aberto (horário local)', () => {
    expect(situationBadge({ status_id: 1, status: 'Divulgada no PNCP', closing_date: '2026-10-19T23:59' }, now).tone).toBe('open');
  });

  it('prazo vencido → prazo encerrado', () => {
    expect(situationBadge({ status_id: 1, status: 'Divulgada no PNCP', closing_date: '2026-10-19T08:00' }, now))
      .toMatchObject({ label: 'Prazo encerrado', tone: 'closed' });
  });

  it('revogada, anulada e suspensa usam a situação do PNCP', () => {
    expect(situationBadge({ status_id: 2, status: 'Revogada', closing_date: '2026-11-03T08:29' }, now)).toMatchObject({ label: 'Revogada', tone: 'closed' });
    expect(situationBadge({ status_id: 3, status: 'Anulada', closing_date: null }, now)).toMatchObject({ label: 'Anulada', tone: 'closed' });
    expect(situationBadge({ status_id: 4, status: 'Suspensa', closing_date: null }, now)).toMatchObject({ label: 'Suspensa', tone: 'pending' });
  });

  it('sem prazo informado mostra a situação do PNCP', () => {
    expect(situationBadge({ status_id: 1, status: 'Divulgada no PNCP', closing_date: null }, now))
      .toMatchObject({ label: 'Divulgada no PNCP', tone: 'pending' });
  });
});
