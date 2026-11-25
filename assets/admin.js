// A administração da HOTARU (admin.html): onde o Eric cadastra os produtos
// selados, com as próprias fotos (plano do card tracker, plans/hotaru-
// catalog-plan.md, etapa 4). As cartas continuam na tela Shop do tracker.
//
// O login é desta página (Eric, 2026-11-25), com a mesma conta do card
// tracker, no mesmo projeto do Supabase. Antes ela lia a sessão do tracker
// no navegador, o que só funcionava enquanto os dois sites ficavam em
// ericthmoritsuka.github.io; com o domínio lojahotaru.com.br, a loja fica
// em outra origem e não enxerga mais essa sessão. Agora o admin pede um
// link por e-mail (signInWithOtp, como js/auth.js do tracker), que volta
// para esta mesma página, e guarda a sessão na chave própria
// hotaru-admin-auth. shouldCreateUser: false: o link nunca cria conta.
// O endereço de volta precisa estar em Authentication > URL Configuration
// > Redirect URLs no Supabase; sem ele, o Supabase manda o link para o
// tracker. Quem decide se a conta pode cadastrar é o banco
// (supabase/store-sealed.sql: só o dono do grupo da família).
//
// Cada produto tem nome, tipo, idioma, descrição, preço, fotos (a primeira
// é a capa) e quantos estão à venda agora. As fotos são reduzidas aqui
// antes de subir para o bucket público store, em sealed/<produto>/.
//
// A aba Blog (Eric, 2026-11-25) escreve os posts num editor visual (Quill,
// em assets/vendor, carregado pela página antes deste módulo). As fotos dos
// posts vão para blog/<post>/ no mesmo bucket. O editor também aceita
// Markdown (assets/blog-markdown.js): atalhos ao digitar, texto colado e um
// modo de escrever em Markdown puro.

import {deltaToMarkdown, looksLikeMarkdown, markdownToDelta, readMarkdownFile} from './blog-markdown.js';
import {YT_EMBED, blogPhotoUrl, isBlogPath, plainText, postDate, renderPost, youtubeId} from './blog-render.js';
import {createClient} from './vendor/supabase-js-2.117.2.js';

const SUPABASE_URL = 'https://ehdkbxrjxsypegbtrxbw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Ycfz9bobfuvHWdDKjaoQQA_LDYmm0vJ';
const BUCKET = 'store';
const MAX_PHOTOS = 8;
// Uma foto vira um JPG de até 1600 px no lado maior e menos de 1 MB, o
// limite do bucket.
const MAX_SIDE = 1600;
const MAX_BYTES = 1000 * 1024;
const CATEGORIES = ['Booster', 'Booster box', 'Blister', 'Elite Trainer Box', 'Box de coleção', 'Lata', 'Deck', 'Outro'];
const LANGUAGES = {en: 'Inglês', ja: 'Japonês', ko: 'Coreano', pt: 'Português', 'zh-tw': 'Chinês tradicional'};

const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
	auth: {
		autoRefreshToken: true,
		detectSessionInUrl: false,
		flowType: 'pkce',
		persistSession: true,
		storageKey: 'hotaru-admin-auth',
	},
});

const root = document.querySelector('[data-admin]');

function el(tag, attrs, ...children) {
	const node = document.createElement(tag);

	for (const [key, value] of Object.entries(attrs || {})) {
		if (value === null || value === undefined || value === false) {
			continue;
		}

		if (key.startsWith('on') && typeof value === 'function') {
			node.addEventListener(key.slice(2), value);
		}
		else if (key === 'value') {
			node.value = value;
		}
		else {
			node.setAttribute(key, value === true ? '' : String(value));
		}
	}

	for (const child of children.flat(Infinity)) {
		if (child !== null && child !== undefined && child !== false) {
			node.append(child instanceof Node ? child : document.createTextNode(String(child)));
		}
	}

	return node;
}

const brl = (value) => {
	const [whole, cents] = (Math.round(Number(value) * 100) / 100).toFixed(2).split('.');

	return `R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cents}`;
};

const photoUrl = (path) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;

// 30,50 ou 1.500,00 ou 30.5: o preço como número, ou null.
function readPrice(text) {
	const typed = String(text || '').replace(/\s/g, '').replace(/^R\$/i, '');
	let plain = null;

	if (/^(\d{1,3}(\.\d{3})+|\d+),\d{1,2}$/.test(typed)) {
		plain = typed.replace(/\./g, '').replace(',', '.');
	}
	else if (/^\d+(\.\d{1,2})?$/.test(typed)) {
		plain = typed;
	}

	const value = plain === null ? NaN : Number(plain);

	return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

const priceText = (value) => (value ? (Math.round(Number(value) * 100) / 100).toFixed(2).replace('.', ',') : '');

function message(text, cls = 'admin-note') {
	return el('p', {class: cls, role: 'status'}, text);
}

// -------------------------------------------------------------- photos

// A foto reduzida para JPG. Lança um erro com a mensagem a mostrar quando
// o navegador não abre o arquivo (HEIC num navegador sem suporte, por
// exemplo).
// The photo opened for drawing: createImageBitmap, else an <img>, which some
// browsers decode when createImageBitmap does not.
async function openPhoto(file) {
	try {
		return await createImageBitmap(file);
	}
	catch {
		const url = URL.createObjectURL(file);
		const img = new Image();

		img.src = url;

		try {
			await img.decode();
		}
		catch {
			URL.revokeObjectURL(url);
			throw new Error(`${file.name}: este navegador não abre esse formato. Use uma foto JPG ou PNG.`);
		}

		return {close: () => URL.revokeObjectURL(url), height: img.naturalHeight, image: img, width: img.naturalWidth};
	}
}

async function shrink(file) {
	const opened = await openPhoto(file);
	const bitmap = opened.image ? opened : {close: () => opened.close(), height: opened.height, image: opened, width: opened.width};

	for (const [side, quality] of [[MAX_SIDE, 0.85], [MAX_SIDE, 0.7], [1200, 0.7], [1000, 0.6]]) {
		const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement('canvas');

		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);
		canvas.getContext('2d').drawImage(bitmap.image, 0, 0, canvas.width, canvas.height);

		const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

		if (blob && blob.size <= MAX_BYTES) {
			bitmap.close();

			return blob;
		}
	}

	bitmap.close();
	throw new Error(`${file.name}: a foto ficou grande demais mesmo reduzida.`);
}

const randomName = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => n.toString(16).padStart(2, '0')).join('');

// Sobe uma foto já reduzida para a pasta (sealed/<produto>/ ou
// blog/<post>/) e devolve o caminho dela no bucket.
async function uploadTo(folder, blob) {
	const path = `${folder}${randomName()}.jpg`;
	// The bytes with their type, as the card tracker uploads its photos, so
	// the bucket sees image/jpeg rather than a form.
	const {error} = await client.storage.from(BUCKET).upload(path, await blob.arrayBuffer(), {cacheControl: '31536000', contentType: 'image/jpeg', upsert: false});

	if (error) {
		throw new Error(`A foto não subiu: ${error.message}`);
	}

	return path;
}

const upload = (productId, blob) => uploadTo(`sealed/${productId}/`, blob);

// --------------------------------------------------------------- form

function productForm(product, {onDone}) {
	const isNew = !product;
	const id = isNew ? crypto.randomUUID() : product.id;
	// Fotos já no bucket (caminhos) e novas, ainda no aparelho ({file, url}).
	let photos = isNew ? [] : [...(product.photos || [])];
	let busy = false;

	const name = el('input', {id: 'admin-name', maxlength: 120, required: true, type: 'text', value: isNew ? '' : product.name});
	const category = el('input', {id: 'admin-category', list: 'admin-categories', maxlength: 40, type: 'text', value: isNew ? '' : product.category || ''});
	const categories = el('datalist', {id: 'admin-categories'}, CATEGORIES.map((one) => el('option', {value: one})));
	const language = el('select', {id: 'admin-language'},
		el('option', {value: ''}, 'Sem idioma'),
		Object.entries(LANGUAGES).map(([code, label]) => el('option', {selected: !isNew && product.language === code, value: code}, label)));
	const price = el('input', {id: 'admin-price', inputmode: 'decimal', placeholder: '0,00', type: 'text', value: isNew ? '' : priceText(product.price_brl)});
	const quantity = el('input', {id: 'admin-quantity', inputmode: 'numeric', max: 99, min: 0, type: 'number', value: isNew ? '1' : String(product.available)});
	const description = el('textarea', {id: 'admin-description', maxlength: 2000, rows: 4}, isNew ? '' : product.description || '');
	const active = el('input', {checked: isNew || product.active, id: 'admin-active', type: 'checkbox'});
	const files = el('input', {accept: 'image/*', id: 'admin-files', multiple: true, type: 'file'});
	const gallery = el('div', {class: 'admin-photos', id: 'admin-photos'});
	const status = el('p', {'aria-live': 'polite', class: 'admin-status', id: 'admin-status'});
	const save = el('button', {class: 'btn btn-gold', id: 'admin-save', type: 'submit'}, isNew ? 'Cadastrar produto' : 'Salvar');

	function drawPhotos() {
		gallery.replaceChildren(...photos.map((photo, i) => el('figure', {class: `admin-photo${i === 0 ? ' admin-cover' : ''}`},
			el('img', {alt: `Foto ${i + 1}`, src: typeof photo === 'string' ? photoUrl(photo) : photo.url}),
			el('figcaption', null,
				i === 0 ? el('span', {class: 'admin-cover-tag'}, 'Capa') : el('button', {class: 'admin-link', onclick: () => {
					photos = [photo, ...photos.filter((one) => one !== photo)];
					drawPhotos();
				}, type: 'button'}, 'Usar como capa'),
				el('button', {class: 'admin-link', onclick: () => {
					photos = photos.filter((one) => one !== photo);
					drawPhotos();
				}, type: 'button'}, 'Remover')
			)
		)));
		files.disabled = photos.length >= MAX_PHOTOS;
	}

	files.addEventListener('change', () => {
		const room = MAX_PHOTOS - photos.length;
		const picked = [...files.files].slice(0, room);

		photos = [...photos, ...picked.map((file) => ({file, url: URL.createObjectURL(file)}))];
		files.value = '';
		status.textContent = files.files.length > room ? `Até ${MAX_PHOTOS} fotos por produto.` : '';
		drawPhotos();
	});

	const form = el('form', {class: 'admin-form', id: 'admin-form', novalidate: true},
		el('h2', null, isNew ? 'Novo produto' : `Editar: ${product.name}`),
		isNew ? null : el('p', {class: 'admin-counts'}, `À venda: ${product.available} · Reservados: ${product.reserved} · Vendidos: ${product.sold}`),
		el('label', {for: 'admin-name'}, 'Nome'), name,
		el('label', {for: 'admin-category'}, 'Tipo'), category, categories,
		el('label', {for: 'admin-language'}, 'Idioma'), language,
		el('label', {for: 'admin-price'}, 'Preço (R$)'), price,
		el('label', {for: 'admin-quantity'}, 'Quantidade à venda agora'), quantity,
		el('p', {class: 'admin-hint'}, 'Quantos estão disponíveis para comprar. Os reservados por um pedido e os vendidos não entram nesta conta.'),
		el('label', {for: 'admin-description'}, 'Descrição'), description,
		el('p', {class: 'admin-hint'}, 'Use **negrito**, *itálico* e linhas começando com "- " para fazer listas. Uma linha em branco separa os parágrafos.'),
		el('label', {class: 'admin-check'}, active, ' Mostrar na loja'),
		el('label', {for: 'admin-files'}, 'Fotos (a primeira é a capa)'), gallery, files,
		status,
		el('div', {class: 'admin-actions'},
			save,
			el('button', {class: 'btn btn-navy', onclick: () => onDone(null), type: 'button'}, 'Voltar')
		)
	);

	form.addEventListener('submit', async (event) => {
		event.preventDefault();

		if (busy) {
			return;
		}

		const value = readPrice(price.value);
		const count = Number(quantity.value);

		if (!name.value.trim()) {
			status.textContent = 'Escreva o nome do produto.';
			name.focus();

			return;
		}

		if (value === null) {
			status.textContent = 'Escreva o preço, como 30,50.';
			price.focus();

			return;
		}

		if (!Number.isInteger(count) || count < 0 || count > 99) {
			status.textContent = 'A quantidade vai de 0 a 99.';
			quantity.focus();

			return;
		}

		busy = true;
		save.disabled = true;

		try {
			const paths = [];

			for (const [i, photo] of photos.entries()) {
				if (typeof photo === 'string') {
					paths.push(photo);
				}
				else {
					status.textContent = `Enviando a foto ${i + 1} de ${photos.length}…`;
					paths.push(await upload(id, await shrink(photo.file)));
				}
			}

			status.textContent = 'Salvando…';

			const {data, error} = await client.rpc('save_product', {product: {
				active: active.checked,
				category: category.value.trim() || null,
				description: description.value.trim() || null,
				id,
				language: language.value || null,
				name: name.value.trim(),
				photos: paths,
				price_brl: value,
				quantity: count,
			}});

			if (error) {
				throw new Error(error.message);
			}

			onDone(data);
		}
		catch (err) {
			status.textContent = `Não foi salvo. ${err.message || err}`;
			busy = false;
			save.disabled = false;
		}
	});

	drawPhotos();

	return form;
}

// --------------------------------------------------------------- list

function productRow(product, {onEdit}) {
	const cover = product.photos && product.photos[0];

	return el('li', {class: `admin-product${product.active ? '' : ' admin-inactive'}`, id: `admin-${product.id}`},
		cover ? el('img', {alt: '', class: 'admin-thumb', loading: 'lazy', src: photoUrl(cover)}) : el('span', {'aria-hidden': 'true', class: 'admin-thumb admin-thumb-none'}),
		el('div', {class: 'admin-product-body'},
			el('p', {class: 'admin-product-name'}, product.name),
			el('p', {class: 'admin-product-meta'}, [product.category, LANGUAGES[product.language], brl(product.price_brl)].filter(Boolean).join(' · ')),
			el('p', {class: 'admin-product-counts'}, product.active
				? `À venda: ${product.available} · Reservados: ${product.reserved} · Vendidos: ${product.sold}`
				: `Fora da loja · Reservados: ${product.reserved} · Vendidos: ${product.sold}`)
		),
		el('button', {class: 'btn btn-navy admin-edit', onclick: () => onEdit(product), type: 'button'}, 'Editar')
	);
}

async function showList(notice = '') {
	root.replaceChildren(message('Carregando os produtos…'));

	const {data, error} = await client.rpc('store_products_admin');

	if (error) {
		root.replaceChildren(message(error.code === '42501'
			? 'Esta conta não é a dona da loja. Toque em Sair e entre com a conta do Eric.'
			: error.code === 'PGRST202'
				? 'A loja ainda não tem selados: rode supabase/store-sealed.sql no Supabase.'
				: `Não foi possível ler os produtos. ${error.message}`));

		return;
	}

	const products = Array.isArray(data) ? data : [];
	const edit = (product) => {
		root.replaceChildren(productForm(product, {onDone: (saved) => showList(saved ? `${saved.name}: salvo. À venda: ${saved.available}.` : '')}));
		window.scrollTo(0, 0);
	};

	root.replaceChildren(
		tabs('selados'),
		notice ? message(notice, 'admin-done') : '',
		el('div', {class: 'admin-head'},
			el('h2', null, products.length ? `Selados (${products.length})` : 'Selados'),
			el('button', {class: 'btn btn-gold', id: 'admin-new', onclick: () => edit(null), type: 'button'}, 'Novo produto')
		),
		products.length
			? el('ul', {class: 'admin-list'}, products.map((product) => productRow(product, {onEdit: edit})))
			: message('Nenhum produto ainda. Cadastre o primeiro com Novo produto.')
	);
}

// As partes da administração: os selados, os destaques e o blog. canLeave
// pergunta antes de sair de uma tela com alterações não salvas.
function tabs(current, canLeave = () => true) {
	const tab = (id, label, open) => el('button', {
		'aria-current': current === id ? 'page' : null,
		class: `btn ${current === id ? 'btn-gold' : 'btn-navy'}`,
		id: `admin-tab-${id}`,
		onclick: () => {
			if (current !== id && canLeave()) {
				open();
			}
		},
		type: 'button',
	}, label);

	return el('nav', {'aria-label': 'Administração', class: 'admin-tabs'},
		tab('selados', 'Selados', () => showList()),
		tab('destaques', 'Destaques', () => showFeatured()),
		tab('blog', 'Blog', () => showPosts())
	);
}

// ------------------------------------------------------------ featured

// Os destaques (Eric, 2026-11-25): o que aparece primeiro na home, em
// Cartas avulsas e em Selados, na ordem daqui. Cartas e coleções vêm do
// catálogo que o Shop do tracker publica (store_catalog); selados, dos
// produtos desta página. Salvar troca a lista inteira (save_featured, em
// supabase/store-featured.sql do card tracker). Um destaque que não está
// à venda agora continua na lista e o site o pula até voltar.

const MAX_FEATURED = 60;
const MAX_RESULTS = 20;

const fold = (text) => String(text || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

const cardKey = (item) => `card|${item.card_id}|${item.language || ''}|${item.finish || ''}`;
const itemKey = (item) => (item.kind === 'card' ? cardKey(item) : item.kind === 'set' ? `set|${item.set_name}` : `product|${item.product_id}`);

// O catálogo em anúncios (carta + idioma + acabamento) e em coleções, como
// o site os mostra.
function catalogEntries(rows) {
	const entries = new Map();

	for (const row of rows) {
		if (row.kind !== 'single' || !row.card_id) {
			continue;
		}

		const card = {card_id: row.card_id, finish: row.finish || '', kind: 'card', language: row.language || ''};
		const key = cardKey(card);

		if (!entries.has(key)) {
			entries.set(key, {...card, copies: 0, image: null, name: row.name, number: row.number, price: Infinity, set_name: row.set_name});
		}

		const entry = entries.get(key);

		entry.copies += 1;
		entry.price = Math.min(entry.price, Number(row.price_brl));
		entry.image = entry.image || row.image_path;

		if (row.set_name) {
			const setKey = `set|${row.set_name}`;

			if (!entries.has(setKey)) {
				entries.set(setKey, {cards: new Set(), image: null, kind: 'set', price: Infinity, set_name: row.set_name, top: -Infinity});
			}

			const set = entries.get(setKey);

			set.cards.add(key);
			set.price = Math.min(set.price, Number(row.price_brl));

			if (Number(row.price_brl) > set.top && row.image_path) {
				set.top = Number(row.price_brl);
				set.image = row.image_path;
			}
		}
	}

	return entries;
}

const LANGUAGE_NAMES = {...LANGUAGES, de: 'Alemão', es: 'Espanhol', fr: 'Francês', it: 'Italiano', 'zh-cn': 'Chinês simplificado'};

// O que a linha diz de um destaque: nome e detalhes, e se está à venda.
function describe(item, entries, products) {
	if (item.kind === 'product') {
		const product = products.get(item.product_id);

		if (!product) {
			return {gone: 'Produto apagado', image: null, meta: 'Selado', name: 'Produto'};
		}

		return {
			gone: !product.active ? 'Fora da loja: o site não mostra' : !product.available ? 'Sem unidade à venda: o site não mostra agora' : '',
			image: product.photos && product.photos[0],
			meta: [product.category || 'Selado', LANGUAGE_NAMES[product.language], brl(product.price_brl)].filter(Boolean).join(' · '),
			name: product.name,
		};
	}

	const entry = entries.get(itemKey(item));

	if (item.kind === 'set') {
		return entry
			? {gone: '', image: entry.image, meta: `Coleção · ${entry.cards.size === 1 ? '1 carta' : `${entry.cards.size} cartas`} · a partir de ${brl(entry.price)}`, name: item.set_name}
			: {gone: 'Nenhuma carta à venda agora: o site não mostra', image: null, meta: 'Coleção', name: item.set_name};
	}

	const details = (one) => ['Carta', one.set_name, one.number ? `nº ${one.number}` : null, LANGUAGE_NAMES[one.language] || one.language.toUpperCase(), one.finish || null].filter(Boolean).join(' · ');

	return entry
		? {gone: '', image: entry.image, meta: `${details(entry)} · ${brl(entry.price)}`, name: entry.name}
		: {gone: 'Não está à venda agora: o site não mostra', image: null, meta: details({...item, set_name: null}), name: item.card_id};
}

function featuredRow(info, {first, last, onMove, onRemove}) {
	return el('li', {class: `admin-product${info.gone ? ' admin-inactive' : ''}`},
		info.image ? el('img', {alt: '', class: 'admin-thumb', loading: 'lazy', src: photoUrl(info.image)}) : el('span', {'aria-hidden': 'true', class: 'admin-thumb admin-thumb-none'}),
		el('div', {class: 'admin-product-body'},
			el('p', {class: 'admin-product-name'}, info.name),
			el('p', {class: 'admin-product-meta'}, info.meta),
			info.gone ? el('p', {class: 'admin-product-counts admin-gone'}, info.gone) : ''
		),
		el('div', {class: 'admin-moves'},
			el('button', {'aria-label': `Subir ${info.name}`, class: 'admin-move', disabled: first, onclick: () => onMove(-1), type: 'button'}, '↑'),
			el('button', {'aria-label': `Descer ${info.name}`, class: 'admin-move', disabled: last, onclick: () => onMove(1), type: 'button'}, '↓'),
			el('button', {'aria-label': `Tirar ${info.name} dos destaques`, class: 'admin-move', onclick: onRemove, type: 'button'}, 'Tirar')
		)
	);
}

function addRow(info, onAdd) {
	return el('li', {class: 'admin-product'},
		info.image ? el('img', {alt: '', class: 'admin-thumb', loading: 'lazy', src: photoUrl(info.image)}) : el('span', {'aria-hidden': 'true', class: 'admin-thumb admin-thumb-none'}),
		el('div', {class: 'admin-product-body'},
			el('p', {class: 'admin-product-name'}, info.name),
			el('p', {class: 'admin-product-meta'}, info.meta),
			info.gone ? el('p', {class: 'admin-product-counts admin-gone'}, info.gone) : ''
		),
		el('button', {'aria-label': `Pôr ${info.name} nos destaques`, class: 'btn btn-navy admin-edit', onclick: onAdd, type: 'button'}, 'Destacar')
	);
}

async function showFeatured(notice = '') {
	root.replaceChildren(tabs('destaques'), message('Carregando os destaques…'));

	const [featured, catalog, admin] = await Promise.all([
		client.rpc('store_featured'),
		client.rpc('store_catalog'),
		client.rpc('store_products_admin'),
	]);
	const error = featured.error || catalog.error || admin.error;

	if (error) {
		root.replaceChildren(tabs('destaques'), message(error.code === '42501'
			? 'Esta conta não é a dona da loja. Toque em Sair e entre com a conta do Eric.'
			: error.code === 'PGRST202'
				? 'Os destaques ainda não existem no banco: rode supabase/store-featured.sql no Supabase.'
				: `Não foi possível ler os destaques. ${error.message}`));

		return;
	}

	const entries = catalogEntries(Array.isArray(catalog.data) ? catalog.data : []);
	const products = new Map((Array.isArray(admin.data) ? admin.data : []).map((product) => [product.id, product]));
	const saved = Array.isArray(featured.data) ? featured.data : [];
	// As duas listas, cada uma na ordem do Eric: cartas e coleções, selados.
	const lists = {
		cards: saved.filter((item) => item.kind !== 'product'),
		products: saved.filter((item) => item.kind === 'product'),
	};
	const status = el('p', {class: 'admin-status', role: 'status'}, notice);
	const saveButton = el('button', {class: 'btn btn-gold', id: 'admin-save-featured', type: 'button'}, 'Salvar destaques');
	const cardBox = el('div');
	const productBox = el('div');
	const search = el('input', {'aria-label': 'Buscar carta ou coleção', class: 'admin-search', placeholder: 'Buscar carta ou coleção à venda', type: 'search'});
	const results = el('ul', {class: 'admin-results'});
	const productResults = el('ul', {class: 'admin-results'});
	let dirty = false;

	const has = (item) => [...lists.cards, ...lists.products].some((one) => itemKey(one) === itemKey(item));
	const total = () => lists.cards.length + lists.products.length;

	function changed() {
		dirty = true;
		status.className = 'admin-status';
		status.textContent = 'Alterações não salvas.';
		draw();
	}

	function add(listName, item) {
		if (total() >= MAX_FEATURED) {
			status.textContent = `No máximo ${MAX_FEATURED} destaques.`;

			return;
		}

		lists[listName].push(item);
		changed();
	}

	function drawList(listName, box, empty) {
		const list = lists[listName];

		box.replaceChildren(list.length
			? el('ol', {class: 'admin-list'}, list.map((item, index) => featuredRow(describe(item, entries, products), {
				first: index === 0,
				last: index === list.length - 1,
				onMove: (step) => {
					const [moved] = list.splice(index, 1);

					list.splice(index + step, 0, moved);
					changed();
				},
				onRemove: () => {
					list.splice(index, 1);
					changed();
				},
			})))
			: message(empty));
	}

	function drawResults() {
		const words = fold(search.value).split(/\s+/).filter(Boolean);

		if (!words.length) {
			results.replaceChildren();

			return;
		}

		const found = [...entries.values()]
			.filter((entry) => !has(entry))
			.map((entry) => ({entry, info: describe(entry, entries, products)}))
			.filter(({info}) => {
				const text = fold(`${info.name} ${info.meta}`);

				return words.every((word) => text.includes(word));
			})
			// As coleções antes das cartas, depois pelo nome.
			.sort((a, b) => (a.entry.kind === 'set' ? 0 : 1) - (b.entry.kind === 'set' ? 0 : 1) || a.info.name.localeCompare(b.info.name, 'pt-BR'))
			.slice(0, MAX_RESULTS);

		results.replaceChildren(...(found.length
			? found.map(({entry, info}) => addRow(info, () => add('cards', entry.kind === 'set'
				? {kind: 'set', set_name: entry.set_name}
				: {card_id: entry.card_id, finish: entry.finish, kind: 'card', language: entry.language})))
			: [el('li', null, message('Nada à venda com esse nome.'))]));
	}

	function drawProductResults() {
		const left = [...products.values()].filter((product) => !has({kind: 'product', product_id: product.id}));

		productResults.replaceChildren(...left.map((product) => addRow(describe({kind: 'product', product_id: product.id}, entries, products), () => add('products', {kind: 'product', product_id: product.id}))));
	}

	function draw() {
		drawList('cards', cardBox, 'Nenhuma carta ou coleção em destaque. A home mostra as de maior preço.');
		drawList('products', productBox, 'Nenhum selado em destaque. Os selados aparecem na ordem de sempre.');
		drawResults();
		drawProductResults();
	}

	search.addEventListener('input', drawResults);

	saveButton.addEventListener('click', async () => {
		saveButton.disabled = true;
		status.className = 'admin-status';
		status.textContent = 'Salvando…';

		const items = [...lists.cards, ...lists.products].map((item) => (item.kind === 'card'
			? {card_id: item.card_id, finish: item.finish || '', kind: 'card', language: item.language || ''}
			: item.kind === 'set'
				? {kind: 'set', set_name: item.set_name}
				: {kind: 'product', product_id: item.product_id}));
		const {error: saveError} = await client.rpc('save_featured', {items});

		saveButton.disabled = false;

		if (saveError) {
			status.textContent = `Não foi possível salvar. ${saveError.message}`;

			return;
		}

		dirty = false;
		showFeatured('Destaques salvos. O site já mostra a nova ordem.');
	});

	root.replaceChildren(
		tabs('destaques', () => !dirty || window.confirm('Sair sem salvar os destaques?')),
		el('div', {class: 'admin-featured'},
			el('p', {class: 'admin-hint'}, 'O que fica no alto do site, nesta ordem. Cartas e coleções aparecem primeiro na home e em Cartas avulsas; selados, primeiro em Selados e na home.'),
			el('section', {'aria-labelledby': 'admin-featured-cards'},
				el('h3', {id: 'admin-featured-cards'}, 'Cartas avulsas'),
				cardBox,
				el('label', {class: 'admin-hint'}, 'Destacar uma carta ou uma coleção inteira:'),
				search,
				results
			),
			el('section', {'aria-labelledby': 'admin-featured-products'},
				el('h3', {id: 'admin-featured-products'}, 'Selados'),
				productBox,
				products.size ? el('p', {class: 'admin-hint'}, 'Destacar um selado:') : '',
				productResults
			),
			el('div', {class: 'admin-save-bar'}, saveButton, status)
		)
	);
	draw();
}

// ---------------------------------------------------------------- blog

// Os posts do blog (Eric, 2026-11-25): rascunho até o Eric publicar, com
// categoria, capa, resumo e o texto no editor visual. O banco guarda o texto
// no formato do editor (Delta), com cada foto como o caminho dela em
// blog/<post>/ e cada vídeo como o ID do YouTube; as páginas públicas o
// montam com assets/blog-render.js. Salvar não sai do post: o Eric continua
// escrevendo, e Voltar leva à lista.

const BLOG_CATEGORIES = ['Pokémon TCG', 'Coleção', 'Outros'];
const PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
// Sem sublinhado: o Markdown não tem, e as duas formas de escrever devem
// dar o mesmo post.
const POST_FORMATS = ['header', 'bold', 'italic', 'strike', 'link', 'blockquote', 'list', 'image', 'video'];
const EDITOR_MODE_KEY = 'hotaru.blogEditorMode';

// Atalhos de Markdown ao digitar: o sinal some e o texto ganha o formato.
const INLINE_SHORTCUTS = [
	[/(?<![*\\])\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, {bold: true}],
	[/(?<![\w\\])__([^_\s](?:[^_]*[^_\s])?)__$/, {bold: true}],
	[/(?<![~\\])~~([^~\s](?:[^~]*[^~\s])?)~~$/, {strike: true}],
	[/(?<![*\\])\*([^*\s](?:[^*]*[^*\s])?)\*$/, {italic: true}],
	[/(?<![\w_\\])_([^_\s](?:[^_]*[^_\s])?)_$/, {italic: true}],
];

function readMode() {
	try {
		return window.localStorage.getItem(EDITOR_MODE_KEY) === 'markdown' ? 'markdown' : 'visual';
	}
	catch {
		return 'visual';
	}
}

function keepMode(mode) {
	try {
		window.localStorage.setItem(EDITOR_MODE_KEY, mode);
	}
	catch {
		// Sem armazenamento, o editor só não lembra o modo.
	}
}
const POST_TOOLBAR = [
	[{header: [2, 3, false]}],
	['bold', 'italic', 'strike'],
	[{list: 'ordered'}, {list: 'bullet'}, 'blockquote'],
	['link', 'image', 'video'],
	['clean'],
];

// Do banco para o editor: caminhos de foto viram links, IDs de vídeo viram o
// endereço do player.
function toEditor(body) {
	const ops = body && Array.isArray(body.ops) ? body.ops : [];

	return {ops: ops.map((op) => {
		if (op && op.insert && typeof op.insert === 'object') {
			if (typeof op.insert.image === 'string') {
				return {...op, insert: {image: blogPhotoUrl(op.insert.image) || ''}};
			}

			if (typeof op.insert.video === 'string') {
				return {...op, insert: {video: `${YT_EMBED}${op.insert.video}`}};
			}
		}

		return op;
	})};
}

// O caminho de uma foto que já está na pasta do post, ou null.
function folderPath(src, folder) {
	if (typeof src !== 'string' || !src.startsWith(PUBLIC_PREFIX)) {
		return null;
	}

	const path = src.slice(PUBLIC_PREFIX.length);

	return isBlogPath(path) && path.startsWith(folder) ? path : null;
}

// Do editor para o banco. Uma foto colada como dados (um print colado, por
// exemplo) é reduzida e sobe para a pasta do post; uma foto de outro site
// sai do texto, porque o banco só aceita fotos da pasta do post. Sem upload
// (upload false), como na prévia, essas fotos só ficam de fora. Devolve o
// texto e quantas fotos saíram.
async function fromEditor(delta, folder, {upload: send = true} = {}) {
	const ops = [];
	let removed = 0;

	for (const op of delta.ops) {
		if (op.insert && typeof op.insert === 'object') {
			if (typeof op.insert.image === 'string') {
				let path = folderPath(op.insert.image, folder);

				if (!path && send && op.insert.image.startsWith('data:image/')) {
					const blob = await (await fetch(op.insert.image)).blob();

					path = await uploadTo(folder, await shrink(new File([blob], 'foto colada', {type: blob.type})));
				}

				if (path) {
					ops.push({...op, insert: {image: path}});
				}
				else {
					removed += 1;
				}
			}
			else if (typeof op.insert.video === 'string') {
				const id = youtubeId(op.insert.video);

				if (id) {
					ops.push({...op, insert: {video: id}});
				}
				else {
					removed += 1;
				}
			}
			else {
				removed += 1;
			}

			continue;
		}

		ops.push(op);
	}

	return {body: {ops}, removed};
}

// O post como o site vai mostrar, para a prévia.
function postPreview({body, category, cover, date, title}) {
	return el('article', {class: 'post admin-preview'},
		el('header', {class: 'post-head'},
			category ? el('p', {class: 'eyebrow post-category'}, category) : '',
			el('h1', null, title || 'Sem título'),
			el('p', {class: 'post-date'}, date)
		),
		cover ? el('img', {alt: '', class: 'post-cover', src: cover}) : '',
		el('div', {class: 'post-body'}, renderPost(body, {title}))
	);
}

function postForm(post, {categories, onBack}) {
	const id = post ? post.id : crypto.randomUUID();
	const folder = `blog/${id}/`;
	// O post como está no banco; null até o primeiro salvamento.
	let saved = post;
	// A capa: o caminho no bucket, uma foto nova ({file, url}) ou nada.
	let cover = post && post.cover ? post.cover : null;
	let busy = false;
	let dirty = false;

	const title = el('input', {id: 'admin-post-title', maxlength: 140, required: true, type: 'text', value: post ? post.title : ''});
	const category = el('input', {id: 'admin-post-category', list: 'admin-post-categories', maxlength: 40, type: 'text', value: post ? post.category || '' : ''});
	const categoryList = el('datalist', {id: 'admin-post-categories'}, categories.map((one) => el('option', {value: one})));
	const summary = el('textarea', {id: 'admin-post-summary', maxlength: 300, rows: 2}, post ? post.summary || '' : '');
	const coverFile = el('input', {accept: 'image/*', id: 'admin-post-cover', type: 'file'});
	const coverBox = el('div', {class: 'admin-photos admin-post-cover'});
	const editorBox = el('div', {class: 'admin-editor', id: 'admin-editor'});
	const editorWrap = el('div', {class: 'admin-editor-wrap'}, editorBox);
	const videoInput = el('input', {'aria-label': 'Link do vídeo do YouTube', class: 'admin-search', id: 'admin-video-link', placeholder: 'Cole o link do vídeo do YouTube', type: 'url'});
	const videoPanel = el('div', {class: 'admin-video', hidden: true});
	const imageFiles = el('input', {accept: 'image/*', hidden: true, id: 'admin-post-images', multiple: true, type: 'file'});
	const preview = el('div', {class: 'admin-preview-box', hidden: true});
	const status = el('p', {'aria-live': 'polite', class: 'admin-status', id: 'admin-post-status'});
	const buttons = el('div', {class: 'admin-actions admin-save-bar'});
	let videoRange = null;

	const markdown = el('textarea', {'aria-label': 'Texto em Markdown', class: 'admin-markdown', id: 'admin-post-markdown', rows: 18, spellcheck: 'true'});
	const markdownPane = el('div', {class: 'admin-markdown-pane', hidden: true}, markdown);
	const modeButtons = el('div', {'aria-label': 'Como escrever', class: 'admin-mode', role: 'group'});
	const editorHint = el('p', {class: 'admin-hint admin-editor-hint'});
	let mode = 'visual';

	const quill = new window.Quill(editorBox, {
		formats: POST_FORMATS,
		modules: {
			keyboard: {
				bindings: {
					// "## " vira título, "### " subtítulo e "> " citação. As listas
					// ("- " e "1. ") o Quill já faz sozinho.
					markdownBlock: {
						collapsed: true,
						handler(range, context) {
							const mark = context.prefix.trim();
							const start = range.index - context.prefix.length;
							const format = mark === '>' ? {blockquote: true} : {header: mark.length >= 3 ? 3 : 2};

							this.quill.deleteText(start, context.prefix.length, 'user');
							this.quill.formatLine(start, 1, format, 'user');
							this.quill.setSelection(start, 0, 'silent');

							return false;
						},
						key: ' ',
						prefix: /^\s*(#{1,3}|>)$/,
					},
				},
			},
			toolbar: {
				container: POST_TOOLBAR,
				handlers: {
					image: () => imageFiles.click(),
					video: () => {
						videoRange = quill.getSelection(true);
						videoPanel.hidden = false;
						videoInput.value = '';
						videoInput.focus();
					},
				},
			},
			uploader: {
				handler: (range, files) => insertImages(files, range),
				mimetypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
			},
		},
		placeholder: 'Escreva o post aqui. Use a barra para títulos, listas, links, fotos e vídeos.',
		theme: 'snow',
	});

	if (post) {
		quill.setContents(toEditor(post.body), 'silent');
	}

	// Os botões da barra sem nome visível ganham um, para leitores de tela.
	for (const [selector, label] of [
		['.ql-bold', 'Negrito'], ['.ql-italic', 'Itálico'], ['.ql-strike', 'Riscado'],
		['.ql-list[value="ordered"]', 'Lista numerada'], ['.ql-list[value="bullet"]', 'Lista com marcadores'],
		['.ql-blockquote', 'Citação'], ['.ql-link', 'Link'], ['.ql-image', 'Foto'], ['.ql-video', 'Vídeo do YouTube'],
		['.ql-clean', 'Tirar a formatação'],
	]) {
		const button = editorWrap.querySelector(`.ql-toolbar ${selector}`);

		if (button) {
			button.setAttribute('aria-label', label);
			button.setAttribute('title', label);
		}
	}

	function changed() {
		dirty = true;

		if (!busy) {
			status.textContent = 'Alterações não salvas.';
		}
	}

	const Delta = window.Quill.import('delta');

	// **negrito**, __negrito__, *itálico*, _itálico_ e ~~riscado~~ viram o
	// formato quando o segundo sinal é digitado; [texto](link) vira link
	// quando o ) fecha.
	function shortcuts(delta) {
		const last = delta.ops[delta.ops.length - 1];
		const range = quill.getSelection();

		if (!range || range.length || !last || typeof last.insert !== 'string' || last.insert.length !== 1) {
			return;
		}

		const [, offset] = quill.getLine(range.index);
		const start = range.index - offset;
		const before = quill.getText(start, offset);
		const link = before.match(/\[([^\]]+)\]\(([^)\s]+)\)$/);
		let found = null;

		if (link) {
			found = {attributes: {link: link[2]}, at: start + link.index, length: link[0].length, text: link[1]};
		}
		else {
			for (const [pattern, attributes] of INLINE_SHORTCUTS) {
				const match = before.match(pattern);

				if (match) {
					found = {attributes, at: start + match.index, length: match[0].length, text: match[1]};

					break;
				}
			}
		}

		if (!found) {
			return;
		}

		// Na hora, antes da próxima tecla: com digitação rápida, esperar faria
		// o cursor voltar para o meio do texto.
		quill.updateContents(new Delta().retain(found.at).delete(found.length).insert(found.text, found.attributes), 'user');
		quill.setSelection(found.at + found.text.length, 0, 'silent');

		for (const name of Object.keys(found.attributes)) {
			quill.format(name, false, 'silent');
		}
	}

	// Um texto em Markdown colado entra formatado. Um texto com formato de
	// verdade (de um site ou de um editor de texto) segue o caminho normal do
	// editor, e fotos coladas sobem pelo uploader.
	editorWrap.addEventListener('paste', (event) => {
		const data = event.clipboardData;

		if (!data || data.files.length) {
			return;
		}

		const text = data.getData('text/plain');
		const html = data.getData('text/html');

		if (!looksLikeMarkdown(text) || /<(h[1-6]|ul|ol|li|strong|b|em|i|a|blockquote)[\s>]/i.test(html)) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		const range = quill.getSelection(true);
		const file = readMarkdownFile(text);

		fillFromFile(file);

		const pasted = new Delta(markdownToDelta(file.markdown).ops);

		quill.updateContents(new Delta().retain(range.index).delete(range.length).concat(pasted), 'user');
		quill.setSelection(range.index + pasted.length(), 0, 'silent');
		quill.scrollSelectionIntoView();
	}, true);

	// O título e o resumo de um arquivo .md, só nos campos ainda vazios.
	function fillFromFile(file) {
		if (file.title && !title.value.trim()) {
			title.value = file.title.slice(0, 140);
		}

		if (file.summary && !summary.value.trim()) {
			summary.value = file.summary.slice(0, 300);
		}
	}

	// Importar um arquivo .md: o texto do arquivo toma o lugar do texto do
	// post (depois de perguntar, se já há texto), e o front matter preenche o
	// título e o resumo vazios.
	const importFile = el('input', {accept: '.md,.markdown,.txt,text/markdown,text/plain', hidden: true, id: 'admin-post-import', type: 'file'});

	importFile.addEventListener('change', async () => {
		const [picked] = importFile.files;

		importFile.value = '';

		if (!picked) {
			return;
		}

		const hasText = mode === 'markdown' ? markdown.value.trim() : quill.getText().trim() || quill.getLength() > 1;

		if (hasText && !window.confirm('Trocar o texto do post pelo do arquivo?')) {
			return;
		}

		const file = readMarkdownFile(await picked.text());

		fillFromFile(file);

		if (mode === 'markdown') {
			markdown.value = file.markdown;
		}
		else {
			quill.setContents(markdownToDelta(file.markdown), 'user');
		}

		changed();
		status.textContent = `${picked.name}: importado. Confira e salve.`;
	});

	// O texto do modo Markdown passa para o editor (antes de salvar, da prévia
	// e de voltar ao visual).
	function syncFromMarkdown() {
		if (mode === 'markdown') {
			quill.setContents(markdownToDelta(markdown.value), 'silent');
		}
	}

	function setMode(next) {
		if (next === 'markdown' && mode !== 'markdown') {
			markdown.value = deltaToMarkdown(quill.getContents());
		}
		else if (next === 'visual' && mode === 'markdown') {
			syncFromMarkdown();
		}

		mode = next;
		keepMode(next);
		editorWrap.hidden = next === 'markdown';
		markdownPane.hidden = next !== 'markdown';
		editorHint.textContent = next === 'markdown'
			? 'Markdown: # ou ## título, ### subtítulo, **negrito**, *itálico*, ~~riscado~~, - lista, 1. lista, > citação, [texto](link). Uma linha só com o link de um vídeo do YouTube vira o vídeo. Fotos e vídeos também entram pelos botões abaixo.'
			: 'Aceita Markdown ao digitar: ## título, ### subtítulo, **negrito**, *itálico*, ~~riscado~~, - lista, 1. lista, > citação e [texto](link). Um texto em Markdown colado entra formatado.';
		modeButtons.replaceChildren(...[['visual', 'Visual'], ['markdown', 'Markdown']].map(([id, label]) => el('button', {
			'aria-pressed': String(next === id),
			class: `btn ${next === id ? 'btn-gold' : 'btn-navy'}`,
			id: `admin-mode-${id}`,
			onclick: () => {
				if (mode !== id) {
					setMode(id);
					(id === 'markdown' ? markdown : quill).focus();
				}
			},
			type: 'button',
		}, label)));
	}

	markdown.addEventListener('input', changed);

	// Insere no modo Markdown, no lugar do cursor, numa linha só dela.
	function insertMarkdownLine(text) {
		const at = markdown.selectionStart ?? markdown.value.length;
		const before = markdown.value.slice(0, at);
		const after = markdown.value.slice(markdown.selectionEnd ?? at);
		const lead = before && !before.endsWith('\n') ? '\n' : '';
		const tail = after.startsWith('\n') ? '' : '\n';

		markdown.value = `${before}${lead}${text}${tail}${after}`;
		markdown.selectionStart = markdown.selectionEnd = before.length + lead.length + text.length + tail.length;
		changed();
	}

	const guard = (event) => {
		if (dirty) {
			event.preventDefault();
			event.returnValue = '';
		}
	};

	window.addEventListener('beforeunload', guard);

	const canLeave = () => {
		if (dirty && !window.confirm('Sair sem salvar o post?')) {
			return false;
		}

		window.removeEventListener('beforeunload', guard);

		return true;
	};

	quill.on('text-change', (delta, old, source) => {
		if (source === 'user') {
			changed();
			shortcuts(delta);
		}
	});

	for (const input of [title, category, summary]) {
		input.addEventListener('input', changed);
	}

	async function insertImages(files, range) {
		const list = [...files].filter((file) => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name));
		let index = range ? range.index : quill.getLength() - 1;

		for (const [i, file] of list.entries()) {
			status.textContent = list.length > 1 ? `Enviando a foto ${i + 1} de ${list.length}…` : 'Enviando a foto…';

			try {
				const path = await uploadTo(folder, await shrink(file));

				if (mode === 'markdown') {
					insertMarkdownLine(`![foto](${blogPhotoUrl(path)})`);

					continue;
				}

				quill.insertEmbed(index, 'image', blogPhotoUrl(path), 'user');
				index += 1;
				quill.setSelection(index, 0, 'silent');
			}
			catch (err) {
				status.textContent = err.message || String(err);

				return;
			}
		}

		status.textContent = dirty ? 'Alterações não salvas.' : '';
	}

	imageFiles.addEventListener('change', () => {
		const files = [...imageFiles.files];

		imageFiles.value = '';
		insertImages(files, mode === 'markdown' ? null : quill.getSelection(true));
	});

	function insertVideo() {
		const videoId = youtubeId(videoInput.value);

		if (!videoId) {
			status.textContent = 'Esse link não é de um vídeo do YouTube.';
			videoInput.focus();

			return;
		}

		videoPanel.hidden = true;

		if (mode === 'markdown') {
			insertMarkdownLine(`https://youtu.be/${videoId}`);
			markdown.focus();

			return;
		}

		const index = videoRange ? videoRange.index : quill.getLength() - 1;

		quill.insertEmbed(index, 'video', `${YT_EMBED}${videoId}`, 'user');
		quill.setSelection(index + 1, 0, 'silent');
		status.textContent = 'Alterações não salvas.';
	}

	videoInput.addEventListener('keydown', (event) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			insertVideo();
		}
	});

	videoPanel.append(
		el('label', {class: 'admin-hint', for: 'admin-video-link'}, 'O vídeo entra onde o cursor estava. Serve o link do vídeo, de um Short ou o youtu.be.'),
		videoInput,
		el('div', {class: 'admin-actions'},
			el('button', {class: 'btn btn-gold', id: 'admin-video-insert', onclick: insertVideo, type: 'button'}, 'Inserir vídeo'),
			el('button', {class: 'btn btn-navy', onclick: () => {
				videoPanel.hidden = true;
				(mode === 'markdown' ? markdown : quill).focus();
			}, type: 'button'}, 'Cancelar')
		)
	);

	function drawCover() {
		const src = !cover ? null : typeof cover === 'string' ? blogPhotoUrl(cover) : cover.url;

		coverBox.replaceChildren(...(src
			? [el('figure', {class: 'admin-photo admin-cover'},
				el('img', {alt: 'Capa do post', src}),
				el('figcaption', null, el('button', {class: 'admin-link', onclick: () => {
					cover = null;
					changed();
					drawCover();
				}, type: 'button'}, 'Tirar a capa')))]
			: []));
	}

	coverFile.addEventListener('change', () => {
		const [file] = coverFile.files;

		coverFile.value = '';

		if (file) {
			cover = {file, url: URL.createObjectURL(file)};
			changed();
			drawCover();
		}
	});

	async function showPreview() {
		if (!preview.hidden) {
			preview.hidden = true;

			return;
		}

		syncFromMarkdown();

		const {body} = await fromEditor(quill.getContents(), folder, {upload: false});

		preview.replaceChildren(
			el('p', {class: 'admin-hint'}, 'Prévia: assim o post aparece no site. Uma foto colada só aparece depois de salvar.'),
			postPreview({
				body,
				category: category.value.trim(),
				cover: !cover ? null : typeof cover === 'string' ? blogPhotoUrl(cover) : cover.url,
				date: saved && saved.status === 'published' ? postDate(saved.published_at) : 'Rascunho',
				title: title.value.trim(),
			})
		);
		preview.hidden = false;
		preview.scrollIntoView({behavior: 'smooth', block: 'start'});
	}

	async function save(nextStatus) {
		if (busy) {
			return;
		}

		if (!title.value.trim()) {
			status.textContent = 'Escreva o título do post.';
			title.focus();

			return;
		}

		busy = true;
		drawButtons();

		try {
			let coverPath = typeof cover === 'string' ? cover : null;

			if (cover && typeof cover !== 'string') {
				status.textContent = 'Enviando a capa…';
				coverPath = await uploadTo(folder, await shrink(cover.file));
				cover = coverPath;
			}

			status.textContent = 'Salvando…';
			syncFromMarkdown();

			const {body, removed} = await fromEditor(quill.getContents(), folder);
			const {data, error} = await client.rpc('save_post', {post: {
				body,
				category: category.value.trim() || null,
				cover: coverPath,
				excerpt: plainText(body) || null,
				id,
				status: nextStatus,
				summary: summary.value.trim() || null,
				title: title.value.trim(),
			}});

			if (error) {
				throw new Error(error.message);
			}

			saved = data;
			dirty = false;
			quill.setContents(toEditor(data.body), 'silent');
			drawCover();

			const time = new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
			const parts = [data.status === 'published' ? `Publicado às ${time}.` : `Rascunho salvo às ${time}. Só você vê.`];

			if (removed) {
				parts.push(removed === 1
					? '1 foto ou vídeo de outro site saiu do texto: use os botões de foto e de vídeo.'
					: `${removed} fotos ou vídeos de outros sites saíram do texto: use os botões de foto e de vídeo.`);
			}

			status.replaceChildren(parts.join(' '), data.status === 'published' ? ' ' : '', data.status === 'published'
				? el('a', {href: `post.html?p=${encodeURIComponent(data.slug)}`, rel: 'noopener', target: '_blank'}, 'Ver no site')
				: '');
		}
		catch (err) {
			status.textContent = `Não foi salvo. ${err.message || err}`;
		}

		busy = false;
		drawButtons();
	}

	function drawButtons() {
		const published = saved && saved.status === 'published';
		const button = (label, cls, idName, onclick) => el('button', {class: `btn ${cls}`, disabled: busy, id: idName, onclick, type: 'button'}, label);

		buttons.replaceChildren(
			published
				? button('Salvar', 'btn-gold', 'admin-post-save', () => save('published'))
				: button('Publicar', 'btn-gold', 'admin-post-publish', () => save('published')),
			published
				? button('Voltar para rascunho', 'btn-navy', 'admin-post-unpublish', () => save('draft'))
				: button('Salvar rascunho', 'btn-navy', 'admin-post-draft', () => save('draft')),
			button(preview.hidden ? 'Prévia' : 'Fechar prévia', 'btn-navy', 'admin-post-preview', async () => {
				await showPreview();
				drawButtons();
			}),
			el('button', {class: 'admin-link', id: 'admin-post-back', onclick: () => {
				if (canLeave()) {
					onBack();
				}
			}, type: 'button'}, 'Voltar para a lista'),
			status
		);
	}

	markdownPane.append(el('div', {class: 'admin-actions admin-markdown-tools'},
		el('button', {class: 'btn btn-navy', id: 'admin-markdown-photo', onclick: () => imageFiles.click(), type: 'button'}, 'Inserir foto'),
		el('button', {class: 'btn btn-navy', id: 'admin-markdown-video', onclick: () => {
			videoPanel.hidden = false;
			videoInput.value = '';
			videoInput.focus();
		}, type: 'button'}, 'Inserir vídeo')
	));

	drawCover();
	drawButtons();
	setMode(readMode());

	const form = el('form', {class: 'admin-form admin-post-form', id: 'admin-post-form', novalidate: true, onsubmit: (event) => event.preventDefault()},
		el('h2', null, post ? 'Editar post' : 'Novo post'),
		el('label', {for: 'admin-post-title'}, 'Título'), title,
		el('label', {for: 'admin-post-category'}, 'Categoria'), category, categoryList,
		el('p', {class: 'admin-hint'}, 'Escolha uma da lista ou escreva uma nova. O blog filtra os posts por categoria.'),
		el('label', {for: 'admin-post-cover'}, 'Capa (opcional)'), coverBox, coverFile,
		el('label', {for: 'admin-post-summary'}, 'Resumo (opcional)'), summary,
		el('p', {class: 'admin-hint'}, 'Aparece na lista do blog. Sem resumo, a lista mostra o começo do texto.'),
		el('div', {class: 'admin-text-head'},
			el('label', {onclick: () => (mode === 'markdown' ? markdown : quill).focus()}, 'Texto'),
			modeButtons,
			el('button', {class: 'admin-link', id: 'admin-post-import-button', onclick: () => importFile.click(), type: 'button'}, 'Importar arquivo .md'),
			importFile
		),
		editorWrap, markdownPane, editorHint, videoPanel, imageFiles,
		buttons,
		preview
	);

	return {canLeave, form};
}

function postRow(post, {onEdit}) {
	const cover = blogPhotoUrl(post.cover);
	const published = post.status === 'published';

	return el('li', {class: `admin-product${published ? '' : ' admin-inactive'}`, id: `admin-post-${post.id}`},
		cover ? el('img', {alt: '', class: 'admin-thumb', loading: 'lazy', src: cover}) : el('span', {'aria-hidden': 'true', class: 'admin-thumb admin-thumb-none'}),
		el('div', {class: 'admin-product-body'},
			el('p', {class: 'admin-product-name'}, post.title),
			el('p', {class: 'admin-product-meta'}, [published ? `Publicado em ${postDate(post.published_at)}` : 'Rascunho', post.category].filter(Boolean).join(' · ')),
			published ? el('p', {class: 'admin-product-counts'}, el('a', {href: `post.html?p=${encodeURIComponent(post.slug)}`, rel: 'noopener', target: '_blank'}, 'Ver no site')) : ''
		),
		el('button', {class: 'btn btn-navy admin-edit', onclick: () => onEdit(post), type: 'button'}, 'Editar')
	);
}

async function showPosts(notice = '') {
	root.replaceChildren(tabs('blog'), message('Carregando os posts…'));

	const {data, error} = await client.rpc('store_posts_admin');

	if (error) {
		root.replaceChildren(tabs('blog'), message(error.code === '42501'
			? 'Esta conta não é a dona da loja. Toque em Sair e entre com a conta do Eric.'
			: error.code === 'PGRST202'
				? 'O blog ainda não existe no banco: rode supabase/store-blog.sql no Supabase.'
				: `Não foi possível ler os posts. ${error.message}`));

		return;
	}

	const posts = Array.isArray(data) ? data : [];
	const categories = [...new Set([...BLOG_CATEGORIES, ...posts.map((post) => post.category).filter(Boolean)])];

	const edit = (post) => {
		if (typeof window.Quill !== 'function') {
			root.replaceChildren(tabs('blog'), message('O editor não carregou. Recarregue a página.'));

			return;
		}

		const {canLeave, form} = postForm(post, {categories, onBack: () => showPosts()});

		root.replaceChildren(tabs('blog', canLeave), form);
		window.scrollTo(0, 0);
	};

	root.replaceChildren(
		tabs('blog'),
		notice ? message(notice, 'admin-done') : '',
		el('div', {class: 'admin-head'},
			el('h2', null, posts.length ? `Blog (${posts.length})` : 'Blog'),
			el('button', {class: 'btn btn-gold', id: 'admin-new-post', onclick: () => edit(null), type: 'button'}, 'Novo post')
		),
		posts.length
			? el('ul', {class: 'admin-list'}, posts.map((post) => postRow(post, {onEdit: edit})))
			: message('Nenhum post ainda. Escreva o primeiro com Novo post.')
	);
}

// ------------------------------------------------------------- entrar

// Para onde o link do e-mail volta: esta página, sem busca nem âncora.
// Vale em ericthmoritsuka.github.io/hotaru/admin.html e em
// lojahotaru.com.br/admin.html, e cada endereço precisa estar nas Redirect
// URLs do Supabase.
const returnUrl = () => new URL('admin.html', window.location.href).href;

// O que o link do e-mail trouxe na URL (?code= do fluxo PKCE, ou um erro),
// tirado da barra de endereço para que recarregar não use o código de novo
// (como readAuthReturn em js/auth.js do tracker).
function readReturn() {
	const url = new URL(window.location.href);
	const hash = new URLSearchParams(url.hash.slice(1));
	const query = url.searchParams;
	const code = query.get('code');
	const error = query.get('error_description') || query.get('error')
		|| hash.get('error_description') || hash.get('error');

	if (!code && !error) {
		return null;
	}

	const errorCode = query.get('error_code') || hash.get('error_code');

	for (const key of ['code', 'error', 'error_code', 'error_description']) {
		query.delete(key);
	}

	history.replaceState(history.state, '', url.pathname + url.search);

	return {code, error: error ? {code: errorCode, message: error} : null};
}

function returnProblem(error) {
	return error && error.code === 'otp_expired'
		? 'O link expirou ou já foi usado. Peça outro abaixo.'
		: 'O link não funcionou. Ele vale uma vez só e precisa ser aberto neste mesmo navegador em que foi pedido. Peça outro abaixo.';
}

function sendProblem(error) {
	const text = `${error.code || ''} ${error.message || ''}`;

	if (/otp_disabled|signups? not allowed/i.test(text)) {
		return 'Este e-mail não tem conta no card tracker. Use o mesmo e-mail com que você entra lá.';
	}

	if (error.status === 429 || /rate.?limit/i.test(text)) {
		return 'Muitos links pedidos em pouco tempo. Espere um minuto e tente de novo.';
	}

	return `Não foi possível enviar o link. ${error.message || error}`;
}

// Sem sessão: pede o e-mail e manda o link. shouldCreateUser: false, então
// um e-mail sem conta recebe um aviso, e nunca uma conta nova.
function signInForm(notice) {
	const email = el('input', {autocomplete: 'email', id: 'admin-email', inputmode: 'email', required: true, type: 'email'});
	const status = el('p', {'aria-live': 'polite', class: 'admin-status', id: 'admin-status'});
	const send = el('button', {class: 'btn btn-gold', type: 'submit'}, 'Enviar link');
	const form = el('form', {class: 'admin-form'},
		el('h2', null, 'Entrar'),
		el('p', {class: 'admin-hint'}, 'Use o e-mail da sua conta do card tracker. O link chega por e-mail e precisa ser aberto neste mesmo navegador.'),
		el('label', {for: 'admin-email'}, 'E-mail'), email,
		status,
		el('div', {class: 'admin-actions'}, send)
	);

	status.textContent = notice || '';

	form.addEventListener('submit', async (event) => {
		event.preventDefault();

		const address = email.value.trim().toLowerCase();

		if (!address) {
			status.textContent = 'Escreva o seu e-mail.';

			return;
		}

		send.disabled = true;
		status.textContent = 'Enviando…';

		const {error} = await client.auth.signInWithOtp({email: address, options: {emailRedirectTo: returnUrl(), shouldCreateUser: false}});

		send.disabled = false;
		status.textContent = error
			? sendProblem(error)
			: `Link enviado para ${address}. Abra o e-mail neste navegador e toque no link.`;
	});

	root.replaceChildren(form);
}

// Sai só desta página: scope local não derruba a sessão do tracker.
async function signOut() {
	await client.auth.signOut({scope: 'local'});
	window.location.replace(returnUrl());
}

async function start() {
	if (!root) {
		return;
	}

	const back = readReturn();
	let notice = '';

	if (back && back.error) {
		notice = returnProblem(back.error);
	}
	else if (back && back.code) {
		const {error} = await client.auth.exchangeCodeForSession(back.code);

		if (error) {
			notice = returnProblem(error);
		}
	}

	const {data} = await client.auth.getSession();

	if (!data || !data.session) {
		signInForm(notice);

		return;
	}

	root.before(el('p', {class: 'admin-who'},
		`Conta: ${data.session.user.email} · `,
		el('button', {class: 'admin-link', onclick: signOut, type: 'button'}, 'Sair')
	));
	await showList();
}

start().catch((err) => {
	if (root) {
		root.replaceChildren(message(`A administração não abriu. ${err.message || err}`));
	}
});
