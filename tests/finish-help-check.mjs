// Checks the finish explainer on HOTARU's card tags (assets/catalogo.js,
// FINISH_HELP, Eric 2026-11-26) in headless Chromium, against the built pages
// served from this folder and a stand-in for the Supabase calls. Nothing
// touches the real project.
//
// Covers: a Holo or Reverse Holo tag is a button and other finishes stay a
// plain tag; tapping a tag on a phone opens the explainer without opening the
// card, with the right title and the right drawn card highlighted, inside the
// screen; tapping it again, tapping outside, and Escape close it; the card
// page's tag, facts row, Também à venda, and buy line; the cart; the kit
// page; the home carousel; hover on a desktop; no sideways scrolling.
//
// Run: python3 build.py && PLAYWRIGHT=/path/to/node_modules/playwright node tests/finish-help-check.mjs [screenshot-folder]

import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT || 'playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.argv[2] || null;
const PORT = 8000 + Math.floor(Math.random() * 900);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SUPABASE = 'https://ehdkbxrjxsypegbtrxbw.supabase.co';

const listing = (id, cardId, name, number, finish, fields = {}) => ({card_id: cardId, catalog: 'international', condition: 'Near Mint', description: null, finish, id, image_path: `tcgdex/pt/sv/30th/${number}.webp`, in_kit: false, kind: 'single', language: 'pt', name, number, price_brl: 10, published_at: '2026-11-25T10:00:00Z', rarity: 'Rare', set_name: '30 anos', ...fields});

// The four finishes the live catalog carries, plus one with no explainer.
const CATALOG = [
	listing('c-lug', '30th-121', 'Lugia', '121', 'Holo', {price_brl: 40}),
	listing('c-lux', 'me03-028', 'Luxray', '028', 'Reverse holo', {price_brl: 30}),
	listing('c-lux-n', 'me03-028', 'Luxray', '028', 'Normal', {price_brl: 3}),
	listing('c-mew', '30th-158', 'Mew ex', '158', 'Holo, 30th anniversary stamp', {price_brl: 50}),
	listing('c-cha', 'base1-4', 'Charmander', '046', '1st edition', {price_brl: 20}),
	listing('c-hoh', '30th-012', 'Ho-Oh', '012', 'Holo', {in_kit: true}),
	listing('c-pik', '30th-025', 'Pikachu', '025', 'Normal', {in_kit: true}),
];

const KIT = '11111111-2222-4333-8444-555555555555';
const kitRow = () => ({
	description: null,
	discount_pct: 10,
	id: KIT,
	items: ['c-hoh', 'c-pik'].map((id) => {
		const row = CATALOG.find((one) => one.id === id);

		return {card_id: row.card_id, condition: row.condition, finish: row.finish, image_path: row.image_path, language: 'pt', listing_id: id, name: row.name, number: row.number, price_brl: 10, set_name: row.set_name};
	}),
	name: 'Dupla dos 30 anos',
	price: 18,
	sum: 20,
});

function startServer() {
	const child = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {cwd: ROOT, stdio: 'ignore'});

	return new Promise((resolve) => setTimeout(() => resolve(child), 800));
}

async function open(browser, viewport) {
	const context = await browser.newContext({hasTouch: viewport.width < 600, isMobile: viewport.width < 600, viewport});
	const page = await context.newPage();
	const errors = [];

	page.on('pageerror', (err) => errors.push(err.message));
	await context.route('**/*', (route) => {
		const url = route.request().url();

		if (url.startsWith(ORIGIN)) {
			return route.continue();
		}

		if (url.startsWith(`${SUPABASE}/storage/`)) {
			const hue = [...url].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;

			return route.fulfill({body: `<svg xmlns="http://www.w3.org/2000/svg" width="63" height="88"><rect width="63" height="88" rx="4" fill="hsl(${hue} 60% 55%)" stroke="#fff" stroke-width="3"/></svg>`, contentType: 'image/svg+xml'});
		}

		if (!url.startsWith(`${SUPABASE}/rest/v1/rpc/`)) {
			return route.abort();
		}

		const name = url.split('/rpc/')[1];
		const json = (body) => route.fulfill({body: JSON.stringify(body), contentType: 'application/json'});

		if (name === 'store_catalog') {
			return json(CATALOG);
		}

		if (name === 'store_bundles') {
			return json([kitRow()]);
		}

		if (name === 'listing_status') {
			return json(Object.fromEntries((route.request().postDataJSON()?.ids || []).map((id) => [id, 'available'])));
		}

		return json([]);
	});

	return {context, errors, page};
}

const plain = (text) => String(text).replace(/\s+/g, ' ').trim();

async function noSideways(page, label) {
	const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

	assert.ok(wide <= 0, `${label} scrolls sideways by ${wide}px`);
}

async function insideScreen(page, label) {
	const box = await page.locator('#finish-pop').boundingBox();
	const {height, width} = page.viewportSize();

	assert.ok(box, `${label}: no explainer box`);
	assert.ok(box.x >= 16 && box.x + box.width <= width - 16, `${label}: explainer leaves the 16px gutter (${box.x}..${box.x + box.width} of ${width})`);
	assert.ok(box.y >= 0 && box.y + box.height <= height, `${label}: explainer leaves the screen vertically`);
}

const tileTag = (page, name) => page.locator('.card-item', {has: page.locator('h3', {hasText: name})}).locator('.finish-tag').first();

let passed = 0;

async function check(label, run) {
	await run();
	passed++;
	console.log(`ok - ${label}`);
}

const server = await startServer();
const browser = await chromium.launch();

try {
	const {context, errors, page} = await open(browser, {height: 844, width: 390});

	await page.goto(`${ORIGIN}/avulsas.html`);
	await page.locator('.card-item h3', {hasText: 'Lugia'}).first().waitFor();

	await check('Holo and Reverse Holo tags are buttons; other finishes stay a plain tag', async () => {
		assert.equal(await tileTag(page, 'Lugia').evaluate((node) => node.tagName), 'BUTTON');
		assert.equal(await tileTag(page, 'Mew ex').evaluate((node) => node.tagName), 'BUTTON');
		assert.equal(await tileTag(page, 'Charmander').evaluate((node) => node.tagName), 'SPAN');
		assert.equal(await page.locator('.card-item', {has: page.locator('h3', {hasText: 'Luxray'})}).count(), 2);
		assert.equal(await page.locator('.card-shot .finish-tag-help').count(), 0, 'no button inside the photo link');
	});

	await check('tapping a Reverse Holo tag opens the explainer and stays on the page', async () => {
		const tag = page.locator('.card-item .finish-tag-help[data-finish-kind="reverse"]').first();

		await tag.scrollIntoViewIfNeeded();
		await tag.tap();
		await page.locator('#finish-pop').waitFor({state: 'visible'});
		assert.equal(new URL(page.url()).pathname, '/avulsas.html');
		assert.equal(plain(await page.locator('.finish-pop-title').textContent()), 'Reverse Holo');
		assert.match(plain(await page.locator('.finish-pop-text').textContent()), /ilustração não brilha/);
		assert.equal(plain(await page.locator('.finish-mini.is-current figcaption').textContent()), 'Reverse Holo');
		assert.equal(await tag.getAttribute('aria-expanded'), 'true');
		await insideScreen(page, 'phone grid');
		await noSideways(page, 'avulsas with the explainer open');

		if (SHOTS) {
			await page.screenshot({path: join(SHOTS, 'phone-reverse.png')});
		}
	});

	await check('tapping the same tag again closes it; a tap outside closes it', async () => {
		const tag = page.locator('.card-item .finish-tag-help[data-finish-kind="reverse"]').first();

		await tag.tap();
		assert.ok(await page.locator('#finish-pop').isHidden());
		assert.equal(await tag.getAttribute('aria-expanded'), 'false');

		const holo = tileTag(page, 'Lugia');

		await holo.scrollIntoViewIfNeeded();
		await holo.tap();
		await page.locator('#finish-pop').waitFor({state: 'visible'});
		assert.equal(plain(await page.locator('.finish-pop-title').textContent()), 'Holo');
		assert.equal(plain(await page.locator('.finish-mini.is-current figcaption').textContent()), 'Holo');

		if (SHOTS) {
			await page.screenshot({path: join(SHOTS, 'phone-holo.png')});
		}

		await page.locator('.finish-pop-text').tap();
		assert.ok(await page.locator('#finish-pop').isVisible(), 'a tap inside keeps it open');
		await page.locator('h1, h2').first().tap();
		assert.ok(await page.locator('#finish-pop').isHidden());
	});

	await check('Escape closes it and gives focus back to the tag', async () => {
		const holo = tileTag(page, 'Lugia');

		await holo.focus();
		await page.keyboard.press('Enter');
		await page.locator('#finish-pop').waitFor({state: 'visible'});
		await page.keyboard.press('Escape');
		assert.ok(await page.locator('#finish-pop').isHidden());
		assert.ok(await holo.evaluate((node) => node === document.activeElement));
	});

	await check('the card page tag opens the explainer', async () => {
		await page.goto(`${ORIGIN}/carta.html?c=me03-028&l=pt&a=${encodeURIComponent('Reverse Holo')}`);

		const tag = page.locator('.card-detail .finish-tag-help');

		await tag.waitFor();
		await tag.tap();
		await page.locator('#finish-pop').waitFor({state: 'visible'});
		assert.equal(plain(await page.locator('.finish-pop-title').textContent()), 'Reverse Holo');
		await insideScreen(page, 'card page');
		await noSideways(page, 'card page with the explainer open');

		if (SHOTS) {
			await page.screenshot({path: join(SHOTS, 'phone-card-page.png')});
		}
	});

	await check('on the card page, the facts row, Também à venda, and the buy line each open it', async () => {
		await page.goto(`${ORIGIN}/carta.html?c=me03-028&l=pt&a=Normal`);
		await page.locator('.card-facts').waitFor();
		assert.equal(await page.locator('.card-facts .finish-help').count(), 0, 'Normal has no explainer');
		assert.equal(await page.locator('.buy-box .finish-help').count(), 0, 'Normal buy line has no explainer');

		const other = page.locator('.other-finishes .finish-help');

		assert.equal(await other.count(), 1);
		await other.tap();
		await page.locator('#finish-pop').waitFor({state: 'visible'});
		assert.equal(plain(await page.locator('.finish-pop-title').textContent()), 'Reverse Holo');
		assert.equal(new URL(page.url()).search, '?c=me03-028&l=pt&a=Normal', 'the ? beside the link does not follow it');
		await insideScreen(page, 'Também à venda');

		await page.goto(`${ORIGIN}/carta.html?c=me03-028&l=pt&a=${encodeURIComponent('Reverse Holo')}`);

		for (const where of ['.card-facts', '.buy-box']) {
			const help = page.locator(`${where} .finish-help`);

			await help.waitFor();
			await help.scrollIntoViewIfNeeded();
			await help.tap();
			await page.locator('#finish-pop').waitFor({state: 'visible'});
			assert.equal(plain(await page.locator('.finish-pop-title').textContent()), 'Reverse Holo', where);
			await insideScreen(page, where);
			await page.locator('h1').tap();
			assert.ok(await page.locator('#finish-pop').isHidden(), `${where}: closes on a tap outside`);
		}

		if (SHOTS) {
			await page.locator('.card-facts .finish-help').tap();
			await page.screenshot({path: join(SHOTS, 'phone-card-facts.png')});
			await page.locator('h1').tap();
		}

		await noSideways(page, 'card page');
	});

	await check('the cart and the kit page open it beside a Holo finish', async () => {
		await page.locator('.buy-box .buy-add').first().tap();
		await page.goto(`${ORIGIN}/pedido.html`);

		const cartHelp = page.locator('.cart-meta .finish-help');

		await cartHelp.waitFor();
		await cartHelp.tap();
		await page.locator('#finish-pop').waitFor({state: 'visible'});
		assert.equal(plain(await page.locator('.finish-pop-title').textContent()), 'Reverse Holo');
		await insideScreen(page, 'cart');
		await noSideways(page, 'cart');

		await page.goto(`${ORIGIN}/kit.html?id=${KIT}`);

		const kitHelp = page.locator('.kit-card-meta .finish-help');

		await kitHelp.waitFor();
		assert.equal(await kitHelp.count(), 1, 'only the Holo card in the kit');
		await kitHelp.scrollIntoViewIfNeeded();
		await kitHelp.tap();
		await page.locator('#finish-pop').waitFor({state: 'visible'});
		assert.equal(plain(await page.locator('.finish-pop-title').textContent()), 'Holo');
		assert.equal(new URL(page.url()).pathname, '/kit.html');
		await insideScreen(page, 'kit page');
		await noSideways(page, 'kit page');
	});

	await check('the home carousel tag opens the explainer without opening the card', async () => {
		await page.goto(`${ORIGIN}/index.html`);

		const tag = page.locator('.carousel .finish-tag-help').first();

		await tag.waitFor();
		await tag.scrollIntoViewIfNeeded();
		await tag.tap();
		await page.locator('#finish-pop').waitFor({state: 'visible'});
		assert.equal(new URL(page.url()).pathname, '/index.html');
		await insideScreen(page, 'home carousel');
		await noSideways(page, 'home with the explainer open');
	});

	assert.deepEqual(errors, [], 'no page errors on the phone');
	await context.close();

	const desk = await open(browser, {height: 900, width: 1440});

	await desk.page.goto(`${ORIGIN}/avulsas.html`);
	await desk.page.locator('.card-item h3', {hasText: 'Lugia'}).first().waitFor();

	await check('on a desktop, hovering a tag opens it and moving away closes it', async () => {
		const tag = tileTag(desk.page, 'Lugia');

		await tag.hover();
		await desk.page.locator('#finish-pop').waitFor({state: 'visible'});
		assert.equal(plain(await desk.page.locator('.finish-pop-title').textContent()), 'Holo');
		await insideScreen(desk.page, 'desktop grid');

		if (SHOTS) {
			await desk.page.screenshot({path: join(SHOTS, 'desktop-holo.png')});
		}

		await desk.page.mouse.move(5, 5);
		await desk.page.locator('#finish-pop').waitFor({state: 'hidden'});
	});

	await check('on a desktop, clicking a tag does not open the card', async () => {
		const tag = tileTag(desk.page, 'Mew ex');

		await tag.click();
		await desk.page.locator('#finish-pop').waitFor({state: 'visible'});
		assert.equal(new URL(desk.page.url()).pathname, '/avulsas.html');
	});

	assert.deepEqual(desk.errors, [], 'no page errors on the desktop');
	await desk.context.close();
}
finally {
	await browser.close();
	server.kill();
}

console.log(`${passed} checks passed`);
