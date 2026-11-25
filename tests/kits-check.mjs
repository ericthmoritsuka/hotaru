// Checks HOTARU's kits (assets/catalogo.js, Eric 2026-11-25) in headless
// Chromium at phone width, against the built pages served from this folder
// and a stand-in for the Supabase calls (store_catalog, store_bundles,
// listing_status, place_order, order_status), shaped as
// pokemon-card-tracker's supabase/store-bundles.sql answers them. Nothing
// touches the real project.
//
// Covers: the Kits section on the home page and at the top of avulsas.html;
// a single taken from a copy outside the kit; kit.html; a kit put in the cart
// takes out the same copies added as singles; the cart's kit line, count,
// and total; place_order with bundles; a kit gone from the catalog in an
// open cart; a kit's lines in My orders; and no sideways scrolling.
//
// Run: python3 build.py && PLAYWRIGHT=/path/to/node_modules/playwright node tests/kits-check.mjs

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
const KIT = '11111111-2222-4333-8444-555555555555';

const listing = (id, cardId, name, number, fields = {}) => ({card_id: cardId, catalog: 'international', condition: 'Near Mint', description: null, finish: null, id, image_path: `tcgdex/en/mep/${number}.webp`, in_kit: false, kind: 'single', language: 'en', name, number, price_brl: 5, published_at: '2026-11-25T10:00:00Z', rarity: 'Promo', set_name: 'MEP Black Star Promos', ...fields});

// Sprigatito has two copies, one in the kit; Fuecoco and Quaxly one each,
// both in the kit; Pikachu is only a single.
const CATALOG = [
	listing('c-spr-kit', 'mep-001', 'Sprigatito', '001', {in_kit: true}),
	listing('c-spr-free', 'mep-001', 'Sprigatito', '001'),
	listing('c-fue', 'mep-002', 'Fuecoco', '002', {in_kit: true}),
	listing('c-qua', 'mep-003', 'Quaxly', '003', {in_kit: true}),
	listing('c-pika', 'mep-025', 'Pikachu', '025', {price_brl: 9}),
];

const kitRow = () => ({
	description: 'As três iniciais de **Paldea**.',
	discount_pct: 5,
	id: KIT,
	items: ['c-spr-kit', 'c-fue', 'c-qua'].map((id) => {
		const row = CATALOG.find((one) => one.id === id);

		return {card_id: row.card_id, condition: row.condition, finish: null, image_path: row.image_path, language: 'en', listing_id: id, name: row.name, number: row.number, price_brl: 5, set_name: row.set_name};
	}),
	name: 'Trio inicial MEP',
	price: 14.25,
	sum: 15,
});

function startServer() {
	const child = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {cwd: ROOT, stdio: 'ignore'});

	return new Promise((resolve) => setTimeout(() => resolve(child), 800));
}

// A phone with the Supabase stand-in. state.kitLive false takes the kit off
// the catalog and marks Fuecoco reserved, as an order by someone else would.
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

		// A card-shaped picture in a color of its own, so the fan shows.
		if (url.startsWith(`${SUPABASE}/storage/`)) {
			const hue = [...url].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;

			return route.fulfill({body: `<svg xmlns="http://www.w3.org/2000/svg" width="63" height="88"><rect width="63" height="88" rx="4" fill="hsl(${hue} 60% 55%)" stroke="#fff" stroke-width="3"/></svg>`, contentType: 'image/svg+xml'});
		}

		if (!url.startsWith(`${SUPABASE}/rest/v1/rpc/`)) {
			return route.abort();
		}

		const name = url.split('/rpc/')[1];
		const args = route.request().postDataJSON() || {};
		const json = (body) => route.fulfill({body: JSON.stringify(body), contentType: 'application/json'});

		state.calls.push([name, args]);

		if (name === 'store_catalog') {
			return json(CATALOG.filter((row) => state.kitLive || row.id !== 'c-fue'));
		}

		if (name === 'store_bundles') {
			return json(state.kitLive ? [kitRow()] : []);
		}

		if (name === 'store_sealed') {
			return json([]);
		}

		if (name === 'listing_status') {
			return json(Object.fromEntries(args.ids.map((id) => [id, !state.kitLive && id === 'c-fue' ? 'reserved' : 'available'])));
		}

		if (name === 'place_order') {
			return json({code: 'HTR-0042', receipt_token: '99999999-8888-4777-8666-555555555555', reserved_until: new Date(Date.now() + 48 * 3600e3).toISOString(), total: 14.25});
		}

		if (name === 'order_status') {
			const items = kitRow().items.map((item) => ({...item, bundle_id: KIT, bundle_name: 'Trio inicial MEP', kind: 'single', price_brl: 4.75}));

			return json([{code: 'HTR-0042', created_at: new Date().toISOString(), delivered_at: null, items: [{...CATALOG[4], bundle_id: null, bundle_name: null}, ...items], paid_at: null, receipt_at: null, reserved_until: new Date(Date.now() + 40 * 3600e3).toISOString(), status: 'pending', token: args.tokens[0], total: 23.25}]);
		}

		return route.fulfill({body: JSON.stringify({code: 'PGRST202', message: name}), contentType: 'application/json', status: 404});
	});

	return {context, errors, page};
}

const plain = (text) => String(text).replace(/\s+/g, ' ').trim();
const text = async (locator) => plain(await locator.textContent());
const cart = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('hotaru.cart') || '[]'));

async function noSideways(page, label) {
	const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

	assert.ok(wide <= 0, `${label} scrolls sideways by ${wide}px`);
}

let passed = 0;

async function check(label, run) {
	await run();
	passed++;
	console.log(`ok - ${label}`);
}

const server = await startServer();
const browser = await chromium.launch();

try {
	const state = {calls: [], kitLive: true};
	const {context, errors, page} = await phone(browser, state);

	await check('home shows the Kits section with the price, the sum struck, and the percent', async () => {
		await page.goto(`${ORIGIN}/index.html`);
		await page.locator('#kits .kit-item').waitFor();
		assert.equal(await page.locator('#kits').isVisible(), true);

		const tile = page.locator('#kits .kit-item').first();

		assert.equal(await text(tile.locator('h3')), 'Trio inicial MEP');
		assert.equal(await text(tile.locator('.kit-price strong')), 'R$ 14,25');
		assert.equal(await text(tile.locator('.kit-price s')), 'R$ 15,00');
		assert.equal(await text(tile.locator('.kit-tag')), '-5%');
		assert.equal(await tile.locator('.kit-fan .card-pic').count(), 3);
		await noSideways(page, 'home');
		await page.locator('#kits').screenshot({path: `${process.env.SHOTS || '/tmp'}/hotaru-kits-home.png`});
	});

	await check('avulsas.html lists the kits above the cards, and a single comes from a copy outside the kit', async () => {
		await page.goto(`${ORIGIN}/avulsas.html`);
		await page.locator('[data-catalog="kits"] .kit-item').waitFor();
		assert.equal(await text(page.locator('[data-catalog="kits"] h2')), 'Um kit à venda');

		const sprigatito = page.locator('[data-catalog="all"] .card-item', {has: page.locator('h3', {hasText: 'Sprigatito'})});

		await sprigatito.locator('.quick-add').click();
		assert.deepEqual((await cart(page)).map((item) => item.id), ['c-spr-free']);
		await noSideways(page, 'avulsas');
	});

	await check('kit.html shows the cards, and the kit takes the same copies out of the cart', async () => {
		// The buyer also added the kit's own Sprigatito and Fuecoco as singles.
		await page.evaluate(() => {
			const items = JSON.parse(localStorage.getItem('hotaru.cart'));

			items.push({cardId: 'mep-001', condition: 'Near Mint', finish: null, id: 'c-spr-kit', imagePath: null, language: 'en', name: 'Sprigatito', number: '001', price: 5, setName: 'MEP'});
			items.push({cardId: 'mep-002', condition: 'Near Mint', finish: null, id: 'c-fue', imagePath: null, language: 'en', name: 'Fuecoco', number: '002', price: 5, setName: 'MEP'});
			localStorage.setItem('hotaru.cart', JSON.stringify(items));
		});
		await page.goto(`${ORIGIN}/kit.html?id=${KIT}`);
		await page.locator('.kit-detail').waitFor();
		assert.equal(await text(page.locator('.kit-detail h1')), 'Trio inicial MEP');
		assert.equal(await page.locator('.kit-card').count(), 3);
		assert.equal(await text(page.locator('.kit-saving')), 'Separadas, as cartas custam R$ 15,00: no kit, você economiza R$ 0,75.');
		assert.equal(await page.locator('.sealed-description strong').count(), 1, 'the description is formatted');
		await page.locator('.kit-detail .buy-add').click();
		assert.match(await text(page.locator('.buy-status')), /^Kit adicionado\. As 2 cartas avulsas iguais saíram do carrinho/);

		const items = await cart(page);

		assert.deepEqual(items.map((item) => item.id), ['c-spr-free', KIT]);
		assert.deepEqual(items[1].ids, ['c-spr-kit', 'c-fue', 'c-qua']);
		assert.equal(await text(page.locator('[data-cart-count]').first()), '4', 'the header counts the kit\'s cards');
		assert.equal(await page.locator('.kit-detail .buy-add').isDisabled(), true);
		await noSideways(page, 'kit');
		await page.screenshot({fullPage: true, path: `${process.env.SHOTS || '/tmp'}/hotaru-kit-page.png`});
	});

	await check('the cart shows the kit line, counts its cards, and orders it with bundles', async () => {
		await page.goto(`${ORIGIN}/pedido.html`);
		await page.locator(`.cart-item[data-id="${KIT}"]`).waitFor();
		await page.waitForFunction(() => !document.getElementById('order-submit').disabled);
		assert.equal(await text(page.locator(`.cart-item[data-id="${KIT}"] .cart-name`)), 'Kit Trio inicial MEP');
		assert.match(await text(page.locator(`.cart-item[data-id="${KIT}"] .cart-meta`)), /^3 cartas: Sprigatito, Near Mint · Fuecoco/);
		assert.equal(await text(page.locator('.cart-total')), 'Total: R$ 19,25 (4 cartas)');
		assert.equal(await text(page.locator('#order-submit')), 'Fechar pedido com 4 cartas');

		const asked = state.calls.filter(([name]) => name === 'listing_status').pop()[1].ids.sort();

		assert.deepEqual(asked, ['c-fue', 'c-qua', 'c-spr-free', 'c-spr-kit']);
		await noSideways(page, 'pedido');
		await page.fill('#order-name', 'Ana');
		await page.fill('#order-phone', '81 99999-0000');
		await page.click('#order-submit');
		await page.locator('.order-done').waitFor();

		const ordered = state.calls.find(([name]) => name === 'place_order')[1];

		assert.deepEqual(ordered.items, ['c-spr-free']);
		assert.deepEqual(ordered.bundles, [KIT]);
		assert.ok((await page.locator('.order-items').textContent()).includes('Kit Trio inicial MEP (3 cartas: Sprigatito, Fuecoco, Quaxly)'));
		assert.deepEqual(await cart(page), []);
	});

	await check('My orders shows the kit\'s cards as one line', async () => {
		await page.goto(`${ORIGIN}/meus-pedidos.html`);
		await page.locator('#mine-HTR-0042').waitFor();

		const lines = (await page.locator('#mine-HTR-0042 .order-items li').allTextContents()).map(plain);

		assert.equal(lines.length, 2);
		assert.ok(lines[0].startsWith('Pikachu ('));
		assert.equal(lines[1], 'Kit Trio inicial MEP (3 cartas: Sprigatito, Fuecoco, Quaxly) · R$ 14,25');
	});

	await check('a single order still sends no bundles', async () => {
		await page.goto(`${ORIGIN}/avulsas.html`);
		await page.locator('[data-catalog="all"] .card-item').first().waitFor();
		await page.locator('[data-catalog="all"] .card-item', {has: page.locator('h3', {hasText: 'Pikachu'})}).locator('.quick-add').click();
		await page.goto(`${ORIGIN}/pedido.html`);
		await page.waitForFunction(() => !document.getElementById('order-submit').disabled);
		await page.fill('#order-name', 'Bia');
		await page.fill('#order-phone', '81 98888-0000');
		state.calls.length = 0;
		await page.click('#order-submit');
		await page.locator('.order-done').waitFor();

		const ordered = state.calls.find(([name]) => name === 'place_order')[1];

		assert.deepEqual(ordered.items, ['c-pika']);
		assert.equal('bundles' in ordered, false);
	});

	assert.deepEqual(errors, []);
	await context.close();

	// Someone reserved Fuecoco: the kit leaves the catalog, and an open cart
	// with it says so.
	const gone = {calls: [], kitLive: false};
	const second = await phone(browser, gone);

	await check('a kit whose card was reserved leaves the pages, and an open cart warns', async () => {
		await second.page.goto(`${ORIGIN}/index.html`);
		await second.page.locator('#cartas .card-item').first().waitFor();
		assert.equal(await second.page.locator('#kits').isHidden(), true);
		await second.page.goto(`${ORIGIN}/kit.html?id=${KIT}`);
		assert.match(await text(second.page.locator('.card-note')), /^Este kit não está mais à venda/);
		await second.page.evaluate(([id]) => localStorage.setItem('hotaru.cart', JSON.stringify([{id, ids: ['c-spr-kit', 'c-fue', 'c-qua'], imagePath: null, items: [{name: 'Sprigatito'}, {name: 'Fuecoco'}, {name: 'Quaxly'}], kind: 'kit', name: 'Trio inicial MEP', price: 14.25, sum: 15}])), [KIT]);
		await second.page.goto(`${ORIGIN}/pedido.html`);
		await second.page.locator('.cart-warn').waitFor();
		assert.equal(await text(second.page.locator('.cart-warn strong')), 'Kit temporariamente indisponível.');
		assert.equal(await second.page.locator('#order-submit').isDisabled(), true);
	});

	assert.deepEqual(second.errors, []);
	await second.context.close();
	console.log(`\n${passed} checks passed.`);
}
finally {
	await browser.close();
	server.kill();
}
