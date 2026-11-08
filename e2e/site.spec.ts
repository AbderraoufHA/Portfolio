import { expect, test } from '@playwright/test';

test.describe('home', () => {
  test('renders the hero, navigation and metadata', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/INFO ABDOU/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('production systems');
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'start a project' }).first()).toBeVisible();

    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description?.length ?? 0).toBeGreaterThan(40);

    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toMatch(/^http:\/\/127\.0\.0\.1:4321\/$/);

    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogImage).toMatch(/^http:\/\/127\.0\.0\.1:4321\/images\/og-default\.webp$/);

    const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(jsonLd).toContain('"@type":"Person"');
  });

  test('theme toggle switches and persists', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await page.locator('[data-theme-toggle]').first().click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('light');

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  test('command palette opens, filters and closes', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');

    const dialog = page.locator('dialog[data-palette]');
    await expect(dialog).toHaveJSProperty('open', true);

    const input = page.locator('[data-palette-input]');
    await input.fill('edge');
    await expect(page.locator('[data-palette-item]:visible').first()).toContainText('EdgeMetrics');

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveJSProperty('open', false);
  });

  test('sections are reachable from the header', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'work', exact: true }).click();
    await expect(page.locator('#work')).toBeInViewport();
  });
});

test.describe('projects', () => {
  test('lists projects and filters by search', async ({ page }) => {
    await page.goto('/projects/');

    const cards = page.locator('[data-project-card]');
    const initial = await cards.count();
    expect(initial).toBeGreaterThanOrEqual(3);

    const search = page.getByRole('searchbox', { name: 'Search projects' });
    await search.fill('zzzz-no-match');
    await expect(page.locator('[data-project-card]:visible')).toHaveCount(0);
    await expect(page.locator('[data-project-empty]')).toBeVisible();

    await search.fill('');
    await expect(page.locator('[data-project-card]:visible')).toHaveCount(initial);
  });

  test('filters by tag', async ({ page }) => {
    await page.goto('/projects/');
    const tag = page.locator('[data-filter-tag]').nth(1);
    const label = (await tag.textContent())?.trim() ?? '';
    await tag.click();
    await expect(tag).toHaveAttribute('aria-pressed', 'true');

    const cards = page.locator('[data-project-card]:visible');
    expect(await cards.count()).toBeGreaterThan(0);
    for (const card of await cards.all()) {
      expect(((await card.getAttribute('data-tags')) ?? '').toLowerCase()).toContain(label.toLowerCase());
    }
  });
});

test.describe('case study', () => {
  test('renders content, metrics and demo tabs', async ({ page }) => {
    await page.goto('/projects/edge-metrics/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('EdgeMetrics');
    await expect(page.locator('#demos')).toBeVisible();

    const tabs = page.getByRole('tab');
    expect(await tabs.count()).toBeGreaterThanOrEqual(2);

    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    const panel = page.locator('[role="tabpanel"]:visible');
    await expect(panel.locator('iframe')).toHaveAttribute('src', /\/demos\//);
    await expect(panel.locator('iframe')).toHaveAttribute('sandbox', /allow-scripts/);
  });

  test('has next/previous navigation', async ({ page }) => {
    await page.goto('/projects/edge-metrics/');
    const nav = page.getByRole('navigation', { name: /project/i });
    await expect(nav.first()).toBeVisible();
  });
});

test.describe('static endpoints', () => {
  for (const [path, type] of [
    ['/sitemap.xml', /xml/],
    ['/rss.xml', /xml/],
    ['/robots.txt', /text\/plain/],
    ['/site.webmanifest', /json/],
    ['/favicon.svg', /svg/],
    ['/apple-touch-icon.png', /png/],
    ['/cv.pdf', /pdf/],
  ] as const) {
    test(`${path} responds`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type'] ?? '').toMatch(type);
    });
  }

  test('sitemap lists the home page and projects', async ({ request }) => {
    const body = await (await request.get('/sitemap.xml')).text();
    expect(body).toContain('<urlset');
    expect(body).toContain('/projects/edge-metrics');
  });

  test('robots points at the sitemap', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text();
    expect(body).toMatch(/Sitemap: https?:\/\//);
  });
});

test.describe('admin', () => {
  test('is noindex and explains the placeholder binding', async ({ page }) => {
    await page.goto('/admin/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Admin is not configured');
    await expect(page.getByRole('banner')).toHaveCount(0);
  });
});

test.describe('404', () => {
  test('returns a real 404 page', async ({ page }) => {
    const response = await page.goto('/this-path-does-not-exist/');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Nothing at this path');
    await expect(page.getByRole('link', { name: 'back home' })).toBeVisible();
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('shows the sticky CTA and the mobile menu', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /start a project/i }).last()).toBeVisible();

    const menu = page.locator('details[data-mobile-menu]');
    await menu.locator('summary').click();
    await expect(menu.getByRole('link', { name: 'about' })).toBeVisible();
  });
});
