// Checks the Região filter on avulsas.html (assets/catalogo.js, REGIONS,
// regionsOf, addRegions; asked for by customers on 2026-11-26) in headless
// Chromium, against the built pages served from this folder and stand-ins
// for Supabase and the TCGdex GraphQL endpoint. Nothing touches the real
// project or TCGdex.
//
// Covers: the region comes from the National Dex number, as in the card
// tracker; a regional form written in Portuguese ("Exeggutor de Alola") or
// English ("Alolan Vulpix") goes to its form's region; a tag team counts in
// each of its regions; a Trainer has none; only regions with cards are
// offered, in Dex order, with counts; picking one filters the grid; the
// search finds a region name; avulsas.html?regiao=<id> opens filtered; one
// GraphQL request per set, none on the next visit, and only the set that
// gained a card asks again; with TCGdex down the select stays hidden and the
// page works as before; the filters fit a 390px phone and a desktop row.
//
// Run: python3 build.py && PLAYWRIGHT=/path/to/node_modules/playwright node tests/region-filter-check.mjs [screenshot-folder]

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
const GRAPHQL = 'https://api.tcgdex.net/v2/graphql';

const listing = (id, cardId, name, fields = {}) => ({card_id: cardId, catalog: 'international', condition: 'Near Mint', description: null, finish: 'Normal', id, image_path: null, in_kit: false, kind: 'single', language: 'pt', name, number: cardId.split('-').pop(), price_brl: 10, published_at: '2026-11-25T10:00:00Z', rarity: 'Common', set_name: cardId.split('-')[0], ...fields});

const CATALOG = [
	listing('c-cha', 'base1-4', 'Charmander'),
	listing('c-exe', '30th-002', 'Exeggutor de Alola'),
	listing('c-vul', '30th-003', 'Alolan Vulpix', {language: 'en'}),
	listing('c-lug', '30th-121', 'Lugia'),
	listing('c-lux', 'me03-028', 'Luxray'),
	listing('c-mew', 'me03-050', 'Meowth de Galar'),
	listing('c-tag', 'sm9-33', 'Pikachu e Zekrom GX'),
	listing('c-tab', 'me03-081', 'Poké Tablet', {rarity: 'Uncommon'}),
];

// What TCGdex answers per set, with a card of another set whose id contains
// the filter text, which must be ignored.
const DEX = {
	'30th': {'30th-002': [103], '30th-003': [37], '30th-121': [249], 'x30th-002': [1]},
	base1: {'base1-4': [4]},
	me03: {'me03-028': [405], 'me03-050': [52], 'me03-081': []},
	sm9: {'sm9-33': [25, 644]},
};

function startServer() {
	const child = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {cwd: ROOT, stdio: 'ignore'});

	return new Promise((resolve) => setTimeout(() => resolve(child), 800));
}

async function open(context, {catalog = CATALOG, tcgdex = 'up'} = {}) {
	const page = await context.newPage();
	const errors = [];
	const asked = [];

	page.on('pageerror', (err) => errors.push(err.message));
	await page.route('**/*', (route) => {
		const url = route.request().url();

		if (url.startsWith(ORIGIN)) {
			return route.continue();
		}

		if (url === GRAPHQL) {
			if (tcgdex === 'down') {
				return route.abort();
			}

			const set = /id: "([^"]+)-"/.exec(route.request().postDataJSON().query)[1];

			asked.push(set);

			return route.fulfill({body: JSON.stringify({data: {cards: Object.entries(DEX[set] || {}).map(([id, dexId]) => ({dexId: dexId.length ? dexId : null, id}))}}), contentType: 'application/json'});
		}

		if (!url.startsWith(`${SUPABASE}/rest/v1/rpc/`)) {
			return route.abort();
		}

		return route.fulfill({body: JSON.stringify(url.endsWith('/store_catalog') ? catalog : []), contentType: 'application/json'});
	});

	return {asked, errors, page};
}

const names = (page) => page.locator('.cards-grid h3').allTextContents();
const region = (page) => page.locator('select.card-region');

const server = await startServer();
const browser = await chromium.launch();
let checks = 0;
const ok = (label) => {
	checks++;
	console.log(`ok ${checks} ${label}`);
};

try {
	// Phone first: the layout that matters.
	const phone = await browser.newContext({hasTouch: true, isMobile: true, viewport: {height: 844, width: 390}});
	let {asked, errors, page} = await open(phone);

	await page.goto(`${ORIGIN}/avulsas.html`);
	await region(page).waitFor({state: 'visible'});

	assert.deepEqual(await region(page).locator('option').allTextContents(), ['Todas as regiões', 'Kanto (2)', 'Johto (1)', 'Sinnoh (1)', 'Unova (1)', 'Alola (2)', 'Galar (1)']);
	ok('only regions with cards, in Dex order, with counts; forms and tag teams counted');

	assert.deepEqual([...asked].sort(), ['30th', 'base1', 'me03', 'sm9']);
	ok('one GraphQL request per set');

	await region(page).selectOption('kanto');
	assert.deepEqual((await names(page)).sort(), ['Charmander', 'Pikachu e Zekrom GX']);
	assert.equal(await page.locator('.card-total').textContent(), '2 cartas');
	ok('Kanto shows Charmander and the tag team, not Exeggutor de Alola or the Trainer');

	await region(page).selectOption('alola');
	assert.deepEqual((await names(page)).sort(), ['Alolan Vulpix', 'Exeggutor de Alola']);
	ok('Alola holds the Portuguese and English regional forms');

	await region(page).selectOption('');
	assert.equal((await names(page)).length, CATALOG.length);
	ok('Todas as regiões shows every card, the Trainer included');

	await page.locator('.card-search').fill('johto');
	assert.deepEqual(await names(page), ['Lugia']);
	ok('the search finds a region name');
	await page.locator('.card-search').fill('');

	const filters = await page.locator('.card-filters').boundingBox();
	const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

	assert.ok(wide <= 0, `phone scrolls sideways by ${wide}px`);
	const select = await region(page).boundingBox();

	assert.ok(select.x >= filters.x && select.x + select.width <= filters.x + filters.width + 1, 'region select leaves the filter box');
	ok('fits a 390px phone with no sideways scroll');

	if (SHOTS) {
		await region(page).selectOption('kanto');
		await page.locator('.card-filters').scrollIntoViewIfNeeded();
		await page.screenshot({path: join(SHOTS, 'region-phone.png')});
	}

	assert.deepEqual(errors, []);
	await page.close();

	// Next visit: the saved answer, no request.
	({asked, errors, page} = await open(phone));
	await page.goto(`${ORIGIN}/avulsas.html?regiao=sinnoh`);
	await region(page).waitFor({state: 'visible'});
	assert.deepEqual(asked, []);
	ok('the next visit reads no set again');

	assert.equal(await region(page).inputValue(), 'sinnoh');
	assert.deepEqual(await names(page), ['Luxray']);
	ok('avulsas.html?regiao=sinnoh opens filtered');
	await page.close();

	// A new card in a saved set: only that set is asked again.
	DEX.me03['me03-099'] = [6];
	({asked, errors, page} = await open(phone, {catalog: [...CATALOG, listing('c-chz', 'me03-099', 'Charizard ex')]}));
	await page.goto(`${ORIGIN}/avulsas.html`);
	await region(page).waitFor({state: 'visible'});
	assert.deepEqual(asked, ['me03']);
	await region(page).selectOption('kanto');
	assert.ok((await names(page)).includes('Charizard ex'));
	ok('a card missing from the saved set reads that set alone again');
	assert.deepEqual(errors, []);
	await phone.close();

	// TCGdex down and nothing saved: the page as it was.
	const offline = await browser.newContext({viewport: {height: 900, width: 1280}});

	({errors, page} = await open(offline, {tcgdex: 'down'}));
	await page.goto(`${ORIGIN}/avulsas.html`);
	await page.locator('.cards-grid h3').first().waitFor();
	await page.waitForTimeout(500);
	assert.equal(await region(page).isVisible(), false);
	assert.equal((await names(page)).length, CATALOG.length);
	assert.equal(await page.locator('.card-filters.has-region').count(), 0);
	assert.deepEqual(errors, []);
	ok('with TCGdex down the select stays hidden and every card shows');
	await offline.close();

	// Desktop: the five controls on one row.
	const desk = await browser.newContext({viewport: {height: 900, width: 1280}});

	({errors, page} = await open(desk));
	await page.goto(`${ORIGIN}/avulsas.html`);
	await region(page).waitFor({state: 'visible'});
	const tops = await page.locator('.card-filters > :not([hidden])').evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));

	assert.equal(tops.length, 5);
	assert.equal(new Set(tops).size, 1, `filters wrap on desktop: ${tops}`);
	ok('desktop keeps the five filters on one row');

	if (SHOTS) {
		await page.locator('.card-filters').scrollIntoViewIfNeeded();
		await page.screenshot({path: join(SHOTS, 'region-desktop.png')});
	}

	assert.deepEqual(errors, []);
	await desk.close();

	console.log(`\n${checks}/${checks} checks passed`);
}
finally {
	await browser.close();
	server.kill();
}
