# HOTARU

Loja virtual de cartas colecionáveis: cartas avulsas de Pokémon TCG e alguns
selados, direto da coleção do Eric. Recife/PE, 100% virtual, sem loja física.
No ar em <https://lojahotaru.com.br>.

> Brilhe em novos universos

## Como funciona

As páginas são HTML estático no GitHub Pages. O que está à venda não mora
aqui: o navegador lê tudo do Supabase.

- **Cartas e kits** ganham preço e são publicados na tela Shop do card tracker.
- **Selados, destaques e blog** são cadastrados em `admin.html`, com login por
  link no e-mail. A página não tem link no site e fica fora dos buscadores.
- **Pedidos:** o comprador põe as cartas no carrinho e fecha o pedido, que
  reserva as cartas. Ele paga com Pix (o QR Code e o copia e cola são gerados no
  navegador, em `assets/pix.js`) e anexa o comprovante. Pedido sem pagamento é
  cancelado em 48 horas. A entrega é combinada com o comprador.

O banco (tabelas, funções e regras de acesso) está nos arquivos
`supabase/store*.sql` do card tracker.

## Páginas

| Arquivo | O que mostra |
| :--- | :--- |
| `index.html` | Home: kits, cartas e selados em destaque, últimos posts do blog, nossa história e o canal do YouTube |
| `avulsas.html` | Todas as cartas e kits à venda |
| `carta.html` | Uma carta, com as linhas de compra por estado, acabamento e preço |
| `kit.html` | Um kit: cartas vendidas juntas |
| `selados.html`, `selado.html` | Os selados à venda e a página de cada um |
| `pedido.html` | Carrinho, fechamento do pedido e Pix |
| `meus-pedidos.html` | Os pedidos feitos neste navegador ou abertos pelo link privado |
| `blog.html`, `post.html` | O blog |
| `sobre.html` | A história da HOTARU e o canal do YouTube |
| `ajuda.html` | Perguntas frequentes; sem link no menu por enquanto |
| `admin.html` | Administração, só para o Eric |

`loja.html`, `carrinho.html` e os doze `produto-*.html` são endereços da
maquete do começo do projeto, com produtos e preços inventados. Hoje cada um só
redireciona para a página de verdade mais parecida e fica fora dos buscadores.
A maquete continua no histórico do git.

## Identidade

Tirada do guia de identidade visual da marca:

| Elemento | Valor |
| :--- | :--- |
| Azul-marinho | `#0e1f47` |
| Ouro metálico | gradiente `#8e6b14 → #f0db9b → #c9a227` |
| Verde-limão (brilho) | `#d6f24b` |
| Marfim / creme | `#f7efdc` / `#fbf7ec` |
| Fonte de exibição | Playfair Display |
| Fonte de apoio | Inter |

O vaga-lume em `assets/logo-card.png` e o logotipo em `assets/logo-wordmark.png`
foram recortados direto da arte do guia. O padrão de losangos do fundo é
reproduzido em CSS (`--pattern`), porque a arte original não se repete sem emenda.

## Como mexer

Os textos das páginas ficam em `build.py`, e os pedaços repetidos (cabeçalho,
rodapé, sprite de ícones) em `_parts/`. Depois de mudar qualquer um deles:

```bash
python3 build.py      # regrava os .html a partir de build.py + _parts/
```

Para ver local:

```bash
python3 -m http.server 8777    # http://127.0.0.1:8777
```

Os testes em `tests/` rodam no Chromium headless com Playwright, contra as
páginas geradas e um substituto do Supabase, sem tocar no projeto de verdade.
O cabeçalho de cada arquivo diz como rodar.
