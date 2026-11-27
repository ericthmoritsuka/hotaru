// O catálogo de cartas da HOTARU: lê no navegador as cartas à venda que o
// Eric publica pela tela Shop do card tracker (função store_catalog do
// Supabase; plano em pokemon-card-tracker, plans/hotaru-catalog-plan.md,
// etapa 3). Não há build: um preço salvo no tracker aparece aqui na próxima
// visita.
//
// Quatro lugares usam o mesmo script, cada um marcado por data-catalog:
//   home    na home, as cartas mais recentes, logo depois da hero; a seção
//           inteira fica escondida quando não há nenhuma carta à venda
//   all     avulsas.html, todas as cartas, com busca e filtros
//   card    carta.html?c=<id da carta>&l=<idioma>&a=<acabamento>, uma carta
//           num acabamento, com Adicionar
//           ao carrinho
//   order   pedido.html, o carrinho, o pedido e o Pix
//   sealed, sealedone, homesealed  selados.html, selado.html?id=<produto> e
//           a seção de selados da home (etapa 4), lidos de store_sealed
//   homekits, kits, kit  a seção Kits da home, os kits no alto de
//           avulsas.html e kit.html?id=<kit>, lidos de store_bundles
// Toda página carrega o script, para o link Carrinho do cabeçalho mostrar
// quantas cartas há nele.
//
// Comprar (etapa 5, regras do Eric em 2026-11-24): o carrinho fica neste
// navegador e não reserva nada; muitas pessoas podem ter a mesma carta no
// carrinho. Quem fecha o pedido primeiro fica com ela (place_order no
// Supabase), e ela some do catálogo. O carrinho aberto avisa quando uma
// carta foi reservada por outra pessoa ou não está mais à venda. Fechado o
// pedido, a página mostra o Pix copia e cola e o QR Code (assets/pix.js);
// sem pagamento em 48 horas, o pedido é cancelado e as cartas voltam. O
// site não fala em frete, envio ou parcelamento, que não existem.
//
// Todo texto vindo do banco entra na página como texto (textContent), nunca
// como HTML.
//
// O artista da carta (Eric, 2026-11-24) não está no catálogo: a página da
// carta o lê no TCGdex, que responde a qualquer site. Se o TCGdex não
// responder, a linha simplesmente não aparece.
//
// A região de cada Pokémon (filtro Região de avulsas.html, 2026-11-26)
// também vem do TCGdex, pelo número da Pokédex; sem resposta, o filtro não
// aparece.

(() => {
	'use strict';

	const SUPABASE_URL = 'https://ehdkbxrjxsypegbtrxbw.supabase.co';
	// A chave publicável do projeto: pública de propósito, só abre o que as
	// regras do banco deixam um visitante ler.
	const SUPABASE_KEY = 'sb_publishable_Ycfz9bobfuvHWdDKjaoQQA_LDYmm0vJ';
	const EMAIL = 'hotaru.loja@gmail.com';
	const TCGDEX = 'https://api.tcgdex.net/v2';
	// Os idiomas ocidentais que o TCGdex lê pelo idioma da cópia; um catálogo
	// asiático (ja, ko, zh-tw...) é lido pelo próprio código.
	const WESTERN = new Set(['de', 'en', 'es', 'fr', 'it', 'pt']);
	const HOME_LIMIT = 8;
	// O carrossel da home (Eric, 2026-11-24): até tantas cartas, as de maior
	// preço primeiro, passando sozinho a cada tanto até alguém mexer nele.
	const CAROUSEL_LIMIT = 12;
	const CAROUSEL_EVERY_MS = 4500;
	const CART_KEY = 'hotaru.cart';
	const LAST_ORDER_KEY = 'hotaru.lastOrder';
	// O carrinho aberto confere as cartas a cada minuto.
	const RECHECK_MS = 60000;
	const MAX_ORDER = 20;
	// O comprovante: foto, captura ou PDF de até 5 MB, como o bucket
	// store-receipts aceita.
	const RECEIPT_TYPES = {'application/pdf': 'pdf', 'image/heic': 'heic', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'};
	const RECEIPT_MAX = 5 * 1024 * 1024;

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

	// Raridades em português, com os nomes da lista em português do próprio
	// TCGdex (api.tcgdex.net/v2/pt/rarities, lida em 2026-11-24), com as
	// maiúsculas uniformizadas e "Rare Secreta" corrigida para Rara Secreta.
	// O tracker publica a raridade em inglês; uma que não está aqui aparece
	// como veio, como Futuristic Rare, que o TCGdex também não traduz.
	const RARITIES = {
		'ace spec rare': 'ACE SPEC Raro',
		'amazing rare': 'Raras Incríveis',
		'black white rare': 'Rara Preto e Branco',
		common: 'Comum',
		'double rare': 'Rara Dupla',
		'full art trainer': 'Arte Completa de Treinador',
		'holo rare': 'Rara Holo',
		'holo rare v': 'Rara Holo V',
		'holo rare vmax': 'Rara Holo VMAX',
		'holo rare vstar': 'Rara Holo VSTAR',
		'hyper rare': 'Hiper Rara',
		'illustration rare': 'Ilustração Rara',
		'mega hyper rare': 'Mega Hiper Raro',
		promo: 'Promo',
		'radiant rare': 'Rara Radiante',
		rare: 'Rara',
		'rare holo': 'Rara Holo',
		'secret rare': 'Rara Secreta',
		'shiny rare': 'Shiny Rara',
		'shiny rare v': 'Shiny Rara V',
		'shiny rare vmax': 'Shiny Rara VMAX',
		'shiny ultra rare': 'Brilhante Ultra Rara',
		'special illustration rare': 'Ilustração Rara Especial',
		'ultra rare': 'Ultra Rara',
		uncommon: 'Incomum',
	};

	const rarityName = (rarity) => (rarity && String(rarity).toLowerCase() !== 'none' ? RARITIES[String(rarity).toLowerCase()] || rarity : null);

	// O acabamento como o tracker escreve ("Normal, 30th anniversary
	// stamp"). Só o stamp dos 30 anos vira português aqui, porque o texto
	// também é o endereço da carta (a=) nos anúncios que já estão no ar; o
	// resto, readFinish separa em partes.
	const FINISH_WORDS = [
		[/\b30th anniversary stamp\b/gi, 'carimbo de 30 anos'],
		[/\breverse holo\b/gi, 'Reverse Holo'],
	];

	const finishName = (finish) => FINISH_WORDS.reduce((text, [pattern, word]) => text.replace(pattern, word), String(finish || '')) || null;

	// Cada acabamento de uma carta tem o seu preço e o seu anúncio (Eric,
	// 2026-11-24).
	const plainFinish = (finish) => !finish || /^normal$/i.test(String(finish).trim());

	// As etiquetas da carta (Eric, 2026-11-26), lidas do acabamento que o
	// tracker publica: "Tipo, subtipo, padrão, stamps, tamanho", como
	// js/prices.js finishName o escreve a partir da variante do TCGdex
	// ("Reverse holo, Poké Ball pattern", "Normal, Shadowless, 1st Edition
	// stamp", "Holo, Cosmos foil, Jumbo"), ou a palavra da cópia importada
	// ("1st Edition", "Unlimited", "Unlimited holo"). Cada parte vira uma
	// etiqueta com o nome que a comunidade usa:
	//   brilho   o padrão antes do tipo: "Poké Ball Reverse Holo", "Cosmos
	//            Holo" (Eric: o nome do padrão e depois o acabamento)
	//   edição   1ª Edição, Shadowless e Unlimited (em inglês, como os
	//            colecionadores falam; Eric)
	//   stamp    Stamp 30 anos, Stamp 25 anos e os outros stamps
	//   promo    as cartas promocionais (a raridade Promo)
	//   tamanho  Jumbo
	const PATTERN_NAMES = {
		cosmos: 'Cosmos', 'cracked ice': 'Cracked Ice', duskball: 'Dusk Ball', energy: 'Energy', friendball: 'Friend Ball',
		galaxy: 'Galaxy', gold: 'Gold', greatball: 'Great Ball', league: 'League', loveball: 'Love Ball', 'master ball': 'Master Ball',
		masterball: 'Master Ball', 'poke ball': 'Poké Ball', pokeball: 'Poké Ball', 'poké ball': 'Poké Ball', quickball: 'Quick Ball',
		starlight: 'Starlight', 'team rocket': 'Team Rocket', tinsel: 'Tinsel', ultraball: 'Ultra Ball',
	};
	const EDITION_NAMES = {'1999-2000 copyright': 'Copyright 1999-2000', '1st edition': '1ª Edição', shadowless: 'Shadowless', unlimited: 'Unlimited'};
	const STAMP_NAMES = {
		'25th celebration': '25 anos', '30 anos': '30 anos', '30th anniversary': '30 anos', 'player rewards program': 'Play! Pokémon',
		'pokemon center': 'Pokémon Center', 'pre release': 'Pré-lançamento', 'set logo': 'Logo da coleção', staff: 'Staff',
	};

	// Toda carta de uma coleção carimbada tem o stamp, mas o tracker só o
	// escreve quando a cópia aponta para a variante do TCGdex que o tem: as
	// comuns e raras Holo dos 30 anos chegam como "Holo", e o TCGdex nem
	// marca o logo dos 25 anos impresso nas cartas de Celebrações (cel25-18
	// Zamazenta V, conferido na imagem em 2026-11-26). Por isso a coleção
	// decide, e o stamp escrito no acabamento também conta.
	const STAMPED_SETS = {'30th': '30 anos', cel25: '25 anos'};

	const titleCase = (text) => String(text).replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
	const setOf = (cardId) => String(cardId || '').replace(/-[^-]*$/, '');

	function readFinish(finish, cardId = '', rarity = '') {
		const info = {editions: [], jumbo: false, other: [], pattern: null, promo: /^promo$/i.test(String(rarity || '').trim()), stamps: [], type: null};
		const add = (list, name) => (list.includes(name) ? null : list.push(name));

		for (const part of String(finish || '').split(',').map((one) => one.trim()).filter(Boolean)) {
			const word = part.toLowerCase();
			let match;

			if (word === 'normal' || word === 'holo' || word === 'reverse holo') {
				info.type = word === 'normal' ? 'Normal' : word === 'holo' ? 'Holo' : 'Reverse Holo';
			}
			else if (word === 'unlimited holo') {
				info.type = 'Holo';
				add(info.editions, 'Unlimited');
			}
			else if (EDITION_NAMES[word]) {
				add(info.editions, EDITION_NAMES[word]);
			}
			else if ((match = word.match(/^(.+) stamp$/))) {
				if (match[1] === '1st edition') {
					add(info.editions, '1ª Edição');
				}
				else {
					add(info.stamps, STAMP_NAMES[match[1]] || titleCase(match[1]));
				}
			}
			else if ((match = word.match(/^carimbo de (.+)$/))) {
				add(info.stamps, STAMP_NAMES[match[1]] || match[1]);
			}
			else if ((match = word.match(/^(.+) (?:pattern|foil)$/))) {
				info.pattern = PATTERN_NAMES[match[1]] || titleCase(match[1]);
			}
			else if (word === 'jumbo') {
				info.jumbo = true;
			}
			else {
				info.other.push(part);
			}
		}

		if (STAMPED_SETS[setOf(cardId)]) {
			add(info.stamps, STAMPED_SETS[setOf(cardId)]);
		}

		return info;
	}

	// O brilho como a etiqueta o escreve: o padrão antes do tipo, e nada no
	// Normal simples.
	function shineLabel(info) {
		const type = info.type === 'Normal' && info.pattern ? null : info.type;
		const words = [info.pattern, type === 'Normal' ? null : type].filter(Boolean).join(' ');

		return [words, ...info.other].filter(Boolean).join(', ') || null;
	}

	const stampLabel = (name) => `Stamp ${name}`;

	// As etiquetas, na ordem do canto da foto: o brilho (dourado) em cima,
	// depois as marcas (escuras): edição, stamps, promo e tamanho. help é o
	// balão (HELP), quando há um.
	function badgesOf(info) {
		const shine = shineLabel(info);
		const shineHelp = info.type === 'Reverse Holo' ? 'reverse' : info.type === 'Holo' ? 'holo' : null;
		const EDITION_HELP = {'1ª Edição': 'first', Shadowless: 'shadowless', Unlimited: 'unlimited'};
		const STAMP_HELP = {'25 anos': 'stamp25', '30 anos': 'stamp30'};

		return [
			shine ? {help: shineHelp, label: shine, pattern: info.pattern, shine: true} : null,
			...info.editions.map((name) => ({help: EDITION_HELP[name] || null, label: name})),
			...info.stamps.map((name) => ({help: STAMP_HELP[name] || null, label: stampLabel(name)})),
			info.promo ? {help: 'promo', label: 'Promo'} : null,
			info.jumbo ? {help: null, label: 'Jumbo'} : null,
		].filter(Boolean);
	}

	// O que cada etiqueta quer dizer (Eric, 2026-11-26). Os brilhos mostram
	// duas cartinhas desenhadas, e as edições duas molduras; os stamps, a 1ª
	// Edição e a estrela das promos mostram um recorte de uma carta de
	// verdade, da imagem do TCGdex que o site já usa (nada desenhado por nós):
	//   stamp-30-anos.webp    Lugia 30th-121, canto da ilustração
	//   stamp-25-anos.webp    Zamazenta V cel25-18, canto da ilustração
	//   primeira-edicao.webp  Moltres base3-27 (Fossil), stamp Edition 1
	//   promo-estrela.webp    Cottonee mep-018, código, número e estrela PROMO
	const HELP = {
		first: {
			picture: {alt: 'O stamp Edition 1 à esquerda, logo abaixo da ilustração de uma carta do Fossil.', height: 150, src: 'assets/primeira-edicao.webp', width: 280},
			text: 'A primeira tiragem das coleções da época da Wizards (1999 a 2002), com o stamp Edition 1 à esquerda, logo abaixo da ilustração. Costuma valer mais que a mesma carta Unlimited.',
			title: '1ª Edição',
		},
		holo: {
			minis: 'shine',
			text: 'A carta tem brilho holográfico. Na maioria das cartas, o brilho fica só na ilustração; nas especiais, como as ex e as ilustrações raras, ele pode cobrir a carta inteira.',
			title: 'Holo',
		},
		promo: {
			picture: {alt: 'O canto de uma carta promocional: o código MEP, o número 018 sem o total da coleção e a estrela preta escrita PROMO.', height: 128, src: 'assets/promo-estrela.webp', width: 448},
			text: 'Uma carta promocional: sai em produtos especiais e eventos, não nos boosters das coleções. Tem a estrela preta escrita PROMO ao lado do número, que vem sem o total da coleção (018, e não 018/191).',
			title: 'Promo',
		},
		reverse: {
			minis: 'shine',
			text: 'O brilho fica em volta: na moldura, no fundo e na área do texto, e a ilustração não brilha. É uma versão especial, e a mesma carta também existe sem esse brilho em volta.',
			title: 'Reverse Holo',
		},
		shadowless: {
			minis: 'edition',
			text: 'Uma das primeiras tiragens do Base Set, de 1999: a moldura da ilustração não tem a sombra do lado direito, que a tiragem Unlimited ganhou depois.',
			title: 'Shadowless',
		},
		stamp25: {
			picture: {alt: 'O stamp dos 25 anos no canto da ilustração de uma carta: o rosto do Pikachu com 2 e 5 nas bochechas.', height: 180, src: 'assets/stamp-25-anos.webp', width: 280},
			text: 'O símbolo dos 25 anos de Pokémon: o Pikachu com 2 e 5 nas bochechas, no canto da ilustração. Vem impresso em todas as cartas da coleção Celebrações.',
			title: 'Stamp 25 anos',
		},
		stamp30: {
			picture: {alt: 'O stamp dos 30 anos no canto da ilustração de uma carta: o rosto do Pikachu com 3 e 0 nas bochechas.', height: 180, src: 'assets/stamp-30-anos.webp', width: 280},
			text: 'O símbolo dos 30 anos de Pokémon: o Pikachu com 3 e 0 nas bochechas, no canto da ilustração. Vem impresso em todas as cartas da coleção Celebração de 30 Anos.',
			title: 'Stamp 30 anos',
		},
		unlimited: {
			minis: 'edition',
			text: 'A tiragem comum das primeiras coleções, depois da 1ª Edição (e, no Base Set, da Shadowless): sem o stamp Edition 1, e com a sombra do lado direito da moldura da ilustração.',
			title: 'Unlimited',
		},
	};

	// O padrão do brilho, antes do texto do Holo ou do Reverse Holo.
	const PATTERN_TEXT = {
		Cosmos: 'O brilho tem o padrão Cosmos: círculos e pontos que lembram um céu estrelado, comum nas cartas promocionais.',
		'Master Ball': 'O brilho tem o desenho de várias Master Balls, em vez do brilho liso; costuma ser mais rara que a Poké Ball Reverse Holo da mesma carta.',
		'Poké Ball': 'O brilho tem o desenho de várias Poké Balls, em vez do brilho liso.',
	};
	const patternText = (pattern) => PATTERN_TEXT[pattern] || `O brilho tem um padrão próprio, ${pattern}, em vez do brilho liso.`;

	// O estado e a raridade (Eric, 2026-11-27). O tracker publica o estado em
	// inglês e por extenso (js/scan/session.js CONDITIONS: Near Mint, Lightly
	// Played, Moderately Played, Heavily Played, Damaged). A carta é tida como
	// Near Mint, então só quem tem outro estado ganha a etiqueta; os balões
	// seguem os padrões de estado da TCGplayer (outubro de 2026). Um valor que
	// não está aqui aparece como veio, sem balão, e nunca some.
	const CONDITIONS = {
		'damaged': {abbr: 'DMG', name: 'Danificada', rank: 4, text: 'Rasgo, furo, dobra forte, contato com água, tinta ou informação ilegível.'},
		'heavily played': {abbr: 'HP', name: 'Muito jogada', rank: 3, text: 'Desgaste forte: bordas brancas, riscos grandes e dobras maiores, mas a carta continua inteira.'},
		'lightly played': {abbr: 'LP', name: 'Pouco jogada', rank: 1, text: 'Sinais leves de manuseio: bordas um pouco gastas, alguns riscos e, no máximo, uma dobra pequena (até cerca de 1 cm), sem rasgos.'},
		'moderately played': {abbr: 'MP', name: 'Jogada', rank: 2, text: 'Uso visível: bordas e cantos gastos, riscos e arranhões, dobras de até cerca de 2 cm e um pouco de sujeira.'},
		'near mint': {abbr: 'NM', name: 'Near Mint', rank: 0},
	};
	const CONDITION_ABBRS = Object.fromEntries(Object.entries(CONDITIONS).map(([key, one]) => [one.abbr.toLowerCase(), key]));

	// Do valor do tracker ao estado conhecido, ou null.
	const conditionOf = (value) => {
		const word = String(value || '').trim().toLowerCase();

		return CONDITIONS[word] || CONDITIONS[CONDITION_ABBRS[word]] || null;
	};
	const isNearMint = (value) => !String(value || '').trim() || conditionOf(value) === CONDITIONS['near mint'];

	// A etiqueta de um estado (abreviado no tile, por extenso onde o texto
	// já o escreve), ou null no Near Mint.
	function conditionBadge(value, {full = false} = {}) {
		const one = conditionOf(value);

		if (isNearMint(value)) {
			return null;
		}

		return one
			? {cls: 'cond-tag', help: `cond-${one.abbr.toLowerCase()}`, label: full ? String(value).trim() : one.abbr, title: `${one.abbr} · ${one.name}`}
			: {cls: 'cond-tag', help: null, label: String(value).trim()};
	}

	// O estado de um tile: sem etiqueta quando alguma cópia é Near Mint (ou
	// não tem estado); senão, o da cópia mais próxima do Near Mint. Um valor
	// desconhecido conta como o pior.
	function groupCondition(group) {
		const values = (group.copies || []).map((row) => row.condition);

		if (!values.length || values.some(isNearMint)) {
			return null;
		}

		const rank = (value) => (conditionOf(value) ? conditionOf(value).rank : 9);

		return values.reduce((best, value) => (rank(value) < rank(best) ? value : best));
	}

	// Da raridade de Rara Dupla (ex) para cima, com o que cada uma é. Fora
	// daqui, nenhuma etiqueta: Comum, Incomum, Rara, Rara Holo, e a Promo, que
	// tem a sua. Ficam de fora também as da geração anterior (Rara Holo V,
	// VMAX e VSTAR, Radiante, Shiny, Raras Incríveis), até o Eric decidir.
	const HIGH_RARITIES = {
		'ace spec rare': 'Uma carta de Treinador ou de Energia de efeito poderoso; cada baralho pode ter só uma carta ACE SPEC.',
		'double rare': 'A raridade dos Pokémon ex de arte comum, marcada com duas estrelas pretas.',
		'hyper rare': 'Uma versão da carta com acabamento dourado.',
		'illustration rare': 'A ilustração ocupa a carta inteira.',
		'mega hyper rare': 'A raridade mais alta das coleções Mega Evolução.',
		'secret rare': 'O número da carta é maior que o total da coleção, como 205/198.',
		'special illustration rare': 'A ilustração ocupa a carta inteira, numa carta de Pokémon ex ou de Treinador.',
		'ultra rare': 'Uma carta de arte completa, em geral um Pokémon ex ou um Treinador.',
	};
	const HIGH_RARITY_BY_NAME = Object.fromEntries(Object.keys(HIGH_RARITIES).map((key) => [RARITIES[key], key]));

	const rarityBadge = (name) => (HIGH_RARITY_BY_NAME[name] ? {help: `rarity-${HIGH_RARITY_BY_NAME[name].replace(/ /g, '-')}`, label: name} : null);

	// As etiquetas do estado e da raridade de um tile, depois das do
	// acabamento.
	const markBadges = (group) => [rarityBadge(group.rarity), conditionBadge(groupCondition(group))].filter(Boolean);

	// O estado como texto (a ficha, as linhas de compra, o kit e o carrinho):
	// o valor do tracker, com o "?" do balão quando ele tem um, no formato de
	// withFinishHelp. Near Mint e sem estado ficam como texto.
	const conditionPart = (value) => conditionBadge(value, {full: true}) || (String(value || '').trim() || null);

	for (const one of Object.values(CONDITIONS)) {
		if (one.text) {
			HELP[`cond-${one.abbr.toLowerCase()}`] = {text: one.text, title: `${one.abbr} · ${one.name}`};
		}
	}

	for (const [key, text] of Object.entries(HIGH_RARITIES)) {
		HELP[`rarity-${key.replace(/ /g, '-')}`] = {text, title: RARITIES[key]};
	}

	const helpAttrs = (badge, cls) => ({
		'aria-expanded': 'false',
		'aria-label': `${badge.title || badge.label}: o que é?`,
		class: cls,
		'data-finish-kind': badge.help,
		'data-pattern': badge.pattern || null,
		'data-title': badge.title || badge.label,
		type: 'button',
	});

	const helpMark = () => el('span', {'aria-hidden': 'true', class: 'finish-tag-i'}, '?');

	// Uma etiqueta no canto da foto, como as do resto do site (.tag).
	function badgeTag(badge) {
		const cls = `tag ${badge.shine ? 'foil finish-tag' : badge.cls || 'stamp-tag'}`;

		return badge.help
			? el('button', helpAttrs(badge, `${cls} finish-tag-help`), badge.label, helpMark())
			: el('span', {class: cls}, badge.label);
	}

	function finishTags(group) {
		const badges = [...badgesOf(readFinish(group.finish, group.cardId, group.rarity)), ...markBadges(group)];

		return badges.length ? el('div', {class: 'finish-tags'}, badges.map(badgeTag)) : null;
	}

	// O mesmo balão onde a etiqueta aparece como texto (a ficha e as linhas
	// de compra da carta, Também à venda, o kit e o carrinho): um "?" logo
	// depois do nome.
	const badgeHelp = (badge) => (badge && badge.help ? el('button', helpAttrs(badge, 'finish-help'), helpMark()) : null);

	// As etiquetas de um acabamento como texto, sem a promo (a raridade já
	// a diz): o brilho (ou Normal, com normal), as edições, os stamps e o
	// tamanho.
	function finishWords(finish, cardId, {normal = false} = {}) {
		const badges = badgesOf({...readFinish(finish, cardId), promo: false});

		return !normal || badges.some((badge) => badge.shine) ? badges : [{label: 'Normal', shine: true}, ...badges];
	}

	// Uma parte de texto com o seu "?", quando a parte é uma etiqueta.
	const textWithHelp = (part) => (typeof part === 'string' || !part ? part : [part.label, badgeHelp(part)]);

	// Um texto com partes separadas por " · ", com o "?" logo depois de
	// cada etiqueta que tem balão.
	const withFinishHelp = (parts, badges) => [...parts.filter(Boolean), ...badges].flatMap((part, i) => [
		i ? ' · ' : null,
		typeof part === 'string' ? part : part.label,
		typeof part === 'string' ? null : badgeHelp(part),
	]);

	// O nome da carta com as etiquetas do acabamento, para títulos, alt e
	// e-mail.
	const finishSummary = (group) => finishWords(group.finish, group.cardId).map((badge) => badge.label).join(', ');

	// Uma cartinha desenhada: moldura, ilustração e duas linhas de texto; o
	// brilho vai na ilustração (Holo) ou na moldura (Reverse Holo), e a
	// sombra da moldura da ilustração marca a Unlimited.
	const miniCard = (kind, current) => el('figure', {class: `finish-mini finish-mini-${kind}${current ? ' is-current' : ''}`},
		el('span', {'aria-hidden': 'true', class: 'finish-mini-card'},
			el('span', {class: 'finish-mini-art'}),
			el('span', {class: 'finish-mini-line'}),
			el('span', {class: 'finish-mini-line finish-mini-line-short'})
		),
		el('figcaption', null, HELP[kind].title)
	);

	// O conteúdo do balão de uma etiqueta.
	function helpContent(button) {
		const kind = button.dataset.finishKind;
		const help = HELP[kind];
		const pattern = button.dataset.pattern;
		const pairs = {edition: ['shadowless', 'unlimited'], shine: ['holo', 'reverse']};

		return [
			el('p', {class: `finish-pop-title${help.picture || help.minis ? '' : ' finish-pop-title-alone'}`}, button.dataset.title || help.title),
			help.picture
				? el('img', {alt: help.picture.alt, class: 'finish-pop-stamp', height: String(help.picture.height), src: help.picture.src, width: String(help.picture.width)})
				: help.minis ? el('div', {class: 'finish-pop-cards'}, pairs[help.minis].map((one) => miniCard(one, one === kind))) : null,
			el('p', {class: 'finish-pop-text'}, pattern ? `${patternText(pattern)} ${help.text}` : help.text),
		];
	}

	// O balão é um só na página, preso ao body, para não ser cortado pela
	// foto (overflow hidden) nem pelo carrossel; abre com um toque ou
	// clique, e também ao passar o mouse onde há mouse.
	const finishPop = {button: null, node: null, timer: 0};

	function finishPopNode() {
		if (!finishPop.node) {
			finishPop.node = el('div', {class: 'finish-pop', hidden: true, id: 'finish-pop', role: 'tooltip'});
			finishPop.node.addEventListener('mouseenter', () => clearTimeout(finishPop.timer));
			finishPop.node.addEventListener('mouseleave', () => closeFinishPopSoon());
			document.body.append(finishPop.node);
		}

		return finishPop.node;
	}

	function placeFinishPop() {
		const {button, node} = finishPop;

		if (!button || !node) {
			return;
		}

		const gutter = 16;
		const spot = button.getBoundingClientRect();
		const width = node.offsetWidth;
		const height = node.offsetHeight;
		const left = Math.min(Math.max(spot.left, gutter), window.innerWidth - width - gutter);
		const below = spot.bottom + 8;
		const top = below + height > window.innerHeight - gutter && spot.top - 8 - height >= gutter ? spot.top - 8 - height : below;

		node.style.left = `${Math.max(left, gutter)}px`;
		node.style.top = `${top}px`;
	}

	function openFinishPop(button) {
		clearTimeout(finishPop.timer);

		if (finishPop.button === button) {
			return;
		}

		closeFinishPop();

		const node = finishPopNode();

		node.replaceChildren(...helpContent(button));
		node.hidden = false;
		node.classList.remove('is-away');
		finishPop.button = button;
		button.setAttribute('aria-expanded', 'true');
		button.setAttribute('aria-describedby', 'finish-pop');
		placeFinishPop();
	}

	function closeFinishPop() {
		clearTimeout(finishPop.timer);

		if (finishPop.button) {
			finishPop.button.setAttribute('aria-expanded', 'false');
			finishPop.button.removeAttribute('aria-describedby');
		}

		if (finishPop.node) {
			finishPop.node.hidden = true;
		}

		finishPop.button = null;
	}

	function closeFinishPopSoon() {
		clearTimeout(finishPop.timer);
		finishPop.timer = setTimeout(closeFinishPop, 200);
	}

	// Os eventos ficam no document, então valem para toda etiqueta que o
	// catálogo desenhar depois (grade, carrossel, página da carta).
	function watchFinishTags() {
		const hover = window.matchMedia('(hover: hover) and (pointer: fine)');
		const tagOf = (event) => (event.target instanceof Element ? event.target.closest('[data-finish-kind]') : null);

		document.addEventListener('click', (event) => {
			const button = tagOf(event);

			if (button) {
				event.preventDefault();
				event.stopPropagation();

				if (finishPop.button === button && !hover.matches) {
					closeFinishPop();
				}
				else {
					openFinishPop(button);
				}

				return;
			}

			if (finishPop.node && !finishPop.node.contains(event.target)) {
				closeFinishPop();
			}
		}, true);
		document.addEventListener('mouseover', (event) => {
			const button = tagOf(event);

			if (button && hover.matches) {
				openFinishPop(button);
			}
		});
		document.addEventListener('mouseout', (event) => {
			const button = tagOf(event);

			if (button && hover.matches && !button.contains(event.relatedTarget)) {
				closeFinishPopSoon();
			}
		});
		document.addEventListener('keydown', (event) => {
			if (event.key === 'Escape' && finishPop.button) {
				const button = finishPop.button;

				closeFinishPop();
				button.focus();
			}
		});
		// Rolando a página ou o carrossel, o balão acompanha a etiqueta, e
		// some enquanto ela está fora da tela ou da faixa do carrossel (sem
		// fechar: a rolagem suave do Tab até a etiqueta passa por fora).
		const followFinishTag = () => {
			if (!finishPop.button) {
				return;
			}

			const spot = finishPop.button.getBoundingClientRect();
			const track = finishPop.button.closest('.carousel-track');
			const area = track ? track.getBoundingClientRect() : {bottom: window.innerHeight, left: 0, right: window.innerWidth, top: 0};
			const seen = finishPop.button.isConnected && spot.bottom > area.top && spot.top < area.bottom && spot.right > area.left && spot.left < area.right;

			finishPop.node.classList.toggle('is-away', !seen);

			if (seen) {
				placeFinishPop();
			}
		};

		document.addEventListener('scroll', followFinishTag, {capture: true, passive: true});
		window.addEventListener('resize', followFinishTag, {passive: true});
	}

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

	// A descrição de um selado aceita um Markdown mínimo, que vira nós da
	// página (nunca HTML): uma linha em branco separa parágrafos, linhas que
	// começam com "- " (ou "* " e "• ") viram lista, **texto** vira negrito e
	// *texto* vira itálico. Qualquer outra coisa aparece como foi escrita.
	const LIST_ITEM = /^[-*•]\s+/;
	const EMPHASIS = /\*\*(.+?)\*\*|\*([^\s*](?:[^*]*[^\s*])?)\*/g;

	function inlineText(text) {
		const parts = [];
		let last = 0;

		for (const match of text.matchAll(EMPHASIS)) {
			parts.push(text.slice(last, match.index));
			parts.push(match[1] === undefined ? el('em', null, match[2]) : el('strong', null, inlineText(match[1])));
			last = match.index + match[0].length;
		}

		parts.push(text.slice(last));

		return parts.filter((part) => part !== '');
	}

	function richText(text) {
		const blocks = [];

		for (const chunk of String(text || '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/)) {
			let lines = [];
			let items = [];

			const flush = () => {
				if (lines.length) {
					blocks.push(el('p', null, lines.map((line, i) => [i ? el('br') : null, inlineText(line)])));
				}

				if (items.length) {
					blocks.push(el('ul', null, items.map((item) => el('li', null, inlineText(item)))));
				}

				lines = [];
				items = [];
			};

			for (const raw of chunk.split('\n')) {
				const line = raw.trim();

				if (!line) {
					continue;
				}

				if (LIST_ITEM.test(line)) {
					if (lines.length) {
						flush();
					}

					items.push(line.replace(LIST_ITEM, ''));
				}
				else {
					if (items.length) {
						flush();
					}

					lines.push(line);
				}
			}

			flush();
		}

		return blocks;
	}

	// Chama uma função pública do Supabase. Lança o erro do banco, com a
	// mensagem dele, quando a resposta não é 2xx.
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

	async function readCatalog() {
		const rows = await rpc('store_catalog');

		return Array.isArray(rows) ? rows : [];
	}

	// Os destaques (Eric, 2026-11-25): cartas, coleções e selados que ele
	// escolhe em admin.html para aparecer primeiro, na ordem dele
	// (store_featured, supabase/store-featured.sql no card tracker). Sem
	// resposta do banco, não há destaque e as páginas ficam como antes. As
	// cartas e os selados leem a mesma resposta.
	let featuredRead = null;

	function readFeatured() {
		featuredRead = featuredRead || rpc('store_featured').then((rows) => (Array.isArray(rows) ? rows : []), () => []);

		return featuredRead;
	}

	// ------------------------------------------------------------ cart

	// O carrinho: as cópias escolhidas, com o que a página precisa para
	// mostrá-las sem ler o catálogo de novo.
	function readCart() {
		try {
			const value = JSON.parse(localStorage.getItem(CART_KEY) || '[]');

			return Array.isArray(value) ? value.filter((item) => item && typeof item.id === 'string') : [];
		}
		catch {
			return [];
		}
	}

	function writeCart(items) {
		try {
			localStorage.setItem(CART_KEY, JSON.stringify(items));
		}
		catch {
			// Sem armazenamento: o carrinho dura só esta página.
		}

		drawCartCount(items);
	}

	// As cópias que o carrinho leva: as avulsas e as de cada kit.
	const cartIds = (items = readCart()) => new Set(items.flatMap((item) => (item.kind === 'kit' ? item.ids || [] : [item.id])));

	// Quantas cartas o carrinho leva: um kit conta as suas.
	const cardCount = (items) => items.reduce((n, item) => n + (item.kind === 'kit' ? (item.ids || []).length : 1), 0);

	function drawCartCount(items = readCart()) {
		for (const node of document.querySelectorAll('[data-cart-count]')) {
			node.textContent = String(cardCount(items));
			node.hidden = !items.length;
		}

		for (const link of document.querySelectorAll('.orders-link')) {
			link.hidden = !readOrders().length;
		}

		for (const link of document.querySelectorAll('.cart-link')) {
			link.setAttribute('aria-label', cardCount(items) === 1 ? 'Carrinho, 1 carta' : `Carrinho, ${cardCount(items)} cartas`);
		}
	}

	const cartItem = (row) => ({
		cardId: row.card_id,
		condition: row.condition || null,
		finish: row.finish ? finishName(row.finish) : null,
		id: row.id,
		imagePath: row.image_path || null,
		language: row.language || '',
		name: row.name,
		number: row.number || null,
		price: Number(row.price_brl),
		setName: row.set_name || null,
	});

	// Uma carta do catálogo: do Eric (single) ou de outra pessoa, consignada
	// (consigned; plans/hotaru-consignment-plan.md no card tracker). O
	// comprador vê as duas do mesmo jeito.
	const isCardRow = (row) => row.kind === 'single' || row.kind === 'consigned';

	// Uma carta à venda por carta, idioma e acabamento, com quantas cópias
	// há, os estados delas e o menor preço.
	function groupCards(rows) {
		const groups = new Map();

		for (const row of rows) {
			if (!isCardRow(row) || !row.card_id) {
				continue;
			}

			const finish = row.finish ? finishName(row.finish) : null;
			const key = `${row.card_id}|${row.language || ''}|${finish || ''}`;

			if (!groups.has(key)) {
				groups.set(key, {
					cardId: row.card_id,
					catalog: row.catalog || 'international',
					conditions: new Set(),
					copies: [],
					finish,
					imagePath: null,
					key,
					language: row.language || '',
					name: row.name,
					newest: '',
					number: row.number,
					price: Infinity,
					rarity: rarityName(row.rarity),
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

		}

		// Uma carta avulsa sai primeiro de uma cópia que não está num kit
		// (Eric, 2026-11-25), para o kit continuar inteiro.
		for (const group of groups.values()) {
			group.copies.sort((a, b) => Number(Boolean(a.in_kit)) - Number(Boolean(b.in_kit)));
		}

		return [...groups.values()];
	}

	// ------------------------------------------------------------ regions

	// A região de cada Pokémon, para o filtro Região de avulsas.html (pedido
	// de clientes em 2026-11-26: quem coleciona Kanto não quer procurar set
	// por set). Mesma regra do card tracker (js/checklists.js, REGIONS e
	// regionTag): a região sai do número da Pokédex Nacional, e uma forma
	// regional fica na região da forma, então Exeggutor de Alola é Alola, não
	// Kanto. Trainers e Energias não têm número nem região.
	const REGIONS = [
		{first: 1, id: 'kanto', last: 151, name: 'Kanto'},
		{first: 152, id: 'johto', last: 251, name: 'Johto'},
		{first: 252, id: 'hoenn', last: 386, name: 'Hoenn'},
		{first: 387, id: 'sinnoh', last: 493, name: 'Sinnoh'},
		{first: 494, id: 'unova', last: 649, name: 'Unova'},
		{first: 650, id: 'kalos', last: 721, name: 'Kalos'},
		{first: 722, id: 'alola', last: 809, name: 'Alola'},
		{first: 810, id: 'galar', last: 898, name: 'Galar'},
		{first: 899, id: 'hisui', last: 905, name: 'Hisui'},
		{first: 906, id: 'paldea', last: 1025, name: 'Paldea'},
	];

	// A forma regional no nome, como o TCGdex escreve em inglês ("Alolan
	// Vulpix") e em português ("Exeggutor de Alola", "Meowth de Galar").
	const FORM_NAMES = [
		[/(^|\s)alolan\s|\sde alola(\s|$)/i, 'alola'],
		[/(^|\s)galarian\s|\sde galar(\s|$)/i, 'galar'],
		[/(^|\s)hisuian\s|\sde hisui(\s|$)/i, 'hisui'],
		[/(^|\s)paldean\s|\sde paldea(\s|$)/i, 'paldea'],
	];

	// Os ids das regiões de uma carta, pelos números da Pokédex e pelo nome.
	function regionsOf(dexIds, name) {
		const ids = (dexIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);

		if (!ids.length) {
			return [];
		}

		const form = FORM_NAMES.find(([pattern]) => pattern.test(String(name || '')));

		if (form) {
			return [form[1]];
		}

		return [...new Set(ids.map((n) => REGIONS.find((region) => n >= region.first && n <= region.last)).filter(Boolean).map((region) => region.id))];
	}

	// Os números da Pokédex vêm do TCGdex, que o catálogo não guarda: uma
	// consulta GraphQL por coleção traz os da coleção inteira, como o card
	// tracker faz (js/catalog.js, cardDetailsQuery). A resposta fica neste
	// navegador por uma semana, e a coleção é lida de novo antes disso só
	// quando falta nela uma carta à venda (o TCGdex completa uma coleção nova
	// aos poucos). Só o catálogo internacional, o único que a loja vende
	// hoje; uma carta de outro catálogo fica sem região.
	const DEX_KEY = 'hotaru.dex';
	const DEX_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
	const TCGDEX_GRAPHQL = `${TCGDEX}/graphql`;

	const setIdOf = (cardId) => {
		const cut = String(cardId).lastIndexOf('-');

		return cut > 0 ? String(cardId).slice(0, cut) : null;
	};

	function readDexCache() {
		try {
			const value = JSON.parse(localStorage.getItem(DEX_KEY) || '{}');

			return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
		}
		catch {
			return {};
		}
	}

	function writeDexCache(cache) {
		try {
			localStorage.setItem(DEX_KEY, JSON.stringify(cache));
		}
		catch {
			// Navegador sem espaço ou em modo privado: lê de novo na próxima.
		}
	}

	// {id da carta: [números]} de uma coleção. Lança quando o TCGdex falha.
	async function readSetDex(setId) {
		const query = `{ cards(filters: {id: ${JSON.stringify(`${setId}-`)}}, pagination: {page: 1, itemsPerPage: 1000}) { id dexId } }`;
		const response = await fetch(TCGDEX_GRAPHQL, {body: JSON.stringify({query}), headers: {'content-type': 'application/json'}, method: 'POST'});

		if (!response.ok) {
			throw new Error(`TCGdex ${response.status}`);
		}

		const body = await response.json();
		const cards = body && body.data && Array.isArray(body.data.cards) ? body.data.cards : null;

		if (!cards) {
			throw new Error('TCGdex sem dados');
		}

		const out = {};

		// O filtro de id acha qualquer id que contenha o texto, então a
		// coleção exata é conferida.
		for (const card of cards) {
			if (card && typeof card.id === 'string' && setIdOf(card.id) === setId) {
				out[card.id] = Array.isArray(card.dexId) ? card.dexId.filter(Number.isInteger) : [];
			}
		}

		return out;
	}

	// Põe group.regions (ids) em cada carta do catálogo internacional.
	// Resolve true quando ao menos uma coleção respondeu.
	async function addRegions(groups) {
		const cache = readDexCache();
		const now = Date.now();
		const bySet = new Map();

		for (const group of groups) {
			const setId = group.catalog === 'international' ? setIdOf(group.cardId) : null;

			if (setId) {
				bySet.set(setId, [...(bySet.get(setId) || []), group]);
			}
		}

		let answered = false;

		await Promise.all([...bySet].map(async ([setId, members]) => {
			const saved = cache[setId];
			const fresh = saved && saved.cards && now - Number(saved.at || 0) < DEX_KEEP_MS && members.every((group) => Object.hasOwn(saved.cards, group.cardId));

			if (!fresh) {
				try {
					cache[setId] = {at: now, cards: await readSetDex(setId)};
				}
				catch {
					// Sem rede ou TCGdex fora do ar: usa o que estiver guardado.
				}
			}

			const cards = cache[setId] && cache[setId].cards;

			if (!cards) {
				return;
			}

			answered = true;

			for (const group of members) {
				group.regions = regionsOf(cards[group.cardId], group.name);
			}
		}));

		writeDexCache(cache);

		return answered;
	}

	const cardHref = (group) => `carta.html?c=${encodeURIComponent(group.cardId)}&l=${encodeURIComponent(group.language)}${group.finish ? `&a=${encodeURIComponent(group.finish)}` : ''}`;

	// O nome da carta com o acabamento, quando não é o Normal simples.
	const fullName = (group) => (finishSummary(group) ? `${group.name} (${finishSummary(group)})` : group.name);

	const available = (n) => (n === 1 ? '1 disponível' : `${n} disponíveis`);

	const setLine = (group) => [group.setName, group.number ? `nº ${group.number}` : null].filter(Boolean).join(' · ');

	function shot(group, {link = true} = {}) {
		const url = pictureUrl(group.imagePath);
		const inner = url
			? el('img', {alt: `${fullName(group)}, ${setLine(group)}`, class: 'card-pic', decoding: 'async', loading: 'lazy', src: url})
			: el('span', {class: 'card-pic card-pic-none'}, group.name);

		// No tile, a etiqueta fica fora do link da foto, irmã dele no
		// article (.card-item, que a posiciona), porque ela pode ser um botão.
		return link
			? [finishTags(group), el('a', {class: 'shot card-shot', href: cardHref(group), tabindex: '-1', 'aria-hidden': 'true'}, inner)]
			: el('div', {class: 'shot card-shot'}, finishTags(group), inner);
	}

	// O carrinho direto da grade (Eric, 2026-11-24): uma carta cujas cópias
	// são todas iguais (estado, acabamento e preço) entra com um toque; uma
	// com cópias diferentes leva à página da carta, para escolher qual.
	const variantKey = (row) => [row.condition || '', row.finish || '', row.price_brl].join('|');

	function quickAdd(group) {
		const same = new Set(group.copies.map(variantKey)).size === 1;
		// O ícone do sprite, o mesmo carrinho do cabeçalho; texto fixo, sem
		// dado do banco.
		const icon = () => {
			const span = el('span', {'aria-hidden': 'true', class: 'quick-icon'});

			span.innerHTML = '<svg width="16" height="16"><use href="#i-cart"/></svg>';

			return span;
		};
		const label = (text) => [icon(), text];

		if (!same) {
			return el('a', {'aria-label': `Escolher a cópia de ${fullName(group)}`, class: 'quick-add quick-choose', href: cardHref(group)}, 'Escolher');
		}

		const button = el('button', {class: 'quick-add', type: 'button'});

		function draw() {
			const inCart = cartIds();
			const free = group.copies.filter((row) => !inCart.has(row.id));
			const there = group.copies.length - free.length;

			button.disabled = !free.length;
			button.classList.toggle('quick-in', there > 0);
			button.setAttribute('aria-label', free.length ? `Adicionar ${fullName(group)} ao carrinho` : `${fullName(group)}: todas no carrinho`);
			button.replaceChildren(...label(there ? `No carrinho${there > 1 ? ` (${there})` : ''}` : 'Adicionar'));
		}

		button.addEventListener('click', () => {
			const inCart = cartIds();
			const next = group.copies.find((row) => !inCart.has(row.id));

			if (!next) {
				return;
			}

			if (cardCount(readCart()) >= MAX_ORDER) {
				button.textContent = `Até ${MAX_ORDER} cartas`;

				return;
			}

			writeCart([...readCart(), cartItem(next)]);
			draw();
		});
		draw();

		return button;
	}

	// A marca de um destaque, antes do tipo do anúncio.
	const featuredMark = () => el('span', {class: 'featured-mark'}, 'Destaque');

	function tile(group) {
		return el('article', {class: 'product card-item'},
			shot(group),
			el('div', {class: 'meta'},
				el('span', {class: 'kind'}, group.featured ? featuredMark() : null, ['Carta', languageName(group.language)].filter(Boolean).join(' · ')),
				el('h3', null, el('a', {'aria-label': finishSummary(group) ? fullName(group) : null, href: cardHref(group)}, group.name)),
				el('p', {class: 'card-set'}, setLine(group)),
				el('div', {class: 'price'}, el('strong', null, brl(group.price))),
				el('div', {class: 'card-foot'},
					el('p', {class: 'card-count'}, available(group.copies.length)),
					quickAdd(group)
				)
			)
		);
	}

	const mailto = (group) => {
		const what = `${group.name} (${[setLine(group), languageName(group.language), finishSummary(group)].filter(Boolean).join(', ')})`;
		const subject = `Quero a carta ${what}`;
		const body = `Olá, Eric!\n\nTenho interesse na carta ${what}, por ${brl(group.price)}.\n\nQuantidade: 1\n\nNome:\n`;

		return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
	};

	const message = (text, cls = 'card-note') => el('p', {class: cls, role: 'status'}, text);

	// -------------------------------------------------------- featured

	// Uma carta em destaque é um anúncio: a carta num idioma e num
	// acabamento, com a mesma chave que groupCards dá a ele.
	const featuredKey = (item) => `${item.card_id}|${item.language || ''}|${(item.finish && finishName(item.finish)) || ''}`;

	// Os destaques de cartas na ordem do Eric: {group} para uma carta,
	// {set, groups} para uma coleção inteira. O que não está à venda agora
	// fica de fora e volta sozinho quando estiver. Marca os anúncios em
	// destaque, para o tile mostrar a marca.
	function featuredCards(groups, featured) {
		const byKey = new Map(groups.map((group) => [group.key, group]));
		const picks = [];

		for (const item of featured) {
			if (item.kind === 'card') {
				const group = byKey.get(featuredKey(item));

				if (group && !group.featured) {
					group.featured = true;
					picks.push({group});
				}
			}
			else if (item.kind === 'set') {
				const inSet = groups.filter((group) => group.setName === item.set_name);

				if (inSet.length) {
					picks.push({groups: inSet, set: item.set_name});
				}
			}
		}

		return picks;
	}

	const setHref = (name) => `avulsas.html?colecao=${encodeURIComponent(name)}`;

	// Uma coleção em destaque: a carta mais cara dela na foto, quantas cartas
	// estão à venda e o menor preço. Leva às cartas da coleção; na própria
	// página de cartas, onOpen só aplica o filtro.
	function setTile(pick, {onOpen} = {}) {
		const cover = [...pick.groups].sort((a, b) => b.price - a.price)[0];
		const url = pictureUrl(cover.imagePath);
		const lowest = Math.min(...pick.groups.map((group) => group.price));
		const open = onOpen
			? (event) => {
				event.preventDefault();
				onOpen(pick.set);
			}
			: null;
		const count = pick.groups.length === 1 ? '1 carta à venda' : `${pick.groups.length} cartas à venda`;

		return el('article', {class: 'product card-item set-item'},
			el('a', {'aria-hidden': 'true', class: 'shot card-shot set-shot', href: setHref(pick.set), onclick: open, tabindex: '-1'},
				url
					? el('img', {alt: '', class: 'card-pic', decoding: 'async', loading: 'lazy', src: url})
					: el('span', {class: 'card-pic card-pic-none'}, pick.set)),
			el('div', {class: 'meta'},
				el('span', {class: 'kind'}, featuredMark(), 'Coleção'),
				el('h3', null, el('a', {href: setHref(pick.set), onclick: open}, pick.set)),
				el('p', {class: 'card-set'}, count),
				el('div', {class: 'price'}, el('span', {class: 'set-from'}, 'a partir de'), el('strong', null, brl(lowest))),
				el('div', {class: 'card-foot'},
					el('span', {class: 'quick-add quick-choose set-open'}, 'Ver a coleção')
				)
			)
		);
	}

	const pickTile = (pick, options) => (pick.set ? setTile(pick, options) : tile(pick.group));

	// A faixa Em destaque no alto de uma página.
	function featuredBand(tiles, label) {
		return el('section', {'aria-label': label, class: 'featured'},
			el('h2', {class: 'featured-title'}, label),
			carousel(tiles, label)
		);
	}

	// ------------------------------------------------------------ home

	function home(root, groups, featured = []) {
		const section = root.closest('section') || root;

		if (!groups.length) {
			section.hidden = true;

			return;
		}

		// Os destaques do Eric primeiro, na ordem dele; depois as de maior
		// preço até completar o carrossel.
		const picks = featuredCards(groups, featured);
		const rest = [...groups]
			.filter((group) => !group.featured)
			.sort((a, b) => b.price - a.price || b.newest.localeCompare(a.newest))
			.slice(0, Math.max(0, CAROUSEL_LIMIT - picks.length));

		// O último item leva a todas as cartas (Eric, 2026-11-24).
		const all = el('a', {class: 'carousel-all', href: 'avulsas.html'},
			el('span', {class: 'carousel-all-count'}, groups.length === 1 ? '1 carta' : `${groups.length} cartas`),
			el('span', {class: 'carousel-all-text'}, 'Ver todas as cartas →'));

		root.replaceChildren(
			carousel([...picks.map((pick) => pickTile(pick)), ...rest.map(tile), all], 'Cartas em destaque'),
			el('div', {class: 'carousel-foot'}, el('a', {class: 'btn btn-navy', href: 'avulsas.html'}, groups.length === 1 ? 'Ver a carta à venda' : `Ver todas as ${groups.length} cartas`))
		);
		section.hidden = false;
	}

	// Um carrossel de rolagem com encaixe: arrasta no celular, setas no
	// computador e pontos embaixo. Passa sozinho devagar e para de vez quando
	// a pessoa mexe nele, ou desde o começo quando o aparelho pede menos
	// movimento.
	//
	// Os pontos (Eric, 2026-11-25) ficam no lugar da barra de rolagem do
	// navegador, que fica escondida: um por página, e o da página atual é um
	// traço dourado. Cada um é um botão ("Página 2 de 4") que leva à página.
	// As setas, os pontos e o passar sozinho andam uma página inteira. A
	// rolagem continua no dedo, na roda do mouse e nas setas do teclado.
	function carousel(slides, label) {
		const track = el('div', {class: 'carousel-track', tabindex: '0'}, slides.map((slide) => el('div', {class: 'carousel-slide'}, slide)));
		const prev = el('button', {'aria-label': 'Cartas anteriores', class: 'carousel-arrow carousel-prev', type: 'button'}, '‹');
		const next = el('button', {'aria-label': 'Próximas cartas', class: 'carousel-arrow carousel-next', type: 'button'}, '›');
		const dots = el('div', {'aria-label': 'Páginas do carrossel', class: 'carousel-dots', role: 'group'});
		const box = el('div', {'aria-label': label, 'aria-roledescription': 'carrossel', class: 'carousel', role: 'region'},
			el('div', {class: 'carousel-stage'}, prev, track, next),
			dots);
		let timer = null;
		let pages = 0;

		const gap = () => parseFloat(getComputedStyle(track).columnGap) || 0;
		const slideWidth = () => (track.firstElementChild ? track.firstElementChild.offsetWidth + gap() : track.clientWidth);
		const perView = () => Math.max(1, Math.round((track.clientWidth + gap()) / slideWidth()));
		const maxLeft = () => Math.max(0, track.scrollWidth - track.clientWidth);
		const atEnd = () => track.scrollLeft >= maxLeft() - 4;
		// A página de agora: a do primeiro cartão visível, ou a última quando
		// a rolagem chegou ao fim.
		const currentPage = () => (atEnd() ? pages - 1 : Math.floor(Math.round(track.scrollLeft / slideWidth()) / perView()));
		const pageLeft = (page) => {
			const first = track.children[Math.min(slides.length - 1, page * perView())];

			return Math.min(maxLeft(), first.offsetLeft - track.firstElementChild.offsetLeft);
		};

		function go(page) {
			track.scrollTo({behavior: 'smooth', left: pageLeft(Math.max(0, Math.min(pages - 1, page)))});
		}

		function draw() {
			const count = Math.ceil(slides.length / perView());

			if (count !== pages) {
				pages = count;
				dots.replaceChildren(...Array.from({length: count}, (_, page) => el('button', {
					'aria-label': `Página ${page + 1} de ${count}`,
					class: 'carousel-dot',
					onclick: () => {
						stop();
						go(page);
					},
					type: 'button',
				})));
			}

			const current = currentPage();

			[...dots.children].forEach((dot, page) => {
				dot.classList.toggle('is-current', page === current);
				dot.setAttribute('aria-current', page === current ? 'true' : 'false');
			});
			dots.hidden = count < 2;
			prev.disabled = track.scrollLeft <= 4;
			next.disabled = atEnd();
		}

		function stop() {
			if (timer) {
				clearInterval(timer);
				timer = null;
			}
		}

		prev.addEventListener('click', () => {
			stop();
			go(currentPage() - 1);
		});
		next.addEventListener('click', () => {
			stop();
			go(currentPage() + 1);
		});
		track.addEventListener('scroll', draw, {passive: true});
		window.addEventListener('resize', draw, {passive: true});

		for (const type of ['pointerdown', 'wheel', 'keydown', 'focusin', 'touchstart']) {
			box.addEventListener(type, stop, {passive: true});
		}

		const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		if (!calm && slides.length > 1) {
			timer = setInterval(() => {
				if (!box.isConnected) {
					stop();

					return;
				}

				if (document.hidden || box.matches(':hover')) {
					return;
				}

				if (atEnd()) {
					track.scrollTo({behavior: 'smooth', left: 0});
				}
				else {
					go(currentPage() + 1);
				}
			}, CAROUSEL_EVERY_MS);
		}

		requestAnimationFrame(draw);

		return box;
	}

	// ------------------------------------------------------- all cards

	function all(root, groups, featured = []) {
		if (!groups.length) {
			root.replaceChildren(message('Nenhuma carta à venda agora. Volte em breve!'));

			return;
		}

		const sets = [...new Set(groups.map((group) => group.setName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
		const languages = [...new Set(groups.map((group) => group.language).filter(Boolean))].sort((a, b) => languageName(a).localeCompare(languageName(b), 'pt-BR'));
		const search = el('input', {'aria-label': 'Buscar cartas', class: 'card-search', placeholder: 'Buscar por nome ou coleção', type: 'search'});
		const setSelect = el('select', {'aria-label': 'Coleção'}, el('option', {value: ''}, 'Todas as coleções'), sets.map((name) => el('option', {value: name}, name)));
		const languageSelect = el('select', {'aria-label': 'Idioma'}, el('option', {value: ''}, 'Todos os idiomas'), languages.map((code) => el('option', {value: code}, languageName(code))));
		// Região aparece quando o TCGdex responde (addRegions); até lá, e se
		// ele não responder, a página fica como era.
		const regionSelect = el('select', {'aria-label': 'Região', class: 'card-region', hidden: true}, el('option', {value: ''}, 'Todas as regiões'));
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
			group.search = fold([group.name, group.setName, group.number, languageName(group.language), group.rarity, group.finish, finishSummary(group)].filter(Boolean).join(' '));
		}

		function draw() {
			const words = fold(search.value).split(/\s+/).filter(Boolean);
			const shown = groups
				.filter((group) => (!setSelect.value || group.setName === setSelect.value)
					&& (!languageSelect.value || group.language === languageSelect.value)
					&& (!regionSelect.value || (group.regions || []).includes(regionSelect.value))
					&& words.every((word) => group.search.includes(word)))
				.sort(SORTS[sortSelect.value] || SORTS.set);

			count.textContent = shown.length === 1 ? '1 carta' : `${shown.length} cartas`;
			grid.replaceChildren(...(shown.length ? shown.map(tile) : [message('Nenhuma carta com esses filtros.')]));
		}

		for (const control of [search, setSelect, languageSelect, regionSelect, sortSelect]) {
			control.addEventListener(control === search ? 'input' : 'change', draw);
		}

		// avulsas.html?colecao=<nome> abre já filtrada, como os destaques de
		// coleção da home levam.
		const wanted = new URLSearchParams(window.location.search).get('colecao');

		if (wanted && sets.includes(wanted)) {
			setSelect.value = wanted;
		}

		// Uma coleção em destaque, nesta página, só filtra a grade.
		const openSet = (name) => {
			search.value = '';
			setSelect.value = name;
			draw();
			count.scrollIntoView({behavior: 'smooth', block: 'start'});
		};
		const picks = featuredCards(groups, featured);
		const filters = el('div', {class: 'card-filters'}, search, setSelect, languageSelect, regionSelect, sortSelect);

		root.replaceChildren(
			picks.length ? featuredBand(picks.map((pick) => pickTile(pick, {onOpen: openSet})), 'Em destaque') : '',
			picks.length ? el('h2', {class: 'featured-title'}, 'Todas as cartas') : '',
			filters, count, grid
		);
		draw();

		// Com as regiões lidas: o filtro oferece só as regiões que têm carta
		// à venda, com quantas são, a busca também acha "kanto", e
		// avulsas.html?regiao=kanto abre já filtrada.
		addRegions(groups).then((answered) => {
			const counts = new Map();

			for (const group of groups) {
				for (const id of group.regions || []) {
					counts.set(id, (counts.get(id) || 0) + 1);
				}
			}

			if (!answered || !counts.size || !regionSelect.isConnected) {
				return;
			}

			for (const group of groups) {
				const names = (group.regions || []).map((id) => REGIONS.find((region) => region.id === id).name);

				if (names.length) {
					group.search = `${group.search} ${fold(names.join(' '))}`;
				}
			}

			regionSelect.append(...REGIONS.filter((region) => counts.has(region.id)).map((region) => el('option', {value: region.id}, `${region.name} (${counts.get(region.id)})`)));

			const wantedRegion = new URLSearchParams(window.location.search).get('regiao');

			if (wantedRegion && counts.has(wantedRegion)) {
				regionSelect.value = wantedRegion;
			}

			regionSelect.hidden = false;
			filters.classList.add('has-region');
			draw();
		});
	}

	// -------------------------------------------------------- one card

	function one(root, groups) {
		const params = new URLSearchParams(window.location.search);
		const same = groups.filter((one) => one.cardId === params.get('c') && one.language === (params.get('l') || ''));
		// O acabamento do endereço; um endereço sem ele (de antes dos
		// acabamentos separados) abre o Normal simples, ou o primeiro.
		const wanted = params.get('a');
		const group = wanted !== null
			? same.find((one) => (one.finish || '') === wanted)
			: same.find((one) => plainFinish(one.finish)) || same[0];

		if (!group) {
			root.replaceChildren(
				message('Esta carta não está mais à venda.'),
				el('a', {class: 'btn btn-navy', href: 'avulsas.html'}, 'Ver as cartas à venda')
			);
			document.title = 'Carta indisponível | HOTARU';

			return;
		}

		document.title = `${fullName(group)} | Cartas | HOTARU`;

		// A ficha separa as etiquetas: o brilho no Acabamento, e as marcas
		// em linhas próprias, cada uma com o seu "?".
		const info = readFinish(group.finish, group.cardId, group.rarity);
		const badges = badgesOf(info);
		const shine = badges.find((badge) => badge.shine);
		const listed = (list) => (list.length ? list.flatMap((badge, i) => [i ? ', ' : null, badge.text || badge.label, badgeHelp(badge)]) : null);
		const facts = [
			['Coleção', group.setName],
			['Número', group.number],
			['Idioma', languageName(group.language)],
			['Raridade', group.rarity ? [group.rarity, badgeHelp(badges.find((badge) => badge.help === 'promo') || rarityBadge(group.rarity))] : null],
			['Estado', group.conditions.size ? [...group.conditions].flatMap((value, i) => [i ? ', ' : null, textWithHelp(conditionPart(value))]) : null],
			['Acabamento', group.finish ? [shine ? shine.label : 'Normal', badgeHelp(shine)] : null],
			['Edição', listed(badges.filter((badge) => info.editions.includes(badge.label)))],
			['Stamp', listed(info.stamps.map((name) => ({...badges.find((badge) => badge.label === stampLabel(name)), text: name})))],
			['Tamanho', info.jumbo ? 'Jumbo' : null],
			['Disponível', available(group.copies.length)],
		].filter(([, value]) => value);

		const factList = el('dl', {class: 'card-facts'}, facts.map(([label, value]) => [el('dt', null, label), el('dd', null, value)]));

		root.replaceChildren(el('div', {class: 'card-detail'},
			shot(group, {link: false}),
			el('div', {class: 'card-info'},
				el('p', {class: 'eyebrow'}, ['Carta avulsa', languageName(group.language)].filter(Boolean).join(' · ')),
				el('h1', null, group.name),
				el('p', {class: 'card-price'}, brl(group.price)),
				factList,
				buyBox(group),
				otherFinishes(group, same),
				el('p', {class: 'card-how'}, 'O carrinho não reserva a carta: ela fica com quem fechar o pedido primeiro. Depois, é só pagar com Pix em até 48 horas, e a entrega é combinada com você.'),
				el('p', {class: 'card-how'}, 'Dúvidas? ', el('a', {href: mailto(group)}, `Escreva para ${EMAIL}`), '.'),
				el('a', {class: 'card-back', href: 'avulsas.html'}, '← Todas as cartas')
			)
		));
		addArtist(group, factList);
	}

	// Os outros acabamentos da mesma carta e idioma à venda, cada um com o
	// seu preço e link.
	function otherFinishes(group, same) {
		const others = same.filter((one) => one !== group);

		if (!others.length) {
			return null;
		}

		return el('div', {class: 'other-finishes'},
			el('p', {class: 'other-finishes-title'}, 'Também à venda'),
			el('ul', null, others.map((one) => el('li', null,
				// O brilho e a edição de cada um; o stamp é da coleção, igual em
				// todos.
				...withFinishHelp([], finishWords(one.finish, one.cardId, {normal: true}).filter((badge) => !/^Stamp /.test(badge.label))).map((node, i) => (i === 0 ? el('a', {href: cardHref(one)}, node) : node)),
				` · ${brl(one.price)} · ${available(one.copies.length)}`
			)))
		);
	}

	// Adicionar ao carrinho: uma linha por estado, acabamento e preço, com
	// quantas cópias ainda não estão no carrinho.
	function buyBox(group) {
		const box = el('div', {class: 'buy-box'});

		function draw() {
			const inCart = cartIds();
			const variants = new Map();

			for (const row of group.copies) {
				const key = [row.condition || '', row.finish || '', row.price_brl].join('|');

				if (!variants.has(key)) {
					variants.set(key, {free: [], row, total: 0});
				}

				const variant = variants.get(key);

				variant.total++;

				if (!inCart.has(row.id)) {
					variant.free.push(row);
				}
			}

			const lines = [...variants.values()].map(({free, row, total}) => {
				// O brilho e a edição da cópia; o stamp é da coleção, e fica na
				// ficha.
				const words = row.finish ? finishWords(finishName(row.finish), group.cardId).filter((badge) => !/^Stamp /.test(badge.label)) : [];
				const state = conditionPart(row.condition);
				const label = [row.condition, ...words.map((badge) => badge.label)].filter(Boolean).join(' · ') || 'Cópia';
				const qty = el('select', {'aria-label': `Quantidade, ${label}`, class: 'buy-qty'},
					free.map((_, i) => el('option', {value: String(i + 1)}, String(i + 1))));
				const button = el('button', {class: 'btn btn-gold buy-add', onclick: () => {
					const n = Number(qty.value) || 1;
					const cart = readCart();

					if (cardCount(cart) + n > MAX_ORDER) {
						status.textContent = `Um pedido leva até ${MAX_ORDER} cartas.`;

						return;
					}

					writeCart([...cart, ...free.slice(0, n).map(cartItem)]);
					draw();
					status.replaceChildren(n === 1 ? 'Adicionada ao carrinho. ' : `${n} adicionadas ao carrinho. `, el('a', {href: 'pedido.html'}, 'Ver o carrinho'));
				}, type: 'button'}, 'Adicionar ao carrinho');
				const inside = total - free.length;

				return el('div', {class: 'buy-line'},
					el('p', {class: 'buy-label'},
						typeof state === 'object' && state
							? [el('strong', null, state.label), badgeHelp(state), words.length ? [' · ', el('strong', null, words.map((badge) => badge.label).join(' · '))] : null]
							: el('strong', null, label),
						words.map(badgeHelp), ` · ${brl(row.price_brl)} · ${available(total)}`),
					free.length
						? el('div', {class: 'buy-actions'}, free.length > 1 ? qty : null, button)
						: el('p', {class: 'buy-all-in'}, 'Todas estão no seu carrinho. ', el('a', {href: 'pedido.html'}, 'Ver o carrinho')),
					inside && free.length ? el('p', {class: 'buy-in'}, inside === 1 ? '1 já está no seu carrinho.' : `${inside} já estão no seu carrinho.`) : null
				);
			});
			const status = el('p', {'aria-live': 'polite', class: 'buy-status', role: 'status'});

			box.replaceChildren(...lines, status);
		}

		draw();

		return box;
	}

	// O artista da carta, do TCGdex: no idioma da cópia, depois em inglês.
	// Null quando o TCGdex não responde ou não sabe.
	async function readArtist(group) {
		const own = group.catalog === 'international' ? (WESTERN.has(group.language) ? group.language : 'en') : group.catalog;
		const langs = [...new Set([own, group.catalog === 'international' ? 'en' : own])];

		for (const lang of langs) {
			try {
				const response = await fetch(`${TCGDEX}/${lang}/cards/${encodeURIComponent(group.cardId)}`);

				if (response.ok) {
					const card = await response.json();
					const name = card && typeof card.illustrator === 'string' ? card.illustrator.trim() : '';

					if (name) {
						return name;
					}
				}
			}
			catch {
				// Sem rede ou TCGdex fora do ar: tenta o próximo, depois desiste.
			}
		}

		return null;
	}

	// Põe a linha Artista depois de Raridade (ou depois de Idioma, para uma
	// carta sem raridade), quando o TCGdex responde.
	async function addArtist(group, list) {
		const name = await readArtist(group);

		if (!name || !list.isConnected) {
			return;
		}

		const terms = [...list.querySelectorAll('dt')];
		const after = terms.find((term) => term.textContent === 'Raridade') || terms.find((term) => term.textContent === 'Idioma');
		const pair = [el('dt', null, 'Artista'), el('dd', {class: 'card-artist'}, name)];

		if (after) {
			after.nextElementSibling.after(...pair);
		}
		else {
			list.append(...pair);
		}
	}

	// ----------------------------------------------------------- start

	// ----------------------------------------------------------- order

	const when = (iso) => new Date(iso).toLocaleString('pt-BR', {day: '2-digit', hour: '2-digit', minute: '2-digit', month: '2-digit', timeZone: 'America/Recife'});

	const NOTICES = {
		gone: ['Não está mais disponível.', 'Esta carta foi vendida ou saiu do catálogo.'],
		reserved: ['Temporariamente indisponível.', 'Outra pessoa fechou um pedido com esta carta. Se a compra não for concluída, ela volta ao catálogo.'],
	};
	const KIT_NOTICES = {
		gone: ['Kit indisponível.', 'Uma carta do kit foi vendida, ou o kit saiu do catálogo.'],
		reserved: ['Kit temporariamente indisponível.', 'Outra pessoa fechou um pedido com uma carta do kit. Se a compra não for concluída, o kit volta ao catálogo.'],
	};

	// Meus pedidos: os pedidos feitos neste navegador, mais novos primeiro,
	// cada um pelo seu código secreto.
	const ORDERS_KEY = 'hotaru.orders';

	function readOrders() {
		try {
			const value = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');

			return Array.isArray(value) ? value.filter((one) => one && typeof one.token === 'string') : [];
		}
		catch {
			return [];
		}
	}

	function rememberOrder(token) {
		if (!/^[0-9a-f-]{36}$/i.test(String(token || ''))) {
			return;
		}

		try {
			const kept = readOrders().filter((one) => one.token !== token);

			localStorage.setItem(ORDERS_KEY, JSON.stringify([{at: new Date().toISOString(), token}, ...kept].slice(0, 50)));
		}
		catch {
			// Sem armazenamento: o link privado ainda abre o pedido.
		}

		drawCartCount();
	}

	function readLastOrder() {
		try {
			const value = JSON.parse(localStorage.getItem(LAST_ORDER_KEY) || 'null');

			return value && value.code ? value : null;
		}
		catch {
			return null;
		}
	}

	function keepLastOrder(order) {
		try {
			localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
		}
		catch {
			// Sem armazenamento: o Pix fica só nesta página.
		}
	}

	// Envia o comprovante para o bucket privado, sob o código secreto do
	// pedido, e o registra no pedido. Lança um erro com a mensagem a mostrar.
	async function sendReceipt(order, file) {
		const ext = RECEIPT_TYPES[file.type];

		if (!ext) {
			throw new Error('Envie uma foto (JPG, PNG, WEBP ou HEIC) ou um PDF.');
		}

		if (file.size > RECEIPT_MAX) {
			throw new Error('O arquivo passa de 5 MB. Envie uma captura de tela do comprovante.');
		}

		const random = Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => n.toString(16).padStart(2, '0')).join('');
		const path = `${order.receiptToken}/${random}.${ext}`;
		const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/store-receipts/${path}`, {
			body: file,
			headers: {apikey: SUPABASE_KEY, 'Content-Type': file.type, 'x-upsert': 'false'},
			method: 'POST',
		}).catch(() => null);

		if (!upload || !upload.ok) {
			throw new Error('O comprovante não foi enviado. Confira a conexão e tente de novo, ou mande para ' + EMAIL + '.');
		}

		await rpc('attach_receipt', {path, token: order.receiptToken});
	}

	// Já pagou? Envie o comprovante: só enquanto o pedido espera pagamento.
	function receiptBox(order) {
		const status = el('p', {'aria-live': 'polite', class: 'receipt-status'});

		if (order.receiptSent) {
			return el('div', {class: 'receipt'}, el('p', {class: 'receipt-done'}, 'Comprovante enviado. O Eric confere o pagamento e fala com você.'));
		}

		if (!order.receiptToken) {
			return null;
		}

		const input = el('input', {accept: 'image/jpeg,image/png,image/webp,image/heic,application/pdf', class: 'receipt-file', id: 'receipt-file', type: 'file'});
		const button = el('button', {class: 'btn btn-navy', type: 'button'}, 'Enviar comprovante');
		const box = el('div', {class: 'receipt'},
			el('h3', null, 'Já pagou? Envie o comprovante'),
			el('p', null, 'Uma foto ou captura de tela do comprovante do Pix ajuda o Eric a conferir o pagamento. Só o Eric vê.'),
			el('label', {class: 'receipt-label', for: 'receipt-file'}, 'Comprovante'),
			input,
			button,
			status
		);

		button.addEventListener('click', async () => {
			const file = input.files && input.files[0];

			if (!file) {
				status.textContent = 'Escolha o arquivo do comprovante.';
				input.focus();

				return;
			}

			button.disabled = true;
			status.textContent = 'Enviando…';

			try {
				await sendReceipt(order, file);

				const kept = readLastOrder();

				if (kept && kept.code === order.code) {
					keepLastOrder({...kept, receiptSent: true});
				}

				box.replaceWith(receiptBox({...order, receiptSent: true}));
			}
			catch (err) {
				button.disabled = false;
				status.textContent = err.message || 'O comprovante não foi enviado. Tente de novo.';
			}
		});

		return box;
	}

	// O Pix de um pedido aberto: o QR Code, o copia e cola e o botão de
	// copiar. Os IDs levam o código do pedido, porque Meus pedidos pode
	// mostrar mais de um.
	function pixBlock(order) {
		const Pix = window.HotaruPix;
		const code = Pix ? Pix.brCode({amount: order.total, description: `Pedido ${order.code}`, txid: Pix.txidFor(order.code)}) : null;

		if (!code) {
			return message('Não foi possível montar o código Pix. Escreva para ' + EMAIL + ' com o número do pedido.');
		}

		const id = `pix-code-${order.code}`;
		const copyStatus = el('span', {'aria-live': 'polite', class: 'pix-copied'});
		const qr = el('div', {'aria-label': `QR Code do Pix de ${brl(order.total)}`, class: 'pix-qr', role: 'img'});
		const text = el('textarea', {class: 'pix-code', id, readonly: true, rows: 3}, code);

		if (window.qrcode) {
			const made = window.qrcode(0, 'M');

			made.addData(code);
			made.make();
			// Um SVG feito pela biblioteca a partir do código acima, que só
			// tem caracteres que este script mesmo escreveu.
			qr.innerHTML = made.createSvgTag({margin: 2, scalable: true});
		}

		return el('div', {class: 'pix'},
			qr,
			el('label', {class: 'pix-label', for: id}, 'Pix copia e cola'),
			text,
			el('div', {class: 'pix-actions'},
				el('button', {class: 'btn btn-gold', onclick: () => copy(code, text, copyStatus), type: 'button'}, 'Copiar código Pix'),
				copyStatus
			),
			el('p', {class: 'pix-who'}, `Quem recebe: ${Pix.RECEIVER.name}. No app do banco aparece o nome completo do Eric.`)
		);
	}

	async function copy(value, field, status) {
		try {
			await navigator.clipboard.writeText(value);
			status.textContent = 'Copiado!';
		}
		catch {
			field.select();
			status.textContent = 'Selecionado: copie com o menu do celular.';
		}
	}

	// O link privado de um pedido: abre o pedido em qualquer aparelho.
	const orderLink = (token) => new URL(`meus-pedidos.html?p=${encodeURIComponent(token)}`, window.location.href).href;

	function linkBlock(order) {
		if (!order.receiptToken) {
			return null;
		}

		const link = orderLink(order.receiptToken);
		const id = `order-link-${order.code}`;
		const status = el('span', {'aria-live': 'polite', class: 'pix-copied'});
		const field = el('input', {class: 'order-link-field', id, readonly: true, type: 'text', value: link});

		return el('div', {class: 'order-link'},
			el('label', {for: id}, 'Link privado deste pedido'),
			el('p', null, 'Guarde o link (ou mande para você mesmo) para ver o pedido em outro aparelho. Quem tem o link vê o pedido.'),
			field,
			el('div', {class: 'pix-actions'},
				el('button', {class: 'btn btn-navy', onclick: () => copy(link, field, status), type: 'button'}, 'Copiar link'),
				status
			)
		);
	}

	const itemText = (item) => (item.kind === 'kit' ? `Kit ${item.name} (${kitCards(item.items.length)}: ${item.items.map((one) => one.name).join(', ')}) · ${brl(item.price)}` : singleText(item));

	const singleText = (item) => `${item.name} (${[item.setName, item.number ? `nº ${item.number}` : null, languageName(item.language)].filter(Boolean).join(', ')}) · ${brl(item.price)}`;

	// O pedido fechado: o código, o total, o prazo e o Pix.
	function confirmation(order) {
		return el('div', {class: 'order-done'},
			el('p', {class: 'eyebrow'}, 'Pedido recebido'),
			el('h2', null, `Pedido ${order.code}`),
			el('p', {class: 'order-total'}, `Total: ${brl(order.total)}`),
			el('p', null, `Pague com Pix até ${when(order.reservedUntil)}. Até lá, as cartas ficam reservadas para você.`),
			pixBlock(order),
			receiptBox(order),
			el('p', null, 'Depois de pagar, é só aguardar: o Eric confere o pagamento e combina a entrega com você pelo telefone que você deixou. Sem pagamento até o prazo, o pedido é cancelado e as cartas voltam para o catálogo.'),
			el('ul', {class: 'order-items'}, (order.items || []).map((item) => el('li', null, itemText(item)))),
			linkBlock(order),
			el('div', {class: 'order-next'},
				el('a', {class: 'btn btn-navy', href: 'avulsas.html'}, 'Continuar vendo as cartas'),
				el('a', {class: 'order-mine', href: 'meus-pedidos.html'}, 'Meus pedidos')
			)
		);
	}

	// O estado de cada linha do carrinho: o de cada carta avulsa
	// (listing_status), e o de um kit: disponível enquanto store_bundles o
	// mostra, senão reservado ou indisponível conforme as cartas dele. Um kit
	// à venda com outro preço ou outras cópias (o Eric trocou uma cópia
	// vendida) fica como está agora, e uma avulsa que passou a vir nele sai
	// do carrinho.
	async function cartStatuses(cart) {
		const ids = [...cartIds(cart)];
		const hasKits = cart.some((item) => item.kind === 'kit');
		const [raw, kits] = await Promise.all([rpc('listing_status', {ids}), hasKits ? readKits() : []]);
		const states = raw || {};
		const live = new Map(kits.map((kit) => [kit.id, kit]));
		const out = {};
		let changed = false;
		let next = cart.map((item) => {
			if (item.kind !== 'kit') {
				out[item.id] = states[item.id];

				return item;
			}

			const kit = live.get(item.id);

			if (kit) {
				const fresh = kitItem(kit);

				out[item.id] = 'available';

				if (fresh.price !== item.price || fresh.ids.join() !== (item.ids || []).join()) {
					changed = true;

					return fresh;
				}

				return item;
			}

			const mine = (item.ids || []).map((id) => states[id]);

			out[item.id] = mine.includes('reserved') && !mine.includes('gone') ? 'reserved' : 'gone';

			return item;
		});

		if (changed) {
			const inKits = new Set(next.filter((item) => item.kind === 'kit').flatMap((item) => item.ids));

			next = next.filter((item) => item.kind === 'kit' || !inKits.has(item.id));
			writeCart(next);
		}

		return out;
	}

	function order(root) {
		let statuses = {};
		let busy = false;
		let notice = '';
		let timer = null;

		const form = el('form', {class: 'order-form', novalidate: true});
		const nameInput = el('input', {autocomplete: 'name', id: 'order-name', maxlength: 80, required: true, type: 'text'});
		const phoneInput = el('input', {autocomplete: 'tel', id: 'order-phone', inputmode: 'tel', maxlength: 40, required: true, type: 'text'});
		const noteInput = el('textarea', {id: 'order-note', maxlength: 500, rows: 2});
		const formError = el('p', {class: 'order-error', role: 'alert'});
		const submit = el('button', {class: 'btn btn-gold', id: 'order-submit', type: 'submit'}, 'Fechar pedido');
		const list = el('ul', {class: 'cart-list'});
		const totalLine = el('p', {class: 'cart-total'});
		const noticeLine = el('p', {'aria-live': 'polite', class: 'cart-notice'});

		form.append(
			el('label', {for: 'order-name'}, 'Seu nome'), nameInput,
			el('label', {for: 'order-phone'}, 'Telefone ou ramal'), phoneInput,
			el('label', {for: 'order-note'}, 'Observação (opcional)'), noteInput,
			el('p', {class: 'order-privacy'}, 'Seu nome e telefone só servem para o Eric combinar a entrega com você.'),
			formError,
			submit
		);
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			close();
		});

		const OFFLINE = 'Não foi possível conferir as cartas agora. Tente de novo em instantes.';
		const freeItems = () => readCart().filter((item) => statuses[item.id] === 'available');

		function remove(id) {
			writeCart(readCart().filter((item) => item.id !== id));
			draw();
		}

		// O último pedido, enquanto o prazo para pagar não acabou.
		function openOrder() {
			const last = readLastOrder();

			return last && Date.parse(last.reservedUntil) > Date.now() ? last : null;
		}

		function draw() {
			const cart = readCart();

			if (!cart.length) {
				stopTimer();

				const last = openOrder();
				const open = Boolean(last);

				root.replaceChildren(...(open ? [confirmation(last)] : [message('Seu carrinho está vazio.'), el('a', {class: 'btn btn-navy', href: 'avulsas.html'}, 'Ver as cartas à venda')]));

				return;
			}

			list.replaceChildren(...cart.map((item) => {
				const status = statuses[item.id];
				const off = status === 'reserved' || status === 'gone';

				return el('li', {class: `cart-item${off ? ' cart-off' : ''}`, 'data-id': item.id},
					item.imagePath ? el('img', {alt: '', class: 'cart-pic', loading: 'lazy', src: pictureUrl(item.imagePath)}) : el('span', {'aria-hidden': 'true', class: 'cart-pic cart-pic-none'}),
					el('div', {class: 'cart-body'},
						el('p', {class: 'cart-name'}, el('a', {href: item.kind === 'kit' ? kitHref(item) : item.kind === 'sealed' ? `selado.html?id=${encodeURIComponent(item.productId)}` : `carta.html?c=${encodeURIComponent(item.cardId)}&l=${encodeURIComponent(item.language)}${item.finish ? `&a=${encodeURIComponent(item.finish)}` : ''}`}, item.kind === 'kit' ? `Kit ${item.name}` : item.name)),
						el('p', {class: 'cart-meta'}, item.kind === 'kit'
							? `${kitCards(item.ids.length)}: ${item.items.map((one) => [one.name, one.condition].filter(Boolean).join(', ')).join(' · ')}`
							: withFinishHelp([item.setName, item.number ? `nº ${item.number}` : null, languageName(item.language), conditionPart(item.condition)], finishWords(item.finish, item.cardId, {normal: true}))),
						off ? el('p', {class: `cart-warn cart-warn-${status}`}, el('strong', null, (item.kind === 'kit' ? KIT_NOTICES : NOTICES)[status][0]), ` ${(item.kind === 'kit' ? KIT_NOTICES : NOTICES)[status][1]}`) : null,
						el('p', {class: 'cart-price'}, brl(item.price), item.kind === 'kit' && item.sum > item.price ? [' ', el('s', null, brl(item.sum))] : null)
					),
					el('button', {'aria-label': `Remover ${item.name}`, class: 'cart-remove', onclick: () => remove(item.id), type: 'button'}, 'Remover')
				);
			}));

			const free = freeItems();
			const total = free.reduce((sum, item) => sum + item.price, 0);
			const checked = cart.every((item) => statuses[item.id]);

			totalLine.textContent = free.length ? `Total: ${brl(total)} (${kitCards(cardCount(free))})` : '';
			noticeLine.textContent = notice;
			submit.textContent = free.length ? `Fechar pedido com ${kitCards(cardCount(free))}` : 'Fechar pedido';
			submit.disabled = busy || !checked || !free.length;

			if (!root.contains(form)) {
				// Um pedido esperando pagamento fica à mão acima do carrinho, para
				// o Pix não se perder quando sobram cartas nele.
				const last = openOrder();

				root.replaceChildren(
					last ? el('details', {class: 'order-open'},
						el('summary', null, `Pedido ${last.code} aguardando pagamento: ver o Pix`),
						confirmation(last)
					) : '',
					el('h2', {class: 'cart-head'}, 'Seu carrinho'),
					noticeLine,
					list,
					totalLine,
					el('h3', {class: 'order-head'}, 'Fechar o pedido'),
					form
				);
			}
		}

		// Confere no Supabase quais cartas do carrinho ainda estão à venda.
		async function check() {
			const cart = readCart();

			if (!cart.length) {
				draw();

				return true;
			}

			try {
				statuses = await cartStatuses(cart);

				if (notice === OFFLINE) {
					notice = '';
				}

				return true;
			}
			catch {
				notice = OFFLINE;

				return false;
			}
			finally {
				draw();
			}
		}

		function stopTimer() {
			if (timer) {
				clearInterval(timer);
				timer = null;
			}
		}

		async function close() {
			formError.textContent = '';
			notice = '';

			const name = nameInput.value.trim();
			const phone = phoneInput.value.trim();

			if (!name || !phone) {
				formError.textContent = !name ? 'Escreva o seu nome.' : 'Escreva um telefone ou ramal para o Eric falar com você.';
				(!name ? nameInput : phoneInput).focus();

				return;
			}

			busy = true;
			draw();

			const fresh = await check();
			const items = freeItems();

			if (!fresh || !items.length) {
				busy = false;
				draw();

				return;
			}

			let result;

			try {
				result = await rpc('place_order', {
					buyer_name: name,
					buyer_note: noteInput.value.trim() || null,
					buyer_phone: phone,
					items: items.filter((item) => item.kind !== 'kit').map((item) => item.id),
					...(items.some((item) => item.kind === 'kit') ? {bundles: items.filter((item) => item.kind === 'kit').map((item) => item.id)} : {}),
				});
			}
			catch (err) {
				busy = false;
				formError.textContent = `O pedido não foi fechado. ${err.message || 'Tente de novo em instantes.'}`;
				draw();

				return;
			}

			if (result && (Array.isArray(result.unavailable) || Array.isArray(result.unavailable_kits))) {
				busy = false;
				notice = 'Alguém fechou um pedido com uma das suas cartas antes de você. Confira o carrinho e feche de novo com as que sobraram.';
				await check();

				return;
			}

			const ordered = new Set(items.map((item) => item.id));
			const done = {code: result.code, items, receiptToken: result.receipt_token || null, reservedUntil: result.reserved_until, total: Number(result.total)};

			keepLastOrder(done);
			rememberOrder(done.receiptToken);
			writeCart(readCart().filter((item) => !ordered.has(item.id)));
			busy = false;
			stopTimer();
			root.replaceChildren(confirmation(done));
			window.scrollTo(0, 0);
		}

		draw();
		check();
		timer = setInterval(check, RECHECK_MS);
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible' && readCart().length && root.contains(form)) {
				check();
			}
		});
	}

	// ------------------------------------------------------- my orders

	const STATUS_TEXT = {
		cancelled: 'Cancelado: as cartas voltaram para o catálogo.',
		delivered: 'Entregue. Obrigado pela compra!',
		expired: 'Vencido: o pagamento não chegou em 48 horas, e as cartas voltaram para o catálogo.',
		paid: 'Pagamento confirmado. O Eric vai combinar a entrega com você.',
	};

	function leftText(iso) {
		const minutes = Math.ceil((Date.parse(iso) - Date.now()) / 60000);

		return minutes >= 60 ? `faltam ${Math.floor(minutes / 60)} h` : `faltam ${Math.max(minutes, 1)} min`;
	}

	// Um pedido como o Supabase o devolve (order_status), na forma que as
	// peças do pedido usam.
	const fromServer = (row) => ({
		code: row.code,
		createdAt: row.created_at,
		items: orderLines(row.items || []),
		receiptSent: Boolean(row.receipt_at),
		receiptToken: row.token,
		reservedUntil: row.reserved_until,
		status: row.status === 'paid' && row.delivered_at ? 'delivered' : row.status,
		total: Number(row.total),
	});

	// As linhas de um pedido do servidor: as avulsas, e cada kit numa linha
	// só, com o preço que o servidor dividiu entre as cartas dele.
	function orderLines(items) {
		const lines = [];
		const kits = new Map();

		for (const item of items) {
			const line = {imagePath: item.image_path, language: item.language, name: item.name, number: item.number, price: Number(item.price_brl), setName: item.set_name};

			if (!item.bundle_id && !item.bundle_name) {
				lines.push(line);
				continue;
			}

			const key = item.bundle_id || item.bundle_name;

			if (!kits.has(key)) {
				const kit = {items: [], kind: 'kit', name: item.bundle_name || 'Kit', price: 0};

				kits.set(key, kit);
				lines.push(kit);
			}

			const kit = kits.get(key);

			kit.items.push(line);
			kit.price = Math.round((kit.price + line.price) * 100) / 100;
		}

		return lines;
	}

	function mineCard(order) {
		const open = order.status === 'pending' && Date.parse(order.reservedUntil) > Date.now();
		const state = open ? `Aguardando pagamento · ${leftText(order.reservedUntil)}` : STATUS_TEXT[order.status] || STATUS_TEXT.expired;

		return el('article', {class: `mine-order mine-${open ? 'pending' : order.status}`, id: `mine-${order.code}`},
			el('div', {class: 'mine-head'},
				el('h2', null, `Pedido ${order.code}`),
				el('p', {class: 'mine-date'}, `Feito em ${when(order.createdAt)}`)
			),
			el('p', {class: 'mine-state'}, state),
			el('ul', {class: 'order-items'}, order.items.map((item) => el('li', null, itemText(item)))),
			el('p', {class: 'order-total'}, `Total: ${brl(order.total)}`),
			open ? el('p', null, `Pague com Pix até ${when(order.reservedUntil)}.`) : null,
			open ? pixBlock(order) : null,
			open ? receiptBox(order) : null,
			linkBlock(order)
		);
	}

	async function mine(root) {
		const params = new URLSearchParams(window.location.search);
		const shared = params.get('p');

		if (shared) {
			rememberOrder(shared);
		}

		const tokens = readOrders().map((one) => one.token);

		if (!tokens.length) {
			root.replaceChildren(
				message('Nenhum pedido feito neste navegador ainda. Se você tem o link privado de um pedido, abra-o aqui.'),
				el('a', {class: 'btn btn-navy', href: 'avulsas.html'}, 'Ver as cartas à venda')
			);

			return;
		}

		let rows;

		try {
			rows = await rpc('order_status', {tokens});
		}
		catch {
			root.replaceChildren(message('Não foi possível ler os seus pedidos agora. Tente de novo em instantes.'));

			return;
		}

		const orders = (Array.isArray(rows) ? rows : []).map(fromServer);
		const first = shared ? orders.find((one) => one.receiptToken === shared) : null;

		if (!orders.length) {
			root.replaceChildren(message('Não encontramos esses pedidos. Se você tem o link privado de um pedido, confira se ele está completo.'));

			return;
		}

		// O pedido do link aberto vem primeiro.
		const shown = first ? [first, ...orders.filter((one) => one !== first)] : orders;

		root.replaceChildren(...shown.map(mineCard));
	}

	// ---------------------------------------------------------- sealed

	// Os selados à venda (store_sealed): cada produto com as unidades
	// disponíveis, que são o que o carrinho guarda.
	async function readSealed() {
		const rows = await rpc('store_sealed');

		return (Array.isArray(rows) ? rows : []).map((row) => ({
			category: row.category || '',
			description: row.description || '',
			id: row.id,
			language: row.language || '',
			name: row.name,
			photos: Array.isArray(row.photos) ? row.photos : [],
			price: Number(row.price_brl),
			units: Array.isArray(row.units) ? row.units : [],
		}));
	}

	const sealedHref = (product) => `selado.html?id=${encodeURIComponent(product.id)}`;

	const sealedItem = (product, unit) => ({
		cardId: null,
		condition: null,
		finish: null,
		id: unit,
		imagePath: product.photos[0] || null,
		kind: 'sealed',
		language: product.language,
		name: product.name,
		number: null,
		price: product.price,
		productId: product.id,
		setName: product.category || null,
	});

	const sealedKind = (product) => [product.category || 'Selado', languageName(product.language)].filter(Boolean).join(' · ');

	function sealedShot(product, {link = true} = {}) {
		const url = pictureUrl(product.photos[0]);
		const inner = url
			? el('img', {alt: product.name, class: 'card-pic sealed-pic', decoding: 'async', loading: 'lazy', src: url})
			: el('span', {class: 'card-pic card-pic-none sealed-pic'}, product.name);

		return link ? el('a', {'aria-hidden': 'true', class: 'shot card-shot sealed-shot', href: sealedHref(product), tabindex: '-1'}, inner) : el('div', {class: 'shot card-shot sealed-shot'}, inner);
	}

	// Adicionar: uma unidade por toque, até acabarem as livres.
	function sealedAdd(product) {
		const button = el('button', {class: 'quick-add', type: 'button'});
		const icon = () => {
			const span = el('span', {'aria-hidden': 'true', class: 'quick-icon'});

			span.innerHTML = '<svg width="16" height="16"><use href="#i-cart"/></svg>';

			return span;
		};

		function draw() {
			const inCart = cartIds();
			const free = product.units.filter((unit) => !inCart.has(unit));
			const there = product.units.length - free.length;

			button.disabled = !free.length;
			button.classList.toggle('quick-in', there > 0);
			button.setAttribute('aria-label', free.length ? `Adicionar ${product.name} ao carrinho` : `${product.name}: todos no carrinho`);
			button.replaceChildren(icon(), there ? `No carrinho${there > 1 ? ` (${there})` : ''}` : 'Adicionar');
		}

		button.addEventListener('click', () => {
			const inCart = cartIds();
			const unit = product.units.find((one) => !inCart.has(one));

			if (!unit || cardCount(readCart()) >= MAX_ORDER) {
				return;
			}

			writeCart([...readCart(), sealedItem(product, unit)]);
			draw();
		});
		draw();

		return button;
	}

	function sealedTile(product) {
		return el('article', {class: 'product card-item sealed-item'},
			sealedShot(product),
			el('div', {class: 'meta'},
				el('span', {class: 'kind'}, product.featured ? featuredMark() : null, sealedKind(product)),
				el('h3', null, el('a', {href: sealedHref(product)}, product.name)),
				el('div', {class: 'price'}, el('strong', null, brl(product.price))),
				el('div', {class: 'card-foot'},
					el('p', {class: 'card-count'}, available(product.units.length)),
					sealedAdd(product)
				)
			)
		);
	}

	// Os selados em destaque primeiro, na ordem do Eric, marcados; os outros
	// depois, na ordem de sempre. Um destaque sem unidade à venda não vem na
	// lista, então fica de fora sozinho.
	function featuredFirst(products, featured) {
		const rank = new Map();

		for (const item of featured) {
			if (item.kind === 'product' && !rank.has(item.product_id)) {
				rank.set(item.product_id, rank.size);
			}
		}

		for (const product of products) {
			product.featured = rank.has(product.id);
		}

		const place = (product) => (rank.has(product.id) ? rank.get(product.id) : rank.size);

		return [...products].sort((a, b) => place(a) - place(b));
	}

	function sealedGrid(root, products) {
		if (!products.length) {
			root.replaceChildren(message('Nenhum selado à venda agora. Volte em breve!'));

			return;
		}

		const top = products.filter((product) => product.featured);
		const rest = products.filter((product) => !product.featured);
		const grid = (list) => el('div', {class: 'products cards-grid sealed-grid'}, list.map(sealedTile));

		root.replaceChildren(...(top.length
			? [
				el('section', {'aria-label': 'Em destaque', class: 'featured'}, el('h2', {class: 'featured-title'}, 'Em destaque'), grid(top)),
				rest.length ? el('h2', {class: 'featured-title'}, 'Todos os selados') : '',
				rest.length ? grid(rest) : '',
			]
			: [grid(products)]));
	}

	function sealedHome(root, products) {
		const section = root.closest('section') || root;

		if (!products.length) {
			section.hidden = true;

			return;
		}

		root.replaceChildren(el('div', {class: 'products cards-grid sealed-grid'}, products.slice(0, HOME_LIMIT).map(sealedTile)));
		section.hidden = false;
	}

	function sealedOne(root, products) {
		const id = new URLSearchParams(window.location.search).get('id');
		const product = products.find((one) => one.id === id);

		if (!product) {
			root.replaceChildren(
				message('Este produto não está mais à venda.'),
				el('a', {class: 'btn btn-navy', href: 'selados.html'}, 'Ver os selados à venda')
			);
			document.title = 'Produto indisponível | HOTARU';

			return;
		}

		document.title = `${product.name} | Selados | HOTARU`;

		const main = sealedShot(product, {link: false});
		const thumbs = product.photos.length > 1
			? el('div', {class: 'sealed-thumbs'}, product.photos.map((path, i) => el('button', {'aria-label': `Foto ${i + 1}`, class: 'sealed-thumb', onclick: () => {
				const img = main.querySelector('img');

				if (img) {
					img.src = pictureUrl(path);
				}
			}, type: 'button'}, el('img', {alt: '', loading: 'lazy', src: pictureUrl(path)}))))
			: null;
		const status = el('p', {'aria-live': 'polite', class: 'buy-status', role: 'status'});
		const box = el('div', {class: 'buy-box'});

		function drawBuy() {
			const inCart = cartIds();
			const free = product.units.filter((unit) => !inCart.has(unit));
			const qty = el('select', {'aria-label': 'Quantidade', class: 'buy-qty'}, free.map((_, i) => el('option', {value: String(i + 1)}, String(i + 1))));
			const add = el('button', {class: 'btn btn-gold buy-add', onclick: () => {
				const n = Number(qty.value) || 1;
				const cart = readCart();

				if (cardCount(cart) + n > MAX_ORDER) {
					status.textContent = `Um pedido leva até ${MAX_ORDER} itens.`;

					return;
				}

				writeCart([...cart, ...free.slice(0, n).map((unit) => sealedItem(product, unit))]);
				drawBuy();
				status.replaceChildren(n === 1 ? 'Adicionado ao carrinho. ' : `${n} adicionados ao carrinho. `, el('a', {href: 'pedido.html'}, 'Ver o carrinho'));
			}, type: 'button'}, 'Adicionar ao carrinho');

			box.replaceChildren(el('div', {class: 'buy-line'},
				el('p', {class: 'buy-label'}, el('strong', null, brl(product.price)), ` · ${available(product.units.length)}`),
				free.length
					? el('div', {class: 'buy-actions'}, free.length > 1 ? qty : null, add)
					: el('p', {class: 'buy-all-in'}, 'Todos estão no seu carrinho. ', el('a', {href: 'pedido.html'}, 'Ver o carrinho'))
			), status);
		}

		drawBuy();

		const facts = [
			['Tipo', product.category],
			['Idioma', languageName(product.language)],
			['Disponível', available(product.units.length)],
		].filter(([, value]) => value);

		root.replaceChildren(el('div', {class: 'card-detail sealed-detail'},
			el('div', {class: 'sealed-gallery'}, main, thumbs),
			el('div', {class: 'card-info'},
				el('p', {class: 'eyebrow'}, ['Selado', languageName(product.language)].filter(Boolean).join(' · ')),
				el('h1', null, product.name),
				el('p', {class: 'card-price'}, brl(product.price)),
				el('dl', {class: 'card-facts'}, facts.map(([label, value]) => [el('dt', null, label), el('dd', null, value)])),
				product.description ? el('div', {class: 'sealed-description'}, richText(product.description)) : null,
				box,
				el('p', {class: 'card-how'}, 'O carrinho não reserva o produto: ele fica com quem fechar o pedido primeiro. Depois, é só pagar com Pix em até 48 horas, e a entrega é combinada com você.'),
				el('a', {class: 'card-back', href: 'selados.html'}, '← Todos os selados')
			)
		));
	}

	const SEALED_VIEWS = {homesealed: sealedHome, sealed: sealedGrid, sealedone: sealedOne};

	async function startSealed(roots) {
		let products;

		try {
			const [rows, featured] = await Promise.all([readSealed(), readFeatured()]);

			products = featuredFirst(rows, featured);
		}
		catch {
			for (const root of roots) {
				if (root.dataset.catalog === 'homesealed') {
					(root.closest('section') || root).hidden = true;
				}
				else {
					root.replaceChildren(message('Não foi possível carregar os selados agora. Tente de novo em instantes.'));
				}
			}

			return;
		}

		for (const root of roots) {
			SEALED_VIEWS[root.dataset.catalog](root, products);
		}
	}

	// ------------------------------------------------------------ kits

	// Os kits (Eric, 2026-11-25; plano em pokemon-card-tracker,
	// plans/hotaru-bundles-plan.md): várias cartas vendidas juntas por um
	// preço que não é a soma, como o trio de iniciais. O Eric monta o kit na
	// tela Shop do card tracker; store_bundles devolve só os kits com todas
	// as cartas disponíveis, cada um com o preço que o servidor calcula. As
	// cartas do kit continuam à venda uma a uma: quem fechar o pedido
	// primeiro leva, e o kit some enquanto uma delas estiver reservada.

	async function readKits() {
		const rows = await rpc('store_bundles');

		return (Array.isArray(rows) ? rows : []).map((kit) => ({
			description: kit.description || null,
			discount: kit.discount_pct === null || kit.discount_pct === undefined ? null : Number(kit.discount_pct),
			id: String(kit.id),
			items: (kit.items || []).map((item) => ({
				cardId: item.card_id,
				condition: item.condition || null,
				finish: item.finish ? finishName(item.finish) : null,
				id: item.listing_id,
				imagePath: item.image_path || null,
				language: item.language || '',
				name: item.name,
				number: item.number || null,
				price: Number(item.price_brl),
				setName: item.set_name || null,
			})),
			name: kit.name,
			price: Number(kit.price),
			sum: Number(kit.sum),
		}));
	}

	const kitHref = (kit) => `kit.html?id=${encodeURIComponent(kit.id)}`;

	// O desconto do kit em porcentagem: o que o Eric escolheu, ou, num kit de
	// preço digitado, o quanto ele sai abaixo da soma, arredondado para baixo.
	function kitOff(kit) {
		if (kit.discount) {
			return kit.discount;
		}

		const sum = Math.round(kit.sum * 100);
		const price = Math.round(kit.price * 100);

		return price < sum ? Math.floor((sum - price) * 100 / sum) : null;
	}

	const offText = (n) => `-${String(n).replace('.', ',')}%`;

	const kitCards = (n) => (n === 1 ? '1 carta' : `${n} cartas`);

	// O kit no carrinho: uma linha só, com as cópias que ele leva.
	const kitItem = (kit) => ({
		id: kit.id,
		ids: kit.items.map((item) => item.id),
		imagePath: (kit.items.find((item) => item.imagePath) || {}).imagePath || null,
		items: kit.items.map(({condition, finish, language, name, number, setName}) => ({condition, finish, language, name, number, setName})),
		kind: 'kit',
		name: kit.name,
		price: kit.price,
		sum: kit.sum,
	});

	// As cartas do kit em leque: até três fotos, e +N quando há mais.
	function kitShot(kit, {link = true} = {}) {
		const shown = kit.items.slice(0, 3);
		const fan = el('span', {class: `kit-fan kit-fan-${shown.length}`}, shown.map((item) => {
			const url = pictureUrl(item.imagePath);

			return url
				? el('img', {alt: '', class: 'card-pic', decoding: 'async', loading: 'lazy', src: url})
				: el('span', {class: 'card-pic card-pic-none'}, item.name);
		}));
		const off = kitOff(kit);
		const parts = [
			off ? el('span', {class: 'tag kit-tag'}, offText(off)) : null,
			fan,
			kit.items.length > 3 ? el('span', {class: 'kit-more'}, `+${kit.items.length - 3}`) : null,
		];
		const label = {'aria-label': `${kit.name}: ${kit.items.map((item) => item.name).join(', ')}`, role: 'img'};

		return link
			? el('a', {class: 'shot card-shot kit-shot', href: kitHref(kit), tabindex: '-1', 'aria-hidden': 'true'}, ...parts)
			: el('div', {class: 'shot card-shot kit-shot', ...label}, ...parts);
	}

	// Põe o kit no carrinho. As mesmas cópias, já no carrinho como avulsas,
	// saem dele, para o pedido não levar uma cópia duas vezes. Devolve
	// quantas saíram, ou null quando o kit não coube.
	function addKit(kit) {
		const ids = new Set(kit.items.map((item) => item.id));
		const rest = readCart().filter((item) => item.id !== kit.id && !(item.kind !== 'kit' && ids.has(item.id)));
		const removed = readCart().length - rest.length;

		if (cardCount(rest) + ids.size > MAX_ORDER) {
			return null;
		}

		writeCart([...rest, kitItem(kit)]);

		return removed;
	}

	// Uma cópia do kit já está no carrinho em outro kit: este kit não entra.
	const kitClash = (kit) => readCart().some((item) => item.kind === 'kit' && item.id !== kit.id && item.ids.some((id) => kit.items.some((one) => one.id === id)));

	function kitAdd(kit, status = null) {
		const icon = () => {
			const span = el('span', {'aria-hidden': 'true', class: 'quick-icon'});

			span.innerHTML = '<svg width="16" height="16"><use href="#i-cart"/></svg>';

			return span;
		};
		const button = el('button', {class: status ? 'btn btn-gold buy-add' : 'quick-add', type: 'button'});

		function draw() {
			const there = readCart().some((item) => item.id === kit.id);

			button.disabled = there || kitClash(kit);
			button.classList.toggle('quick-in', there);
			button.setAttribute('aria-label', there ? `${kit.name}: no carrinho` : `Adicionar ${kit.name} ao carrinho`);
			button.replaceChildren(...(status ? [] : [icon()]), there ? 'No carrinho' : (status ? 'Adicionar o kit ao carrinho' : 'Adicionar'));
		}

		button.addEventListener('click', () => {
			const removed = addKit(kit);

			if (removed === null) {
				button.textContent = `Até ${MAX_ORDER} cartas`;

				return;
			}

			draw();

			if (status) {
				status.replaceChildren(removed ? `Kit adicionado. ${removed === 1 ? 'A carta avulsa igual saiu' : `As ${removed} cartas avulsas iguais saíram`} do carrinho, porque já vêm no kit. ` : 'Kit adicionado ao carrinho. ', el('a', {href: 'pedido.html'}, 'Ver o carrinho'));
			}
		});
		draw();

		return button;
	}

	// O preço do kit e, riscada, a soma das cartas separadas; o desconto em
	// porcentagem fica na etiqueta da foto.
	function kitPrice(kit) {
		return el('div', {class: 'price kit-price'},
			el('strong', null, brl(kit.price)),
			kit.sum > kit.price ? el('s', {'aria-label': `separadas, ${brl(kit.sum)}`}, brl(kit.sum)) : null);
	}

	function kitTile(kit) {
		return el('article', {class: 'product card-item kit-item'},
			kitShot(kit),
			el('div', {class: 'meta'},
				el('span', {class: 'kind'}, `Kit · ${kitCards(kit.items.length)}`),
				el('h3', null, el('a', {href: kitHref(kit)}, kit.name)),
				el('p', {class: 'card-set'}, kit.items.map((item) => item.name).join(' · ')),
				kitPrice(kit),
				el('div', {class: 'card-foot'},
					el('p', {class: 'card-count'}, 'Leve junto e pague menos'),
					kitAdd(kit)
				)
			)
		);
	}

	const kitGrid = (kits) => el('div', {class: 'products cards-grid kit-grid'}, kits.map(kitTile));

	// A seção Kits da home: some quando não há kit à venda.
	function kitsHome(root, kits) {
		const section = root.closest('section') || root;

		if (!kits.length) {
			section.hidden = true;

			return;
		}

		root.replaceChildren(kitGrid(kits.slice(0, HOME_LIMIT)));
		section.hidden = false;
	}

	// Os kits no alto de avulsas.html, antes das cartas.
	function kitsAll(root, kits) {
		if (!kits.length) {
			root.hidden = true;

			return;
		}

		root.replaceChildren(
			el('div', {class: 'section-head kits-head'},
				el('div', null,
					el('p', {class: 'eyebrow'}, 'Kits'),
					el('h2', null, kits.length === 1 ? 'Um kit à venda' : `${kits.length} kits à venda`),
					el('p', null, 'Cartas que saem juntas por menos do que separadas.'))),
			kitGrid(kits)
		);
		root.hidden = false;
	}

	// kit.html?id=<kit>: as cartas, cada uma com o estado e o link para a
	// página dela, a descrição, o preço e Adicionar.
	function kitOne(root, kits) {
		const id = new URLSearchParams(window.location.search).get('id');
		const kit = kits.find((one) => one.id === id);

		if (!kit) {
			root.replaceChildren(
				message('Este kit não está mais à venda: uma das cartas dele foi vendida ou reservada. As cartas que sobraram podem estar à venda uma a uma.'),
				el('a', {class: 'btn btn-navy', href: 'avulsas.html'}, 'Ver as cartas à venda')
			);
			document.title = 'Kit indisponível | HOTARU';

			return;
		}

		document.title = `${kit.name} | Kits | HOTARU`;

		const status = el('p', {'aria-live': 'polite', class: 'buy-status', role: 'status'});
		const cards = el('ul', {class: 'kit-cards'}, kit.items.map((item) => el('li', {class: 'kit-card'},
			item.imagePath ? el('img', {alt: '', class: 'kit-card-pic', loading: 'lazy', src: pictureUrl(item.imagePath)}) : el('span', {'aria-hidden': 'true', class: 'kit-card-pic cart-pic-none'}),
			el('div', null,
				el('p', {class: 'kit-card-name'}, el('a', {href: `carta.html?c=${encodeURIComponent(item.cardId)}&l=${encodeURIComponent(item.language)}${item.finish ? `&a=${encodeURIComponent(item.finish)}` : ''}`}, item.name)),
				el('p', {class: 'kit-card-meta'}, withFinishHelp([item.setName, item.number ? `nº ${item.number}` : null, languageName(item.language), conditionPart(item.condition)], finishWords(item.finish, item.cardId))),
				el('p', {class: 'kit-card-alone'}, `Separada: ${brl(item.price)}`)))));

		root.replaceChildren(el('div', {class: 'card-detail kit-detail'},
			kitShot(kit, {link: false}),
			el('div', {class: 'card-info'},
				el('p', {class: 'eyebrow'}, `Kit · ${kitCards(kit.items.length)}`),
				el('h1', null, kit.name),
				kitPrice(kit),
				el('p', {class: 'kit-saving'}, kit.sum > kit.price ? `Separadas, as cartas custam ${brl(kit.sum)}: no kit, você economiza ${brl(Math.round((kit.sum - kit.price) * 100) / 100)}.` : `Separadas, as cartas custam ${brl(kit.sum)}.`),
				kit.description ? el('div', {class: 'sealed-description'}, richText(kit.description)) : null,
				cards,
				el('div', {class: 'buy-box'}, el('div', {class: 'buy-line'}, el('div', {class: 'buy-actions'}, kitAdd(kit, status))), status),
				el('p', {class: 'card-how'}, 'O carrinho não reserva o kit, e cada carta dele também está à venda sozinha: fica com quem fechar o pedido primeiro. Depois, é só pagar com Pix em até 48 horas, e a entrega é combinada com você.'),
				el('a', {class: 'card-back', href: 'avulsas.html'}, '← Todas as cartas')
			)
		));
	}

	const KIT_VIEWS = {homekits: kitsHome, kit: kitOne, kits: kitsAll};

	async function startKits(roots) {
		let kits;

		try {
			kits = await readKits();
		}
		catch {
			for (const root of roots) {
				if (root.dataset.catalog === 'kit') {
					root.replaceChildren(message('Não foi possível carregar o kit agora. Tente de novo em instantes.'));
				}
				else {
					(root.dataset.catalog === 'homekits' ? root.closest('section') || root : root).hidden = true;
				}
			}

			return;
		}

		for (const root of roots) {
			KIT_VIEWS[root.dataset.catalog](root, kits);
		}
	}

	const VIEWS = {all, card: one, home};

	async function start() {
		drawCartCount();
		watchFinishTags();

		const mineRoot = document.querySelector('[data-catalog="mine"]');

		if (mineRoot) {
			mine(mineRoot);
		}

		const orderRoot = document.querySelector('[data-catalog="order"]');

		if (orderRoot) {
			order(orderRoot);
		}

		const kitRoots = [...document.querySelectorAll('[data-catalog]')].filter((root) => KIT_VIEWS[root.dataset.catalog]);

		if (kitRoots.length) {
			startKits(kitRoots);
		}

		const sealedRoots = [...document.querySelectorAll('[data-catalog]')].filter((root) => SEALED_VIEWS[root.dataset.catalog]);

		if (sealedRoots.length) {
			startSealed(sealedRoots);
		}

		const roots = [...document.querySelectorAll('[data-catalog]')].filter((root) => root !== orderRoot && root !== mineRoot && !SEALED_VIEWS[root.dataset.catalog] && !KIT_VIEWS[root.dataset.catalog]);

		if (!roots.length) {
			return;
		}

		let groups;
		let featured;

		try {
			const [rows, picks] = await Promise.all([readCatalog(), readFeatured()]);

			groups = groupCards(rows);
			featured = picks;
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
				view(root, groups, featured);
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
