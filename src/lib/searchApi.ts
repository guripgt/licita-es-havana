/**
 * Cliente para o edge function search-processes.
 * Centraliza chamadas ao backend de busca de licitações.
 */

import { supabase } from '@/integrations/supabase/client';
import type { SearchFilters, SearchResult } from '@/types/processes';

export async function searchProcesses(filters: SearchFilters): Promise<SearchResult> {
  const { data, error } = await supabase.functions.invoke('search-processes', {
    body: filters,
  });

  if (error) {
    console.error('Search function error:', error);
    throw new Error('Erro ao buscar licitações. Tente novamente.');
  }

  return data as SearchResult;
}
