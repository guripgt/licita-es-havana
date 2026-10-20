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
  homologated_value: number | null;
  status_id: number | null;
}

export type Situation = 'abertas' | 'encerradas' | 'revogadas' | 'anuladas' | 'suspensas' | 'todas';

export interface SearchFilters {
  searchText?: string;
  excludeText?: string;
  /** Código de modalidade do PNCP (1–13). */
  modality?: number;
  situation?: Situation;
  openDateStart?: string;
  openDateEnd?: string;
  closeDateStart?: string;
  closeDateEnd?: string;
  pubDateStart?: string;
  pubDateEnd?: string;
  uf?: string;
  city?: string;
  agency?: string;
  srp?: string;
  minValue?: number;
  maxValue?: number;
}

export interface SourceStatus {
  name: string;
  status: "ok" | "error" | "empty" | "disabled";
  message?: string;
}

