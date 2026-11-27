// Checks 404.html (QA-05 of the 2026-11-27 QA review): the GitHub Pages
// "file not found" page in Portuguese, in the store's layout, with the nav
// and links to the home page and to Cartas, headless Chromium against the
// built page. The deep address check feeds the file to a made-up path the way
// GitHub Pages does, so a relative CSS or link would break there.
//
// Run: python3 build.py && PLAYWRIGHT=/path/to/node_modules/playwright node tests/not-found-check.mjs

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

import {ORIGIN, ROOT, chromium, noSideways, runner, startServer, stub} from './helpers.mjs';

const {check, done} = runner();
const server = await startServer();
const browser = await chromium.launch();

try {
	const context = await browser.newContext({viewport: {height: 800, width: 390}});

	await stub(context, {});

	const page = await context.newPage();
	const errors = [];

	page.on('pageerror', (err) => errors.push(err.message));

	// What GitHub Pages does for an address that does not exist: the same
	// file, whatever the depth, with a 404 status.
	await page.route(`${ORIGIN}/nao/existe/mesmo`, (route) => route.fulfill({body: readFileSync(join(ROOT, '404.html')), contentType: 'text/html; charset=utf-8', status: 404}));
	await page.route(`${ORIGIN}/nao-existe`, (route) => route.fulfill({body: readFileSync(join(ROOT, '404.html')), contentType: 'text/html; charset=utf-8', status: 404}));

	await check('an address two folders deep still gets the store layout (CSS, logo, nav)', async () => {
		await page.goto(`${ORIGIN}/nao/existe/mesmo`);

		const styled = await page.evaluate(() => ({
			bg: getComputedStyle(document.querySelector('.masthead')).backgroundColor,
			h1: getComputedStyle(document.querySelector('h1')).fontFamily,
			logo: document.querySelector('.brand .word').naturalWidth,
		}));

		assert.equal(styled.bg, 'rgb(255, 255, 255)');
		assert.match(styled.h1, /Playfair/);
		assert.ok(styled.logo > 0, 'the logo did not load');
		assert.equal(await page.locator('.nav a').count(), 5);
	});

	await check('it says so in Portuguese, is not indexed, and has a title', async () => {
		await page.goto(`${ORIGIN}/nao-existe`);
		assert.equal(await page.locator('h1').textContent(), 'Página não encontrada');
		assert.equal(await page.title(), 'Página não encontrada | HOTARU');
		assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex');
		assert.equal(await page.locator('html').getAttribute('lang'), 'pt-BR');
	});

	await check('the links go home and to Cartas, from any depth', async () => {
		await page.goto(`${ORIGIN}/nao/existe/mesmo`);
		await page.getByRole('link', {name: 'Ver as cartas'}).click();
		assert.equal(new URL(page.url()).pathname, '/avulsas.html');
		await page.goto(`${ORIGIN}/nao/existe/mesmo`);
		await page.getByRole('link', {name: 'Voltar para o início'}).click();
		assert.equal(new URL(page.url()).pathname, '/index.html');
		await page.goto(`${ORIGIN}/nao/existe/mesmo`);
		await page.locator('.nav a', {hasText: 'Selados'}).click();
		assert.equal(new URL(page.url()).pathname, '/selados.html');
	});

	await check('no sideways scroll at 390 px', async () => {
		await page.goto(`${ORIGIN}/404.html`);
		await noSideways(page, assert, '404');
	});

	assert.deepEqual(errors, [], 'no page errors');
	await context.close();
}
finally {
	await browser.close();
	server.kill();
}

done();
