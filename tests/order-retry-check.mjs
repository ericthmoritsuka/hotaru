// Checks that closing an order is safe to retry (developer review M3) in
// headless Chromium, against the built pages served from this folder and a
// stand-in for Supabase whose place_order keeps orders by request_id, as
// supabase/store-hardening.sql (version 4) in the tracker repo does. Nothing
// touches the real project.
//
// Covers: the server makes the order but the response is dropped; the
// buyer's cards then read as reserved, yet Fechar pedido stays on, and the
// retry sends the same request_id and the same cards, gets the same order
// back, and shows the success screen, with one order made; a changed cart
// gets a new request_id; a database without the request_id argument
// (PGRST202) still closes the order, by calling again without it.
//
// Run: python3 build.py && PLAYWRIGHT=/path/to/node_modules/playwright node tests/order-retry-check.mjs

import assert from 'node:assert/strict';

import {ORIGIN, chromium, listing, open, plain, runner, startServer} from './helpers.mjs';

const {check, done} = runner();

const ONE = listing('sv-001', 'Carta Um', {id: 'c-1', price_brl: 30});
const TWO = listing('sv-002', 'Carta Dois', {id: 'c-2', price_brl: 20});
const cartItem = (row) => ({cardId: row.card_id, condition: 'Near Mint', finish: null, id: row.id, imagePath: null, language: 'en', name: row.name, number: row.number, price: row.price_brl, setName: 'Teste'});

const server = await startServer();
const browser = await chromium.launch();

// A place_order that behaves like the server: a request_id that already
// made an order gets it back; a card already reserved is taken. drop: how
// many next responses are lost after the order is made. legacy: the
// database has no request_id argument yet.
function fakeServer(state, {legacy = false} = {}) {
	const server = {calls: [], drop: 0, orders: new Map()};

	server.install = (context) => context.route('**/rest/v1/rpc/place_order', async (route) => {
		const args = route.request().postDataJSON();
		const ids = args.items || [];

		server.calls.push(args);

		if (legacy && 'request_id' in args) {
			return route.fulfill({body: JSON.stringify({code: 'PGRST202', message: 'Could not find the function public.place_order(buyer_name, buyer_note, buyer_phone, items, request_id) in the schema cache'}), contentType: 'application/json', status: 404});
		}

		let order = args.request_id && server.orders.get(args.request_id);

		if (!order) {
			const taken = ids.filter((id) => state.status[id] === 'reserved');

			if (taken.length) {
				return route.fulfill({body: JSON.stringify({unavailable: taken, unavailable_kits: []}), contentType: 'application/json'});
			}

			ids.forEach((id) => {
				state.status[id] = 'reserved';
			});
			order = {code: `HTR-${String(42 + server.orders.size).padStart(4, '0')}`, receipt_token: `99999999-8888-4777-8666-${String(555555555555 + server.orders.size)}`, reserved_until: new Date(Date.now() + 48 * 3600e3).toISOString(), total: ids.length ? 50 : 0};
			server.orders.set(args.request_id || `none-${server.orders.size}`, order);
		}

		if (server.drop > 0) {
			server.drop -= 1;

			return route.abort();
		}

		return route.fulfill({body: JSON.stringify(order), contentType: 'application/json'});
	});

	return server;
}

async function cartPage(state, items, options) {
	const ctx = await open(browser, {height: 844, width: 390}, state);
	const fake = fakeServer(state, options);

	await fake.install(ctx.context);
	await ctx.page.goto(`${ORIGIN}/pedido.html`);
	await ctx.page.evaluate((list) => localStorage.setItem('hotaru.cart', JSON.stringify(list)), items.map(cartItem));
	await ctx.page.goto(`${ORIGIN}/pedido.html`);
	await ctx.page.waitForFunction(() => document.getElementById('order-submit') && !document.getElementById('order-submit').disabled);
	await ctx.page.fill('#order-name', 'Bia');
	await ctx.page.fill('#order-phone', '81 98888-0000');

	return {...ctx, fake};
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

try {
	await check('a dropped response, then a retry, makes one order and shows the success screen', async () => {
		const state = {catalog: [ONE, TWO], status: {}};
		const {context, errors, fake, page} = await cartPage(state, [ONE, TWO]);

		fake.drop = 1;
		await page.click('#order-submit');
		await page.waitForFunction(() => document.getElementById('order-error').textContent.includes('a conexão caiu'));
		assert.match(plain(await page.locator('#order-error').textContent()), /Toque em Fechar pedido de novo: se ele já tinha sido registrado, aparece o mesmo pedido, sem reservar as cartas outra vez\./);
		assert.equal(fake.orders.size, 1, 'the server made the order');

		// The page now reads the buyer's own cards as reserved; the retry
		// must still go out, with the same attempt.
		await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
		await page.waitForFunction(() => !document.getElementById('order-submit').disabled);
		assert.equal(await page.locator('.cart-off').count(), 0, 'the lost order\'s cards are not shown as taken');
		await page.click('#order-submit');
		await page.locator('.order-done').waitFor();

		assert.equal(fake.calls.length, 2);
		assert.match(fake.calls[0].request_id, UUID);
		assert.equal(fake.calls[1].request_id, fake.calls[0].request_id, 'the retry sends the same request_id');
		assert.deepEqual(fake.calls[1].items, fake.calls[0].items);
		assert.equal(fake.orders.size, 1, 'one order');
		assert.match(plain(await page.locator('.order-done h2').textContent()), /HTR-0042/);
		assert.equal(await page.evaluate(() => localStorage.getItem('hotaru.orderAttempt')), null, 'the attempt ends with the order');
		assert.deepEqual(errors, []);
		await context.close();
	});

	await check('a changed cart gets a new request_id', async () => {
		const state = {catalog: [ONE, TWO], status: {}};
		const {context, errors, fake, page} = await cartPage(state, [ONE, TWO]);

		fake.drop = 1;
		await page.click('#order-submit');
		await page.waitForFunction(() => document.getElementById('order-error').textContent.includes('a conexão caiu'));
		await page.waitForFunction(() => !document.getElementById('order-submit').disabled);

		// The buyer takes a card out: another attempt, so the server treats
		// it as a new order.
		await page.click('button[aria-label="Remover Carta Dois"]');
		state.status = {};
		await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
		await page.waitForFunction(() => !document.getElementById('order-submit').disabled);
		await page.click('#order-submit');
		await page.locator('.order-done').waitFor();
		assert.equal(fake.calls.length, 2);
		assert.match(fake.calls[1].request_id, UUID);
		assert.notEqual(fake.calls[1].request_id, fake.calls[0].request_id);
		assert.deepEqual(errors, []);
		await context.close();
	});

	await check('a database without request_id (before the SQL runs) still closes the order', async () => {
		const state = {catalog: [ONE], status: {}};
		const {context, errors, fake, page} = await cartPage(state, [ONE], {legacy: true});

		await page.click('#order-submit');
		await page.locator('.order-done').waitFor();
		assert.equal(fake.calls.length, 2);
		assert.ok('request_id' in fake.calls[0]);
		assert.ok(!('request_id' in fake.calls[1]), 'the second call leaves request_id out');
		assert.equal(fake.orders.size, 1);
		assert.deepEqual(errors, []);
		await context.close();
	});
}
finally {
	await browser.close();
	server.kill();
}

done();
