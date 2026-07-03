import { test, expect } from '@playwright/test';
import { setupBackendMocks } from './mocks/mockBackend';

test.describe('Features Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await setupBackendMocks(page);
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    
    page.on('dialog', async dialog => {
      await dialog.accept();
    });
  });

  test('should navigate to System Features and toggle a checkbox', async ({ page }) => {
    test.setTimeout(40000);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const nextBtn = page.locator('footer button.btn-primary');
    await expect(nextBtn).toBeVisible({ timeout: 10000 });
    await expect(nextBtn).toBeEnabled({ timeout: 10000 });
    
    // 1. Welcome -> EULA
    await nextBtn.click();
    
    // 2. EULA -> Source
    const eulaCheckbox = page.getByRole('checkbox').first();
    await eulaCheckbox.waitFor({ state: 'visible' });
    await eulaCheckbox.check();
    await nextBtn.click();

    // 3. Source -> Timezone
    await expect(eulaCheckbox).toBeHidden();
    await nextBtn.click();

    // 4. Timezone -> Network
    await nextBtn.click();

    // 5. Network -> Host Selection
    await page.locator('select#mgmtInterface').selectOption('eth0');
    await nextBtn.click();

    // 6. Host Selection -> Profile
    await nextBtn.click();

    // 7. Profile -> System Features
    await nextBtn.click();

    // 8. System Features (Wait for a checkbox)
    const featureCheckbox = page.getByRole('checkbox').first();
    await featureCheckbox.waitFor({ state: 'visible' });
    
    // Toggle the checkbox
    await featureCheckbox.check();
    await expect(featureCheckbox).toBeChecked();
    
    await featureCheckbox.uncheck();
    await expect(featureCheckbox).not.toBeChecked();
  });
});
