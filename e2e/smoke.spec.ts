import { test, expect } from "@playwright/test";

// Usa a API real do PNCP: confirma que a busca traz resultados e o funil persiste.
test("busca real no PNCP, salva no funil e persiste após recarregar", async ({ page }) => {
  await page.goto("/#/buscar");
  await page.getByRole("combobox").nth(0).click();
  await page.getByRole("option", { name: "Pregão - Eletrônico" }).click();
  await page.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "SP", exact: true }).click();
  await page.getByRole("button", { name: "Buscar", exact: true }).click();

  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/editais analisados/)).toBeVisible();
  const title = (await firstRow.locator("td").nth(2).innerText()).trim();

  await firstRow.getByRole("button", { name: "Salvar no funil" }).click();
  await expect(page.getByText("Processo salvo no funil!")).toBeVisible();

  await page.goto("/#/funil");
  await expect(page.getByText(title.slice(0, 40)).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(title.slice(0, 40)).first()).toBeVisible();
});

test("processo inexistente mostra aviso", async ({ page }) => {
  await page.goto("/#/licitacao/PNCP/nao-existe");
  await expect(page.getByText("Processo não encontrado.")).toBeVisible();
});
