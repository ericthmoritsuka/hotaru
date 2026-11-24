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
