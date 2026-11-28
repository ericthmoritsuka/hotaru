// Checks avulsas.html after the 2026-11-27 design and QA review (F1, F14,
// QA-01, QA-02, QA-04, QA-07, QA-08, QA-21, QA-27) in headless Chromium,
// against the built pages served from this folder and stand-ins for Supabase
// and the TCGdex GraphQL endpoint. Nothing touches the real project.
//
// Covers: the grid opens with 24 tiles, "Mostrar mais" adds 24 at a time and
// keeps the count; the default sort is the most expensive first and the
// choice goes in the URL; search, collection, language, region and sort go in
// the URL, and open from it (any letter case); Back from a card brings the
// same filtered list, the open pages and the scroll; a featured collection
// click clears the other filters; no results gets a "Limpar filtros" button
// that spans the grid; ?regiao= waits instead of showing every card and says
// so when TCGdex is down; the region select keeps its place; 3 columns at
// 768 px; filter labels fit at 360 px; no sideways scroll at 360, 390, 768
// and 1280 px.
//
// Run: python3 build.py && PLAYWRIGHT=/path/to/node_modules/playwright node tests/catalog-paging-check.mjs [screenshot-folder]

import assert from 'node:assert/strict';
import {join} from 'node:path';

import {ORIGIN, chromium, listing, noSideways, open, plain, runner, startServer} from './helpers.mjs';

const SHOTS = process.argv[2] || null;
const {check, done} = runner();

// 60 cards in two sets, prices 1..60, and two with a regional form. The
// language of every 10th is Portuguese.
const CATALOG = Array.from({length: 60}, (_, i) => {
	const n = i + 1;

	return listing(`${n % 2 ? 'sv01' : 'sv02'}-${String(n).padStart(3, '0')}`, `Carta ${String(n).padStart(2, '0')}`, {language: n % 10 === 0 ? 'pt' : 'en', price_brl: n, published_at: `2026-11-${String(1 + (n % 27)).padStart(2, '0')}T10:00:00Z`, set_name: n % 2 ? 'Coleção Um' : 'Coleção Dois'});
});
const DEX = {sv01: Object.fromEntries(CATALOG.filter((row) => row.card_id.startsWith('sv01')).map((row, i) => [row.card_id, [i < 5 ? 25 : 200]])), sv02: Object.fromEntries(CATALOG.filter((row) => row.card_id.startsWith('sv02')).map((row) => [row.card_id, [300]]))};

const names = (page) => page.locator('.cards-grid h3').allTextContents();
const state = (extra = {}) => ({catalog: CATALOG, dex: DEX, featured: [{kind: 'set', set_name: 'Coleção Um'}], ...extra});
const search = (page) => new URL(page.url()).searchParams;

const server = await startServer();
const browser = await chromium.launch();

try {
	const {context, errors, page} = await open(browser, {height: 844, width: 390}, state());

	await page.goto(`${ORIGIN}/avulsas.html`);
	await page.locator('.cards-grid .card-item').first().waitFor();
	await page.waitForFunction(() => !document.querySelector('.card-region').disabled);

	await check('the grid opens with 24 tiles, the most expensive first, and keeps the count', async () => {
		assert.equal((await names(page)).length, 24);
		assert.equal((await names(page))[0], 'Carta 60');
		assert.equal(await page.locator('.card-filters select[aria-label="Ordenar"]').inputValue(), 'price-desc');
		assert.equal(plain(await page.locator('.card-total').textContent()), '60 cartas, mostrando as primeiras 24');
		assert.equal(plain(await page.locator('.card-more').textContent()), 'Mostrar mais 24 cartas (de 60)');
		assert.equal(search(page).has('ordem'), false, 'the default sort leaves the URL clean');
	});

	await check('"Mostrar mais" adds 24 at a time, then the last 12, then goes away', async () => {
		await page.locator('.card-more').click();
		assert.equal((await names(page)).length, 48);
		assert.equal(plain(await page.locator('.card-more').textContent()), 'Mostrar mais 12 cartas (de 60)');
		await page.locator('.card-more').click();
		assert.equal((await names(page)).length, 60);
		assert.ok(await page.locator('.card-more').isHidden());
		assert.equal(plain(await page.locator('.card-total').textContent()), '60 cartas');
	});

	await check('sort, search, collection, language and region go in the URL and reset the pages', async () => {
		await page.locator('select[aria-label="Ordenar"]').selectOption('price-asc');
		assert.equal(search(page).get('ordem'), 'menor-preco');
		assert.equal((await names(page)).length, 24, 'a new sort goes back to the first page');
		assert.equal((await names(page))[0], 'Carta 01');
		await page.locator('select[aria-label="Coleção"]').selectOption('Coleção Dois');
		await page.locator('select[aria-label="Idioma"]').selectOption('pt');
		await page.locator('.card-search').fill('carta 2');
		await page.waitForFunction(() => new URL(location.href).searchParams.get('busca') === 'carta 2');
		assert.equal(search(page).get('colecao'), 'Coleção Dois');
		assert.equal(search(page).get('idioma'), 'pt');
		assert.deepEqual(await names(page), ['Carta 20']);
		await page.locator('select[aria-label="Região"]').selectOption({index: 1});
		assert.equal(search(page).get('regiao'), 'kanto');
	});

	await check('Back from a card brings the same list, the same open pages and the scroll', async () => {
		await page.locator('.card-search').fill('');
		await page.locator('select[aria-label="Coleção"]').selectOption('');
		await page.locator('select[aria-label="Idioma"]').selectOption('');
		await page.locator('select[aria-label="Região"]').selectOption('');
		await page.locator('select[aria-label="Ordenar"]').selectOption('price-desc');
		await page.locator('select[aria-label="Idioma"]').selectOption('en');
		await page.locator('.card-more').click();
		assert.equal((await names(page)).length, 48);

		const tile = page.locator('.cards-grid .card-item').nth(40);

		await tile.scrollIntoViewIfNeeded();

		const before = await page.evaluate(() => window.scrollY);
		const first = plain(await tile.locator('h3').textContent());

		await tile.locator('h3 a').click();
		await page.waitForURL(/carta\.html/);
		await page.goBack();
		await page.locator('.cards-grid .card-item').first().waitFor();
		await page.waitForFunction(() => !document.querySelector('.card-region').disabled);

		assert.equal(search(page).get('idioma'), 'en');
		assert.equal(await page.locator('select[aria-label="Idioma"]').inputValue(), 'en');
		assert.equal((await names(page)).length, 48, 'the two open pages come back');
		assert.equal(plain(await page.locator('.cards-grid .card-item').nth(40).locator('h3').textContent()), first);
		await page.waitForFunction((y) => Math.abs(window.scrollY - y) < 120, before);
	});

	await check('the URL opens the list filtered, in any letter case, with the region waiting for TCGdex', async () => {
		await page.goto(`${ORIGIN}/avulsas.html?colecao=COLEÇÃO%20um&idioma=EN&ordem=Nome&regiao=KANTO&busca=carta`);
		await page.locator('.cards-grid .card-item').first().waitFor();
		await page.waitForFunction(() => !document.querySelector('.card-region').disabled);
		assert.equal(await page.locator('select[aria-label="Coleção"]').inputValue(), 'Coleção Um');
		assert.equal(await page.locator('select[aria-label="Idioma"]').inputValue(), 'en');
		assert.equal(await page.locator('select[aria-label="Região"]').inputValue(), 'kanto');
		assert.equal(await page.locator('select[aria-label="Ordenar"]').inputValue(), 'name');
		assert.equal((await names(page)).length, 5, 'only the five Kanto cards of the first set');
	});

	await check('while the region loads, the list waits instead of showing every card', async () => {
		const slow = await open(browser, {height: 844, width: 390}, state({dex: DEX}));
		const seen = [];

		await slow.context.route('https://api.tcgdex.net/**', async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 1200));
			route.continue();
		});
		slow.page.on('console', () => {});
		await slow.page.goto(`${ORIGIN}/avulsas.html?regiao=kanto`);
		await slow.page.locator('.card-grid-note, .card-item').first().waitFor();
		seen.push(plain(await slow.page.locator('.cards-grid').textContent()));
		assert.match(seen[0], /Carregando as cartas da região/);
		assert.equal(await slow.page.locator('.cards-grid .card-item').count(), 0, 'no tile before the region answers');
		assert.ok(await slow.page.locator('select[aria-label="Região"]').isDisabled(), 'the region select holds its place, off');
		await slow.page.waitForFunction(() => document.querySelectorAll('.cards-grid .card-item').length > 0, null, {timeout: 20000});
		assert.equal(await slow.page.locator('.cards-grid .card-item').count(), 5);
		await slow.context.close();
	});

	await check('with TCGdex down, the page says it shows every card, and the region stays in the URL', async () => {
		const down = await open(browser, {height: 844, width: 390}, state({dex: 'down'}));

		await down.page.goto(`${ORIGIN}/avulsas.html?regiao=kanto`);
		await down.page.locator('.cards-grid .card-item').first().waitFor();
		assert.match(plain(await down.page.locator('.card-notice').textContent()), /Não foi possível carregar as regiões agora, então a lista mostra todas as cartas\./);
		assert.ok(await down.page.locator('select[aria-label="Região"]').isHidden());
		await down.page.locator('select[aria-label="Idioma"]').selectOption('pt');
		assert.equal(search(down.page).get('regiao'), 'kanto');
		await down.context.close();
	});

	await check('a featured collection click clears the other filters and the list is not empty', async () => {
		await page.goto(`${ORIGIN}/avulsas.html`);
		await page.locator('.cards-grid .card-item').first().waitFor();
		await page.waitForFunction(() => !document.querySelector('.card-region').disabled);
		await page.locator('select[aria-label="Idioma"]').selectOption('pt');
		await page.locator('select[aria-label="Região"]').selectOption('johto').catch(() => {});
		await page.locator('.set-item h3 a').first().click();
		assert.equal(await page.locator('select[aria-label="Coleção"]').inputValue(), 'Coleção Um');
		assert.equal(await page.locator('select[aria-label="Idioma"]').inputValue(), '');
		assert.equal(await page.locator('select[aria-label="Região"]').inputValue(), '');
		assert.ok((await names(page)).length > 0);
		assert.equal(search(page).get('colecao'), 'Coleção Um');
		assert.equal(search(page).has('idioma'), false);
	});

	await check('no results: the message spans the grid, offers the contact and "Limpar filtros", which clears every control', async () => {
		await page.locator('.card-search').fill('zzzz');

		const empty = page.locator('.card-empty');

		await empty.waitFor();
		assert.match(plain(await empty.innerText()), /Nenhuma carta com esses filtros\. Tente outro nome ou limpe os filtros\. Procurando uma carta específica\? Escreva para hotaru\.loja@gmail\.com\./);

		const box = await empty.boundingBox();
		const grid = await page.locator('.cards-grid').boundingBox();

		assert.ok(box.width >= grid.width - 1, `the message is ${box.width}px of ${grid.width}px`);
		await empty.getByRole('button', {name: 'Limpar filtros'}).click();
		assert.equal(await page.locator('.card-search').inputValue(), '');
		assert.equal(await page.locator('select[aria-label="Coleção"]').inputValue(), '');
		assert.ok((await names(page)).length > 0);
		assert.equal(search(page).has('busca'), false);
	});

	await check('360 px: the filter labels fit their selects, and nothing scrolls sideways', async () => {
		await page.setViewportSize({height: 740, width: 360});
		await page.goto(`${ORIGIN}/avulsas.html`);
		await page.locator('.cards-grid .card-item').first().waitFor();
		await page.waitForFunction(() => !document.querySelector('.card-region').disabled);

		const cut = await page.evaluate(() => [...document.querySelectorAll('.card-filters select')].filter((select) => !select.hidden).flatMap((select) => {
			const style = getComputedStyle(select);
			const canvas = document.createElement('canvas').getContext('2d');

			canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

			const room = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 22;

			return [...select.options].filter((option) => canvas.measureText(option.textContent).width > room && !/\(\d+\)$/.test(option.textContent) && select.selectedOptions[0] === option).map((option) => `${option.textContent} (${canvas.measureText(option.textContent).width.toFixed(0)} > ${room.toFixed(0)})`);
		}));

		assert.deepEqual(cut, [], 'a selected label is cut');
		await noSideways(page, assert, '360 px avulsas');

		if (SHOTS) {
			await page.locator('.card-filters').scrollIntoViewIfNeeded();
			await page.screenshot({path: join(SHOTS, 'filtros-360.png')});
		}
	});

	assert.deepEqual(errors, [], 'no page errors on the phone');
	await context.close();

	for (const width of [768, 1280]) {
		const wide = await open(browser, {height: 900, width}, state());

		await wide.page.goto(`${ORIGIN}/avulsas.html`);
		await wide.page.locator('.cards-grid .card-item').first().waitFor();
		await wide.page.waitForFunction(() => !document.querySelector('.card-region').disabled);

		await check(`${width} px: ${width === 768 ? 'three' : 'four'} columns, five filters on one row where there is room, no sideways scroll`, async () => {
			const columns = await wide.page.evaluate(() => getComputedStyle(document.querySelector('.cards-grid')).gridTemplateColumns.split(' ').length);

			assert.equal(columns, width === 768 ? 3 : 4);
			await noSideways(wide.page, assert, `${width} px avulsas`);

			if (width === 1280) {
				const tops = await wide.page.evaluate(() => [...document.querySelectorAll('.card-filters > *')].map((node) => Math.round(node.getBoundingClientRect().top)));

				assert.equal(new Set(tops).size, 1, `filters on several rows: ${tops}`);
			}

			if (SHOTS) {
				await wide.page.screenshot({fullPage: false, path: join(SHOTS, `avulsas-${width}.png`)});
			}
		});

		assert.deepEqual(wide.errors, []);
		await wide.context.close();
	}
}
finally {
	await browser.close();
	server.kill();
}

done();
