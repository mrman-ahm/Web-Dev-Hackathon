import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const localSupabase = /^http:\/\/(localhost|127\.0\.0\.1):\d+\/?$/.test(process.env.SUPABASE_URL ?? '');

test('workspace CRM persists companies and normalized contacts, version edits and archive actions', async ({ page }) => {
  test.setTimeout(60_000);
  test.skip(!localSupabase, 'This acceptance test writes only to a local Supabase project.');
  await page.setViewportSize({ width: 390, height: 844 });

  const suffix = randomUUID();
  const email = `crm-ui-${suffix}@example.test`;
  const password = 'StrongPassword123!';
  const companyName = `CRM Company ${suffix.slice(0, 8)}`;
  const contactName = `CRM Contact ${suffix.slice(0, 8)}`;

  await page.goto('/signup');
  await page.getByRole('textbox', { name: 'Work email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('textbox', { name: 'Your name' }).fill('CRM UI Owner');
  await page.getByRole('textbox', { name: 'Workspace name' }).fill(`CRM Workspace ${suffix.slice(0, 8)}`);
  const signupResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/auth/signup');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  expect((await signupResponsePromise).status()).toBe(200);
  await page.waitForURL(/\/workspaces\/[0-9a-f-]+\/settings$/);
  await page.getByRole('link', { name: 'Open CRM records' }).click();
  await expect(page.getByRole('heading', { name: 'Companies and contacts' })).toBeVisible();

  await page.getByLabel('Company name').fill(companyName);
  await page.getByLabel('Website').fill('https://example.test');
  const companyResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/companies') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Add company' }).click();
  expect((await companyResponsePromise).status()).toBe(201);
  await expect(page.getByRole('status')).toContainText('Company created.');
  await expect(page.getByRole('heading', { name: companyName })).toBeVisible();

  await page.getByLabel('Contact name').fill(contactName);
  await page.getByLabel('Phone').fill('+1 (202) 555-0147');
  await page.getByLabel('Email').fill(`CRM-${suffix.slice(0, 8)}@example.test`);
  await page.locator('#new-contact-company').selectOption({ label: companyName });
  await page.getByRole('button', { name: 'Add contact' }).click();
  await expect(page.getByRole('status')).toContainText('Contact created.');
  const contactCard = page.locator('article').filter({ has: page.getByRole('heading', { name: contactName }) });
  await expect(contactCard).toContainText('+12025550147');
  await expect(contactCard).toContainText(companyName);

  await contactCard.getByRole('button', { name: 'Edit' }).click();
  const editedContactName = `${contactName} Updated`;
  await page.getByLabel('Contact name').last().fill(editedContactName);
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page.getByRole('status')).toContainText('Contact changes saved.');
  await expect(page.getByRole('heading', { name: editedContactName })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: editedContactName })).toBeVisible();
  await expect(page.getByRole('heading', { name: companyName })).toBeVisible();

  const persistedContactCard = page.locator('article').filter({ has: page.getByRole('heading', { name: editedContactName }) });
  page.once('dialog', (dialog) => dialog.accept());
  await persistedContactCard.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByRole('status')).toContainText('Contact archived.');
  const companyCard = page.locator('article').filter({ has: page.getByRole('heading', { name: companyName }) });
  page.once('dialog', (dialog) => dialog.accept());
  await companyCard.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByRole('status')).toContainText('Company archived.');
  await expect(page.getByRole('heading', { name: companyName })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
