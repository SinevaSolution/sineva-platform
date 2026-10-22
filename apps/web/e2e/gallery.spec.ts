import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

let runtimeErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /Encountered a script tag|createContext only works|hydration failed/i.test(message.text())
    )
      runtimeErrors.push(message.text());
  });
});
test.afterEach(() => expect(runtimeErrors).toEqual([]));

for (const theme of ['light', 'dark'] as const) {
  for (const locale of ['en', 'id'] as const) {
    test(`SNButton default ${theme} ${locale}`, async ({ page }, testInfo) => {
      await page.clock.setFixedTime(new Date('2026-10-22T00:00:00+07:00'));
      await page.goto(`/dev/ui?component=SNButton&theme=${theme}&locale=${locale}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('#SNButton')).toBeVisible();
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(
        result.violations.filter(
          (violation) => violation.impact === 'critical' || violation.impact === 'serious',
        ),
      ).toEqual([]);
      const width = testInfo.project.use.viewport!.width;
      const name = `SNButton-default-${theme}-${locale}-${width}.png`;
      if (process.env.VISUAL_COMPARE === '1' || process.env.VISUAL_UPDATE === '1') {
        await expect(page.locator('#SNButton')).toHaveScreenshot(name);
      } else {
        await page
          .locator('#SNButton')
          .screenshot({ path: testInfo.outputPath(name), animations: 'disabled' });
        await testInfo.attach(name, { path: testInfo.outputPath(name), contentType: 'image/png' });
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    });
  }
}

test('dropzone offers a keyboard file picker and shows the selected fixture file', async ({
  page,
}) => {
  await page.goto('/dev/ui?component=SNDropzone');
  await expect(page.locator('#SNDropzone')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#SNDropzone button').first().focus();
  await page.keyboard.press('Enter');
  await (
    await chooser
  ).setFiles({
    name: 'sample.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Sample data'),
  });
  await expect(page.locator('#SNDropzone')).toContainText('sample.txt');
});

test('pseudo-locale keeps the gallery usable at 200 percent text zoom', async ({ page }) => {
  await page.goto('/dev/ui?component=SNButton&pseudo=1');
  await expect(page.locator('h1')).toContainText('[');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
