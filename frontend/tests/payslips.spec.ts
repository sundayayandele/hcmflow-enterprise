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
  const document = page.getByRole('article', { name: 'Payslip document' });
  await expect(document.getByRole('heading', { name: 'HCMFlow Demo Company' })).toBeVisible();
  await expect(document.getByRole('region', { name: 'Salary bank account' })).toContainText(
    'DEMO-LAG001',
  );
  const table = document.getByRole('table', { name: 'Salary breakdown and deductions' });
  await expect(table.getByRole('row')).toHaveCount(7);
  await expect(table.getByRole('row', { name: /Net pay/ })).toContainText('635,000.00');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toContain('LAG001');
  const pdf = await fs.readFile((await download.path())!);
  expect(pdf.toString('ascii').startsWith('%PDF-1.4')).toBeTruthy();
  expect(pdf.toString('ascii')).toContain('SIMULATION - NOT FOR PAYMENT');
  expect(pdf.toString('ascii')).toContain('HCMFlow Demo Company');
  expect(pdf.toString('ascii')).toContain('DEMO-LAG001');
  await page.getByLabel('Demo employee', { exact: true }).selectOption('demo-2');
  await expect(page.getByRole('article', { name: 'Payslip document' })).toHaveCount(0);
  await expect(page.locator('.payslip-list')).not.toContainText('LAG001');
  await expect(page.locator('.payslip-list')).toContainText('LAG002');
  await page.getByRole('button', { name: 'View payslip', exact: true }).first().click();
  await expect(table.getByRole('row', { name: /Sample salary/ })).toContainText('420,000.00');
  await expect(table.getByRole('row', { name: /Net pay/ })).toContainText('405,000.00');
  await expect(document.getByRole('region', { name: 'Salary bank account' })).toContainText(
    'DEMO-LAG002',
  );
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
