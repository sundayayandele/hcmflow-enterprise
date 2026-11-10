import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('employee payslip archive respects payment day, switches ownership and downloads PDF', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Payslips', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My payslips', exact: true })).toBeVisible();
  const locked = page.getByRole('button', { name: 'Available on payment day', exact: true });
  await expect(locked.first()).toBeDisabled();
  await page.getByRole('button', { name: 'View payslip', exact: true }).first().click();
  await expect(page.getByRole('article', { name: 'Payslip document' })).toContainText('LAG001');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toContain('LAG001');
  const pdf = await fs.readFile((await download.path())!);
  expect(pdf.toString('ascii').startsWith('%PDF-1.4')).toBeTruthy();
  expect(pdf.toString('ascii')).toContain('SIMULATION - NOT FOR PAYMENT');
  await page.getByLabel('Demo employee', { exact: true }).selectOption('demo-2');
  await expect(page.getByRole('article', { name: 'Payslip document' })).toHaveCount(0);
  await expect(page.locator('.payslip-list')).not.toContainText('LAG001');
  await expect(page.locator('.payslip-list')).toContainText('LAG002');
  const count = await locked.count();
  await page.getByRole('button', { name: 'Simulate payment day', exact: true }).click();
  expect(await locked.count()).toBeLessThan(count);
  await page.getByRole('button', { name: 'Reset to today', exact: true }).click();
  await expect(locked).toHaveCount(count);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});
