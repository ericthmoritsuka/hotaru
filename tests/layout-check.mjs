// Checks the page chrome after the 2026-11-27 design and QA review (header,
// skip link, landmarks, focus ring, tap targets, head tags) in headless
// Chromium, against the built pages served from this folder and a stand-in
// for Supabase. Nothing touches the real project.
//
// Covers: at 360, 390, 721, 768, 900, 1024 and 1280 px the header keeps the
// cart icon on screen at 44 px, the five nav links reachable, and no
// sideways page scroll; from 1001 px the logo is centered; there is a skip
// link as the first Tab stop, one main landmark and labeled navs; the focus
// ring is the 3 px navy one on light surfaces; the nav and breadcrumb links
// are at least 24 px tall; the FAQ section keeps its padding; the hero says
// Avulsas and its second button goes to the sealed products; og:image and
// og:url are absolute.
//
// Run: python3 build.py && PLAYWRIGHT=/path/to/node_modules/playwright node tests/layout-check.mjs [screenshot-folder]

import assert from 'node:assert/strict';
import {join} from 'node:path';

import {ORIGIN, chromium, noSideways, open, runner, startServer} from './helpers.mjs';

const SHOTS = process.argv[2] || null;
const {check, done} = runner();
const server = await startServer();
const browser = await chromium.launch();

const PAGES = ['index', 'avulsas', 'selados', 'blog', 'sobre', 'ajuda', 'pedido', 'meus-pedidos', '404'];
const WIDTHS = [360, 390, 721, 768, 900, 1024, 1280];

try {
	for (const width of WIDTHS) {
		const {context, errors, page} = await open(browser, {height: 800, width}, {});

		await check(`${width} px: the header keeps the cart on screen at 44 px, five nav links, no sideways scroll`, async () => {
			for (const name of PAGES) {
				await page.goto(`${ORIGIN}/${name}.html`);
				await page.waitForLoadState('networkidle');
				await noSideways(page, assert, `${width} px ${name}`);

				const head = await page.evaluate(() => {
					const box = (selector) => {
						const rect = document.querySelector(selector).getBoundingClientRect();

						return {bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right, width: rect.width};
					};
					const nav = document.querySelector('.nav');

					return {brand: box('.brand'), cart: box('.cart-link'), links: [...nav.querySelectorAll('a')].map((link) => link.textContent.trim()), navFits: nav.scrollWidth <= nav.clientWidth + 1, navScrolls: getComputedStyle(nav).overflowX};
				});

				assert.ok(head.cart.width >= 44 && head.cart.height >= 44, `${width} px ${name}: cart is ${head.cart.width}x${head.cart.height}`);
				assert.ok(head.cart.right <= width + 12.5 && head.cart.left >= 0, `${width} px ${name}: cart leaves the screen (${head.cart.left}..${head.cart.right})`);
				assert.deepEqual(head.links, ['Início', 'Cartas', 'Selados', 'Blog', 'Sobre nós']);

				if (width > 1000) {
					assert.ok(head.navFits, `${width} px ${name}: the nav does not fit its column`);
					assert.ok(Math.abs((head.brand.left + head.brand.right) / 2 - width / 2) <= 2, `${width} px ${name}: the logo is off center (${(head.brand.left + head.brand.right) / 2} of ${width / 2})`);
				}
			}

			if (SHOTS) {
				await page.goto(`${ORIGIN}/index.html`);
				await page.screenshot({path: join(SHOTS, `cabecalho-${width}.png`)});
			}
		});

		assert.deepEqual(errors, [], `${width} px: no page errors`);
		await context.close();
	}

	const {context, errors, page} = await open(browser, {height: 844, width: 390}, {});

	await page.goto(`${ORIGIN}/index.html`);

	await check('the skip link is the first Tab stop and leads to the one main landmark; navs are labeled', async () => {
		await page.keyboard.press('Tab');
		assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
		assert.equal(await page.locator('.skip').getAttribute('href'), '#conteudo');
		assert.equal(await page.locator('main#conteudo').count(), 1);
		assert.equal(await page.locator('main').count(), 1);

		const navs = await page.evaluate(() => [...document.querySelectorAll('nav')].map((nav) => nav.getAttribute('aria-label')));

		assert.ok(navs.every(Boolean), `a nav has no label: ${navs}`);
		await page.keyboard.press('Enter');
		assert.equal(await page.evaluate(() => location.hash), '#conteudo');
	});

	await check('the keyboard focus ring is 3 px navy on light surfaces and lime on navy ones', async () => {
		const ring = await page.evaluate(() => {
			const link = document.querySelector('.nav a');

			link.focus({focusVisible: true});

			const style = getComputedStyle(link);

			return {color: style.outlineColor, width: style.outlineWidth};
		});

		assert.equal(ring.width, '3px');
		assert.equal(ring.color, 'rgb(14, 31, 71)');

		const hero = await page.evaluate(() => {
			const link = document.querySelector('.hero .btn');

			link.focus({focusVisible: true});

			return getComputedStyle(link).outlineColor;
		});

		assert.equal(hero, 'rgb(214, 242, 75)');
	});

	await check('nav links and breadcrumb links are at least 24 px tall', async () => {
		assert.ok(await page.evaluate(() => [...document.querySelectorAll('.nav a')].every((link) => link.getBoundingClientRect().height >= 24)));
		await page.goto(`${ORIGIN}/avulsas.html`);
		assert.ok(await page.evaluate(() => [...document.querySelectorAll('.crumbs a')].every((link) => link.getBoundingClientRect().height >= 24)));
	});

	await check('the hero says Avulsas and its second button goes to the sealed products in the same tab', async () => {
		await page.goto(`${ORIGIN}/index.html`);
		assert.equal((await page.locator('.hero-cards .tcard .label').allTextContents()).join(), 'Avulsas,Selados');

		const second = page.locator('.hero .btn-ghost');

		assert.equal(await second.textContent(), 'Ver os selados');
		assert.equal(await second.getAttribute('href'), 'selados.html');
		assert.equal(await second.getAttribute('target'), null);
	});

	await check('the FAQ section keeps its own top and bottom padding', async () => {
		await page.goto(`${ORIGIN}/ajuda.html`);

		const padding = await page.evaluate(() => {
			const style = getComputedStyle(document.querySelector('#faq'));

			return [parseFloat(style.paddingTop), parseFloat(style.paddingBottom)];
		});

		assert.ok(padding[0] >= 40 && padding[1] >= 40, `FAQ padding is ${padding}`);
	});

	await check('og:image and og:url are absolute, and the footer has no long dash', async () => {
		await page.goto(`${ORIGIN}/avulsas.html`);
		assert.equal(await page.locator('meta[property="og:image"]').getAttribute('content'), 'https://lojahotaru.com.br/assets/og-image.jpg');
		assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'), 'https://lojahotaru.com.br/avulsas.html');
		assert.match(await page.locator('meta[property="og:description"]').getAttribute('content'), /cartas avulsas/i);
		assert.ok(!(await page.locator('.foot-bot').textContent()).includes('—'));
		await page.goto(`${ORIGIN}/index.html`);
		assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'), 'https://lojahotaru.com.br/');
	});

	assert.deepEqual(errors, [], 'no page errors');
	await context.close();
}
finally {
	await browser.close();
	server.kill();
}

done();
