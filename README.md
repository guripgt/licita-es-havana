# Licitações Havana

Controle pessoal de licitações: busca editais no PNCP (Portal Nacional de Contratações Públicas),
organiza oportunidades num funil e guarda os documentos da empresa.

**App:** https://guripgt.github.io/licita-es-havana/

## Como funciona

- A busca consulta a API pública do PNCP direto do navegador — não há servidor nem login.
- Processos salvos, notas, funil, documentos e configurações ficam guardados **neste navegador**
  (IndexedDB). Use **Configurações → Exportar backup** com frequência e **Importar backup**
  para levar os dados para outro computador ou navegador.
- O PNCP limita a quantidade de consultas por minuto; quando isso acontece, o app espera e tenta
  de novo sozinho. Filtrar por UF e modalidade deixa a busca bem mais rápida.

## Rodar localmente

Requer Node.js 22.

```sh
npm install
npm run dev        # http://localhost:8080
npm test           # testes unitários
npx playwright test  # teste ponta a ponta (usa a API real do PNCP)
```

## Publicação

Cada push na branch `main` roda os testes, gera o build e publica no GitHub Pages
(`.github/workflows/deploy.yml`).
