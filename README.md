# Licitações Havana

Controle pessoal de licitações: busca editais no PNCP (Portal Nacional de Contratações Públicas),
organiza oportunidades num funil e guarda os documentos da empresa.

**App:** https://guripgt.github.io/licita-es-havana/

## Como funciona

- A busca usa a mesma busca do portal do PNCP (pncp.gov.br/app/editais), direto do navegador —
  palavra-chave, situação, UF e modalidade são filtradas no servidor do PNCP e o resultado chega em
  menos de 1 segundo. Se ela falhar, o app usa a API oficial de consultas (mais lenta) como plano B.
  Não há servidor próprio nem login.
- A estrela guarda a licitação em **Favoritos** (menu lateral). A pasta salva no **Funil Operacional**
  (e no Dashboard); para desistir, use **Remover do funil** no cartão do funil, no Dashboard, no detalhe
  do processo ou clicando de novo na pasta na busca.
- Processos salvos, notas, funil, documentos e configurações ficam guardados **neste navegador**
  (IndexedDB). Use **Configurações → Exportar backup** com frequência e **Importar backup**
  para levar os dados para outro computador ou navegador.
- Dicas de busca: use aspas para frase exata (`"material de limpeza"`); o campo "Excluir termos"
  remove resultados com aquelas palavras.
- Ao buscar por palavra-chave, cada licitação mostra logo abaixo (linha cinza) os itens do edital que
  contêm a palavra: número do item, descrição, quantidade, valor unitário e valor total.

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
