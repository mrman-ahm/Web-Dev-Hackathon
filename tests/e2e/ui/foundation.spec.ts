import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
  test(`synthetic component preview remains usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/preview');
    await expect(page.getByRole('heading', { name: 'Component workspace' })).toBeVisible();
    await expect(page.getByText('Synthetic preview data', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const menu = page.getByRole('button', { name: 'Open navigation' });
    if (viewport.width < 1024) {
      await menu.click();
      await expect(page.getByRole('navigation', { name: 'Workspace' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
    }
    await page.getByRole('button', { name: 'Open example dialog' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit saved view' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'View name' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Open example dialog' })).toBeFocused();
    await page.getByRole('textbox', { name: 'Work email' }).fill('ops@example.test');
    await page.getByRole('button', { name: 'Validate example form' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Preview input accepted' })).toBeVisible();
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByText('Page 2 of 2 · 3 records')).toBeVisible();
  });
}

test('skip link and main content support keyboard navigation', async ({ page }) => {
  await page.goto('/preview');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
});

test('preview has no detectable WCAG A/AA accessibility violations', async ({ page }) => {
  await page.goto('/preview');
  await expect(page.getByRole('heading', { name: 'Component workspace' })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});
