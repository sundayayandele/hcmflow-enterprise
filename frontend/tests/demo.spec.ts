import { test, expect } from '@playwright/test';
test('demo navigation and synthetic payroll approval journey', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'A good day starts with your people.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'People', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search employees' }).fill('Ada');
  await expect(page.getByText('Ada Okafor')).toBeVisible();
  await expect(page.getByText('Tunde Adeyemi')).not.toBeVisible();
  await page.getByRole('button', { name: 'Configuration', exact: true }).click();
  await page.getByRole('button', { name: 'Add calendar', exact: true }).click();
  await page.getByLabel('Calendar name').fill('November demo');
  await page.getByLabel('start', { exact: true }).fill('2026-11-01');
  await page.getByLabel('end', { exact: true }).fill('2026-11-30');
  await page.getByLabel('cutoff', { exact: true }).fill('2026-11-25');
  await page.getByLabel('pay date', { exact: true }).fill('2026-11-30');
  await page.getByRole('button', { name: 'Save calendar' }).click();
  await page.getByRole('button', { name: 'Add rule', exact: true }).click();
  await page.getByLabel('Version', { exact: true }).fill('SYNTHETIC-DEMO');
  await page.getByLabel('Synthetic source / test reference').fill('Invented demo scenario');
  await page.getByLabel('effective from', { exact: true }).fill('2026-01-01');
  await page.getByLabel('effective to', { exact: true }).fill('2026-12-31');
  await page.getByLabel('Invented test tax percentage').fill('10');
  await page.getByLabel('Invented test pension percentage').fill('5');
  await page.getByRole('button', { name: 'Save rule' }).click();
  await page.getByRole('button', { name: 'Payroll NG', exact: true }).click();
  await page.getByRole('button', { name: 'New preview' }).click();
  await page.getByLabel('Monthly calendar').selectOption({ label: 'November demo' });
  await page.getByLabel('Synthetic rule version').selectOption({ label: 'SYNTHETIC-DEMO' });
  await page.getByRole('button', { name: 'Confirm period inputs & preview' }).click();
  await expect(page.getByText('Awaiting independent review')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve simulation' })).toBeDisabled();
  await page.getByRole('button', { name: /Demo operator/ }).click();
  await page.getByRole('button', { name: 'Approve simulation' }).click();
  await expect(page.getByText('Simulation approved', { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'playwright-report/payroll-demo.png', fullPage: true });
  await page.getByRole('button', { name: 'Readiness', exact: true }).click();
  await expect(page.getByText('Production payroll is disabled in this release.')).toBeVisible();
});
test('mobile navigation has no horizontal document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'A good day starts with your people.' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('button', { name: 'Capability map', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Room to grow. A plan to get there.' }),
  ).toBeVisible();
  await page.screenshot({ path: 'playwright-report/mobile-demo.png', fullPage: true });
});

test('enrichment hub spans eight areas and retains reviewed workflows across navigation', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enrichment hub', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Eight areas. One connected workspace.' }),
  ).toBeVisible();
  await expect(page.locator('.enrichment-tabs > button')).toHaveCount(8);
  await page.getByRole('button', { name: /Daily HR/ }).click();
  const balance = page
    .locator('.hub-form')
    .filter({
      has: page.getByRole('heading', { name: 'Calendar-day leave balances', exact: true }),
    });
  await balance.getByRole('combobox', { name: 'Employee', exact: true }).selectOption('demo-1');
  await balance.getByLabel('Balance year').fill('2026');
  await balance.getByLabel('Calendar-day allowance').fill('20');
  await balance.getByRole('button', { name: 'Set leave balance', exact: true }).click();
  const leave = page
    .locator('.hub-form')
    .filter({ has: page.getByRole('heading', { name: 'Create a leave', exact: true }) });
  await leave.getByRole('combobox', { name: 'Employee', exact: true }).selectOption('demo-1');
  await leave.getByLabel('Title', { exact: true }).fill('Annual leave browser test');
  await leave.getByLabel('Leave start').fill('2026-12-01');
  await leave.getByLabel('Leave end').fill('2026-12-02');
  await leave.getByRole('button', { name: 'Create leave', exact: true }).click();
  const record = page
    .locator('.hub-record')
    .filter({ has: page.getByRole('heading', { name: 'Annual leave browser test' }) });
  await record.getByRole('button', { name: 'approved', exact: true }).click();
  await expect(
    page.getByText('Independent review required. Switch the demo profile to another reviewer.'),
  ).toBeVisible();
  await page.getByRole('button', { name: /Demo operator/ }).click();
  await record.getByRole('button', { name: 'approved', exact: true }).click();
  await expect(record.getByText('approved', { exact: true })).toBeVisible();
  await expect(page.getByText('18 available / 20 calendar days')).toBeVisible();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Enrichment hub', exact: true }).click();
  await expect(record.getByText('approved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Employee lifecycle/ }).click();
  const checklist = page
    .locator('.hub-record')
    .filter({ has: page.getByRole('heading', { name: 'New starter checklist' }) });
  await checklist.getByRole('button', { name: 'in progress', exact: true }).click();
  await checklist.getByRole('button', { name: 'completed', exact: true }).click();
  await expect(page.getByText('Complete all checklist tasks first')).toBeVisible();
  await checklist.getByLabel('Acknowledge policies').check();
  await checklist.getByLabel('Issue equipment').check();
  await checklist.getByRole('button', { name: 'completed', exact: true }).click();
  await expect(checklist.getByText('completed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Enterprise controls/ }).click();
  await expect(page.getByRole('heading', { name: 'Workplace audit history' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export visible audit records' })).toBeEnabled();
  await page.getByRole('button', { name: /Insights & planning/ }).click();
  const scenario = page
    .locator('.hub-form')
    .filter({ has: page.getByRole('heading', { name: 'Staffing cost scenario' }) });
  await scenario.getByLabel('Scenario title').fill('Browser growth scenario');
  await scenario.getByLabel('Base headcount').fill('6');
  await scenario.getByLabel('Planned hires').fill('3');
  await scenario.getByLabel('Planned exits').fill('1');
  await scenario.getByLabel('Average monthly cost per employee (NGN)').fill('125000');
  await scenario.getByRole('button', { name: 'Save scenario' }).click();
  await expect(page.getByText('8 projected staff · ₦1,000,000.00 / month')).toBeVisible();
  await expect(page.getByText('₦12,000,000.00 / year')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'playwright-report/enrichment-demo.png', fullPage: true });
});

test('enrichment is usable on a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('button', { name: 'Enrichment hub', exact: true }).click();
  await page.getByRole('button', { name: /Finance & benefits/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Approvals before finance handoff' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('payroll evidence, employee history, talent and finance increments are interactive', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enrichment hub', exact: true }).click();
  const evidence = page
    .locator('.hub-form')
    .filter({ has: page.getByRole('heading', { name: 'Draft statutory evidence' }) });
  await evidence.getByLabel('Evidence version').fill('BROWSER-DRAFT-001');
  await evidence.getByLabel('Rule title').fill('Synthetic rule review');
  await evidence
    .getByLabel('Authority / reviewer to confirm')
    .fill('Independent specialist pending');
  await evidence.getByLabel('Source reference', { exact: true }).fill('Invented test source');
  await evidence.getByLabel('Effective from', { exact: true }).fill('2026-01-01');
  await evidence.getByLabel('Effective to', { exact: true }).fill('2026-12-31');
  await evidence.getByLabel('Applicable population').fill('Synthetic employees');
  await evidence.getByLabel('Calculation specification').fill('Draft specification only');
  await evidence.getByLabel('Test evidence reference').fill('Synthetic expected results');
  await evidence.getByRole('button', { name: 'Save evidence draft' }).click();
  await expect(page.getByRole('button', { name: 'Review evidence' })).toBeDisabled();
  await page.getByRole('button', { name: /Demo operator/ }).click();
  await page.getByRole('button', { name: 'Review evidence' }).click();
  await expect(
    page.getByText('Evidence metadata reviewed. Production payroll remains disabled.'),
  ).toBeVisible();
  await page.getByRole('button', { name: /People history/ }).click();
  const amendment = page
    .locator('.hub-form')
    .filter({ has: page.getByRole('heading', { name: 'Amend a Core HR record' }) });
  await amendment.getByLabel('Select employee').selectOption('demo-1');
  await amendment.getByLabel('Monthly gross (NGN)').fill('700000');
  await amendment.getByLabel('Change effective from').fill('2026-12-01');
  await amendment.getByLabel('Reason for amendment').fill('Synthetic salary review');
  await amendment.getByRole('button', { name: 'Save dated amendment' }).click();
  await expect(page.getByText('Version 2 · 2026-12-01')).toBeVisible();
  await page.getByRole('button', { name: /Talent & learning/ }).click();
  const learning = page
    .locator('.hub-record')
    .filter({ has: page.getByRole('heading', { name: 'Data privacy induction' }) });
  await learning.getByRole('button', { name: 'completion requested', exact: true }).click();
  await learning.getByRole('button', { name: 'verified', exact: true }).click();
  await expect(page.getByText('A different reviewer must verify completion')).toBeVisible();
  await page.getByRole('button', { name: /Demo reviewer/ }).click();
  await learning.getByRole('button', { name: 'verified', exact: true }).click();
  await expect(learning.getByText('verified', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Finance & benefits/ }).click();
  const claim = page
    .locator('.hub-record')
    .filter({ has: page.getByRole('heading', { name: 'Synthetic training travel' }) });
  await claim.getByRole('button', { name: 'approved', exact: true }).click();
  await expect(
    page.getByText('Independent review required. Switch the demo profile to another reviewer.'),
  ).toBeVisible();
  await page.getByRole('button', { name: /Demo operator/ }).click();
  await claim.getByRole('button', { name: 'approved', exact: true }).click();
  await expect(claim.getByText('approved', { exact: true })).toBeVisible();
});
