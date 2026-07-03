import { Page } from '@playwright/test';

export async function setupBackendMocks(page: Page) {
  // Fallback for everything else
  await page.route('**/*', async (route, request) => {
    const url = request.url();
    console.log(`MOCK_ROUTE: intercepted ${url}`);
    if (!url.includes(':9323') && !url.includes('/api/') && !url.match(/\/(version|hardware|probe|network|countries|locales|keymaps)/)) {
      return route.continue();
    }
    
    // Continue requests for Vite assets
    if (url.includes('.jsx') || url.includes('.js') || url.includes('.css') || url.includes('src/') || url.includes('@vite')) {
      return route.continue();
    }

    // specific mocks
    if (url.match(/\/version(\?.*)?$/)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ KRYONIX_PRETTY_NAME: 'Kryonix Mocked', KRYONIX_REV: '12345678', KRYONIX_BUILD_TIME: 'Now' }) });
    }
    if (url.match(/\/detection(\?.*)?$/)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ is_kryonix: true, hostname: 'mock-host' }]) });
    }
    if (url.match(/\/hardware(\?.*)?$/)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ is_kryonix: true, hostname: 'mock-host' }]) });
    }
    if (url.match(/\/probe(\?.*)?$/)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        cpu: { model: 'Mock CPU', cores: 4, threads: 8 },
        disks: [{ name: 'Mock Disk', size_gb: 512, path: '/mockdev/mock' }],
        memory_gb: 16,
        boot_mode: 'UEFI',
        network: { internet: true, interface: 'eth0' },
        virtualization: 'None'
      }) });
    }
    if (url.match(/\/network\/status(\?.*)?$/)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        connected: true, internet: true, ip: '192.168.1.100', interface: 'eth0'
      }) });
    }
    if (url.match(/\/network\/interfaces(\?.*)?$/)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        interfaces: [{ name: 'eth0', type: 'ethernet', state: 'up', ipv4_address: '192.168.1.100/24' }]
      }) });
    }
    if (url.match(/\/countries(\?.*)?$/)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ BR: 'Brazil', US: 'United States' }) });
    }
    if (url.match(/\/locales(\?.*)?$/)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ 'en-US': 'English', 'pt-BR': 'Portuguese' }) });
    }
    if (url.match(/\/keymaps(\?.*)?$/)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(['us', 'br']) });
    }

    // Default 200 for any other API route
    if (url.includes('/api/') || url.match(/\/(detection|network|auth|disks|install)/)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    }

    // Otherwise continue
    return route.continue();
  });
}
