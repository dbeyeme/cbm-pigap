import { expect, test } from '@playwright/test';

test('menu mobile visible à 375 px', async ({ page }, info) => {
  test.skip(info.project.name !== 'telephone', 'réservé au projet téléphone');
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Ouvrir le menu' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('accueil lisible à 768 px', async ({ page }, info) => {
  test.skip(info.project.name !== 'tablette', 'réservé au projet tablette');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Services de la plateforme' })).toBeVisible();
});

test('accueil lisible à 1280 px', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'réservé au projet desktop');
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
