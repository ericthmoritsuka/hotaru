// Checks the blog fixes (QA-18, QA-22) and the TCGdex region cache (review
// Low 6) in headless Chromium, against the built pages served from this
// folder and stand-ins for Supabase and the TCGdex GraphQL endpoint. Nothing
// touches the real project.
//
// Covers: a post whose body opens with its own title plus a suffix ("(Parte
// 1)") shows one title, with the suffix; a body heading that is the title
// alone is dropped; a different first heading stays; blog.html shows the
// category chips once there are two categories and says so when the
// category in the address does not exist; a card that TCGdex does not return
// is not asked for again on the next visit, and a set nobody asked for in 30
// days leaves the saved region data.
//
// Run: python3 build.py && PLAYWRIGHT=/path/to/node_modules/playwright node tests/blog-dex-check.mjs

import assert from 'node:assert/strict';

import {ORIGIN, chromium, listing, open, plain, runner, startServer} from './helpers.mjs';

const {check, done} = runner();

const delta = (...lines) => ({ops: lines.flatMap(([text, header]) => [{insert: text}, {attributes: header ? {header} : {}, insert: '\n'}])});
const post = (title, ...lines) => ({body: delta(...lines), category: 'Colecionismo', cover: null, excerpt: null, published_at: '2026-11-20T10:00:00Z', slug: 'um-post', title});

const server = await startServer();
const browser = await chromium.launch();

try {
	const state = {};
	const {context, errors, page} = await open(browser, {height: 844, width: 390}, state);

	await check('a body that opens with the title and a suffix gives one title, with the suffix', async () => {
		state.post = post('Os Mandamentos do Colecionador', ['Os Mandamentos do Colecionador (Parte 1)', 2], ['Primeiro mandamento.']);
		await page.goto(`${ORIGIN}/post.html?p=um-post`);
		await page.locator('.post-body').waitFor();
		assert.equal(plain(await page.locator('h1').textContent()), 'Os Mandamentos do Colecionador (Parte 1)');
		assert.equal(await page.locator('.post-body h2').count(), 0);
		assert.match(plain(await page.locator('.post-body').textContent()), /^Primeiro mandamento\./);
		assert.equal(await page.title(), 'Os Mandamentos do Colecionador | Blog HOTARU');
	});

	await check('a body heading that is the title alone is dropped; another first heading stays', async () => {
		state.post = post('Meu Post', ['Meu Post', 2], ['Texto.']);
		await page.goto(`${ORIGIN}/post.html?p=um-post`);
		await page.locator('.post-body').waitFor();
		assert.equal(plain(await page.locator('h1').textContent()), 'Meu Post');
		assert.equal(await page.locator('.post-body h2').count(), 0);
		state.post = post('Meu Post', ['Outro assunto', 2], ['Texto.']);
		await page.goto(`${ORIGIN}/post.html?p=um-post`);
		await page.locator('.post-body').waitFor();
		assert.equal(plain(await page.locator('h1').textContent()), 'Meu Post');
		assert.equal(plain(await page.locator('.post-body h2').textContent()), 'Outro assunto');
	});

	await check('blog.html shows chips with two categories, and says when the category in the address does not exist', async () => {
		state.posts = [{...post('Um', ['x']), category: 'Colecionismo', slug: 'um'}, {...post('Dois', ['x']), category: 'Dicas', slug: 'dois'}];
		await page.goto(`${ORIGIN}/blog.html`);
		await page.locator('.post-chips').waitFor();
		assert.equal(await page.locator('.post-chips a').count(), 3);
		await page.goto(`${ORIGIN}/blog.html?categoria=zzz`);
		await page.locator('.post-grid').waitFor();
		assert.match(plain(await page.locator('.card-note').textContent()), /Não há posts na categoria "zzz"\. A lista mostra todos os posts\./);
		assert.equal(await page.locator('.post-card').count(), 2);
	});

	assert.deepEqual(errors, []);
	await context.close();

	const dex = {catalog: [listing('sv01-001', 'Presente', {id: 'c-1'}), listing('sv01-002', 'Ausente', {id: 'c-2'})], dex: {sv01: {'sv01-001': [25]}}};
	const regions = await open(browser, {height: 844, width: 390}, dex);

	await check('a card TCGdex does not return is not asked for again on the next visit', async () => {
		await regions.page.goto(`${ORIGIN}/avulsas.html`);
		await regions.page.waitForFunction(() => !document.querySelector('.card-region').disabled);
		assert.equal(dex.calls.filter(([name]) => name === 'graphql').length, 1);
		await regions.page.reload();
		await regions.page.waitForFunction(() => !document.querySelector('.card-region').disabled);
		assert.equal(dex.calls.filter(([name]) => name === 'graphql').length, 1, 'the second visit asked again');
	});

	await check('a set nobody asked for in 30 days leaves the saved data', async () => {
		await regions.page.evaluate(() => {
			const cache = JSON.parse(localStorage.getItem('hotaru.dex'));

			cache.old1 = {at: Date.now() - 40 * 864e5, cards: {}};
			localStorage.setItem('hotaru.dex', JSON.stringify(cache));
		});
		await regions.page.reload();
		await regions.page.waitForFunction(() => !document.querySelector('.card-region').disabled);
		assert.deepEqual(await regions.page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('hotaru.dex')))), ['sv01']);
	});

	assert.deepEqual(regions.errors, []);
	await regions.context.close();
}
finally {
	await browser.close();
	server.kill();
}

done();
