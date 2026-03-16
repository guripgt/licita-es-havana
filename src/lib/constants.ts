export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('pt-BR');
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

export const MODALITIES = [
  'Pregão Eletrônico',
  'Pregão Presencial',
  'Concorrência',
  'Tomada de Preços',
  'Convite',
  'Dispensa de Licitação',
  'Inexigibilidade',
  'Leilão',
  'Diálogo Competitivo',
] as const;

export const STATUS_OPTIONS = [
  'Aberto',
  'Em andamento',
  'Encerrado',
  'Suspenso',
  'Cancelado',
  'Deserto',
] as const;
