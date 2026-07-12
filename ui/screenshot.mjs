import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // Mock API
  await page.route('**/*', async (route, request) => {
    const url = request.url();
    if (url.match(/\/version(\?.*)?$/)) return route.fulfill({ status: 200, body: JSON.stringify({ version: '1.0.0' }) });
    if (url.match(/\/network\/interfaces(\?.*)?$/)) return route.fulfill({ status: 200, body: JSON.stringify({ interfaces: [{ name: 'eth0', type: 'ethernet', state: 'up', ipv4_address: '192.168.1.100' }] }) });
    if (url.match(/\/network\/status(\?.*)?$/)) return route.fulfill({ status: 200, body: JSON.stringify({ connected: true, internet: true, interface: 'eth0' }) });
    if (url.match(/\/locales(\?.*)?$/)) return route.fulfill({ status: 200, body: JSON.stringify([{ id: 'pt_BR.UTF-8', name: 'Português (Brasil)' }]) });
    if (url.match(/\/countries(\?.*)?$/)) return route.fulfill({ status: 200, body: JSON.stringify([{ id: 'BR', name: 'Brasil' }]) });
    
    // Ignore external font/icon requests to avoid hanging
    if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
       return route.continue();
    }
    
    route.continue();
  });

  console.log("Navigating to app...");
  await page.goto('http://localhost:5173');
  
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshot-welcome.png' });
  console.log("Saved screenshot-welcome.png");

  // Click Start
  await page.click('button.btn-primary');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'screenshot-eula.png' });
  console.log("Saved screenshot-eula.png");

  await browser.close();
})();
