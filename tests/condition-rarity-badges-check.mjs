// Checks the condition and rarity badges on HOTARU's card tiles
// (assets/catalogo.js, CONDITIONS, HIGH_RARITIES, markBadges; Eric
// 2026-11-27) in headless Chromium, against the built pages served from this
// folder and a stand-in for the Supabase calls. Nothing touches the real
// project.
//
// Covers: a Near Mint tile (or one with no condition) has no condition
// badge; an LP-only tile shows LP, and tapping it opens the Portuguese
// explainer inside the screen without opening the card; MP, HP and DMG map
// to their abbreviations; a tile with a Near Mint copy and an LP copy shows
// none, and one with LP and MP shows the best (LP); a condition the tracker
// does not know shows as it came, never hidden; a Rara Ilustração tile shows
// the rarity badge with its explainer, and Comum, Incomum, Rara, Rara Holo
// and Promo show none (Promo keeps its own badge); a tile with a rarity, a
// finish and a condition keeps them all, in order; the card page lists the
// conditions with the same explainer and the buy line carries it; the
// search still finds a rarity; no sideways scroll at 390 px and 360 px.
//
// Run: python3 build.py && PLAYWRIGHT=/path/to/node_modules/playwright node tests/condition-rarity-badges-check.mjs [screenshot-folder]

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

let serial = 0;
const listing = (cardId, name, fields = {}) => ({card_id: cardId, catalog: 'international', condition: 'Near Mint', description: null, finish: 'Normal', id: `c-${++serial}`, image_path: `tcgdex/en/sv/${cardId}.webp`, in_kit: false, kind: 'single', language: 'en', name, number: cardId.split('-').pop(), price_brl: 10, published_at: '2026-11-27T10:00:00Z', rarity: 'Common', set_name: 'Teste', ...fields});

// The condition and rarity values are the ones the tracker publishes
// (js/scan/session.js CONDITIONS; TCGdex rarities).
const CATALOG = [
	listing('t-001', 'Nmcarta'),
	listing('t-002', 'Semestado', {condition: null}),
	listing('t-003', 'Lpsolo', {condition: 'Lightly Played', rarity: 'Uncommon'}),
	listing('t-004', 'Mpsolo', {condition: 'Moderately Played'}),
	listing('t-005', 'Hpsolo', {condition: 'Heavily Played'}),
	listing('t-006', 'Dmgsolo', {condition: 'Damaged'}),
	listing('t-007', 'Misturada', {condition: 'Near Mint', rarity: 'Rare'}),
	listing('t-007', 'Misturada', {condition: 'Lightly Played', rarity: 'Rare', price_brl: 8}),
	listing('t-008', 'Melhorlp', {condition: 'Moderately Played'}),
	listing('t-008', 'Melhorlp', {condition: 'Lightly Played'}),
	listing('t-009', 'Desconhecida', {condition: 'Played'}),
	listing('t-010', 'Ilustrada', {rarity: 'Illustration rare'}),
	listing('t-011', 'Comumzinha', {rarity: 'Common'}),
	listing('t-012', 'Incomumzinha', {rarity: 'Uncommon'}),
	listing('t-013', 'Raraseca', {rarity: 'Rare'}),
	listing('t-014', 'Rarholo', {rarity: 'Rare Holo', finish: 'Holo'}),
	listing('t-015', 'Promozinha', {rarity: 'Promo'}),
	listing('t-016', 'Duplaex', {rarity: 'Double rare', finish: 'Holo'}),
	listing('t-017', 'Especialona', {condition: 'Lightly Played', finish: 'Holo, 1st Edition stamp', rarity: 'Special illustration rare'}),
	listing('t-018', 'Hiperzinha', {rarity: 'Hyper rare'}),
	listing('30th-158', 'Mewfuturo', {finish: 'Holo', rarity: 'Futuristic Rare'}),
];

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

		if (name === 'listing_status') {
			return json(Object.fromEntries((route.request().postDataJSON()?.ids || []).map((id) => [id, 'available'])));
		}

		return json([]);
	});

	return {context, errors, page};
}

const plain = (text) => String(text).replace(/\s+/g, ' ').trim();
const tile = (page, name) => page.locator('.card-item', {has: page.locator('h3', {hasText: name})}).first();
const tags = async (page, name) => (await tile(page, name).locator('.finish-tags .tag').allTextContents()).map(plain);
const condTags = (page, name) => tile(page, name).locator('.finish-tags .cond-tag');

// The open explainer holds only its title, its picture or minis, and its
// text: no stray text node, such as the "null" that replaceChildren wrote for
// a balloon with no picture (Eric, 2026-11-27).
async function popClean(page, label) {
	const stray = await page.locator('#finish-pop').evaluate((node) => [...node.childNodes].filter((child) => child.nodeType !== Node.ELEMENT_NODE).map((child) => child.textContent));

	assert.deepEqual(stray, [], `${label}: stray text in the explainer`);
}

async function noSideways(page, label) {
	const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

	assert.ok(wide <= 0, `${label} scrolls sideways by ${wide}px`);
}

async function tagsInsideTile(page, label) {
	const bad = await page.evaluate(() => [...document.querySelectorAll('.card-item')].flatMap((item) => {
		const box = item.getBoundingClientRect();

		return [...item.querySelectorAll('.finish-tags .tag')]
			.filter((tag) => {
				const spot = tag.getBoundingClientRect();

				return spot.left < box.left - 0.5 || spot.right > box.right + 0.5;
			})
			.map((tag) => `${item.querySelector('h3').textContent}: ${tag.textContent}`);
	}));

	assert.deepEqual(bad, [], `${label}: a badge leaves its tile`);
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
	const {context, errors, page} = await open(browser, {height: 844, width: 390});

	await page.goto(`${ORIGIN}/avulsas.html`);
	await tile(page, 'Nmcarta').waitFor();

	await check('a Near Mint tile, and one with no condition, show no condition badge', async () => {
		assert.deepEqual(await tags(page, 'Nmcarta'), []);
		assert.deepEqual(await tags(page, 'Semestado'), []);
	});

	await check('an LP-only tile shows LP, and tapping it opens the Portuguese explainer without opening the card', async () => {
		assert.deepEqual(await tags(page, 'Lpsolo'), ['LP?']);
		await condTags(page, 'Lpsolo').click();
		await page.locator('#finish-pop').waitFor({state: 'visible'});
		assert.equal(plain(await page.locator('.finish-pop-title').textContent()), 'LP · Pouco jogada');
		await popClean(page, 'LP');
		assert.match(plain(await page.locator('.finish-pop-text').textContent()), /^Sinais leves de manuseio: bordas um pouco gastas.*até cerca de 1 cm.*sem rasgos\.$/);
		assert.equal(await page.locator('.finish-pop img, .finish-pop-cards').count(), 0, 'a condition explainer has no picture');
		assert.equal(new URL(page.url()).pathname, '/avulsas.html');

		const box = await page.locator('#finish-pop').boundingBox();

		assert.ok(box.x >= 16 && box.x + box.width <= 390 - 16, 'explainer leaves the 16px gutter');
		await page.keyboard.press('Escape');
		await page.locator('#finish-pop').waitFor({state: 'hidden'});
	});

	await check('MP, HP and DMG show their abbreviations with their explainers', async () => {
		const expected = {Dmgsolo: ['DMG', 'DMG · Danificada', /^Rasgo, furo, dobra forte/], Hpsolo: ['HP', 'HP · Muito jogada', /^Desgaste forte: bordas brancas/], Mpsolo: ['MP', 'MP · Jogada', /^Uso visível: bordas e cantos gastos.*até cerca de 2 cm/]};

		for (const [name, [abbr, title, text]] of Object.entries(expected)) {
			assert.deepEqual(await tags(page, name), [`${abbr}?`]);
			await condTags(page, name).click();
			await page.locator('#finish-pop').waitFor({state: 'visible'});
			assert.equal(plain(await page.locator('.finish-pop-title').textContent()), title);
			await popClean(page, abbr);
			assert.match(plain(await page.locator('.finish-pop-text').textContent()), text);
			await page.keyboard.press('Escape');
		}
	});

	await check('a tile with a Near Mint copy and an LP copy shows none; with LP and MP it shows the best, LP', async () => {
		assert.equal(await tile(page, 'Misturada').locator('.card-count').textContent(), '2 disponíveis');
		assert.deepEqual(await tags(page, 'Misturada'), []);
		assert.deepEqual(await tags(page, 'Melhorlp'), ['LP?']);
	});

	await check('a condition the tracker does not publish shows as it came, with no explainer', async () => {
		assert.deepEqual(await tags(page, 'Desconhecida'), ['Played']);
		assert.equal(await condTags(page, 'Desconhecida').evaluate((node) => node.tagName), 'SPAN');
	});

	await check('a Rara Ilustração tile shows the rarity badge with its explainer', async () => {
		assert.deepEqual(await tags(page, 'Ilustrada'), ['Ilustração Rara?']);
		await tile(page, 'Ilustrada').locator('.finish-tags .tag').click();
		await page.locator('#finish-pop').waitFor({state: 'visible'});
		assert.equal(plain(await page.locator('.finish-pop-title').textContent()), 'Ilustração Rara');
		await popClean(page, 'Ilustração Rara');
		assert.equal(plain(await page.locator('.finish-pop-text').textContent()), 'A ilustração ocupa a carta inteira.');
		await page.keyboard.press('Escape');
		assert.deepEqual(await tags(page, 'Duplaex'), ['Holo?', 'Rara Dupla?']);
		assert.deepEqual(await tags(page, 'Hiperzinha'), ['Hiper Rara?']);
	});

	await check('Futuristic Rare (the 30th Mew ex and Mewtwo ex) keeps its English name and gets a badge and an explainer', async () => {
		assert.deepEqual(await tags(page, 'Mewfuturo'), ['Holo?', 'Stamp 30 anos?', 'Futuristic Rare?']);
		await tile(page, 'Mewfuturo').locator('.finish-tags .tag', {hasText: 'Futuristic'}).click();
		await page.locator('#finish-pop').waitFor({state: 'visible'});
		assert.equal(plain(await page.locator('.finish-pop-title').textContent()), 'Futuristic Rare');
		await popClean(page, 'Futuristic Rare');
		assert.match(plain(await page.locator('.finish-pop-text').textContent()), /^Uma raridade criada na coleção de 30 anos/);
		await page.keyboard.press('Escape');
	});

	await check('Comum, Incomum, Rara, Rara Holo and Promo get no rarity badge; Promo keeps its own', async () => {
		assert.deepEqual(await tags(page, 'Comumzinha'), []);
		assert.deepEqual(await tags(page, 'Incomumzinha'), []);
		assert.deepEqual(await tags(page, 'Raraseca'), []);
		assert.deepEqual(await tags(page, 'Rarholo'), ['Holo?']);
		assert.deepEqual(await tags(page, 'Promozinha'), ['Promo?']);
	});

	await check('a tile with a finish, an edition, a stamp, a rarity and a condition keeps them all, the condition last', async () => {
		assert.deepEqual(await tags(page, 'Especialona'), ['Holo?', '1ª Edição?', 'Ilustração Rara Especial?', 'LP?']);
	});

	await check('the search still finds a rarity, and a rarity badge does not filter anything out', async () => {
		await page.locator('.card-search').fill('ilustração rara');
		assert.deepEqual((await page.locator('.cards-grid h3').allTextContents()).sort(), ['Especialona', 'Ilustrada']);
		await page.locator('.card-search').fill('');
		assert.equal((await page.locator('.cards-grid h3').count()), 19);
	});

	await check('390 px: no sideways scroll and every badge stays inside its tile', async () => {
		await noSideways(page, '390 px avulsas');
		await tagsInsideTile(page, '390 px');

		if (SHOTS) {
			await page.locator('.cards-grid').scrollIntoViewIfNeeded();
			await page.screenshot({fullPage: false, path: join(SHOTS, 'selos-390.png')});
			await tile(page, 'Especialona').scrollIntoViewIfNeeded();
			await page.screenshot({path: join(SHOTS, 'selos-390-especialona.png')});
		}
	});

	await check('the card page lists the conditions with the explainer, and the buy line carries it', async () => {
		await page.goto(`${ORIGIN}/carta.html?c=t-007&l=en&a=Normal`);
		await page.locator('.card-facts').waitFor();

		const estado = page.locator('.card-facts dd').nth((await page.locator('.card-facts dt').allTextContents()).indexOf('Estado'));

		assert.equal(plain(await estado.textContent()), 'Near Mint, Lightly Played?');
		assert.equal(await estado.locator('.finish-help').count(), 1, 'Near Mint has no explainer');
		assert.equal(await page.locator('.finish-tags .cond-tag').count(), 0, 'the photo carries no condition badge when a copy is Near Mint');

		const lines = (await page.locator('.buy-label').allTextContents()).map(plain);

		assert.ok(lines.some((line) => /^Near Mint · R\$ 10,00/.test(line)), lines.join(' | '));
		assert.ok(lines.some((line) => /^Lightly Played\? · R\$ 8,00/.test(line)), lines.join(' | '));
		await page.locator('.buy-label .finish-help').click();
		await page.locator('#finish-pop').waitFor({state: 'visible'});
		assert.equal(plain(await page.locator('.finish-pop-title').textContent()), 'LP · Pouco jogada');
		await popClean(page, 'buy line LP');
		await page.keyboard.press('Escape');
		await noSideways(page, '390 px carta');

		await page.goto(`${ORIGIN}/carta.html?c=t-010&l=en&a=Normal`);
		await page.locator('.card-facts').waitFor();
		assert.match(plain(await page.locator('.card-facts').textContent()), /RaridadeIlustração Rara\?/);
		assert.equal(await page.locator('.finish-tags .tag').count(), 1, 'the photo carries the rarity badge');
	});

	assert.deepEqual(errors, [], 'no page errors at 390 px');
	await context.close();

	const narrow = await open(browser, {height: 740, width: 360});

	await narrow.page.goto(`${ORIGIN}/avulsas.html`);
	await tile(narrow.page, 'Especialona').waitFor();

	await check('360 px: no sideways scroll and every badge stays inside its tile', async () => {
		await noSideways(narrow.page, '360 px avulsas');
		await tagsInsideTile(narrow.page, '360 px');

		if (SHOTS) {
			await tile(narrow.page, 'Especialona').scrollIntoViewIfNeeded();
			await narrow.page.screenshot({path: join(SHOTS, 'selos-360-especialona.png')});
		}

		await narrow.page.goto(`${ORIGIN}/carta.html?c=t-017&l=en&a=${encodeURIComponent('Holo, 1st Edition stamp')}`);
		await narrow.page.locator('.card-facts').waitFor();
		await noSideways(narrow.page, '360 px carta');
		assert.deepEqual((await narrow.page.locator('.finish-tags .tag').allTextContents()).map(plain), ['Holo?', '1ª Edição?', 'Ilustração Rara Especial?', 'LP?']);
	});

	assert.deepEqual(narrow.errors, [], 'no page errors at 360 px');
	await narrow.context.close();
}
finally {
	await browser.close();
	server.kill();
}

console.log(`${passed} checks passed`);
