// Checks the YouTube facade (QA-03, QA-26) and the home carousel's motion
// controls (F7, QA-16) of the 2026-11-27 reviews, plus the balloon fixes
// (QA-10, QA-23), in headless Chromium against the built pages served from
// this folder and a stand-in for Supabase, TCGdex and YouTube. Nothing
// touches the real project or YouTube.
//
// Covers: the home and Sobre pages load no YouTube player until a click (no
// request to youtube-nocookie.com, none aborted), the thumbnail is the one of
// the video the button plays, a click or Enter swaps the button for a
// youtube-nocookie iframe that autoplays, without the web-share token;
// the carousel advances on its own, waits while the mouse or the focus is on
// it, has a visible Pausar button that becomes Continuar and really stops
// and resumes it, stops when someone drags or uses the wheel, and with
// prefers-reduced-motion neither moves nor shows the button; a balloon the
// keyboard opened closes when focus moves on; a balloon on a low tile of a
// 360x740 screen keeps the 16 px gutter at the bottom.
//
// Run: python3 build.py && PLAYWRIGHT=/path/to/node_modules/playwright node tests/media-motion-check.mjs [screenshot-folder]

import assert from 'node:assert/strict';
import {join} from 'node:path';

import {ORIGIN, chromium, listing, open, plain, runner, startServer} from './helpers.mjs';

const SHOTS = process.argv[2] || null;
const {check, done} = runner();

const CATALOG = Array.from({length: 14}, (_, i) => listing(`sv-${String(i + 1).padStart(3, '0')}`, `Carta ${i + 1}`, {finish: i % 2 ? 'Holo' : 'Normal', price_brl: 100 - i, rarity: i % 3 ? 'Common' : 'Illustration Rare'}));
const VIDEOS = ['EME_g29ZMVo', 'c0Azny49uPQ', 'qkAC4Uh-Aw0', 'TErW8C_WeT8'];

const server = await startServer();
const browser = await chromium.launch();

try {
	const {context, errors, page} = await open(browser, {height: 844, width: 390}, {catalog: CATALOG});
	const seen = [];

	await context.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({body: '<!doctype html><title>player</title>', contentType: 'text/html'}));
	page.on('request', (request) => seen.push(request.url()));

	await check('the home page loads no YouTube player before a click, and nothing is aborted', async () => {
		const failed = [];

		page.on('requestfailed', (request) => failed.push(request.url()));
		await page.goto(`${ORIGIN}/index.html`);
		await page.locator('.yt-play').scrollIntoViewIfNeeded();
		await page.locator('.yt-thumb').waitFor();
		await page.waitForFunction(() => document.querySelector('.yt-thumb').complete);
		assert.equal(seen.filter((url) => url.includes('youtube-nocookie.com')).length, 0, 'a player request before the click');
		assert.deepEqual(failed.filter((url) => url.includes('youtube')), [], 'an aborted YouTube request');

		const id = await page.locator('.yt-play').getAttribute('data-id');

		assert.ok(VIDEOS.includes(id), id);
		assert.equal(await page.locator('.yt-thumb').getAttribute('src'), `https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
		assert.equal(seen.filter((url) => url.includes('i.ytimg.com')).length, 1, 'only the thumbnail of the chosen video');
		assert.ok(plain(await page.locator('.yt-play').getAttribute('aria-label')).startsWith('Assistir ao vídeo'));
	});

	await check('a click swaps the facade for a youtube-nocookie iframe that autoplays, without web-share', async () => {
		const id = await page.locator('.yt-play').getAttribute('data-id');

		await page.locator('.yt-play').click();

		const frame = page.locator('.ytframe iframe');

		await frame.waitFor();
		assert.equal(await frame.getAttribute('src'), `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`);
		assert.ok(!(await frame.getAttribute('allow')).includes('web-share'));
		assert.equal(await page.locator('.yt-play').count(), 0);
		assert.match(await frame.getAttribute('title'), /canal Ericthm/);
	});

	await check('Sobre has the same facade, and Enter on the button plays it', async () => {
		seen.length = 0;
		await page.goto(`${ORIGIN}/sobre.html`);
		await page.locator('.yt-play').waitFor();
		assert.equal(seen.filter((url) => url.includes('youtube-nocookie.com')).length, 0);
		await page.locator('.yt-play').focus();
		await page.keyboard.press('Enter');
		await page.locator('.ytframe iframe').waitFor();
		assert.ok(await page.locator('.ytframe iframe').evaluate((node) => node === document.activeElement), 'focus moves to the player');
	});

	assert.deepEqual(errors, []);
	await context.close();

	for (const viewport of [{height: 800, width: 1280}, {height: 844, width: 390}]) {
		const wide = await open(browser, viewport, {catalog: CATALOG});

		await wide.page.clock.install();
		await wide.page.goto(`${ORIGIN}/index.html`);
		await wide.page.locator('.carousel .carousel-slide').first().waitFor();
		await wide.page.waitForFunction(() => !document.querySelector('.carousel-next').disabled || window.innerWidth < 720);

		const track = wide.page.locator('.carousel-track').first();
		const left = () => track.evaluate((node) => Math.round(node.scrollLeft));
		const tick = async (ms = 4600) => {
			await wide.page.clock.fastForward(ms);
			await wide.page.waitForTimeout(900);
		};
		const pause = wide.page.locator('.carousel-pause').first();

		await check(`${viewport.width} px: the carousel moves on its own and has a visible Pausar button`, async () => {
			assert.ok(await pause.isVisible());
			assert.equal(plain(await pause.textContent()), 'Pausar');
			assert.equal(await pause.getAttribute('aria-pressed'), 'false');

			const before = await left();

			await tick();
			assert.ok((await left()) > before, 'it did not advance');
			assert.ok((await pause.boundingBox()).height >= 36);
		});

		await check(`${viewport.width} px: it waits while the mouse is over it and while it has the focus`, async () => {
			await track.scrollIntoViewIfNeeded();
			await wide.page.mouse.move(viewport.width / 2, (await track.boundingBox()).y + 100);

			const held = await left();

			await tick(9500);
			assert.equal(await left(), held, 'it moved under the mouse');
			await wide.page.mouse.move(2, 2);
			await wide.page.locator('.carousel .carousel-track').first().focus();

			const focused = await left();

			await tick(9500);
			assert.equal(await left(), focused, 'it moved with focus inside');
			await wide.page.evaluate(() => document.activeElement.blur());
		});

		await check(`${viewport.width} px: Pausar stops it, turns into Continuar, and Continuar resumes it`, async () => {
			await pause.click();
			assert.equal(plain(await pause.textContent()), 'Continuar');
			assert.equal(await pause.getAttribute('aria-pressed'), 'true');
			await wide.page.mouse.move(2, 2);

			const stopped = await left();

			await tick(14000);
			assert.equal(await left(), stopped, 'it moved while paused');
			await pause.click();
			assert.equal(plain(await pause.textContent()), 'Pausar');
			await wide.page.mouse.move(2, 2);
			await tick();
			assert.notEqual(await left(), stopped, 'it did not resume');
		});

		await check(`${viewport.width} px: using the wheel stops it, and the button then reads Continuar`, async () => {
			await track.dispatchEvent('wheel', {deltaX: 10});
			assert.equal(plain(await pause.textContent()), 'Continuar');

			if (SHOTS) {
				await track.scrollIntoViewIfNeeded();
				await wide.page.screenshot({path: join(SHOTS, `carrossel-${viewport.width}.png`)});
			}
		});

		assert.deepEqual(wide.errors, []);
		await wide.context.close();
	}

	const calm = await open(browser, {height: 800, width: 1280}, {catalog: CATALOG}, {reducedMotion: 'reduce'});

	await calm.page.clock.install();
	await calm.page.goto(`${ORIGIN}/index.html`);
	await calm.page.locator('.carousel .carousel-slide').first().waitFor();

	await check('with prefers-reduced-motion the carousel stays put and shows no Pausar button', async () => {
		const before = await calm.page.locator('.carousel-track').first().evaluate((node) => node.scrollLeft);

		await calm.page.clock.fastForward(14000);
		await calm.page.waitForTimeout(600);
		assert.equal(await calm.page.locator('.carousel-track').first().evaluate((node) => node.scrollLeft), before);
		assert.ok(await calm.page.locator('.carousel-pause').first().isHidden());
	});

	await calm.context.close();

	const keys = await open(browser, {height: 800, width: 1280}, {catalog: CATALOG});

	await keys.page.goto(`${ORIGIN}/avulsas.html?ordem=maior-preco`);
	await keys.page.locator('.cards-grid .card-item').first().waitFor();

	await check('a balloon the keyboard opened closes when focus moves on', async () => {
		const helps = keys.page.locator('.cards-grid .finish-tag-help, .cards-grid .card-marks .finish-help');

		await helps.first().focus();
		await keys.page.keyboard.press('Enter');
		await keys.page.locator('#finish-pop').waitFor({state: 'visible'});
		await keys.page.keyboard.press('Tab');
		await keys.page.locator('#finish-pop').waitFor({state: 'hidden'});
	});

	await keys.context.close();

	const low = await open(browser, {height: 740, width: 360}, {catalog: CATALOG});

	await low.page.goto(`${ORIGIN}/avulsas.html`);
	await low.page.locator('.cards-grid .card-item').first().waitFor();

	await check('a balloon near the bottom of a 360x740 screen keeps a 16 px gutter', async () => {
		const help = low.page.locator('.cards-grid .card-marks .finish-help').first();

		await help.scrollIntoViewIfNeeded();
		await low.page.evaluate(() => window.scrollBy(0, -window.innerHeight + 90));
		await help.tap();
		await low.page.locator('#finish-pop').waitFor({state: 'visible'});

		const box = await low.page.locator('#finish-pop').boundingBox();

		assert.ok(box.y >= 16 - 0.5 && box.y + box.height <= 740 - 16 + 0.5, `the balloon spans ${box.y}..${box.y + box.height} of 740`);
	});

	await low.context.close();
}
finally {
	await browser.close();
	server.kill();
}

done();
