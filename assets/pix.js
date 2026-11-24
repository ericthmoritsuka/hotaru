// O código Pix copia e cola (BR Code estático) de um pedido da HOTARU: um
// texto no formato EMV que o app do banco lê, com a chave, o valor, o nome e
// a cidade de quem recebe e o código do pedido, fechado por um CRC16. É
// montado aqui no navegador, sem nenhum serviço pago e sem API de banco
// (plano do card tracker, plans/hotaru-catalog-plan.md, seção 9).
//
// Quem paga vê o nome do titular da chave, que o app do banco busca na
// própria chave (Eric, 2026-11-24: aparece o nome completo e Mercado Pago IP
// Ltda); o nome e a cidade do código são o que o formato exige.
//
// Usado pelo navegador como window.HotaruPix e pelo Node nos testes como
// globalThis.HotaruPix.

(function (root) {
	'use strict';

	const RECEIVER = {
		city: 'RECIFE',
		// A chave aleatória do Eric, do Mercado Pago. Ela aparece para quem
		// paga de qualquer forma: é feita para ser compartilhada.
		key: '46e90206-1d1d-49e6-8bfa-9162dfeff78c',
		name: 'ERIC MORITSUKA',
	};

	// Sem acentos e só com os caracteres que o formato aceita.
	const plain = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '').trim();

	// Um campo: o ID, o tamanho com dois dígitos e o valor.
	function field(id, value) {
		const text = String(value);

		if (text.length > 99) {
			throw new Error(`Pix: o campo ${id} passa de 99 caracteres.`);
		}

		return `${id}${String(text.length).padStart(2, '0')}${text}`;
	}

	// CRC16-CCITT (polinômio 0x1021, começo 0xFFFF), como pede o BR Code.
	function crc16(text) {
		let crc = 0xffff;

		for (let i = 0; i < text.length; i++) {
			crc ^= text.charCodeAt(i) << 8;

			for (let bit = 0; bit < 8; bit++) {
				crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
			}
		}

		return crc.toString(16).toUpperCase().padStart(4, '0');
	}

	// O código copia e cola. options: key, name (até 25), city (até 15),
	// amount (reais; sem ele, quem paga digita o valor), txid (letras e
	// números, até 25; *** quando não há) e description (aparece no
	// comprovante de alguns bancos).
	function brCode({amount = null, city = RECEIVER.city, description = '', key = RECEIVER.key, name = RECEIVER.name, txid = '***'} = {}) {
		const id = String(txid || '***');

		if (id !== '***' && !/^[A-Za-z0-9]{1,25}$/.test(id)) {
			throw new Error('Pix: o identificador do pedido só pode ter letras e números, até 25.');
		}

		const account = field('00', 'br.gov.bcb.pix') + field('01', key) + (plain(description) ? field('02', plain(description).slice(0, 40)) : '');
		const value = amount === null || amount === undefined ? '' : field('54', Number(amount).toFixed(2));

		if (value && !(Number(amount) > 0)) {
			throw new Error('Pix: o valor precisa ser maior que zero.');
		}

		const body = field('00', '01')
			+ field('26', account)
			+ field('52', '0000')
			+ field('53', '986')
			+ value
			+ field('58', 'BR')
			+ field('59', plain(name).slice(0, 25))
			+ field('60', plain(city).slice(0, 15))
			+ field('62', field('05', id))
			+ '6304';

		return body + crc16(body);
	}

	// HTR-0007 vira HTR0007, que o formato aceita como identificador.
	const txidFor = (orderCode) => String(orderCode || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';

	root.HotaruPix = {RECEIVER, brCode, crc16, txidFor};
})(typeof window !== 'undefined' ? window : globalThis);
