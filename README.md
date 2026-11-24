# HOTARU

Protótipo visual da loja **HOTARU** — colecionáveis, selados, singles, acessórios
e photocards de K-Pop, Loja 100% virtual, com envio para todo o Brasil.

> Brilhe em novos universos

É uma maquete: as páginas mostram como a loja ficaria, mas nada funciona de
verdade. Não há carrinho real, busca, login, pagamento nem back end. Produtos,
preços, estoque e avaliações são fictícios.

## Páginas

| Arquivo | O que mostra |
| :--- | :--- |
| `index.html` | Home — só cartas e selados: hero, como conferimos, nossa história com o canal do YouTube, slogan e aviso de cartas em breve |
| `loja.html` | Catálogo com filtros, ordenação, chips de filtro ativo e paginação |
| `produto-*.html` | 12 páginas de produto, uma por item do catálogo |
| `carrinho.html` | Carrinho com itens, cupom e resumo do pedido |
| `sobre.html` | História da loja, como trabalhamos, canal do YouTube e números |
| `ajuda.html` | FAQ, tabela de prazos e fretes, trocas e formas de pagamento |

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

As páginas são HTML estático e o GitHub Pages serve os arquivos como estão.
O catálogo fica num lugar só, em `build.py`, e os pedaços repetidos (cabeçalho,
rodapé, sprite de ícones) em `_parts/`. Para mudar produto, preço ou texto:

```bash
python3 build.py      # regrava os .html a partir de build.py + _parts/
```

Para ver local:

```bash
python3 -m http.server 8777    # http://127.0.0.1:8777
```

Sem dependências — só Python 3 para gerar e um navegador para ver.
