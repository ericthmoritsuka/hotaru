// A administração da HOTARU (admin.html): onde o Eric cadastra os produtos
// selados, com as próprias fotos (plano do card tracker, plans/hotaru-
// catalog-plan.md, etapa 4). As cartas continuam na tela Shop do tracker.
//
// O login é o do card tracker: os dois sites ficam em ericthmoritsuka.
// github.io, e o tracker guarda a sessão neste navegador na chave
// card-tracker-auth. Esta página a usa (a biblioteca do Supabase coordena
// as abas, então as duas não brigam pela sessão). Sem sessão, ela manda
// entrar no tracker e voltar. Quem decide se a conta pode cadastrar é o
// banco (supabase/store-sealed.sql: só o dono do grupo da família).
//
// Cada produto tem nome, tipo, idioma, descrição, preço, fotos (a primeira
// é a capa) e quantos estão à venda agora. As fotos são reduzidas aqui
// antes de subir para o bucket público store, em sealed/<produto>/.

import {createClient} from './vendor/supabase-js-2.117.2.js';

const SUPABASE_URL = 'https://ehdkbxrjxsypegbtrxbw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Ycfz9bobfuvHWdDKjaoQQA_LDYmm0vJ';
const TRACKER_SIGNIN = 'https://ericthmoritsuka.github.io/pokemon-card-tracker/signin';
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
		storageKey: 'card-tracker-auth',
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

async function upload(productId, blob) {
	const path = `sealed/${productId}/${randomName()}.jpg`;
	// The bytes with their type, as the card tracker uploads its photos, so
	// the bucket sees image/jpeg rather than a form.
	const {error} = await client.storage.from(BUCKET).upload(path, await blob.arrayBuffer(), {cacheControl: '31536000', contentType: 'image/jpeg', upsert: false});

	if (error) {
		throw new Error(`A foto não subiu: ${error.message}`);
	}

	return path;
}

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
			? 'Esta conta não é a dona da loja. Entre no card tracker com a conta do Eric.'
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

// As duas partes da administração: os selados e os destaques.
function tabs(current) {
	const tab = (id, label, open) => el('button', {
		'aria-current': current === id ? 'page' : null,
		class: `btn ${current === id ? 'btn-gold' : 'btn-navy'}`,
		id: `admin-tab-${id}`,
		onclick: () => {
			if (current !== id) {
				open();
			}
		},
		type: 'button',
	}, label);

	return el('nav', {'aria-label': 'Administração', class: 'admin-tabs'},
		tab('selados', 'Selados', () => showList()),
		tab('destaques', 'Destaques', () => showFeatured())
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
			? 'Esta conta não é a dona da loja. Entre no card tracker com a conta do Eric.'
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

	const back = () => {
		if (!dirty || window.confirm('Sair sem salvar os destaques?')) {
			showList();
		}
	};

	root.replaceChildren(
		el('nav', {'aria-label': 'Administração', class: 'admin-tabs'},
			el('button', {class: 'btn btn-navy', id: 'admin-tab-selados', onclick: back, type: 'button'}, 'Selados'),
			el('button', {'aria-current': 'page', class: 'btn btn-gold', id: 'admin-tab-destaques', type: 'button'}, 'Destaques')
		),
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

async function start() {
	if (!root) {
		return;
	}

	const {data} = await client.auth.getSession();

	if (!data || !data.session) {
		root.replaceChildren(
			message('Para cadastrar produtos, entre no card tracker neste mesmo navegador e volte aqui.'),
			el('div', {class: 'admin-actions'},
				el('a', {class: 'btn btn-gold', href: TRACKER_SIGNIN}, 'Entrar no card tracker'),
				el('button', {class: 'btn btn-navy', onclick: () => window.location.reload(), type: 'button'}, 'Já entrei')
			)
		);

		return;
	}

	root.before(el('p', {class: 'admin-who'}, `Conta: ${data.session.user.email}`));
	await showList();
}

start().catch((err) => {
	if (root) {
		root.replaceChildren(message(`A administração não abriu. ${err.message || err}`));
	}
});
