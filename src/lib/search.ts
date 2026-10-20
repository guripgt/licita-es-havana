/**
 * Ponto de entrada da busca: usa a busca do portal do PNCP (rápida, filtra no servidor)
 * e, se ela falhar na primeira página, cai para a API oficial de consultas (plano B).
 * Situações revogada/anulada/suspensa e período de publicação sem palavra-chave vão direto para a
 * API oficial, que filtra isso no servidor (a busca do portal só alcança os 10.000 itens mais
 * recentes; com palavra-chave o resultado do portal é pequeno o bastante).
 */

import type { SearchFilters } from '@/types/processes';
import { createConsultaSearch, type SearchBatch, type SearchSession } from './pncp';
import { createPortalSearch } from './pncpSearch';

const FALLBACK_NAME = 'PNCP (modo alternativo)';

function needsConsulta(f: SearchFilters): boolean {
  const situation = f.situation || 'abertas';
  if (['revogadas', 'anuladas', 'suspensas'].includes(situation)) return true;
  return situation !== 'abertas' && Boolean(f.pubDateStart || f.pubDateEnd) && !f.searchText?.trim();
}

export function createSearch(filters: SearchFilters, today: Date = new Date()): SearchSession {
  if (needsConsulta(filters)) return createConsultaSearch(filters, today);

  let active: SearchSession = createPortalSearch(filters, today);
  let firstBatch: Promise<SearchBatch> | null = null; // decide o motor uma vez só
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

  const runFallback = (onProgress?: (partial: SearchBatch) => void) =>
    active.next(partial => onProgress?.(tag(partial))).then(tag);

  return {
    next(onProgress) {
      if (!firstBatch) {
        firstBatch = active.next(onProgress).catch(e => {
          if (cancelled) throw e;
          fallbackReason = e instanceof Error ? e.message : String(e);
          active = createConsultaSearch(filters, today);
          return runFallback(onProgress);
        });
        return firstBatch;
      }
      return firstBatch.then(() => (fallbackReason ? runFallback(onProgress) : active.next(onProgress)));
    },
    cancel() {
      cancelled = true;
      active.cancel();
    },
  };
}
