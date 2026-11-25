// O texto de um post do blog, montado na página (Eric, 2026-11-25). O post é
// escrito no editor visual do admin (Quill), que guarda o texto no formato
// dele, o Delta: uma lista de pedaços de texto com o que cada um tem
// (negrito, link, título, lista...). Este módulo transforma esse Delta em
// elementos da página, um a um, e nunca em HTML: um <script>, um onerror= ou
// um link javascript: escrito ou colado num post aparece como texto, ou some,
// e nunca roda no navegador de quem lê.
//
// Só entra o que o editor do blog oferece: parágrafos, títulos (h2, h3),
// citações, listas com marcadores e numeradas, negrito, itálico, sublinhado,
// riscado, links http, https, mailto e tel, fotos da pasta do post no bucket
// store e vídeos do YouTube, guardados como o ID do vídeo e mostrados pelo
// youtube-nocookie.com. Qualquer outra coisa é ignorada.
//
// Usado pelas páginas do blog (assets/blog.js) e pela prévia do admin
// (assets/admin.js).

export const SUPABASE_URL = 'https://ehdkbxrjxsypegbtrxbw.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_Ycfz9bobfuvHWdDKjaoQQA_LDYmm0vJ';

const BLOG_PATH = /^blog\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9_-]{1,64}\.(webp|jpg|png)$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export const YT_EMBED = 'https://www.youtube-nocookie.com/embed/';

export const isBlogPath = (path) => typeof path === 'string' && BLOG_PATH.test(path);

export const isVideoId = (id) => typeof id === 'string' && VIDEO_ID.test(id);

// O link público de uma foto do blog, ou null para um caminho que não é de
// uma pasta de post.
export const blogPhotoUrl = (path) => (isBlogPath(path) ? `${SUPABASE_URL}/storage/v1/object/public/store/${path}` : null);

// O ID de um vídeo a partir do que se cola: o link do vídeo (watch?v=,
// youtu.be/, shorts/, live/, embed/) ou o próprio ID. null quando não é do
// YouTube.
export function youtubeId(text) {
	const typed = String(text || '').trim();

	if (isVideoId(typed)) {
		return typed;
	}

	let url;

	try {
		url = new URL(typed);
	}
	catch {
		return null;
	}

	const host = url.hostname.replace(/^(www|m|music)\./, '');
	let id = null;

	if (host === 'youtu.be') {
		id = url.pathname.split('/')[1];
	}
	else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
		const parts = url.pathname.split('/').filter(Boolean);

		id = parts[0] === 'watch' ? url.searchParams.get('v') : ['embed', 'shorts', 'live', 'v'].includes(parts[0]) ? parts[1] : null;
	}

	return isVideoId(id) ? id : null;
}

// Um link que pode virar <a>: http, https, mailto ou tel. null para o resto.
export function safeHref(href) {
	if (typeof href !== 'string' || !href.trim()) {
		return null;
	}

	try {
		const url = new URL(href.trim(), window.location.href);

		return LINK_PROTOCOLS.has(url.protocol) ? url.href : null;
	}
	catch {
		return null;
	}
}

function el(tag, attrs, ...children) {
	const node = document.createElement(tag);

	for (const [key, value] of Object.entries(attrs || {})) {
		if (value !== null && value !== undefined && value !== false) {
			node.setAttribute(key, value === true ? '' : String(value));
		}
	}

	node.append(...children.filter((child) => child !== null && child !== undefined));

	return node;
}

// Um pedaço de texto com a formatação dele: o texto entra sempre como texto.
function inline(text, attributes = {}) {
	let node = document.createTextNode(text);

	for (const [name, tag] of [['strike', 's'], ['underline', 'u'], ['italic', 'em'], ['bold', 'strong']]) {
		if (attributes[name] === true) {
			node = el(tag, null, node);
		}
	}

	const href = attributes.link ? safeHref(attributes.link) : null;

	if (href) {
		const external = /^https?:/.test(href) && new URL(href).origin !== window.location.origin;

		node = el('a', {href, rel: external ? 'noopener noreferrer' : null, target: external ? '_blank' : null}, node);
	}

	return node;
}

function photo(path, title) {
	const src = blogPhotoUrl(path);

	return src ? el('img', {alt: title ? `Foto do post ${title}` : '', class: 'post-photo', decoding: 'async', loading: 'lazy', src}) : null;
}

function video(id) {
	if (!isVideoId(id)) {
		return null;
	}

	return el('div', {class: 'ytframe post-video'},
		el('iframe', {
			allow: 'accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share',
			allowfullscreen: true,
			loading: 'lazy',
			referrerpolicy: 'strict-origin-when-cross-origin',
			src: `${YT_EMBED}${id}`,
			title: 'Vídeo do YouTube',
		}));
}

// As linhas do Delta: cada uma com os pedaços dela e o formato do bloco
// (título, lista, citação), que o Quill guarda no \n que fecha a linha. Um
// vídeo é uma linha sozinho.
function lines(delta) {
	const ops = delta && Array.isArray(delta.ops) ? delta.ops : [];
	const out = [];
	let parts = [];

	for (const op of ops) {
		if (!op || typeof op !== 'object') {
			continue;
		}

		const attributes = op.attributes && typeof op.attributes === 'object' ? op.attributes : {};

		if (typeof op.insert === 'string') {
			const pieces = op.insert.split('\n');

			pieces.forEach((piece, index) => {
				if (piece) {
					parts.push({attributes, text: piece});
				}

				if (index < pieces.length - 1) {
					out.push({attributes, parts});
					parts = [];
				}
			});
		}
		else if (op.insert && typeof op.insert === 'object') {
			if (typeof op.insert.video === 'string') {
				if (parts.length) {
					out.push({attributes: {}, parts});
					parts = [];
				}

				out.push({video: op.insert.video});
			}
			else if (typeof op.insert.image === 'string') {
				parts.push({image: op.insert.image});
			}
		}
	}

	if (parts.length) {
		out.push({attributes: {}, parts});
	}

	return out;
}

// O Delta de um post como elementos da página.
export function renderPost(delta, {title = ''} = {}) {
	const fragment = document.createDocumentFragment();
	let list = null;

	for (const line of lines(delta)) {
		if (line.video !== undefined) {
			list = null;

			const frame = video(line.video);

			if (frame) {
				fragment.append(frame);
			}

			continue;
		}

		const children = line.parts.map((part) => (part.image !== undefined ? photo(part.image, title) : inline(part.text, part.attributes))).filter(Boolean);
		const kind = line.attributes.list === 'ordered' ? 'ol' : line.attributes.list === 'bullet' ? 'ul' : null;

		if (!children.length) {
			// Uma linha vazia no meio de uma lista não a quebra no editor; aqui
			// também não.
			if (!kind) {
				list = null;
			}

			continue;
		}

		if (kind) {
			if (!list || list.tagName.toLowerCase() !== kind) {
				list = el(kind);
				fragment.append(list);
			}

			list.append(el('li', null, ...children));

			continue;
		}

		list = null;

		const level = Number(line.attributes.header);
		const header = level === 2 ? 'h2' : level === 3 ? 'h3' : null;
		const onlyPhotos = line.parts.every((part) => part.image !== undefined);

		fragment.append(el(header || (line.attributes.blockquote === true ? 'blockquote' : onlyPhotos ? 'figure' : 'p'), onlyPhotos && !header ? {class: 'post-figure'} : null, ...children));
	}

	return fragment;
}

// O texto puro do post, para o resumo da lista: até max caracteres, cortado
// numa palavra.
export function plainText(delta, max = 200) {
	const ops = delta && Array.isArray(delta.ops) ? delta.ops : [];
	const text = ops.map((op) => (typeof op.insert === 'string' ? op.insert : ' ')).join('').replace(/\s+/g, ' ').trim();

	if (text.length <= max) {
		return text;
	}

	const cut = text.slice(0, max);
	const space = cut.lastIndexOf(' ');

	return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?-]+$/, '')}…`;
}

const DATE = new Intl.DateTimeFormat('pt-BR', {day: 'numeric', month: 'long', timeZone: 'America/Recife', year: 'numeric'});

export const postDate = (iso) => (iso ? DATE.format(new Date(iso)) : '');
