import { expect, test } from '@playwright/test';

test.describe('Accueil public', () => {
  test('affiche le titre et les actions principales', async ({ page }) => {
    const reponses: { url: string; status: number }[] = [];
    page.on('response', (res) => {
      const url = res.url();
      if (/\.(png|jpe?g|webp|svg)$/i.test(url) && res.request().resourceType() === 'image') {
        reponses.push({ url, status: res.status() });
      }
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('secteur halieutique');
    await expect(page.getByRole('button', { name: 'Demande de licence' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connexion autorités' }).first()).toBeVisible();

    const casses = reponses.filter((r) => r.status >= 400);
    expect(casses, casses.map((c) => `${c.status} ${c.url}`).join('\n')).toEqual([]);
  });

  test('ouvre l’assistant de demande de licence', async ({ page }) => {
    await page.goto('/');
    await page.locator('.ds-fo-cta-main').click();
    await expect(page.getByRole('heading', { name: 'Demande de licence' })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Pêcheur/i })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Organisation/i })).toBeVisible();
  });

  test('page publique de profil inconnue : Page indisponible', async ({ page }) => {
    await page.route('**/api/v1/public/profils/**', (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { code: 'PROFIL_NOT_FOUND' } }),
      }),
    );
    await page.goto('/profil/jeton-fictif');
    await expect(page.getByText('Page indisponible')).toBeVisible();
  });
});
