// Checks that HOTARU sells a consigned card (someone else's card, sold for a
// commission; pokemon-card-tracker's plans/hotaru-consignment-plan.md) like
// any other card, in headless Chromium at phone width, against the built
// pages served from this folder and a stand-in for the Supabase calls
// (store_catalog, listing_status, place_order) shaped as
// supabase/store-consignment.sql leaves them: a consigned listing is a row
// of kind 'consigned'. Nothing touches the real project.
//
// Covers: a consigned card on avulsas.html and the home page; a consigned
// copy and the owner's own copy of the same card, language, and finish in
// one tile; carta.html for a consigned card; the cart and place_order with
// a consigned copy; and no word of consignment shown to the buyer.
//
// Run: python3 build.py && PLAYWRIGHT=/path/to/node_modules/playwright node tests/consignment-check.mjs

import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT || 'playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8000 + Math.floor(Math.random() * 900);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SUPABASE = 'https://ehdkbxrjxsypegbtrxbw.supabase.co';
const MEW = 'cons-0b5c6f2e-1d2a-4c3b-9e8f-7a6b5c4d3e2f';
const ZARD = 'cons-1c6d7f3e-2e3b-4d4c-8f9a-8b7c6d5e4f3a';

const listing = (id, kind, cardId, name, number, fields = {}) => ({card_id: cardId, catalog: 'international', condition: 'Near Mint', description: null, finish: null, id, image_path: `tcgdex/en/base/base1/${number}.webp`, in_kit: false, kind, language: 'en', name, number, price_brl: 10, published_at: '2026-11-26T10:00:00Z', rarity: 'Rare', set_name: 'Base Set', ...fields});

// Mew is only consigned; Pikachu only Eric's; Charizard both, at two prices.
const CATALOG = [
	listing(MEW, 'consigned', 'base1-151', 'Mew', '151', {price_brl: 30}),
	listing('c-pika', 'single', 'base1-58', 'Pikachu', '58', {price_brl: 9}),
	listing('c-zard', 'single', 'base1-4', 'Charizard', '4', {finish: 'Holo', price_brl: 120}),
	listing(ZARD, 'consigned', 'base1-4', 'Charizard', '4', {finish: 'Holo', price_brl: 100}),
];

function startServer() {
	const child = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {cwd: ROOT, stdio: 'ignore'});

	return new Promise((resolve) => setTimeout(() => resolve(child), 800));
}

async function phone(browser, state) {
	const context = await browser.newContext({viewport: {height: 844, width: 390}});
	const page = await context.newPage();
	const errors = [];

	page.on('pageerror', (err) => errors.push(err.message));
	await context.route('**/*', (route) => {
		const url = route.request().url();

		if (url.startsWith(ORIGIN)) {
			return route.continue();
		}

		if (url.startsWith(`${SUPABASE}/storage/`)) {
			return route.fulfill({body: '<svg xmlns="http://www.w3.org/2000/svg" width="63" height="88"><rect width="63" height="88" rx="4" fill="#c9a227"/></svg>', contentType: 'image/svg+xml'});
		}

		if (!url.startsWith(`${SUPABASE}/rest/v1/rpc/`)) {
			return route.abort();
		}

		const name = url.split('/rpc/')[1];
		const args = route.request().postDataJSON() || {};
		const json = (body) => route.fulfill({body: JSON.stringify(body), contentType: 'application/json'});

		state.calls.push([name, args]);

		if (name === 'store_catalog') {
			return json(CATALOG);
		}

		if (name === 'store_bundles' || name === 'store_sealed' || name === 'store_featured' || name === 'store_posts_public') {
			return json([]);
		}

		if (name === 'listing_status') {
			return json(Object.fromEntries(args.ids.map((id) => [id, 'available'])));
		}

		if (name === 'place_order') {
			return json({code: 'HTR-0050', receipt_token: '99999999-8888-4777-8666-555555555555', reserved_until: new Date(Date.now() + 48 * 3600e3).toISOString(), total: 30});
		}

		return route.fulfill({body: JSON.stringify({code: 'PGRST202', message: name}), contentType: 'application/json', status: 404});
	});

	return {context, errors, page};
}

const plain = (text) => String(text).replace(/\s+/g, ' ').trim();
const text = async (locator) => plain(await locator.textContent());
const cart = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('hotaru.cart') || '[]'));
const noConsignWords = async (page, label) => {
	const body = await page.evaluate(() => document.body.innerText);

	assert.doesNotMatch(body, /consign/i, `${label} tells the buyer about consignment`);
};

let passed = 0;

async function check(label, run) {
	await run();
	passed++;
	console.log(`ok - ${label}`);
}

const server = await startServer();
const browser = await chromium.launch();

try {
	const state = {calls: []};
	const {context, errors, page} = await phone(browser, state);
	const tile = (name) => page.locator('[data-catalog="all"] .card-item', {has: page.locator('h3', {hasText: name})});

	await check('avulsas.html lists a consigned card like any other, and one tile for a card both ways', async () => {
		await page.goto(`${ORIGIN}/avulsas.html`);
		await tile('Mew').waitFor();
		assert.equal(await tile('Mew').count(), 1, 'Mew, consigned only, is listed');
		assert.equal(await tile('Pikachu').count(), 1);
		assert.equal(await tile('Charizard').count(), 1, 'the owner\'s and the consigned Charizard share a tile');
		assert.match(await text(tile('Charizard')), /R\$ 100,00/, 'the tile shows the lower price');
		await noConsignWords(page, 'avulsas.html');
	});

	await check('the home page shows the consigned card too', async () => {
		await page.goto(`${ORIGIN}/index.html`);
		await page.locator('.card-item', {has: page.locator('h3', {hasText: 'Mew'})}).first().waitFor();
		await noConsignWords(page, 'home');
	});

	await check('carta.html opens a consigned card', async () => {
		await page.goto(`${ORIGIN}/carta.html?c=base1-151&l=en`);
		await page.locator('h1', {hasText: 'Mew'}).waitFor();
		assert.match(await page.evaluate(() => document.body.innerText), /R\$\s30,00/);
		await noConsignWords(page, 'carta.html');
	});

	await check('a consigned copy goes in the cart and is ordered by its listing ID', async () => {
		await page.goto(`${ORIGIN}/avulsas.html`);
		await tile('Mew').locator('.quick-add').click();
		assert.deepEqual((await cart(page)).map((item) => item.id), [MEW]);
		await page.goto(`${ORIGIN}/pedido.html`);
		await page.locator(`.cart-item[data-id="${MEW}"]`).waitFor();
		await page.waitForFunction(() => !document.getElementById('order-submit').disabled);
		assert.equal(await text(page.locator('.cart-total')), 'Total: R$ 30,00 (1 carta)');
		await noConsignWords(page, 'pedido.html');
		await page.fill('#order-name', 'Ana');
		await page.fill('#order-phone', '81 99999-0000');
		await page.click('#order-submit');
		await page.locator('.order-done').waitFor();
		assert.deepEqual(state.calls.find(([name]) => name === 'place_order')[1].items, [MEW]);
		await page.screenshot({fullPage: true, path: `${process.env.SHOTS || '/tmp'}/hotaru-consignment-order.png`});
	});

	assert.deepEqual(errors, []);
	await context.close();
	console.log(`\n${passed} checks passed.`);
}
finally {
	await browser.close();
	server.kill();
}
