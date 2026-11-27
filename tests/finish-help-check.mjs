// Checks the finish explainer on HOTARU's card tags (assets/catalogo.js,
// FINISH_HELP, Eric 2026-11-26) in headless Chromium, against the built pages
// served from this folder and a stand-in for the Supabase calls. Nothing
// touches the real project.
//
// Covers: every badge the tracker can publish for Eric's cards (Poké Ball,
// Master Ball and Cosmos patterns, 1ª Edição, Shadowless, Unlimited, Stamp
// 25 and 30 anos, Promo, Jumbo) gets its community name and, but Jumbo, its
// own explainer; a Holo or Reverse Holo tag is a button; every 30 anos card carries its own one-line Stamp tag, apart
// from the shine tag, with its own explainer showing the real stamp, and
// the card page and the cart list them apart; tapping a tag on
// a phone opens the explainer without opening the card, with the right
// title and the right drawn card highlighted, inside the screen; tapping it
// again, tapping outside, and Escape close it; the card page's tag, facts
// row, Também à venda, and buy line; the cart; the kit page; the home
// carousel; hover on a desktop; no sideways scrolling.
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
	// The rest of the badges the tracker can publish for the cards Eric owns
	// (research of 2026-11-26), as js/prices.js finishName writes them.
	listing('c-exe', 'sv08.5-001', 'Exeggcute', '001', 'Reverse holo, Poké Ball pattern'),
	listing('c-exu', 'sv08.5-002', 'Exeggutor', '002', 'Reverse holo, Master Ball pattern'),
	listing('c-cot', 'mep-018', 'Cottonee', '018', 'Holo, Cosmos foil', {rarity: 'Promo'}),
	listing('c-kof', 'base1-51', 'Koffing', '051', 'Normal, Shadowless, 1st Edition stamp'),
	listing('c-mac', 'base1-34', 'Machoke', '034', 'Unlimited'),
	listing('c-mol', 'base3-27', 'Moltres', '027', '1st Edition'),
	listing('c-zam', 'cel25-18', 'Zamazenta V', '018', 'Holo'),
	listing('c-dra', 'sv06-130', 'Dragapult ex', '130', 'Holo, Jumbo'),
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

// A tile photo carries only the shine pill; edition, stamp, promo and size
// follow as text under the set line, each with its "?" (2026-11-27 design
// review F4). This reads both, pill first, as the labels the buyer sees.
const tileTexts = async (page, name) => {
	const item = page.locator('.card-item', {has: page.locator('h3', {hasText: name})}).first();
	const pills = (await item.locator('.finish-tags .tag').allTextContents()).map(plain);
	const line = (await item.locator('.card-marks').count()) ? plain(await item.locator('.card-marks').textContent()).split(' · ') : [];

	return [...pills, ...line];
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
	const {context, errors, page} = await open(browser, {height: 844, width: 390});

	await page.goto(`${ORIGIN}/avulsas.html`);
	await page.locator('.card-item h3', {hasText: 'Lugia'}).first().waitFor();

	await check('Holo and Reverse Holo tags are buttons; other finishes stay a plain tag', async () => {
		assert.equal(await tileTag(page, 'Lugia').evaluate((node) => node.tagName), 'BUTTON');
		assert.equal(await tileTag(page, 'Mew ex').evaluate((node) => node.tagName), 'BUTTON');
		const dragapult = page.locator('.card-item', {has: page.locator('h3', {hasText: 'Dragapult ex'})});

		assert.equal(plain(await dragapult.locator('.card-marks').textContent()), 'Jumbo');
		assert.equal(await dragapult.locator('.card-marks .finish-help').count(), 0, 'Jumbo has no explainer');
		assert.equal(await page.locator('.card-item', {has: page.locator('h3', {hasText: 'Luxray'})}).count(), 2);
		assert.equal(await page.locator('.card-shot .finish-tag-help').count(), 0, 'no button inside the photo link');
	});

	await check('every 30 anos card has its own Stamp mark, apart from the shine pill on the photo', async () => {
		const photo = (name) => page.locator('.card-item', {has: page.locator('h3', {hasText: name})}).first().locator('.finish-tags .tag');

		assert.deepEqual(await tileTexts(page, 'Lugia'), ['Holo?', 'Stamp 30 anos?'], 'a Holo common recorded without the stamp');
		assert.deepEqual(await tileTexts(page, 'Mew ex'), ['Holo?', 'Stamp 30 anos?'], 'a Holo whose finish names the stamp');
		assert.deepEqual(await tileTexts(page, 'Pikachu'), ['Stamp 30 anos?'], 'a Normal 30 anos card');
		assert.ok(!(await tileTexts(page, 'Luxray')).some((text) => /Stamp/.test(text)), 'no stamp outside the 30 anos set');
		assert.equal(await page.locator('.finish-tags, .card-marks').filter({hasText: /carimbo/i}).count(), 0);
		assert.equal(await photo('Lugia').count(), 1, 'the photo carries only the shine pill');
		assert.equal(await photo('Pikachu').count(), 0, 'a Normal card has no pill on the photo');

		if (SHOTS) {
			await page.locator('.card-item', {has: page.locator('h3', {hasText: 'Mew ex'})}).first().scrollIntoViewIfNeeded();
			await page.screenshot({path: join(SHOTS, 'phone-stamp.png')});
		}
	});

	await check('the card page lists the shine and the stamp apart', async () => {
		await page.goto(`${ORIGIN}/carta.html?c=30th-158&l=pt&a=${encodeURIComponent('Holo, carimbo de 30 anos')}`);
		await page.locator('.card-facts').waitFor();

		const facts = plain(await page.locator('.card-facts').textContent());

		assert.match(facts, /Acabamento ?Holo/);
		assert.match(facts, /Stamp ?30 anos/);
		assert.deepEqual((await page.locator('.card-detail .finish-tags .tag').allTextContents()).map(plain), ['Holo?', 'Stamp 30 anos?']);
		assert.equal((await page.title()).includes('carimbo'), false, 'the page title drops the stamp');

		await page.locator('.card-facts .finish-help[data-finish-kind="stamp30"]').tap();
		await page.locator('#finish-pop').waitFor({state: 'visible'});
		assert.equal(plain(await page.locator('.finish-pop-title').textContent()), 'Stamp 30 anos');
		await page.locator('h1').tap();
		await page.locator('.buy-box .buy-add').first().tap();
		await page.goto(`${ORIGIN}/pedido.html`);

		const cartStamp = page.locator('.cart-meta .finish-help[data-finish-kind="stamp30"]');

		await cartStamp.waitFor();
		await cartStamp.tap();
		await page.locator('#finish-pop').waitFor({state: 'visible'});
		assert.equal(plain(await page.locator('.finish-pop-title').textContent()), 'Stamp 30 anos');
		await page.evaluate(() => localStorage.removeItem('hotaru.cart'));
		await page.goto(`${ORIGIN}/avulsas.html`);
		await page.locator('.card-item h3', {hasText: 'Lugia'}).first().waitFor();
	});

	await check('the Stamp 30 anos tag opens its own explainer with the real stamp', async () => {
		const tag = page.locator('.card-item', {has: page.locator('h3', {hasText: 'Lugia'})}).first().locator('.card-marks .finish-help');

		assert.equal(await tag.getAttribute('data-finish-kind'), 'stamp30');
		await tag.scrollIntoViewIfNeeded();
		await tag.tap();
		await page.locator('#finish-pop').waitFor({state: 'visible'});
		assert.equal(new URL(page.url()).pathname, '/avulsas.html');
		assert.equal(plain(await page.locator('.finish-pop-title').textContent()), 'Stamp 30 anos');
		assert.match(plain(await page.locator('.finish-pop-text').textContent()), /3 e 0 nas bochechas/);
		assert.equal(await page.locator('#finish-pop .finish-mini').count(), 0, 'no drawn cards for the stamp');
		await page.waitForFunction(() => document.querySelector('.finish-pop-stamp')?.complete);
		assert.equal(await page.locator('.finish-pop-stamp').evaluate((img) => img.naturalWidth), 280, 'the stamp picture loads');
		await insideScreen(page, 'stamp explainer');

		if (SHOTS) {
			await page.screenshot({path: join(SHOTS, 'phone-stamp-pop.png')});
		}

		await page.locator('h1').tap();
		assert.ok(await page.locator('#finish-pop').isHidden());
	});

	await check('the marks line stays inside its tile at 390 and 360px', async () => {
		for (const width of [390, 360]) {
			await page.setViewportSize({height: 844, width});

			const bad = await page.evaluate(() => [...document.querySelectorAll('.card-item')].filter((item) => {
				const box = item.getBoundingClientRect();
				const marks = item.querySelector('.card-marks');

				return marks && (marks.scrollWidth > marks.clientWidth + 1 || marks.getBoundingClientRect().right > box.right + 0.5);
			}).map((item) => item.querySelector('h3').textContent));

			assert.deepEqual(bad, [], `at ${width}px a marks line leaves its tile`);
		}

		await page.setViewportSize({height: 844, width: 390});
	});

	await check('each badge the tracker can publish gets its community name', async () => {
		const texts = (name) => tileTexts(page, name);
		const expected = {
			Charmander: ['1ª Edição?'],
			Cottonee: ['Cosmos Holo?', 'Promo?'],
			'Dragapult ex': ['Holo?', 'Jumbo'],
			Exeggcute: ['Poké Ball Reverse Holo?'],
			Exeggutor: ['Master Ball Reverse Holo?'],
			Koffing: ['Shadowless?', '1ª Edição?'],
			Machoke: ['Unlimited?'],
			Moltres: ['1ª Edição?'],
			'Zamazenta V': ['Holo?', 'Stamp 25 anos?'],
		};

		for (const [name, tags] of Object.entries(expected)) {
			assert.deepEqual(await texts(name), tags, name);
		}

		assert.equal(await page.locator('.finish-tags, .card-marks').filter({hasText: /pattern|foil|anniversary|edition|Sem sombra|Ilimitada/i}).count(), 0, 'no tracker words left');

		if (SHOTS) {
			await page.locator('.card-item', {has: page.locator('h3', {hasText: 'Exeggcute'})}).first().scrollIntoViewIfNeeded();
			await page.screenshot({path: join(SHOTS, 'phone-patterns.png')});
		}
	});

	await check('each new badge opens its own explainer', async () => {
		// The pill or the "?" of a mark, found by the explainer it opens.
		const KINDS = {'1ª Edição': 'first', Cosmos: 'holo', Machoke: 'unlimited', 'Poké Ball': 'reverse', 'Master Ball': 'reverse', Promo: 'promo', Shadowless: 'shadowless', 'Stamp 25 anos': 'stamp25', Unlimited: 'unlimited'};
		const open = async (name, label) => {
			const tag = page.locator('.card-item', {has: page.locator('h3', {hasText: name})}).first().locator(`.finish-tags [data-finish-kind="${KINDS[label]}"], .card-marks [data-finish-kind="${KINDS[label]}"]`).first();

			await tag.scrollIntoViewIfNeeded();
			await tag.tap();
			await page.locator('#finish-pop').waitFor({state: 'visible'});
			await insideScreen(page, `${name} ${label}`);
		};
		const title = async () => plain(await page.locator('.finish-pop-title').textContent());
		const text = async () => plain(await page.locator('.finish-pop-text').textContent());
		const current = async () => plain(await page.locator('.finish-mini.is-current figcaption').textContent());
		const picture = async (src, width) => {
			await page.waitForFunction(() => document.querySelector('.finish-pop-stamp')?.complete);
			assert.match(await page.locator('.finish-pop-stamp').getAttribute('src'), new RegExp(src));
			assert.equal(await page.locator('.finish-pop-stamp').evaluate((img) => img.naturalWidth), width, `${src} loads`);
		};
		const shut = async () => {
			await page.locator('h1').tap();
			assert.ok(await page.locator('#finish-pop').isHidden());
		};

		await open('Exeggcute', 'Poké Ball');
		assert.equal(await title(), 'Poké Ball Reverse Holo');
		assert.match(await text(), /^O brilho tem o desenho de várias Poké Balls.*O brilho fica em volta/);
		assert.equal(await current(), 'Reverse Holo');
		await shut();

		await open('Exeggutor', 'Master Ball');
		assert.equal(await title(), 'Master Ball Reverse Holo');
		assert.match(await text(), /Master Balls/);
		await shut();

		await open('Cottonee', 'Cosmos');
		assert.equal(await title(), 'Cosmos Holo');
		assert.match(await text(), /^O brilho tem o padrão Cosmos.*brilho holográfico/);
		assert.equal(await current(), 'Holo');
		await shut();

		await open('Cottonee', 'Promo');
		assert.equal(await title(), 'Promo');
		assert.match(await text(), /estrela preta escrita PROMO/);
		await picture('promo-estrela', 448);

		if (SHOTS) {
			await page.screenshot({path: join(SHOTS, 'phone-promo.png')});
		}

		await shut();

		await open('Moltres', '1ª Edição');
		assert.equal(await title(), '1ª Edição');
		await picture('primeira-edicao', 280);
		await shut();

		await open('Koffing', 'Shadowless');
		assert.equal(await title(), 'Shadowless');
		assert.deepEqual((await page.locator('.finish-mini figcaption').allTextContents()).map(plain), ['Shadowless', 'Unlimited']);
		assert.equal(await current(), 'Shadowless');

		if (SHOTS) {
			await page.screenshot({path: join(SHOTS, 'phone-shadowless.png')});
		}

		await shut();

		await open('Machoke', 'Unlimited');
		assert.equal(await current(), 'Unlimited');
		await shut();

		await open('Zamazenta V', 'Stamp 25 anos');
		assert.equal(await title(), 'Stamp 25 anos');
		assert.match(await text(), /2 e 5 nas bochechas/);
		await picture('stamp-25-anos', 280);

		if (SHOTS) {
			await page.screenshot({path: join(SHOTS, 'phone-stamp25.png')});
		}

		await shut();
	});

	await check('the card page lists edition, promo, and pattern apart, each with its ?', async () => {
		await page.goto(`${ORIGIN}/carta.html?c=base1-51&l=pt&a=${encodeURIComponent('Normal, Shadowless, 1st Edition stamp')}`);
		await page.locator('.card-facts').waitFor();

		let facts = plain(await page.locator('.card-facts').textContent());

		assert.match(facts, /Acabamento ?Normal/);
		assert.match(facts, /Edição ?Shadowless\?, 1ª Edição\?/);
		assert.equal(await page.locator('.card-facts .finish-help').count(), 2);

		await page.goto(`${ORIGIN}/carta.html?c=mep-018&l=pt&a=${encodeURIComponent('Holo, Cosmos foil')}`);
		await page.locator('.card-facts').waitFor();
		facts = plain(await page.locator('.card-facts').textContent());
		assert.match(facts, /Raridade ?Promo\?/);
		assert.match(facts, /Acabamento ?Cosmos Holo\?/);
		assert.match(plain(await page.locator('.buy-label').first().textContent()), /^Near Mint · Cosmos Holo\?/);

		await page.locator('.card-facts .finish-help[data-finish-kind="promo"]').tap();
		await page.locator('#finish-pop').waitFor({state: 'visible'});
		assert.equal(plain(await page.locator('.finish-pop-title').textContent()), 'Promo');
		await page.locator('h1').tap();

		await page.goto(`${ORIGIN}/carta.html?c=sv06-130&l=pt&a=${encodeURIComponent('Holo, Jumbo')}`);
		await page.locator('.card-facts').waitFor();
		assert.match(plain(await page.locator('.card-facts').textContent()), /Tamanho ?Jumbo/);

		await page.goto(`${ORIGIN}/avulsas.html`);
		await page.locator('.card-item h3', {hasText: 'Lugia'}).first().waitFor();
	});

	await check('tapping a Reverse Holo tag opens the explainer and stays on the page', async () => {
		const tag = page.locator('.card-item .finish-tag-help[data-finish-kind="reverse"]:not([data-pattern])').first();

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
		const tag = page.locator('.card-item .finish-tag-help[data-finish-kind="reverse"]:not([data-pattern])').first();

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

		const kitHelp = page.locator('.kit-card-meta .finish-help[data-finish-kind="holo"]');

		await kitHelp.waitFor();
		assert.equal(await kitHelp.count(), 1, 'only the Holo card in the kit');
		assert.equal(await page.locator('.kit-card-meta .finish-help[data-finish-kind="stamp30"]').count(), 2, 'both 30 anos cards in the kit');
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
