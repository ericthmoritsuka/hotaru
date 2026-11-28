// Checks the order form's wording and errors (QA-24, design F8, review
// Low 3, and the new place_order limits) in headless Chromium, against the
// built pages served from this folder and a stand-in for Supabase whose
// place_order answers the English messages of supabase/store-bundles.sql and
// the order-limits script. Nothing touches the real project.
//
// Covers: the phone field reads "WhatsApp ou telefone" and has no e-mail
// field; an empty phone says "Escreva um WhatsApp ou telefone para o Eric
// falar com você." and marks the field invalid; the cart has no "Seu
// carrinho" heading, the crumbs are Início / Carrinho, there are three steps
// and the line about the next screen; every English place_order message is
// shown in Portuguese after "O pedido não foi fechado."; a message that is
// not in the table is shown as it came; a dropped connection says to close it
// again, which is safe; a response that never comes frees the form.
//
// Run: python3 build.py && PLAYWRIGHT=/path/to/node_modules/playwright node tests/order-errors-check.mjs

import assert from 'node:assert/strict';

import {ORIGIN, chromium, listing, open, plain, runner, startServer} from './helpers.mjs';

const {check, done} = runner();

const CARD = listing('sv-001', 'Carta Um', {id: 'c-1', price_brl: 30});

// What the server says, and what the buyer must read.
const MESSAGES = {
	'A card is in the order twice.': 'Há uma carta repetida no pedido. Tire a repetida do carrinho e feche de novo.',
	'An order holds 1 to 20 cards.': 'Um pedido leva de 1 a 20 cartas.',
	'An order holds up to 10 kits.': 'Um pedido leva até 10 kits.',
	'The note holds up to 500 characters.': 'A observação leva até 500 caracteres.',
	'The shop is holding too many unpaid orders right now. Try again later.': 'A loja está com muitos pedidos esperando pagamento agora. Tente de novo mais tarde.',
	'This connection already has orders waiting for payment. Pay one of them first.': 'Esta conexão já tem pedidos esperando o Pix. Pague um deles antes de fazer outro.',
	'This phone already has orders waiting for payment. Pay one of them first.': 'Este telefone já tem um pedido esperando o Pix. Pague esse pedido antes de fazer outro.',
	'Type a name of up to 80 characters.': 'Escreva um nome de até 80 caracteres.',
	'Type a phone number of up to 40 characters.': 'Escreva um WhatsApp ou telefone de até 40 caracteres.',
};

const server = await startServer();
const browser = await chromium.launch();

async function cartPage(state, viewport = {height: 844, width: 390}) {
	const ctx = await open(browser, viewport, state);

	await ctx.page.goto(`${ORIGIN}/pedido.html`);
	await ctx.page.evaluate((item) => localStorage.setItem('hotaru.cart', JSON.stringify([item])), {cardId: 'sv-001', condition: 'Near Mint', finish: null, id: 'c-1', imagePath: null, language: 'en', name: 'Carta Um', number: '001', price: 30, setName: 'Teste'});
	await ctx.page.goto(`${ORIGIN}/pedido.html`);
	await ctx.page.waitForFunction(() => document.getElementById('order-submit') && !document.getElementById('order-submit').disabled);

	return ctx;
}

const fill = async (page) => {
	await page.fill('#order-name', 'Bia');
	await page.fill('#order-phone', '81 98888-0000');
};

try {
	const state = {catalog: [CARD]};
	const {context, errors, page} = await cartPage(state);

	await check('the cart reads Carrinho once, with three steps, a note about the next screen, and a WhatsApp or phone field', async () => {
		assert.equal(plain(await page.locator('.crumbs').textContent()), 'Início / Carrinho');
		assert.equal(await page.locator('h1').count(), 1);
		assert.equal(await page.locator('.cart-head').count(), 0);
		assert.ok(!(await page.locator('main').textContent()).includes('Seu carrinho'));
		assert.deepEqual((await page.locator('.order-steps li').allTextContents()).map(plain), ['Feche o pedido.', 'Pague com Pix em até 48 horas.', 'Combine a entrega.']);
		assert.equal(plain(await page.locator('.order-after').textContent()), 'Na próxima tela aparece o Pix (QR Code e copia e cola).');
		assert.equal(plain(await page.locator('label[for="order-phone"]').textContent()), 'WhatsApp ou telefone');
		assert.equal(await page.locator('form input[type="email"], form input[name*="mail" i]').count(), 0);
		assert.equal(await page.locator('h2.order-head').count(), 1);
	});

	await check('an empty phone says so in the new words and marks the field', async () => {
		await page.fill('#order-name', 'Bia');
		await page.click('#order-submit');
		assert.equal(plain(await page.locator('#order-error').textContent()), 'Escreva um WhatsApp ou telefone para o Eric falar com você.');
		assert.equal(await page.locator('#order-phone').getAttribute('aria-invalid'), 'true');
		assert.equal(await page.locator('#order-phone').getAttribute('aria-describedby'), 'order-error');
		assert.ok(await page.locator('#order-phone').evaluate((node) => node === document.activeElement));
		await page.fill('#order-name', '');
		await page.click('#order-submit');
		assert.equal(plain(await page.locator('#order-error').textContent()), 'Escreva o seu nome.');
		assert.equal(await page.locator('#order-phone').getAttribute('aria-invalid'), null);
	});

	await check('every English place_order message reads in Portuguese, and an unknown one is shown as it came', async () => {
		await fill(page);

		for (const [english, portuguese] of Object.entries(MESSAGES)) {
			state.placeOrder = (args, json) => json({code: '22023', message: english}, 400);
			await page.click('#order-submit');
			await page.waitForFunction((text) => document.getElementById('order-error').textContent.includes(text), portuguese);
			assert.equal(plain(await page.locator('#order-error').textContent()), `O pedido não foi fechado. ${portuguese}`);
			await page.waitForFunction(() => !document.getElementById('order-submit').disabled);
		}

		state.placeOrder = (args, json) => json({code: '23505', message: 'duplicate key value violates unique constraint'}, 409);
		await page.click('#order-submit');
		await page.waitForFunction(() => document.getElementById('order-error').textContent.includes('duplicate key'));
		assert.equal(plain(await page.locator('#order-error').textContent()), 'O pedido não foi fechado. duplicate key value violates unique constraint');
	});

	await check('a connection that drops says to close the order again, and the form is free again', async () => {
		state.abortRpc = ['place_order'];
		await page.waitForFunction(() => !document.getElementById('order-submit').disabled);
		await page.click('#order-submit');
		await page.waitForFunction(() => document.getElementById('order-error').textContent.includes('a conexão caiu'));
		assert.match(plain(await page.locator('#order-error').textContent()), /Toque em Fechar pedido de novo: se ele já tinha sido registrado, aparece o mesmo pedido, sem reservar as cartas outra vez\. Se algo parecer errado, escreva para hotaru\.loja@gmail\.com com o seu nome\./);
		await page.waitForFunction(() => !document.getElementById('order-submit').disabled);
		state.abortRpc = [];
	});

	await check('a good answer still closes the order', async () => {
		state.placeOrder = (args, json) => json({code: 'HTR-0042', receipt_token: '99999999-8888-4777-8666-555555555555', reserved_until: new Date(Date.now() + 48 * 3600e3).toISOString(), total: 30});
		await page.click('#order-submit');
		await page.locator('.order-done').waitFor();
		assert.match(plain(await page.locator('.order-done h2').textContent()), /HTR-0042/);
		assert.equal(await page.locator('.order-done .cart-changed').count(), 0, 'no price note when the total matches');
	});

	assert.deepEqual(errors, []);
	await context.close();
}
finally {
	await browser.close();
	server.kill();
}

done();
