// Markdown no editor do blog (Eric, 2026-11-25: "um editor que aceite
// markdown fica mais fácil para escrever"). O post continua guardado no
// formato do editor (Delta); este módulo só traduz entre ele e o Markdown,
// para o admin aceitar Markdown colado, ter um modo de escrever em Markdown
// puro e voltar ao visual sem perder nada.
//
// O Markdown aceito é o que o blog sabe mostrar:
//   # ou ## título        ### subtítulo        > citação
//   - item (ou * e +)     1. item numerado
//   **negrito** e __negrito__, *itálico* e _itálico_, ~~riscado~~
//   [texto](link)         ![descrição](link da foto)
//   uma linha com só o link de um vídeo do YouTube vira o vídeo
// Cada linha com texto é um parágrafo; linhas em branco só separam. Uma
// barra invertida antes de um sinal (\*) o deixa como texto.
//
// Um arquivo .md com front matter (title, description, video, entre linhas
// ---) entra pelo readMarkdownFile: o título e o resumo vêm de lá, e o vídeo
// vira o vídeo do post.

import {YT_EMBED, youtubeId} from './blog-render.js';

const ESCAPABLE = '\\`*_{}[]()#+-.!~>|';

// ------------------------------------------------------- Markdown -> Delta

// O texto de uma linha em pedaços com formato: [{insert, attributes}].
function inline(text, attributes = {}) {
	const ops = [];
	let plain = '';

	const flush = () => {
		if (plain) {
			ops.push(Object.keys(attributes).length ? {attributes: {...attributes}, insert: plain} : {insert: plain});
			plain = '';
		}
	};

	let i = 0;

	while (i < text.length) {
		const rest = text.slice(i);
		const prev = i > 0 ? text[i - 1] : '';
		let match;

		if (text[i] === '\\' && i + 1 < text.length && ESCAPABLE.includes(text[i + 1])) {
			plain += text[i + 1];
			i += 2;

			continue;
		}

		if ((match = rest.match(/^!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/))) {
			flush();
			ops.push({insert: {image: match[2]}});
			i += match[0].length;

			continue;
		}

		if ((match = rest.match(/^\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/))) {
			flush();
			ops.push(...inline(match[1], {...attributes, link: match[2]}));
			i += match[0].length;

			continue;
		}

		if ((match = rest.match(/^(\*\*|__)(?=\S)([\s\S]*?\S)\1/)) && (match[1] === '**' || !/\w/.test(prev))) {
			flush();
			ops.push(...inline(match[2], {...attributes, bold: true}));
			i += match[0].length;

			continue;
		}

		if ((match = rest.match(/^~~(?=\S)([\s\S]*?\S)~~/))) {
			flush();
			ops.push(...inline(match[1], {...attributes, strike: true}));
			i += match[0].length;

			continue;
		}

		if ((match = rest.match(/^\*(?=[^\s*])([\s\S]*?[^\s*])\*(?!\*)/) || (!/\w/.test(prev) && rest.match(/^_(?=[^\s_])([\s\S]*?[^\s_])_(?!\w)/)))) {
			flush();
			ops.push(...inline(match[1], {...attributes, italic: true}));
			i += match[0].length;

			continue;
		}

		plain += text[i];
		i += 1;
	}

	flush();

	return ops;
}

const BLOCKS = [
	[/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/, (m) => [m[2], {header: m[1].length <= 2 ? 2 : 3}]],
	[/^\s{0,3}>\s?(.*)$/, (m) => [m[1], {blockquote: true}]],
	[/^\s*[-*+]\s+(.*)$/, (m) => [m[1], {list: 'bullet'}]],
	[/^\s*\d{1,9}[.)]\s+(.*)$/, (m) => [m[1], {list: 'ordered'}]],
];

const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

const FRONT_MATTER = /^\uFEFF?---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;

// O front matter (title: ..., entre duas linhas ---) separado do texto.
function splitFrontMatter(text) {
	const source = String(text || '').replace(/\r\n?/g, '\n');
	const match = source.match(FRONT_MATTER);
	const meta = {};

	if (!match) {
		return {body: source.replace(/^\uFEFF/, ''), meta};
	}

	for (const line of match[1].split('\n')) {
		const field = line.match(/^([A-Za-z_][\w-]*):\s*(.*?)\s*$/);

		if (field) {
			meta[field[1].toLowerCase()] = field[2].replace(/^"((?:[^"\\]|\\.)*)"$/, (all, inner) => inner.replace(/\\(.)/g, '$1')).replace(/^'(.*)'$/, '$1');
		}
	}

	return {body: source.slice(match[0].length), meta};
}

const fold = (text) => String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

// Um arquivo Markdown de post: {title, summary, markdown}. O front matter dá
// o título (title) e o resumo (description); um "# título" no começo do texto
// é o título também, e sai do texto, porque a página do post já o mostra. O
// vídeo do front matter (video ou youtube) entra numa linha só dele antes do
// primeiro ## (o fim da introdução), a não ser que o texto já tenha esse
// vídeo numa linha.
export function readMarkdownFile(text) {
	const {body, meta} = splitFrontMatter(text);
	let markdown = body;
	let title = meta.title || '';
	const heading = markdown.match(/^\s*#\s+(.+?)\s*#*\s*(?:\n|$)/);

	if (heading && (!title || fold(heading[1]) === fold(title))) {
		title = title || heading[1];
		markdown = markdown.slice(heading[0].length);
	}

	const video = youtubeId(meta.video || meta.youtube || '');

	if (video) {
		const lines = markdown.split('\n');
		const has = lines.some((line) => youtubeId(line.trim()) === video && /^\S+$/.test(line.trim()));

		if (!has) {
			const at = lines.findIndex((line) => /^\s{0,3}#{2,6}\s/.test(line));
			const videoLine = ['', `https://youtu.be/${video}`, ''];

			if (at === -1) {
				lines.push(...videoLine);
			}
			else {
				lines.splice(at, 0, ...videoLine);
			}

			markdown = lines.join('\n');
		}
	}

	return {markdown: markdown.replace(/^\n+/, ''), summary: meta.description || '', title};
}

// O Markdown como Delta ({ops}), pronto para o editor. Um front matter no
// começo fica de fora.
export function markdownToDelta(markdown) {
	const ops = [];

	for (const raw of splitFrontMatter(markdown).body.split('\n')) {
		const line = raw.replace(/\s+$/, '');

		if (!line.trim() || RULE.test(line)) {
			continue;
		}

		const video = youtubeId(line.trim());

		if (video && /^\S+$/.test(line.trim())) {
			ops.push({insert: {video: `${YT_EMBED}${video}`}});

			continue;
		}

		let text = line.trim();
		let block = null;

		for (const [pattern, read] of BLOCKS) {
			const match = line.match(pattern);

			if (match) {
				[text, block] = read(match);

				break;
			}
		}

		ops.push(...inline(text));
		ops.push(block ? {attributes: block, insert: '\n'} : {insert: '\n'});
	}

	return {ops};
}

// Um texto colado parece Markdown: tem título, lista, citação, ênfase ou
// link escritos com os sinais.
export function looksLikeMarkdown(text) {
	return FRONT_MATTER.test(String(text || '')) || /(^|\n)\s{0,3}(#{1,6}\s|>\s?\S|[-*+]\s+\S|\d+[.)]\s+\S)|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|!?\[[^\]\n]+\]\([^)\s]+\)/.test(String(text || ''));
}

// ------------------------------------------------------- Delta -> Markdown

const escapeText = (text) => text.replace(/([\\`*_[\]~])/g, '\\$1');

// O sinal no começo de uma linha que o Markdown leria como bloco.
const escapeStart = (text) => text.replace(/^(\s*)(#{1,6}\s|>|[-+]\s)/, '$1\\$2').replace(/^(\s*\d+)([.)]\s)/, '$1\\$2');

function wrap(text, attributes) {
	// O espaço nas pontas fica fora dos sinais: "** negrito**" não é negrito.
	const [, lead, core, tail] = text.match(/^(\s*)([\s\S]*?)(\s*)$/);

	if (!core) {
		return text;
	}

	let out = escapeText(core);

	if (attributes.strike) {
		out = `~~${out}~~`;
	}

	if (attributes.italic) {
		out = `*${out}*`;
	}

	if (attributes.bold) {
		out = `**${out}**`;
	}

	if (attributes.link) {
		out = `[${out}](${String(attributes.link).replace(/[()\s]/g, encodeURIComponent)})`;
	}

	return `${lead}${out}${tail}`;
}

// O Delta do editor como Markdown.
export function deltaToMarkdown(delta) {
	const ops = delta && Array.isArray(delta.ops) ? delta.ops : [];
	const lines = [];
	let parts = '';

	const close = (attributes = {}) => {
		lines.push({attributes, text: parts});
		parts = '';
	};

	for (const op of ops) {
		if (!op || typeof op !== 'object') {
			continue;
		}

		const attributes = op.attributes || {};

		if (typeof op.insert === 'string') {
			op.insert.split('\n').forEach((piece, index, all) => {
				parts += wrap(piece, attributes);

				if (index < all.length - 1) {
					close(attributes);
				}
			});
		}
		else if (op.insert && typeof op.insert.video === 'string') {
			if (parts.trim()) {
				close();
			}

			const id = youtubeId(op.insert.video);

			parts = id ? `https://youtu.be/${id}` : '';
			close();
		}
		else if (op.insert && typeof op.insert.image === 'string') {
			parts += `![foto](${op.insert.image})`;
		}
	}

	if (parts.trim()) {
		close();
	}

	const out = [];
	let previous = null;
	let number = 0;

	for (const {attributes, text} of lines) {
		if (!text.trim()) {
			continue;
		}

		const list = attributes.list === 'bullet' || attributes.list === 'ordered' ? attributes.list : null;
		const level = Number(attributes.header);
		let line;

		number = list === 'ordered' && previous === 'ordered' ? number + 1 : 1;

		if (level === 2 || level === 3) {
			line = `${level === 2 ? '##' : '###'} ${text.trim()}`;
		}
		else if (attributes.blockquote) {
			line = `> ${text.trim()}`;
		}
		else if (list === 'bullet') {
			line = `- ${text.trim()}`;
		}
		else if (list === 'ordered') {
			line = `${number}. ${text.trim()}`;
		}
		else {
			line = escapeStart(text.trim());
		}

		// Itens da mesma lista ficam juntos; o resto, separado por uma linha
		// em branco.
		if (out.length) {
			out.push(list && list === previous ? '\n' : '\n\n');
		}

		out.push(line);
		previous = list;
	}

	return out.length ? `${out.join('')}\n` : '';
}
