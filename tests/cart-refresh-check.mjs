// Checks the cart and the catalog pages' freshness (review of 2026-11-27:
// engineering M1, M2, M7, Low 5; QA-09, QA-14, QA-15, QA-25) in headless
// Chromium, against the built pages served from this folder and a stand-in
// for Supabase. Nothing touches the real project.
//
// Covers: the cart rereads live prices when it opens and shows what changed,
// and before an order goes out a price that changed in the meantime stops it
// until the buyer has seen the new total; a unit taken by someone else is
// replaced on request by another equal one (a card of the same language and
// finish, a sealed unit of the same product), and without one the line says
// it is gone and "Remover as indisponíveis" clears it; a catalog page redraws
// when the tab comes back and the database changed, and does not touch the
// page when it did not; adding a card that was just reserved is refused with
// a notice and the page redraws; the cart in another tab moves the buttons
// here; at 20 cards every Adicionar says so and recovers; a bad price in
// localStorage is dropped instead of printing R$ NaN.
//
// Run: python3 build.py && PLAYWRIGHT=/path/to/node_modules/playwright node tests/cart-refresh-check.mjs

import assert from 'node:assert/strict';

import {ORIGIN, chromium, listing, open, plain, runner, startServer} from './helpers.mjs';

const {check, done} = runner();

const item = (id, fields = {}) => ({cardId: 'sv-001', condition: 'Near Mint', finish: 'Normal', id, imagePath: null, language: 'en', name: 'Carta Um', number: '001', price: 30, setName: 'Teste', ...fields});
const sealedItem = (id) => ({cardId: null, condition: null, finish: null, id, imagePath: null, kind: 'sealed', language: 'pt', name: 'Booster Box', number: null, price: 800, productId: 'p-box', setName: 'Booster Box'});
const seed = (page, items) => page.evaluate((list) => localStorage.setItem('hotaru.cart', JSON.stringify(list)), items);
const cartIds = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('hotaru.cart') || '[]').map((one) => one.id));
const ready = (page) => page.waitForFunction(() => document.getElementById('order-submit') && !document.getElementById('order-submit').disabled);

const server = await startServer();
const browser = await chromium.launch();

async function cartPage(state, items) {
	const ctx = await open(browser, {height: 844, width: 390}, state);

	await ctx.page.goto(`${ORIGIN}/pedido.html`);
	await seed(ctx.page, items);
	await ctx.page.goto(`${ORIGIN}/pedido.html`);

	return ctx;
}

try {
	// ---------------------------------------------------------------- M2
	const row = listing('sv-001', 'Carta Um', {id: 'c-1', price_brl: 45});
	const prices = {catalog: [row]};
	const priced = await cartPage(prices, [item('c-1')]);

	await check('the cart rereads the live price when it opens and shows what changed', async () => {
		await ready(priced.page);
		assert.equal(plain(await priced.page.locator('.cart-price').textContent()), 'R$ 45,00');
		assert.equal(plain(await priced.page.locator('.cart-changed').textContent()), 'O preço mudou: era R$ 30,00, agora é R$ 45,00.');
		assert.match(plain(await priced.page.locator('.cart-notice').textContent()), /Alguns preços mudaram desde que você adicionou as cartas/);
		assert.equal(plain(await priced.page.locator('.cart-total').textContent()), 'Total: R$ 45,00 (1 carta)');
		assert.deepEqual(await priced.page.evaluate(() => JSON.parse(localStorage.getItem('hotaru.cart')).map((one) => one.price)), [45], 'the new price is kept');
	});

	await check('a price that changes after the cart opened stops the order until the buyer sees the new total', async () => {
		row.price_brl = 50;
		await priced.page.fill('#order-name', 'Bia');
		await priced.page.fill('#order-phone', '81 98888-0000');
		prices.calls.length = 0;
		await priced.page.click('#order-submit');
		await priced.page.waitForFunction(() => document.querySelector('.cart-notice').textContent.includes('agora há pouco'));
		assert.equal(prices.calls.filter(([name]) => name === 'place_order').length, 0, 'the order went out at the old price');
		assert.equal(plain(await priced.page.locator('.cart-total').textContent()), 'Total: R$ 50,00 (1 carta)');
		prices.placeOrder = (args, json) => json({code: 'HTR-0042', receipt_token: '99999999-8888-4777-8666-555555555555', reserved_until: new Date(Date.now() + 48 * 3600e3).toISOString(), total: 50});
		await ready(priced.page);
		await priced.page.click('#order-submit');
		await priced.page.locator('.order-done').waitFor();
		assert.equal(prices.calls.filter(([name]) => name === 'place_order').length, 1);
		assert.equal(await priced.page.locator('.order-done .cart-changed').count(), 0);
	});

	await check('if the total the server charged differs from the cart, the confirmation says so', async () => {
		const state = {catalog: [listing('sv-001', 'Carta Um', {id: 'c-1', price_brl: 30})], placeOrder: (args, json) => json({code: 'HTR-0043', receipt_token: '99999999-8888-4777-8666-555555555555', reserved_until: new Date(Date.now() + 48 * 3600e3).toISOString(), total: 33})};
		const ctx = await cartPage(state, [item('c-1')]);

		await ready(ctx.page);
		await ctx.page.fill('#order-name', 'Bia');
		await ctx.page.fill('#order-phone', '81 98888-0000');
		await ctx.page.click('#order-submit');
		await ctx.page.locator('.order-done').waitFor();
		assert.match(plain(await ctx.page.locator('.order-done .cart-changed').textContent()), /O total ficou em R\$ 33,00, e não em R\$ 30,00 como no carrinho/);
		await ctx.context.close();
	});

	assert.deepEqual(priced.errors, []);
	await priced.context.close();

	// ---------------------------------------------------------------- M1
	const swapState = {
		catalog: [listing('sv-001', 'Carta Um', {id: 'c-2', price_brl: 28})],
		sealed: [{category: 'Booster Box', description: '', id: 'p-box', language: 'pt', name: 'Booster Box', photos: [], price_brl: 800, units: ['u-2']}],
		status: {'c-1': 'reserved', 'c-3': 'gone', 'u-1': 'reserved'},
	};
	const swap = await cartPage(swapState, [item('c-1'), item('c-3', {cardId: 'sv-002', name: 'Sem Reposição', number: '002', price: 12}), sealedItem('u-1')]);

	await check('a taken copy is offered another equal one, a sealed unit another unit, and a card with none is just gone', async () => {
		await swap.page.locator('.cart-swap').first().waitFor();
		assert.equal(await swap.page.locator('.cart-swap').count(), 2, 'one offer for the card, one for the sealed product');

		const offers = (await swap.page.locator('.cart-swap').allTextContents()).map(plain);

		assert.ok(offers.some((text) => /^Outra cópia igual está à venda: Near Mint · R\$ 28,00\./.test(text)), offers.join(' | '));
		assert.ok(offers.some((text) => /^Outra unidade igual está à venda: R\$ 800,00\./.test(text)), offers.join(' | '));
		assert.equal(await swap.page.locator('.cart-item[data-id="c-3"] .cart-swap').count(), 0);
		assert.match(plain(await swap.page.locator('.cart-item[data-id="c-3"] .cart-warn').textContent()), /Não está mais disponível/);
	});

	await check('"Trocar por ela" puts the equal copy in the same place, and the total follows', async () => {
		await swap.page.locator('.cart-item[data-id="c-1"] .cart-swap-btn').click();
		await swap.page.waitForFunction(() => !document.querySelector('.cart-item[data-id="c-1"]'));
		assert.deepEqual(await cartIds(swap.page), ['c-2', 'c-3', 'u-1']);
		await swap.page.waitForFunction(() => document.querySelector('.cart-item[data-id="c-2"]') && !document.querySelector('.cart-item[data-id="c-2"] .cart-warn'));
		await swap.page.locator('.cart-item[data-id="u-1"] .cart-swap-btn').click();
		await swap.page.waitForFunction(() => document.querySelector('.cart-item[data-id="u-2"]'));
		assert.deepEqual(await cartIds(swap.page), ['c-2', 'c-3', 'u-2']);
	});

	await check('"Remover as indisponíveis" clears what is gone in one touch', async () => {
		await swap.page.locator('.cart-clean').waitFor({state: 'visible'});
		await swap.page.locator('.cart-clean').click();
		assert.deepEqual(await cartIds(swap.page), ['c-2', 'u-2']);
		assert.ok(await swap.page.locator('.cart-clean').isHidden());
	});

	assert.deepEqual(swap.errors, []);
	await swap.context.close();

	// ---------------------------------------------------------- QA-15/25
	const bad = await cartPage({catalog: [], status: {'x-3': 'gone', 'x-4': 'gone'}}, [item('x-1', {price: 'abc'}), item('x-2', {price: null}), item('x-3'), item('x-4', {cardId: 'sv-009'})]);

	await check('a bad price in localStorage is dropped instead of printing R$ NaN, and stale lines clear in one touch', async () => {
		await bad.page.locator('.cart-clean').waitFor({state: 'visible'});
		assert.ok(!(await bad.page.locator('main').textContent()).includes('NaN'));
		assert.deepEqual(await bad.page.locator('.cart-item').evaluateAll((nodes) => nodes.map((node) => node.dataset.id)), ['x-3', 'x-4']);
		await bad.page.locator('.cart-clean').click();
		assert.deepEqual(await cartIds(bad.page), []);
		await bad.page.locator('.card-note', {hasText: 'Seu carrinho está vazio.'}).waitFor();
	});

	assert.deepEqual(bad.errors, []);
	await bad.context.close();

	// ---------------------------------------------------------------- M7
	const live = {catalog: [listing('sv-001', 'Carta Um', {id: 'c-1', price_brl: 40}), listing('sv-002', 'Carta Dois', {id: 'c-2', price_brl: 20})]};
	const pageA = await open(browser, {height: 844, width: 390}, live);

	await pageA.page.goto(`${ORIGIN}/avulsas.html`);
	await pageA.page.locator('.cards-grid .card-item').first().waitFor();

	await check('a catalog page redraws when the tab comes back and the database changed, and leaves the page alone when it did not', async () => {
		await pageA.page.evaluate(() => {
			document.querySelector('.cards-grid .card-item').dataset.mark = 'same';
		});
		await pageA.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
		await pageA.page.waitForTimeout(600);
		assert.equal(await pageA.page.locator('.cards-grid .card-item').first().getAttribute('data-mark'), 'same', 'an unchanged catalog redrew the page');

		live.catalog = [live.catalog[1]];
		await pageA.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
		await pageA.page.waitForFunction(() => document.querySelectorAll('.cards-grid .card-item').length === 1);
		assert.equal(plain(await pageA.page.locator('.cards-grid h3').textContent()), 'Carta Dois');
	});

	await check('a back navigation from the browser cache (pageshow persisted) rereads the catalog too', async () => {
		live.catalog = [...live.catalog, listing('sv-003', 'Carta Três', {id: 'c-3', price_brl: 5})];
		await pageA.page.evaluate(() => window.dispatchEvent(Object.assign(new Event('pageshow'), {persisted: true})));
		await pageA.page.waitForFunction(() => document.querySelectorAll('.cards-grid .card-item').length === 2);
	});

	await check('adding a card that was just reserved is refused with a notice, and the tile goes away', async () => {
		live.status = {'c-2': 'reserved'};
		await pageA.page.locator('.cards-grid .card-item', {has: pageA.page.locator('h3', {hasText: 'Carta Dois'})}).locator('.quick-add').click();
		await pageA.page.locator('#toast').waitFor({state: 'visible'});
		assert.equal(plain(await pageA.page.locator('#toast').textContent()), 'Essa carta acabou de ser reservada por outra pessoa.');
		assert.deepEqual(await cartIds(pageA.page), []);
		live.catalog = live.catalog.filter((one) => one.id !== 'c-2');
		await pageA.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
		await pageA.page.waitForFunction(() => ![...document.querySelectorAll('.cards-grid h3')].some((node) => node.textContent === 'Carta Dois'));
		live.status = {};
	});

	await check('on a card page, adding a copy that was just reserved is refused too', async () => {
		live.catalog = [listing('sv-001', 'Carta Um', {id: 'c-1', price_brl: 40})];
		await pageA.page.goto(`${ORIGIN}/carta.html?c=sv-001&l=en&a=Normal`);
		await pageA.page.locator('.buy-add').waitFor();
		live.status = {'c-1': 'reserved'};
		await pageA.page.locator('.buy-add').click();
		await pageA.page.locator('#toast').waitFor({state: 'visible'});
		assert.deepEqual(await cartIds(pageA.page), []);
		live.status = {};
	});

	assert.deepEqual(pageA.errors, []);
	await pageA.context.close();

	// ------------------------------------------------------ QA-09 and QA-14
	const many = {catalog: Array.from({length: 22}, (_, i) => listing(`sv-${String(i + 1).padStart(3, '0')}`, `Carta ${i + 1}`, {id: `c-${i + 1}`, price_brl: 100 - i}))};
	const tabA = await open(browser, {height: 844, width: 390}, many);

	await tabA.page.goto(`${ORIGIN}/avulsas.html`);
	await tabA.page.locator('.cards-grid .card-item').first().waitFor();

	const tabB = await tabA.context.newPage();

	await tabB.goto(`${ORIGIN}/pedido.html`);

	await check('the cart changed in another tab moves the buttons and the count here', async () => {
		await tabA.page.locator('.cards-grid .card-item').first().locator('.quick-add').click();
		await tabA.page.waitForFunction(() => document.querySelector('.cards-grid .card-item .quick-add').textContent.includes('No carrinho'));
		await tabB.waitForFunction(() => JSON.parse(localStorage.getItem('hotaru.cart') || '[]').length === 1);
		await tabB.locator('.cart-remove').first().click();
		await tabA.page.waitForFunction(() => document.querySelector('.cards-grid .card-item .quick-add').textContent.trim() === 'Adicionar');
		assert.equal(await tabA.page.locator('[data-cart-count]').first().isHidden(), true);
	});

	await check('at 20 cards every Adicionar says the limit, and they recover when the cart shrinks elsewhere', async () => {
		const twenty = Array.from({length: 20}, (_, i) => item(`k-${i}`));

		await tabB.evaluate((list) => localStorage.setItem('hotaru.cart', JSON.stringify(list)), twenty);
		await tabA.page.waitForFunction(() => [...document.querySelectorAll('.cards-grid .quick-add')].every((button) => button.disabled && button.textContent.includes('Limite de 20')));
		assert.match(await tabA.page.locator('.cards-grid .quick-add').first().getAttribute('aria-label'), /Um pedido leva até 20 cartas/);
		await tabB.evaluate((list) => localStorage.setItem('hotaru.cart', JSON.stringify(list)), twenty.slice(0, 5));
		await tabA.page.waitForFunction(() => [...document.querySelectorAll('.cards-grid .quick-add')].every((button) => !button.disabled && button.textContent.trim() === 'Adicionar'));
	});

	assert.deepEqual(tabA.errors, []);
	await tabA.context.close();
}
finally {
	await browser.close();
	server.kill();
}

done();
