import type { Situation } from '@/types/processes';

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/** Converte string da API em Date; datas só-dia são lidas no fuso local, não em UTC. */
function parseDate(date: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(date);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  return parseDate(date).toLocaleDateString('pt-BR');
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return '—';
  return parseDate(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const FUNNEL_STAGES = [
  'Encontrado',
  'Em análise',
  'Oportunidade aprovada',
  'Proposta em preparação',
  'Participando',
  'Execução',
  'Finalizado',
  'Perdido',
  'Cancelado',
] as const;

export const DOCUMENT_CATEGORIES = [
  'Proposta Comercial',
  'Habilitação Jurídica',
  'Documento Fiscal',
  'Documento Técnico',
  'Outros Anexos',
] as const;

export const UF_LIST = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA',
  'PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'
] as const;

export const SITUATION_OPTIONS: { value: Situation; label: string }[] = [
  { value: 'abertas', label: 'Abertas (recebendo propostas)' },
  { value: 'julgamento', label: 'Em julgamento (propostas encerradas)' },
  { value: 'encerradas', label: 'Encerradas' },
  { value: 'revogadas', label: 'Revogadas' },
  { value: 'anuladas', label: 'Anuladas' },
  { value: 'suspensas', label: 'Suspensas' },
  { value: 'todas', label: 'Todas' },
];
