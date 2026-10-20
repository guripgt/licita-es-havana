import type { NormalizedProcess } from '@/types/processes';

export type SituationTone = 'open' | 'closed' | 'pending';

const STATUS_LABELS: Record<number, { label: string; tone: SituationTone }> = {
  2: { label: 'Revogada', tone: 'closed' },
  3: { label: 'Anulada', tone: 'closed' },
  4: { label: 'Suspensa', tone: 'pending' },
};

/** Selo de situação legível: combina a situação do PNCP com o prazo de propostas (no horário local). */
export function situationBadge(
  p: Pick<NormalizedProcess, 'status_id' | 'status' | 'closing_date'>,
  now: Date = new Date(),
): { label: string; tone: SituationTone } {
  if (p.status_id != null && STATUS_LABELS[p.status_id]) return STATUS_LABELS[p.status_id];
  if (p.closing_date) {
    // Datas do PNCP vêm sem fuso e estão no horário de Brasília: new Date() as lê no horário local.
    return new Date(p.closing_date) > now
      ? { label: 'Recebendo propostas', tone: 'open' }
      : { label: 'Prazo encerrado', tone: 'closed' };
  }
  return { label: p.status || 'Sem informação', tone: 'pending' };
}
