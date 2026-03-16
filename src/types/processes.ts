/**
 * Tipos compartilhados para processos de licitação.
 * Formato normalizado usado tanto pelo edge function quanto pelo frontend.
 */

export interface NormalizedProcess {
  id: string;
  external_id: string;
  source: "PNCP" | "COMPRAS_GOV";
  title: string;
  object_description: string;
  agency: string;
  government_level: string | null;
  modality: string | null;
  estimated_value: number | null;
  is_srp: boolean | null;
  state: string | null;
  city: string | null;
  publication_date: string | null;
  opening_date: string | null;
  closing_date: string | null;
  status: string | null;
  source_portal: string | null;
  external_url: string | null;
}

export interface SearchFilters {
  searchText?: string;
  excludeText?: string;
  modality?: string;
  openDateStart?: string;
  openDateEnd?: string;
  closeDateStart?: string;
  closeDateEnd?: string;
  uf?: string;
  city?: string;
  agency?: string;
  srp?: string;
  minValue?: number;
  maxValue?: number;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface SourceStatus {
  name: string;
  status: "ok" | "error" | "empty";
  message?: string;
}

export interface SearchResult {
  data: NormalizedProcess[];
  totalRecords: number;
  page: number;
  pageSize: number;
  sources: SourceStatus[];
  demoMode: boolean;
}
