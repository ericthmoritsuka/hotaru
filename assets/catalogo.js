// O catálogo de cartas da HOTARU: lê no navegador as cartas à venda que o
// Eric publica pela tela Shop do card tracker (função store_catalog do
// Supabase; plano em pokemon-card-tracker, plans/hotaru-catalog-plan.md,
// etapa 3). Não há build: um preço salvo no tracker aparece aqui na próxima
// visita.
//
// Três lugares usam o mesmo script, cada um marcado por data-catalog:
//   home    na home, as cartas mais recentes, logo depois da hero; a seção
//           inteira fica escondida quando não há nenhuma carta à venda
//   all     avulsas.html, todas as cartas, com busca e filtros
//   card    carta.html?c=<id da carta>&l=<idioma>, uma carta
//
// Até o carrinho existir (etapa 5), comprar é mandar um e-mail: o botão abre
// o e-mail da HOTARU com a carta no assunto. O site não fala em frete,
// envio, parcelamento ou formas de pagamento enquanto nada disso existe.
//
// Todo texto vindo do banco entra na página como texto (textContent), nunca
// como HTML.

(() => {
	'use strict';

	const SUPABASE_URL = 'https://ehdkbxrjxsypegbtrxbw.supabase.co';
	// A chave publicável do projeto: pública de propósito, só abre o que as
	// regras do banco deixam um visitante ler.
	const SUPABASE_KEY = 'sb_publishable_Ycfz9bobfuvHWdDKjaoQQA_LDYmm0vJ';
	const EMAIL = 'hotaru.loja@gmail.com';
	const HOME_LIMIT = 8;

	const LANGUAGES = {
		de: 'Alemão',
		en: 'Inglês',
		es: 'Espanhol',
		fr: 'Francês',
		it: 'Italiano',
		ja: 'Japonês',
		ko: 'Coreano',
		pt: 'Português',
		'zh-cn': 'Chinês simplificado',
		'zh-tw': 'Chinês tradicional',
	};

	const languageName = (code) => LANGUAGES[String(code || '').toLowerCase()] || (code ? String(code).toUpperCase() : '');

	const brl = (value) => {
		const [whole, cents] = (Math.round(Number(value) * 100) / 100).toFixed(2).split('.');

		return `R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cents}`;
	};

	const fold = (text) => String(text || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

	const pictureUrl = (path) => (path ? `${SUPABASE_URL}/storage/v1/object/public/store/${path.split('/').map(encodeURIComponent).join('/')}` : null);

	// Cria um elemento: attrs vira atributos (on* vira evento), children vira
	// filhos, e uma string vira texto.
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
			if (child !== null && child !== undefined && child !== false) {
				node.append(child instanceof Node ? child : document.createTextNode(String(child)));
			}
		}

		return node;
	}

	async function readCatalog() {
		const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/store_catalog`, {
			body: '{}',
			headers: {apikey: SUPABASE_KEY, 'Content-Type': 'application/json'},
			method: 'POST',
		});

		if (!response.ok) {
			throw new Error(`store_catalog ${response.status}`);
		}

		const rows = await response.json();

		return Array.isArray(rows) ? rows : [];
	}

	// Uma carta à venda por carta e idioma, com quantas cópias há, os
	// estados e acabamentos delas e o menor preço.
	function groupCards(rows) {
		const groups = new Map();

		for (const row of rows) {
			if (row.kind !== 'single' || !row.card_id) {
				continue;
			}

			const key = `${row.card_id}|${row.language || ''}`;

			if (!groups.has(key)) {
				groups.set(key, {
					cardId: row.card_id,
					conditions: new Set(),
					copies: [],
					finishes: new Set(),
					imagePath: null,
					key,
					language: row.language || '',
					name: row.name,
					newest: '',
					number: row.number,
					price: Infinity,
					rarity: row.rarity,
					setName: row.set_name,
				});
			}

			const group = groups.get(key);

			group.copies.push(row);
			group.price = Math.min(group.price, Number(row.price_brl));
			group.imagePath = group.imagePath || row.image_path;
			group.newest = String(row.published_at || '') > group.newest ? String(row.published_at) : group.newest;

			if (row.condition) {
				group.conditions.add(row.condition);
			}

			if (row.finish) {
				group.finishes.add(row.finish);
			}
		}

		return [...groups.values()];
	}

	const cardHref = (group) => `carta.html?c=${encodeURIComponent(group.cardId)}&l=${encodeURIComponent(group.language)}`;

	const available = (n) => (n === 1 ? '1 disponível' : `${n} disponíveis`);

	const setLine = (group) => [group.setName, group.number ? `nº ${group.number}` : null].filter(Boolean).join(' · ');

	function shot(group, {link = true} = {}) {
		const url = pictureUrl(group.imagePath);
		const inner = url
			? el('img', {alt: `${group.name}, ${setLine(group)}`, class: 'card-pic', decoding: 'async', loading: 'lazy', src: url})
			: el('span', {class: 'card-pic card-pic-none'}, group.name);

		return link ? el('a', {class: 'shot card-shot', href: cardHref(group), tabindex: '-1', 'aria-hidden': 'true'}, inner) : el('div', {class: 'shot card-shot'}, inner);
	}

	function tile(group) {
		return el('article', {class: 'product card-item'},
			shot(group),
			el('div', {class: 'meta'},
				el('span', {class: 'kind'}, ['Carta', languageName(group.language)].filter(Boolean).join(' · ')),
				el('h3', null, el('a', {href: cardHref(group)}, group.name)),
				el('p', {class: 'card-set'}, setLine(group)),
				el('div', {class: 'price'}, el('strong', null, brl(group.price))),
				el('p', {class: 'card-count'}, available(group.copies.length))
			)
		);
	}

	const mailto = (group) => {
		const what = `${group.name} (${[setLine(group), languageName(group.language)].filter(Boolean).join(', ')})`;
		const subject = `Quero a carta ${what}`;
		const body = `Olá, Eric!\n\nTenho interesse na carta ${what}, por ${brl(group.price)}.\n\nQuantidade: 1\n\nNome:\n`;

		return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
	};

	const message = (text, cls = 'card-note') => el('p', {class: cls, role: 'status'}, text);

	// ------------------------------------------------------------ home

	function home(root, groups) {
		const section = root.closest('section') || root;

		if (!groups.length) {
			section.hidden = true;

			return;
		}

		const newest = [...groups].sort((a, b) => b.newest.localeCompare(a.newest)).slice(0, HOME_LIMIT);

		root.replaceChildren(el('div', {class: 'products cards-grid'}, newest.map(tile)));
		section.hidden = false;
	}

	// ------------------------------------------------------- all cards

	function all(root, groups) {
		if (!groups.length) {
			root.replaceChildren(message('Nenhuma carta à venda agora. Volte em breve!'));

			return;
		}

		const sets = [...new Set(groups.map((group) => group.setName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
		const languages = [...new Set(groups.map((group) => group.language).filter(Boolean))].sort((a, b) => languageName(a).localeCompare(languageName(b), 'pt-BR'));
		const search = el('input', {'aria-label': 'Buscar cartas', class: 'card-search', placeholder: 'Buscar por nome ou coleção', type: 'search'});
		const setSelect = el('select', {'aria-label': 'Coleção'}, el('option', {value: ''}, 'Todas as coleções'), sets.map((name) => el('option', {value: name}, name)));
		const languageSelect = el('select', {'aria-label': 'Idioma'}, el('option', {value: ''}, 'Todos os idiomas'), languages.map((code) => el('option', {value: code}, languageName(code))));
		const sortSelect = el('select', {'aria-label': 'Ordenar'},
			el('option', {value: 'set'}, 'Por coleção'),
			el('option', {value: 'price-asc'}, 'Menor preço'),
			el('option', {value: 'price-desc'}, 'Maior preço'),
			el('option', {value: 'new'}, 'Mais recentes'),
			el('option', {value: 'name'}, 'Nome (A–Z)')
		);
		const count = el('p', {class: 'card-total', role: 'status'});
		const grid = el('div', {class: 'products cards-grid'});
		const SORTS = {
			name: (a, b) => a.name.localeCompare(b.name, 'pt-BR'),
			new: (a, b) => b.newest.localeCompare(a.newest),
			'price-asc': (a, b) => a.price - b.price || a.name.localeCompare(b.name, 'pt-BR'),
			'price-desc': (a, b) => b.price - a.price || a.name.localeCompare(b.name, 'pt-BR'),
			set: (a, b) => String(a.setName || '').localeCompare(String(b.setName || ''), 'pt-BR') || String(a.number || '').localeCompare(String(b.number || ''), 'pt-BR', {numeric: true}),
		};

		for (const group of groups) {
			group.search = fold([group.name, group.setName, group.number, languageName(group.language), group.rarity].join(' '));
		}

		function draw() {
			const words = fold(search.value).split(/\s+/).filter(Boolean);
			const shown = groups
				.filter((group) => (!setSelect.value || group.setName === setSelect.value)
					&& (!languageSelect.value || group.language === languageSelect.value)
					&& words.every((word) => group.search.includes(word)))
				.sort(SORTS[sortSelect.value] || SORTS.set);

			count.textContent = shown.length === 1 ? '1 carta' : `${shown.length} cartas`;
			grid.replaceChildren(...(shown.length ? shown.map(tile) : [message('Nenhuma carta com esses filtros.')]));
		}

		for (const control of [search, setSelect, languageSelect, sortSelect]) {
			control.addEventListener(control === search ? 'input' : 'change', draw);
		}

		root.replaceChildren(el('div', {class: 'card-filters'}, search, setSelect, languageSelect, sortSelect), count, grid);
		draw();
	}

	// -------------------------------------------------------- one card

	function one(root, groups) {
		const params = new URLSearchParams(window.location.search);
		const group = groups.find((one) => one.cardId === params.get('c') && one.language === (params.get('l') || ''));

		if (!group) {
			root.replaceChildren(
				message('Esta carta não está mais à venda.'),
				el('a', {class: 'btn btn-navy', href: 'avulsas.html'}, 'Ver as cartas à venda')
			);
			document.title = 'Carta indisponível | HOTARU';

			return;
		}

		document.title = `${group.name} | Cartas | HOTARU`;

		const facts = [
			['Coleção', group.setName],
			['Número', group.number],
			['Idioma', languageName(group.language)],
			['Raridade', group.rarity],
			['Estado', [...group.conditions].join(', ')],
			['Acabamento', [...group.finishes].join(', ')],
			['Disponível', available(group.copies.length)],
		].filter(([, value]) => value);

		root.replaceChildren(el('div', {class: 'card-detail'},
			shot(group, {link: false}),
			el('div', {class: 'card-info'},
				el('p', {class: 'eyebrow'}, ['Carta avulsa', languageName(group.language)].filter(Boolean).join(' · ')),
				el('h1', null, group.name),
				el('p', {class: 'card-price'}, brl(group.price)),
				el('dl', {class: 'card-facts'}, facts.map(([label, value]) => [el('dt', null, label), el('dd', null, value)])),
				el('a', {class: 'btn btn-gold', href: mailto(group)}, 'Quero esta carta'),
				el('p', {class: 'card-how'}, `Para comprar, mande um e-mail para ${EMAIL} (o botão já abre com a carta escrita). A entrega é combinada com você.`),
				el('a', {class: 'card-back', href: 'avulsas.html'}, '← Todas as cartas')
			)
		));
	}

	// ----------------------------------------------------------- start

	const VIEWS = {all, card: one, home};

	async function start() {
		const roots = [...document.querySelectorAll('[data-catalog]')];

		if (!roots.length) {
			return;
		}

		let groups;

		try {
			groups = groupCards(await readCatalog());
		}
		catch {
			for (const root of roots) {
				if (root.dataset.catalog === 'home') {
					(root.closest('section') || root).hidden = true;
				}
				else {
					root.replaceChildren(message('Não foi possível carregar as cartas agora. Tente de novo em instantes.'));
				}
			}

			return;
		}

		for (const root of roots) {
			const view = VIEWS[root.dataset.catalog];

			if (view) {
				view(root, groups);
			}
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', start);
	}
	else {
		start();
	}
})();
