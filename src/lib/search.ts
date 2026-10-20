/**
 * Ponto de entrada da busca: usa a busca do portal do PNCP (rápida, filtra no servidor)
 * e, se ela falhar na primeira página, cai para a API oficial de consultas (plano B).
 */

import type { SearchFilters } from '@/types/processes';
import { createConsultaSearch, type SearchBatch, type SearchSession } from './pncp';
import { createPortalSearch } from './pncpSearch';

const FALLBACK_NAME = 'PNCP (modo alternativo)';

export function createSearch(filters: SearchFilters, today: Date = new Date()): SearchSession {
  let active: SearchSession = createPortalSearch(filters, today);
  let decided = false; // já sabemos qual motor usar
  let fallbackReason = '';
  let cancelled = false;

  const tag = (batch: SearchBatch): SearchBatch => (fallbackReason
    ? {
      ...batch,
      sources: batch.sources.map(s => ({
        ...s,
        name: FALLBACK_NAME,
        message: `modo alternativo: a busca do portal falhou (${fallbackReason}); usando a API de consultas, mais lenta${s.message ? ` — ${s.message}` : ''}`,
      })),
    }
    : batch);

  return {
    async next(onProgress) {
      if (!decided) {
        try {
          const batch = await active.next(onProgress);
          decided = true;
          return batch;
        } catch (e) {
          if (cancelled) throw e;
          decided = true;
          fallbackReason = e instanceof Error ? e.message : String(e);
          active = createConsultaSearch(filters, today);
        }
      }
      return tag(await active.next(partial => onProgress?.(tag(partial))));
    },
    cancel() {
      cancelled = true;
      active.cancel();
    },
  };
}
