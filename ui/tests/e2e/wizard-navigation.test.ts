import { test, expect } from '@playwright/test';
import { setupBackendMocks } from './mocks/mockBackend';

test.describe('Wizard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err));
    await setupBackendMocks(page);
  });

  test('should navigate from Welcome to EULA and then to Source', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // Wait for React to settle and animations to finish
    await page.screenshot({ path: 'screenshot-welcome.png' });

    const nextBtn = page.locator('footer button.btn-primary');
    await expect(nextBtn).toBeVisible({ timeout: 10000 });
    await expect(nextBtn).toBeEnabled({ timeout: 10000 });
    
    // 1. Welcome -> EULA
    await nextBtn.click();

    // Verify EULA step
    const acceptCheckbox = page.getByRole('checkbox').first();
    await acceptCheckbox.waitFor({ state: 'visible' });
    await acceptCheckbox.check();
    
    // 2. EULA -> Source
    await nextBtn.click();

    // Verify Source step
    await expect(acceptCheckbox).toBeHidden();
  });
});
