// Checks the product pages after the 2026-11-27 design and QA review (F2,
// F3, F8 after adding, P2, QA-13, QA-17, QA-27, QA-28) in headless Chromium,
// against the built pages served from this folder and a stand-in for
// Supabase. Nothing touches the real project.
//
// Covers: on carta.html, kit.html and selado.html the "Adicionar ao carrinho"
// button is above the fold at 390x844 and 1280x800, even on a sealed product
// with a long description; the price shows once in the buy line; the last
// crumb is the product name over a compact band; after adding the last copy
// the line says so and a "Ir para o carrinho" button goes to the cart; a
// finish in the address matches in any letter case; a sealed photo is shown
// whole (contain); the sealed list calls the rest "Outros selados"; a card
// picture that fails to load becomes the named placeholder.
//
// Run: python3 build.py && PLAYWRIGHT=/path/to/node_modules/playwright node tests/detail-pages-check.mjs [screenshot-folder]

import assert from 'node:assert/strict';
import {join} from 'node:path';

import {ORIGIN, SUPABASE, chromium, listing, noSideways, open, plain, runner, startServer} from './helpers.mjs';

const SHOTS = process.argv[2] || null;
const {check, done} = runner();

const MEW = listing('30th-158', 'Mew ex', {finish: 'Holo', id: 'c-mew', price_brl: 300, rarity: 'Special Illustration Rare'});
const TWIN = [listing('sv-001', 'Duas Cópias', {id: 'c-t1'}), listing('sv-001', 'Duas Cópias', {id: 'c-t2'})];
const KIT = '11111111-2222-4333-8444-555555555555';
const LONG = Array.from({length: 12}, (_, i) => `Parágrafo ${i + 1} da descrição longa do produto, que fala do conteúdo da caixa e dos boosters.`).join('\n\n');
const SEALED = [
	{category: 'Booster Box', description: LONG, id: 'p-box', language: 'pt', name: 'Booster Box Escuridão Absoluta', photos: ['sealed/box.webp', 'sealed/box2.webp'], price_brl: 800, units: ['u-1', 'u-2']},
	{category: 'Blister', description: 'Um blister.', id: 'p-blister', language: 'pt', name: 'Blister Triplo', photos: ['sealed/blister.webp'], price_brl: 60, units: ['u-3']},
];
const state = () => ({
	bundles: [{description: 'Trio.', discount_pct: 5, id: KIT, items: ['c-t1', 'c-mew'].map((id) => {
		const row = [...TWIN, MEW].find((one) => one.id === id);

		return {card_id: row.card_id, condition: row.condition, finish: row.finish === 'Normal' ? null : row.finish, image_path: row.image_path, language: 'en', listing_id: id, name: row.name, number: row.number, price_brl: row.price_brl, set_name: row.set_name};
	}), name: 'Dupla', price: 285, sum: 300}],
	catalog: [MEW, ...TWIN],
	featured: [{kind: 'product', product_id: 'p-box'}],
	sealed: SEALED,
});

const server = await startServer();
const browser = await chromium.launch();

// The button must be inside the first screen, with some room.
async function aboveFold(page, label) {
	const box = await page.locator('.buy-add').first().boundingBox();
	const height = page.viewportSize().height;

	assert.ok(box && box.y + box.height <= height, `${label}: the buy button ends at ${box && box.y + box.height}px of ${height}px`);
}

try {
	for (const viewport of [{height: 844, width: 390}, {height: 800, width: 1280}]) {
		const {context, errors, page} = await open(browser, viewport, state());

		await check(`${viewport.width} px: the buy button is above the fold on a card, a kit and a sealed product with a long text`, async () => {
			await page.goto(`${ORIGIN}/carta.html?c=30th-158&l=en&a=Holo`);
			await page.locator('.buy-add').waitFor();
			await aboveFold(page, 'carta');
			await page.goto(`${ORIGIN}/kit.html?id=${KIT}`);
			await page.locator('.buy-add').waitFor();
			await aboveFold(page, 'kit');
			await page.goto(`${ORIGIN}/selado.html?id=p-box`);
			await page.locator('.buy-add').waitFor();
			await aboveFold(page, 'selado');
			await noSideways(page, assert, `${viewport.width} px selado`);

			if (SHOTS) {
				await page.goto(`${ORIGIN}/carta.html?c=30th-158&l=en&a=Holo`);
				await page.locator('.buy-add').waitFor();
				await page.screenshot({path: join(SHOTS, `carta-${viewport.width}.png`)});
				await page.goto(`${ORIGIN}/selado.html?id=p-box`);
				await page.locator('.buy-add').waitFor();
				await page.screenshot({path: join(SHOTS, `selado-${viewport.width}.png`)});
			}
		});

		assert.deepEqual(errors, []);
		await context.close();
	}

	const {context, errors, page} = await open(browser, {height: 844, width: 390}, state());

	await check('the last crumb is the product name, over a compact band', async () => {
		await page.goto(`${ORIGIN}/carta.html?c=30th-158&l=en&a=Holo`);
		await page.locator('.buy-add').waitFor();
		assert.equal(plain(await page.locator('.crumbs').textContent()), 'Início / Cartas / Mew ex');
		assert.ok((await page.locator('.pagehead').boundingBox()).height < 70, 'the band is compact');
		await page.goto(`${ORIGIN}/kit.html?id=${KIT}`);
		await page.locator('.buy-add').waitFor();
		assert.equal(plain(await page.locator('.crumbs').textContent()), 'Início / Cartas / Dupla');
		await page.goto(`${ORIGIN}/selado.html?id=p-blister`);
		await page.locator('.buy-add').waitFor();
		assert.equal(plain(await page.locator('.crumbs').textContent()), 'Início / Selados / Blister Triplo');
	});

	await check('the price shows once: the headline, not the buy line (one variant)', async () => {
		await page.goto(`${ORIGIN}/carta.html?c=30th-158&l=en&a=Holo`);
		await page.locator('.buy-add').waitFor();
		assert.equal(plain(await page.locator('.card-price').textContent()), 'R$ 300,00');
		assert.ok(!/R\$/.test(await page.locator('.buy-label').textContent()), 'the buy line repeats the price');
		await page.goto(`${ORIGIN}/selado.html?id=p-blister`);
		await page.locator('.buy-add').waitFor();
		assert.ok(!/R\$/.test(await page.locator('.buy-label').textContent()));
	});

	await check('after adding the last copy: the line says so and "Ir para o carrinho" opens the cart', async () => {
		await page.goto(`${ORIGIN}/carta.html?c=30th-158&l=en&a=Holo`);
		await page.locator('.buy-add').click();
		assert.equal(plain(await page.locator('.buy-all-in p').textContent()), 'Esta carta está no seu carrinho.');
		assert.equal(plain(await page.locator('.buy-status').textContent()), 'Adicionada ao carrinho.');
		await page.getByRole('link', {name: 'Ir para o carrinho'}).click();
		assert.equal(new URL(page.url()).pathname, '/pedido.html');

		await page.goto(`${ORIGIN}/carta.html?c=sv-001&l=en&a=Normal`);
		await page.locator('.buy-qty').selectOption('2');
		await page.locator('.buy-add').click();
		assert.equal(plain(await page.locator('.buy-all-in p').textContent()), 'As 2 cópias estão no seu carrinho.');
	});

	await check('a finish in the address matches in any letter case', async () => {
		await page.goto(`${ORIGIN}/carta.html?c=sv-001&l=en&a=normal`);
		await page.locator('.buy-box').waitFor();
		assert.equal(plain(await page.locator('h1').textContent()), 'Duas Cópias');
		await page.goto(`${ORIGIN}/carta.html?c=30th-158&l=en&a=HOLO`);
		assert.equal(plain(await page.locator('h1').textContent()), 'Mew ex');
	});

	await check('the buy box comes before the facts, and a sealed product shows its photo whole', async () => {
		await page.goto(`${ORIGIN}/carta.html?c=30th-158&l=en&a=Holo`);
		await page.locator('.buy-box').waitFor();

		const order = await page.evaluate(() => ['.card-price', '.buy-box', '.card-facts'].map((selector) => document.querySelector(selector).getBoundingClientRect().top));

		assert.deepEqual(order, [...order].sort((a, b) => a - b));
		await page.goto(`${ORIGIN}/selado.html?id=p-box`);
		await page.locator('.sealed-pic').waitFor();
		assert.equal(await page.locator('.sealed-pic').evaluate((img) => getComputedStyle(img).objectFit), 'contain');

		const order2 = await page.evaluate(() => ['.card-price', '.buy-box', '.card-facts', '.sealed-description'].map((selector) => document.querySelector(selector).getBoundingClientRect().top));

		assert.deepEqual(order2, [...order2].sort((a, b) => a - b));
	});

	await check('the sealed list calls the products after the featured one "Outros selados"', async () => {
		await page.goto(`${ORIGIN}/selados.html`);
		await page.locator('.sealed-item').first().waitFor();
		assert.deepEqual((await page.locator('.featured-title').allTextContents()).map(plain), ['Em destaque', 'Outros selados']);
	});

	assert.deepEqual(errors, [], 'no page errors');
	await context.close();

	const broken = await open(browser, {height: 844, width: 390}, state());

	await broken.context.route(`${SUPABASE}/storage/**`, (route) => route.abort());

	await check('a card picture that fails to load becomes the named placeholder, readable on the panel', async () => {
		await broken.page.goto(`${ORIGIN}/carta.html?c=30th-158&l=en&a=Holo`);
		await broken.page.locator('.card-pic-none').waitFor();
		assert.equal(plain(await broken.page.locator('.card-pic-none').textContent()), 'Mew ex');
		assert.equal(await broken.page.locator('img.card-pic').count(), 0);
		await broken.page.goto(`${ORIGIN}/avulsas.html`);
		await broken.page.locator('.cards-grid .card-pic-none').first().waitFor();
		assert.equal(await broken.page.locator('.cards-grid img.card-pic').count(), 0);
		await broken.page.goto(`${ORIGIN}/selados.html`);
		await broken.page.locator('.sealed-item .card-pic-none').first().waitFor();
	});

	assert.deepEqual(broken.errors, []);
	await broken.context.close();
}
finally {
	await browser.close();
	server.kill();
}

done();
