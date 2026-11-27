// O blog da HOTARU para quem visita (Eric, 2026-11-25): lê no navegador os
// posts publicados (store_posts_public e store_post, em supabase/store-
// blog.sql do card tracker). Rascunhos nunca chegam aqui: o banco não os
// entrega.
//
// Três lugares usam o script, cada um marcado por data-blog:
//   home  na home, os três posts mais recentes; a seção inteira fica
//         escondida quando não há post publicado ou o banco não responde
//   list  blog.html, todos os posts, com filtro por categoria
//         (blog.html?categoria=<nome>)
//   post  post.html?p=<endereço do post>, um post inteiro
//
// Todo texto vindo do banco entra como texto; o corpo do post é montado por
// assets/blog-render.js, nunca como HTML.

import {SUPABASE_KEY, SUPABASE_URL, blogPhotoUrl, postDate, renderPost} from './blog-render.js';

const HOME_LIMIT = 3;

function el(tag, attrs, ...children) {
	const node = document.createElement(tag);

	for (const [key, value] of Object.entries(attrs || {})) {
		if (value === null || value === undefined || value === false) {
			continue;
		}

		if (key.startsWith('on') && typeof value === 'function') {
			node.addEventListener(key.slice(2), value);
		}
		else {
			node.setAttribute(key, value === true ? '' : String(value));
		}
	}

	for (const child of children.flat(Infinity)) {
		if (child !== null && child !== undefined && child !== false && child !== '') {
			node.append(child instanceof Node ? child : document.createTextNode(String(child)));
		}
	}

	return node;
}

const message = (text) => el('p', {class: 'card-note', role: 'status'}, text);

async function rpc(name, args = {}) {
	const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
		body: JSON.stringify(args),
		headers: {apikey: SUPABASE_KEY, 'Content-Type': 'application/json'},
		method: 'POST',
	});
	const body = await response.json().catch(() => null);

	if (!response.ok) {
		throw Object.assign(new Error((body && body.message) || `${name} ${response.status}`), {code: body && body.code});
	}

	return body;
}

const postHref = (post) => `post.html?p=${encodeURIComponent(post.slug)}`;
const categoryHref = (name) => `blog.html?categoria=${encodeURIComponent(name)}`;

// Um post na lista: capa, categoria, título, data e resumo. O cartão inteiro
// abre o post.
function postCard(post) {
	const cover = blogPhotoUrl(post.cover);

	return el('article', {class: 'post-card'},
		el('a', {'aria-hidden': 'true', class: `post-card-cover${cover ? '' : ' post-card-nocover'}`, href: postHref(post), tabindex: '-1'},
			cover ? el('img', {alt: '', decoding: 'async', loading: 'lazy', src: cover}) : el('img', {alt: '', class: 'post-card-mark', src: 'assets/logo-card.png'})),
		el('div', {class: 'post-card-body'},
			post.category ? el('p', {class: 'eyebrow'}, post.category) : '',
			el('h3', null, el('a', {class: 'post-card-link', href: postHref(post)}, post.title)),
			el('p', {class: 'post-date'}, el('time', {datetime: post.published_at}, postDate(post.published_at))),
			post.excerpt ? el('p', {class: 'post-excerpt'}, post.excerpt) : ''
		)
	);
}

const grid = (posts) => el('div', {class: 'post-grid'}, posts.map(postCard));

function home(root, posts) {
	const section = root.closest('section') || root;

	if (!posts.length) {
		section.hidden = true;

		return;
	}

	root.replaceChildren(grid(posts.slice(0, HOME_LIMIT)));
	section.hidden = false;
}

function list(root, posts) {
	if (!posts.length) {
		root.replaceChildren(message('Nenhum post publicado ainda. Volte em breve.'));

		return;
	}

	const wanted = new URLSearchParams(window.location.search).get('categoria');
	const categories = [...new Set(posts.map((post) => post.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
	const current = categories.includes(wanted) ? wanted : null;
	const shown = current ? posts.filter((post) => post.category === current) : posts;

	root.replaceChildren(
		wanted && !current ? el('p', {class: 'card-note', role: 'status'}, `Não há posts na categoria "${wanted}". A lista mostra todos os posts.`) : '',
		categories.length > 1 || current
			? el('nav', {'aria-label': 'Categorias do blog', class: 'chips post-chips'},
				el('a', {'aria-current': current ? null : 'page', class: 'chip', href: 'blog.html'}, 'Todos'),
				categories.map((name) => el('a', {'aria-current': name === current ? 'page' : null, class: 'chip', href: categoryHref(name)}, name)))
			: '',
		grid(shown)
	);
}

// O corpo do post. Quando ele abre com um título que repete o do post (como
// "Os Mandamentos do Colecionador (Parte 1)" sob "Os Mandamentos do
// Colecionador"), o título da página passa a ser esse e o título repetido sai
// do corpo.
function postBody(post, heading) {
	const body = el('div', {class: 'post-body'}, renderPost(post.body, {title: post.title}));
	const first = body.firstElementChild;
	const same = (text) => text.trim().toLowerCase();

	if (first && /^H[1-3]$/.test(first.tagName) && same(first.textContent).startsWith(same(post.title))) {
		if (first.textContent.trim().length > post.title.trim().length) {
			heading.textContent = first.textContent.trim();
		}

		first.remove();
	}

	return body;
}

async function one(root) {
	const slug = new URLSearchParams(window.location.search).get('p');
	let post = null;

	try {
		post = slug ? await rpc('store_post', {post_slug: slug}) : null;
	}
	catch {
		root.replaceChildren(message('Não foi possível carregar o post agora. Tente de novo em instantes.'));

		return;
	}

	if (!post) {
		root.replaceChildren(
			message('Este post não existe ou não está mais publicado.'),
			el('a', {class: 'btn btn-navy', href: 'blog.html'}, 'Ver os posts do blog')
		);
		document.title = 'Post não encontrado | HOTARU';

		return;
	}

	const cover = blogPhotoUrl(post.cover);
	const crumbs = document.querySelector('[data-blog-crumb]');

	if (crumbs) {
		crumbs.textContent = post.title;
	}

	document.title = `${post.title} | Blog HOTARU`;

	const description = document.querySelector('meta[name="description"]');

	if (description && post.excerpt) {
		description.setAttribute('content', post.excerpt);
	}

	const heading = el('h1', null, post.title);

	root.replaceChildren(el('article', {class: 'post'},
		el('header', {class: 'post-head'},
			post.category ? el('a', {class: 'eyebrow post-category', href: categoryHref(post.category)}, post.category) : '',
			heading,
			el('p', {class: 'post-date'}, el('time', {datetime: post.published_at}, postDate(post.published_at)))
		),
		cover ? el('img', {alt: '', class: 'post-cover', decoding: 'async', src: cover}) : '',
		postBody(post, heading),
		el('p', {class: 'post-back'}, el('a', {class: 'btn btn-navy', href: 'blog.html'}, 'Mais posts do blog'))
	));
}

async function start() {
	const postRoot = document.querySelector('[data-blog="post"]');

	if (postRoot) {
		one(postRoot);
	}

	const roots = [...document.querySelectorAll('[data-blog="home"], [data-blog="list"]')];

	if (!roots.length) {
		return;
	}

	let posts;

	try {
		const rows = await rpc('store_posts_public');

		posts = Array.isArray(rows) ? rows : [];
	}
	catch {
		for (const root of roots) {
			if (root.dataset.blog === 'home') {
				(root.closest('section') || root).hidden = true;
			}
			else {
				root.replaceChildren(message('Não foi possível carregar o blog agora. Tente de novo em instantes.'));
			}
		}

		return;
	}

	for (const root of roots) {
		(root.dataset.blog === 'home' ? home : list)(root, posts);
	}
}

start();
