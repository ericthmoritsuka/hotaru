// Shared pieces of the front-end checks that came with the 2026-11-27 review
// round (header, catalog paging, facade, 404, cart refresh): a static server
// for this folder, a stand-in for Supabase, TCGdex and the YouTube
// thumbnails, and a tiny runner. Nothing touches the real project.
//
// Run a check with: python3 build.py && PLAYWRIGHT=/path/to/node_modules/playwright node tests/<name>-check.mjs

import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);

export const {chromium} = require(process.env.PLAYWRIGHT || 'playwright');
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SUPABASE = 'https://ehdkbxrjxsypegbtrxbw.supabase.co';
export const GRAPHQL = 'https://api.tcgdex.net/v2/graphql';

export const PORT = 8000 + Math.floor(Math.random() * 900);
export const ORIGIN = `http://127.0.0.1:${PORT}`;

export function startServer() {
	const child = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {cwd: ROOT, stdio: 'ignore'});

	return new Promise((resolve) => setTimeout(() => resolve(child), 800));
}

let serial = 0;

export const listing = (cardId, name, fields = {}) => ({card_id: cardId, catalog: 'international', condition: 'Near Mint', description: null, finish: 'Normal', id: `c-${++serial}`, image_path: `tcgdex/en/sv/${cardId}.webp`, in_kit: false, kind: 'single', language: 'en', name, number: cardId.split('-').pop(), price_brl: 10, published_at: '2026-11-27T10:00:00Z', rarity: 'Common', set_name: 'Teste', ...fields});

const picture = (url) => {
	const hue = [...url].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="63" height="88"><rect width="63" height="88" rx="4" fill="hsl(${hue} 60% 55%)" stroke="#fff" stroke-width="3"/></svg>`;
};

// state: {catalog, bundles, sealed, featured, posts, status (id => status),
// dex (set => {card id: [numbers]}), calls (filled), failRpc (names that
// answer 500), slow (ms)}
export async function stub(context, state = {}) {
	state.calls = state.calls || [];
	state.requests = state.requests || [];

	await context.route('**/*', async (route) => {
		const url = route.request().url();

		if (url.startsWith(ORIGIN)) {
			return route.continue();
		}

		state.requests.push(url);

		if (url.startsWith(`${SUPABASE}/storage/`)) {
			return route.fulfill({body: picture(url), contentType: 'image/svg+xml'});
		}

		if (url.startsWith('https://i.ytimg.com/')) {
			return route.fulfill({body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#345"/></svg>', contentType: 'image/svg+xml'});
		}

		if (url === GRAPHQL) {
			if (state.dex === 'down') {
				return route.abort();
			}

			const set = /id: "([^"]+)-"/.exec(route.request().postDataJSON().query)[1];

			state.calls.push(['graphql', set]);

			return route.fulfill({body: JSON.stringify({data: {cards: Object.entries((state.dex || {})[set] || {}).map(([id, dexId]) => ({dexId: dexId.length ? dexId : null, id}))}}), contentType: 'application/json'});
		}

		if (!url.startsWith(`${SUPABASE}/rest/v1/rpc/`)) {
			return route.abort();
		}

		const name = url.split('/rpc/')[1];
		const args = route.request().postDataJSON() || {};
		const json = (body, status = 200) => route.fulfill({body: JSON.stringify(body), contentType: 'application/json', status});

		state.calls.push([name, args]);

		if (state.slow) {
			await new Promise((resolve) => setTimeout(resolve, state.slow));
		}

		if ((state.failRpc || []).includes(name)) {
			return json({message: 'boom'}, 500);
		}

		const answers = {
			listing_status: () => json(Object.fromEntries(args.ids.map((id) => [id, (state.status && state.status[id]) || 'available']))),
			order_status: () => json(state.orders || []),
			place_order: () => (state.placeOrder ? state.placeOrder(args, json) : json({code: 'HTR-0042', receipt_token: '99999999-8888-4777-8666-555555555555', reserved_until: new Date(Date.now() + 48 * 3600e3).toISOString(), total: 0})),
			store_bundles: () => json(typeof state.bundles === 'function' ? state.bundles() : state.bundles || []),
			store_catalog: () => json(typeof state.catalog === 'function' ? state.catalog() : state.catalog || []),
			store_featured: () => json(state.featured || []),
			store_posts_public: () => json(state.posts || []),
			store_sealed: () => json(typeof state.sealed === 'function' ? state.sealed() : state.sealed || []),
		};

		return answers[name] ? answers[name]() : json({code: 'PGRST202', message: name}, 404);
	});
}

export async function open(browser, viewport, state, options = {}) {
	const context = await browser.newContext({hasTouch: viewport.width < 600, isMobile: viewport.width < 600, viewport, ...options});
	const page = await context.newPage();
	const errors = [];

	page.on('pageerror', (err) => errors.push(err.message));
	await stub(context, state);

	return {context, errors, page};
}

export const plain = (text) => String(text).replace(/\s+/g, ' ').trim();

export async function noSideways(page, assert, label) {
	const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

	assert.ok(wide <= 0, `${label} scrolls sideways by ${wide}px`);
}

export function runner() {
	let passed = 0;

	return {
		async check(label, run) {
			await run();
			passed++;
			console.log(`ok - ${label}`);
		},
		done() {
			console.log(`${passed} checks passed`);
		},
	};
}
