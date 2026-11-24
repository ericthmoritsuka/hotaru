#!/usr/bin/env python3
"""
Gera as páginas estáticas da HOTARU a partir de um catálogo único.

    python3 build.py

Os fragmentos compartilhados ficam em _parts/. Tudo que sai daqui é HTML
puro — o GitHub Pages serve os arquivos como estão, sem build no servidor.
"""

import hashlib
import pathlib

ROOT = pathlib.Path(__file__).parent
PARTS = ROOT / "_parts"


def part(name):
    return (PARTS / f"{name}.html").read_text(encoding="utf-8")


def brl(v):
    return f"R$ {v:,.2f}".replace(",", "@").replace(".", ",").replace("@", ".")


# --------------------------------------------------------------------------
# Catálogo
# --------------------------------------------------------------------------

CATS = [
    ("selados",    "Selados",     "i-gift",  "Boosters, blisters, boxes e ETBs lacrados de fábrica.", 128),
    ("singles",    "Singles",     "i-cards", "Cartas avulsas avaliadas uma a uma, da comum à alternativa.", 2140),
    ("acessorios", "Acessórios",  "i-shield","Binders, sleeves, toploaders e playmats para proteger a coleção.", 96),
    ("kpop",       "K-Pop & Geek","i-mic",   "Photocards oficiais, chaveiros, pins e colecionáveis.", 310),
]

P = [
    dict(id="booster-box-destinos", cat="selados", kind="Selado · Pokémon TCG",
         name="Booster Box — Destinos de Paldea (36 pacotes)",
         motif="m-booster", price=899.90, old=1049.90, tag="Pré-venda", tagcls="",
         blurb="Caixa lacrada de fábrica com 36 pacotes de 10 cartas, distribuição oficial Copag em português.",
         specs=[("Coleção", "Destinos de Paldea (SV04)"), ("Conteúdo", "36 pacotes de 10 cartas"),
                ("Idioma", "Português (Copag)"), ("Lacre", "Original de fábrica"),
                ("Lançamento", "Pré-venda — envio a partir de 14/10"), ("SKU", "HTR-SEL-0412")]),

    dict(id="charizard-ex-psa10", cat="singles", kind="Single · Graded PSA 10",
         name="Charizard ex 125/197 — Chamas Obsidianas",
         motif="m-card", price=1890.00, old=None, tag="Foil", tagcls="foil",
         blurb="Carta única, avaliada PSA 10 Gem Mint e mantida no slab original desde a graduação.",
         specs=[("Coleção", "Chamas Obsidianas"), ("Número", "125/197"), ("Raridade", "Special Illustration Rare"),
                ("Avaliação", "PSA 10 — Gem Mint"), ("Certificado", "PSA #87431902"), ("SKU", "HTR-SIN-1187")]),

    dict(id="photocard-newjeans", cat="kpop", kind="K-Pop · Photocard oficial",
         name="Photocard NewJeans — Get Up (versão Bunny Beach)",
         motif="m-photocard", price=79.90, old=99.90, tag="Novo", tagcls="",
         blurb="Photocard oficial retirada de álbum lacrado, conferida e enviada em toploader com sleeve.",
         specs=[("Grupo", "NewJeans"), ("Álbum", "Get Up — Bunny Beach ver."), ("Membro", "Sortido — informe na observação"),
                ("Condição", "Mint, direto do álbum"), ("Envio", "Toploader + sleeve + envelope rígido"), ("SKU", "HTR-KPP-0233")]),

    dict(id="binder-premium", cat="acessorios", kind="Acessório · Binder",
         name="Binder 9 bolsos — Hotaru Premium (480 cartas)",
         motif="m-binder", price=189.90, old=None, tag="", tagcls="",
         blurb="Capa rígida com zíper, páginas de carregamento lateral e tecido interno que não risca a superfície.",
         specs=[("Capacidade", "480 cartas (20 páginas de 9 bolsos)"), ("Fechamento", "Zíper reforçado"),
                ("Bolsos", "Carregamento lateral, livre de PVC"), ("Cor", "Azul-marinho com detalhe dourado"),
                ("Dimensões", "33 × 27 × 5 cm"), ("SKU", "HTR-ACE-0051")]),

    dict(id="playmat-vagalume", cat="acessorios", kind="Acessório · Playmat",
         name="Playmat Vaga-lume Noturno — 60 × 35 cm",
         motif="m-mat", price=149.90, old=179.90, tag="Exclusivo", tagcls="foil",
         blurb="Arte exclusiva da casa, base de borracha antiderrapante e superfície em tecido costurado nas bordas.",
         specs=[("Medidas", "60 × 35 cm"), ("Espessura", "2 mm"), ("Base", "Borracha natural antiderrapante"),
                ("Superfície", "Tecido com costura nas bordas"), ("Arte", "Exclusiva HOTARU"), ("SKU", "HTR-ACE-0088")]),

    dict(id="sleeves-matte", cat="acessorios", kind="Acessório · Sleeves",
         name="Sleeves Matte 66 × 91 mm — 100 unidades",
         motif="m-sleeve", price=39.90, old=None, tag="", tagcls="",
         blurb="Sleeves foscas de 80 mícrons, costas opacas e embaralhamento macio, no tamanho padrão.",
         specs=[("Quantidade", "100 unidades"), ("Medidas", "66 × 91 mm (padrão)"), ("Espessura", "80 mícrons"),
                ("Acabamento", "Fosco, costas opacas"), ("Material", "Livre de ácido e de PVC"), ("SKU", "HTR-ACE-0102")]),

    dict(id="toploader-35pt", cat="acessorios", kind="Acessório · Toploader",
         name="Toploader 35pt rígido — pacote com 25",
         motif="m-card", price=24.90, old=None, tag="", tagcls="",
         blurb="Toploaders rígidos e transparentes de 35pt para guardar ou enviar cartas já sleevadas.",
         specs=[("Quantidade", "25 unidades"), ("Espessura", "35pt"), ("Medidas", "7,6 × 10,2 cm"),
                ("Material", "PVC rígido cristal"), ("Uso", "Comporta carta com sleeve"), ("SKU", "HTR-ACE-0120")]),

    dict(id="chaveiro-acrilico", cat="kpop", kind="Geek · Chaveiro",
         name="Chaveiro acrílico dupla face — coleção Vaga-lume",
         motif="m-key", price=34.90, old=None, tag="", tagcls="",
         blurb="Acrílico de 3 mm impresso dos dois lados, com argola metálica dourada e corrente curta.",
         specs=[("Material", "Acrílico 3 mm"), ("Impressão", "Dupla face, UV"), ("Tamanho", "6 cm"),
                ("Ferragem", "Argola dourada"), ("Arte", "Exclusiva HOTARU"), ("SKU", "HTR-GEE-0019")]),

    dict(id="etb-coroa-estelar", cat="selados", kind="Selado · Pokémon TCG",
         name="Elite Trainer Box — Coroa Estelar",
         motif="m-booster", price=549.90, old=None, tag="", tagcls="",
         blurb="ETB lacrada com 9 boosters, sleeves, dados, contadores e a caixa colecionável da coleção.",
         specs=[("Coleção", "Coroa Estelar (SV07)"), ("Conteúdo", "9 boosters + acessórios"),
                ("Idioma", "Português (Copag)"), ("Lacre", "Original de fábrica"),
                ("Inclui", "65 sleeves, 6 dados, caixa"), ("SKU", "HTR-SEL-0455")]),

    dict(id="blister-triplo", cat="selados", kind="Selado · Pokémon TCG",
         name="Blister Triplo — Chama Negra (3 pacotes + moeda)",
         motif="m-booster", price=89.90, old=109.90, tag="", tagcls="",
         blurb="Blister lacrado com três boosters, uma carta promo exclusiva e a moeda da coleção.",
         specs=[("Coleção", "Chama Negra"), ("Conteúdo", "3 boosters + promo + moeda"),
                ("Idioma", "Português (Copag)"), ("Lacre", "Original de fábrica"),
                ("Promo", "Carta exclusiva do blister"), ("SKU", "HTR-SEL-0399")]),

    dict(id="pikachu-alt-art", cat="singles", kind="Single · Alternativa",
         name="Pikachu com Capuz — Arte Alternativa 202/191",
         motif="m-photocard", price=740.00, old=880.00, tag="Foil", tagcls="foil",
         blurb="Arte alternativa em ótimo estado, conferida sob luz direta e enviada já em toploader.",
         specs=[("Coleção", "Destinos Brilhantes"), ("Número", "202/191"), ("Raridade", "Arte alternativa"),
                ("Condição", "NM — Near Mint"), ("Avaliação", "Conferida pela casa, sem slab"), ("SKU", "HTR-SIN-0904")]),

    dict(id="nendoroid-frieren", cat="kpop", kind="Geek · Figure",
         name="Nendoroid Frieren — edição padrão",
         motif="m-figure", price=629.90, old=None, tag="Esgotado", tagcls="out",
         blurb="Figure articulada de 10 cm com rostos e acessórios intercambiáveis, na caixa original.",
         specs=[("Fabricante", "Good Smile Company"), ("Altura", "10 cm"), ("Inclui", "3 rostos + acessórios"),
                ("Estado", "Novo, caixa lacrada"), ("Disponibilidade", "Sem estoque — avise-me"), ("SKU", "HTR-GEE-0044")]),
]

BY_ID = {p["id"]: p for p in P}


# --------------------------------------------------------------------------
# Componentes
# --------------------------------------------------------------------------

def corners():
    return "".join(
        f'<svg class="corner {c}" aria-hidden="true"><use href="#i-corner"/></svg>'
        for c in ("tl", "tr", "bl", "br")
    )


def tcard(motif, label, cls="", href=None, title=None):
    # Com href, a carta é um link: as cartas da hero levam às categorias.
    tag, attrs = ("a", f' href="{href}" aria-label="{title or label}"') if href else ("div", "")
    return f'''<{tag} class="tcard {cls}"{attrs}>
  <div class="tcard-inner">
    {corners()}
    <svg class="motif" viewBox="0 0 64 64" aria-hidden="true"><use href="#{motif}"/></svg>
    <span class="label">{label}</span>
  </div>
</{tag}>'''


def card(p):
    tag = f'<span class="tag {p["tagcls"]}">{p["tag"]}</span>' if p["tag"] else ""
    old = f"<s>{brl(p['old'])}</s>" if p["old"] else ""
    sold = p["tag"] == "Esgotado"
    btn = ('<button class="btn btn-navy" type="button" disabled style="opacity:.45">Avise-me</button>'
           if sold else
           '<button class="btn btn-gold" type="button">Adicionar ao Carrinho</button>')
    return f'''<article class="product">
  <a class="shot" href="produto-{p["id"]}.html">
    {tag}
    <svg class="motif" viewBox="0 0 64 64" aria-hidden="true"><use href="#{p["motif"]}"/></svg>
  </a>
  <div class="meta">
    <span class="kind">{p["kind"]}</span>
    <h3><a href="produto-{p["id"]}.html" style="text-decoration:none">{p["name"]}</a></h3>
    <div class="price"><strong>{brl(p["price"])}</strong>{old}</div>
    <p class="parcel">ou 6x de {brl(p["price"] / 6)} sem juros</p>
    {btn}
  </div>
</article>'''


def grid(items):
    return '<div class="products">\n' + "\n".join(card(p) for p in items) + "\n</div>"


# Versão do CSS no link, para o HTML novo nunca chegar com o CSS velho em cache.
CSS_V = hashlib.sha256((ROOT / "assets/style.css").read_bytes()).hexdigest()[:10]

# O catálogo de cartas (assets/catalogo.js) lê as cartas à venda no navegador,
# direto do Supabase; a versão no link segue a mesma ideia do CSS.
JS_V = hashlib.sha256((ROOT / "assets/catalogo.js").read_bytes()).hexdigest()[:10]
CATALOGO_JS = f'<script src="assets/catalogo.js?v={JS_V}" defer></script>'
# O Pix e o QR Code, só na página do pedido, antes do catálogo (defer mantém
# a ordem).
PIX_V = hashlib.sha256((ROOT / "assets/pix.js").read_bytes()).hexdigest()[:10]
PEDIDO_JS = (f'<script src="assets/pix.js?v={PIX_V}" defer></script>'
             '<script src="assets/vendor/qrcode-generator-1.4.4.min.js" defer></script>')


def page(name, title, body, active=None):
    # Toda página carrega o catálogo: o link Carrinho do cabeçalho conta as
    # cartas do carrinho.
    html = part("head").replace("{{TITLE}}", title) + part("sprite") + part("header") + body + CATALOGO_JS + part("footer")
    html = html.replace('href="assets/style.css"', f'href="assets/style.css?v={CSS_V}"', 1)
    if active:
        html = html.replace(f'<a href="{active}">', f'<a href="{active}" aria-current="page">', 1)
    (ROOT / f"{name}.html").write_text(html, encoding="utf-8")
    return name


# --------------------------------------------------------------------------
# Home
# --------------------------------------------------------------------------

YT = "https://www.youtube.com/@Ericthm_"

CANAL = f'''<div class="ytbox">
      <div class="ytframe">
        <iframe src="https://www.youtube-nocookie.com/embed/videoseries?list=UU9bwv82L_f3oiDR4qchr_pA"
          title="Vídeos mais recentes do canal Ericthm no YouTube" loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
      </div>
      <a class="plate" href="{YT}" target="_blank" rel="noopener">
        <b>@Ericthm_ · Jornada do Eric</b>
        <em>Assistir no YouTube &rarr;</em>
      </a>
    </div>'''

cats_html = "\n".join(
    f'''<a class="cat" href="loja.html#{slug}">
  <span class="count">{n}</span>
  <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#{icon}"/></svg>
  <h3>{title}</h3>
  <p>{desc}</p>
</a>''' for slug, title, icon, desc, n in CATS)

home = f'''
<section class="hero">
  <div class="wrap">
    <div>
      <p class="eyebrow">Loja virtual · Recife/PE</p>
      <h1>A carta que faltava<br>na sua <em>coleção</em>.</h1>
      <p class="lede">
        Cartas avulsas e alguns selados, direto da coleção de quem ama colecionar.
        A HOTARU é uma loja virtual que nasceu da paixão por colecionar cartas.
      </p>
      <div class="actions">
        <a class="btn btn-gold" href="avulsas.html">Ver as cartas</a>
        <a class="btn btn-ghost" href="{YT}" target="_blank" rel="noopener">Ver o canal</a>
      </div>
    </div>
    <!-- Uma carta por categoria à venda (Eric, 2026-11-24): cada uma leva à
         sua página. Uma categoria nova ganha a sua carta aqui. -->
    <nav class="hero-cards hero-cards-2" aria-label="Categorias">
      {tcard("m-card", "Singles", href="avulsas.html", title="Ver as cartas avulsas")}
      {tcard("m-booster", "Selados", href="selados.html", title="Ver os selados")}
    </nav>
  </div>
</section>

<section class="cartas-home" id="cartas" hidden>
  <div class="wrap">
    <div class="section-head">
      <div>
        <p class="eyebrow">Cartas avulsas</p>
        <h2>Cartas em destaque</h2>
        <p>Algumas das cartas à venda agora.</p>
      </div>
      <a class="more" href="avulsas.html">Ver todas</a>
    </div>
    <div data-catalog="home"></div>
  </div>
</section>

<section class="cartas-home selados-home" id="selados" hidden>
  <div class="wrap">
    <div class="section-head">
      <div>
        <p class="eyebrow">Selados</p>
        <h2>Boosters e boxes lacrados</h2>
        <p>Os selados à venda agora.</p>
      </div>
      <a class="more" href="selados.html">Ver todos</a>
    </div>
    <div data-catalog="homesealed"></div>
  </div>
</section>

<section class="store" id="sobre">
  <div class="wrap">
    <div>
      <p class="eyebrow">Nossa história</p>
      <h2>Tudo começou com a paixão por colecionar cartas</h2>
      <p>
        Antes de ser loja, a HOTARU era coleção: um binder que não parava de crescer,
        edições comparadas lado a lado e cada carta conferida borda por borda antes
        de ganhar lugar na página.
      </p>
      <p>
        Hoje a HOTARU é uma loja 100% virtual. E no nosso canal do YouTube a gente
        ensina mais sobre colecionismo de cartas.
      </p>
      <a class="btn btn-navy" href="sobre.html">Conheça a HOTARU</a>
    </div>
    {CANAL}
  </div>
</section>

<section class="slogan">
  <div class="wrap">
    <img class="sig" src="assets/logo-card.png" alt="">
    <p>Brilhe em novos universos</p>
  </div>
</section>

'''

page("index", "HOTARU — Cartas colecionáveis e selados | Loja virtual", home, "index.html")
print("index.html")


# --------------------------------------------------------------------------
# Cartas à venda (lidas no navegador por assets/catalogo.js)
# --------------------------------------------------------------------------

avulsas = f'''
<div class="pagehead">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">Início</a> &nbsp;/&nbsp; Cartas</p>
    <h1>Cartas avulsas</h1>
    <p>As cartas à venda agora. Para comprar, abra a carta e mande um e-mail: a entrega é combinada com você.</p>
  </div>
</div>

<section class="wrap cartas">
  <div data-catalog="all"><p class="card-note" role="status">Carregando as cartas…</p></div>
</section>
'''

page("avulsas", "Cartas avulsas — HOTARU", avulsas, "avulsas.html")
print("avulsas.html")

carta = f'''
<div class="pagehead">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">Início</a> &nbsp;/&nbsp; <a href="avulsas.html">Cartas</a></p>
  </div>
</div>

<section class="wrap cartas">
  <div data-catalog="card"><p class="card-note" role="status">Carregando a carta…</p></div>
</section>
'''

page("carta", "Carta — HOTARU", carta, "avulsas.html")
print("carta.html")

pedido = f'''
<div class="pagehead">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">Início</a> &nbsp;/&nbsp; <a href="avulsas.html">Cartas</a> &nbsp;/&nbsp; Carrinho</p>
    <h1>Carrinho</h1>
    <p>O carrinho não reserva as cartas: elas ficam com quem fechar o pedido primeiro. Fechado o pedido, você paga com Pix em até 48 horas.</p>
  </div>
</div>

<section class="wrap cartas">
  <div data-catalog="order"><p class="card-note" role="status">Carregando o carrinho…</p></div>
</section>
{PEDIDO_JS}
'''

page("pedido", "Carrinho — HOTARU", pedido)
print("pedido.html")

selados = f'''
<div class="pagehead">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">Início</a> &nbsp;/&nbsp; Selados</p>
    <h1>Selados</h1>
    <p>Boosters, boxes e outros produtos lacrados à venda agora, com fotos do próprio produto.</p>
  </div>
</div>

<section class="wrap cartas">
  <div data-catalog="sealed"><p class="card-note" role="status">Carregando os selados…</p></div>
</section>
'''

page("selados", "Selados — HOTARU", selados, "selados.html")
print("selados.html")

selado = f'''
<div class="pagehead">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">Início</a> &nbsp;/&nbsp; <a href="selados.html">Selados</a></p>
  </div>
</div>

<section class="wrap cartas">
  <div data-catalog="sealedone"><p class="card-note" role="status">Carregando o produto…</p></div>
</section>
'''

page("selado", "Selado — HOTARU", selado, "selados.html")
print("selado.html")

# A administração dos selados: só para o Eric, sem link no site, fora dos
# buscadores. O login é o do card tracker (assets/admin.js).
ADMIN_V = hashlib.sha256((ROOT / "assets/admin.js").read_bytes()).hexdigest()[:10]
admin = f'''
<div class="pagehead">
  <div class="wrap">
    <h1>Administração</h1>
    <p>Os produtos selados da loja. As cartas têm preço na tela Shop do card tracker.</p>
  </div>
</div>

<section class="wrap cartas">
  <div data-admin><p class="card-note" role="status">Abrindo…</p></div>
</section>
<script type="module" src="assets/admin.js?v={ADMIN_V}"></script>
'''

page("admin", "Administração — HOTARU", admin)
admin_html = (ROOT / "admin.html").read_text(encoding="utf-8")
(ROOT / "admin.html").write_text(admin_html.replace("</head>", '<meta name="robots" content="noindex, nofollow">\n</head>', 1), encoding="utf-8")
print("admin.html")

meus = f'''
<div class="pagehead">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">Início</a> &nbsp;/&nbsp; Meus pedidos</p>
    <h1>Meus pedidos</h1>
    <p>Os pedidos feitos neste navegador, ou abertos pelo link privado de um pedido.</p>
  </div>
</div>

<section class="wrap cartas">
  <div data-catalog="mine"><p class="card-note" role="status">Carregando os seus pedidos…</p></div>
</section>
{PEDIDO_JS}
'''

page("meus-pedidos", "Meus pedidos — HOTARU", meus)
print("meus-pedidos.html")


# --------------------------------------------------------------------------
# Loja (catálogo)
# --------------------------------------------------------------------------

def checks(title, opts):
    body = "\n".join(
        f'<label><input type="checkbox"{" checked" if c else ""}> {n} <b>{q}</b></label>'
        for n, q, c in opts)
    return f'<div class="group"><h4>{title}</h4>{body}</div>'


filtros = "".join([
    checks("Categoria", [("Selados", 128, True), ("Singles", 2140, False),
                         ("Acessórios", 96, False), ("K-Pop", 310, False), ("Geek", 74, False)]),
    checks("Jogo / Fandom", [("Pokémon TCG", 1980, False), ("Magic: The Gathering", 412, False),
                             ("Yu-Gi-Oh!", 186, False), ("One Piece TCG", 94, False), ("K-Pop", 310, False)]),
    checks("Condição", [("Lacrado", 224, False), ("Mint / NM", 1620, False),
                        ("Graded (PSA/CGC)", 88, False), ("Played", 240, False)]),
    checks("Preço", [("Até R$ 50", 640, False), ("R$ 50 a R$ 200", 810, False),
                     ("R$ 200 a R$ 800", 390, False), ("Acima de R$ 800", 112, False)]),
    checks("Disponibilidade", [("Em estoque", 2410, True), ("Pré-venda", 36, False)]),
])

loja = f'''
<div class="pagehead">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">Início</a> &nbsp;/&nbsp; Loja</p>
    <h1>Catálogo</h1>
    <p>Tudo o que está na prateleira e no estoque do Recife, do booster lacrado ao toploader avulso.</p>
  </div>
</div>

<div class="wrap">
  <div class="shop">
    <aside class="filters">{filtros}</aside>

    <div>
      <div class="toolbar">
        <span class="count">Mostrando <b>12</b> de 2.648 produtos</span>
        <label>
          <span class="sr">Ordenar por</span>
          <select>
            <option>Mais recentes</option>
            <option>Menor preço</option>
            <option>Maior preço</option>
            <option>Mais vendidos</option>
            <option>Ordem alfabética</option>
          </select>
        </label>
      </div>

      <div class="chips">
        <span class="chip">Em estoque ×</span>
        <span class="chip">Selados ×</span>
        <span class="chip">Limpar tudo</span>
      </div>

      {grid(P)}

      <div class="pager">
        <a href="#" aria-current="page">1</a><a href="#">2</a><a href="#">3</a>
        <a href="#">…</a><a href="#">221</a><a href="#">Próxima ›</a>
      </div>
    </div>
  </div>
</div>
'''

page("loja", "Catálogo — HOTARU | Recife/PE", loja, "loja.html")


# --------------------------------------------------------------------------
# Páginas de produto
# --------------------------------------------------------------------------

def pdp(p):
    rel = [q for q in P if q["cat"] == p["cat"] and q["id"] != p["id"]][:4]
    if len(rel) < 4:
        rel += [q for q in P if q["id"] != p["id"] and q not in rel][: 4 - len(rel)]

    specs = "\n".join(f"<tr><th>{k}</th><td>{v}</td></tr>" for k, v in p["specs"])
    old = f'<s>{brl(p["old"])}</s><span class="off">−{round((1 - p["price"] / p["old"]) * 100)}%</span>' if p["old"] else ""
    sold = p["tag"] == "Esgotado"

    thumbs = "".join(
        f'<div{" aria-current=\'true\'" if i == 0 else ""}><svg viewBox="0 0 64 64"><use href="#{m}"/></svg></div>'
        for i, m in enumerate([p["motif"], "m-card", "m-sleeve", p["motif"]]))

    buy = ('<button class="btn btn-navy btn-block" type="button">Avise-me quando chegar</button>'
           if sold else
           '<button class="btn btn-gold btn-block" type="button">Adicionar ao Carrinho</button>'
           '<a class="btn btn-navy btn-block" href="carrinho.html">Comprar agora</a>')

    stock = ('<span class="stock">Sem estoque no momento</span>' if sold
             else '<span class="stock"><b>Em estoque</b> — 7 unidades no Recife</span>')

    body = f'''
<div class="wrap">
  <p class="crumbs" style="padding-top:26px"><a href="index.html">Início</a> &nbsp;/&nbsp;
    <a href="loja.html">Loja</a> &nbsp;/&nbsp; {p["kind"].split(" · ")[0]} &nbsp;/&nbsp; {p["name"]}</p>

  <div class="pdp">
    <div class="gallery">
      <div class="main">{tcard(p["motif"], p["kind"].split(" · ")[0])}</div>
      <div class="thumbs">{thumbs}</div>
    </div>

    <div class="info">
      <span class="kind">{p["kind"]}</span>
      <h1>{p["name"]}</h1>
      <div class="rating">
        <span class="stars">★★★★★</span> 4,9 · 128 avaliações
        <span style="color:#c9a227">·</span> <a href="#" style="color:var(--gold-dk)">Ver perguntas</a>
      </div>

      <div class="pricebox">
        <div class="row"><span class="now">{brl(p["price"])}</span>{old}</div>
        <p class="pix">
          <b>{brl(p["price"] * 0.9)}</b> no PIX (10% de desconto) &nbsp;·&nbsp;
          ou 6x de {brl(p["price"] / 6)} sem juros
        </p>
      </div>

      <div class="qty">
        <div class="stepper">
          <button type="button" aria-label="Diminuir">−</button><span>1</span><button type="button" aria-label="Aumentar">+</button>
        </div>
        {stock}
      </div>

      <div class="buybox">{buy}</div>

      <ul class="perks">
        <li><svg><use href="#i-truck"/></svg> Frete grátis acima de R$ 249 para todo o Brasil. Recife e região em até 2 dias úteis.</li>
        <li><svg><use href="#i-shield"/></svg> Embalagem rígida com sleeve e toploader, sem exceção.</li>
        <li><svg><use href="#i-star"/></svg> Sete dias para troca ou devolução, do jeito que chegou.</li>
      </ul>
    </div>
  </div>

  <div class="tabs">
    <div class="tabnav">
      <span aria-current="true">Descrição</span><span>Especificações</span><span>Envio</span><span>Avaliações (128)</span>
    </div>
    <div style="max-width:46rem">
      <p>{p["blurb"]}</p>
      <p>
        Conferimos cada item antes de anunciar e fotografamos a unidade que sai da loja.
        Se algo chegar diferente do anunciado, a troca é nossa e o frete de volta também.
      </p>
      <div class="scroller">
        <table class="specs">{specs}</table>
      </div>
    </div>
  </div>
</div>

<section class="wrap">
  <div class="section-head">
    <div><p class="eyebrow">Combina com</p><h2>Quem levou isso, levou também</h2></div>
    <a class="more" href="loja.html">Ver catálogo</a>
  </div>
  {grid(rel)}
</section>
'''
    page(f"produto-{p['id']}", f"{p['name']} — HOTARU", body, "loja.html")


for prod in P:
    pdp(prod)


# --------------------------------------------------------------------------
# Carrinho
# --------------------------------------------------------------------------

CART = [(BY_ID["booster-box-destinos"], 1), (BY_ID["sleeves-matte"], 2), (BY_ID["photocard-newjeans"], 1)]
sub = sum(p["price"] * q for p, q in CART)

lines = "\n".join(f'''<div class="line">
  <div class="thumb"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="#{p["motif"]}"/></svg></div>
  <div>
    <span class="kind">{p["kind"]}</span>
    <h3><a href="produto-{p["id"]}.html" style="text-decoration:none">{p["name"]}</a></h3>
    <p class="sub">Vendido e entregue por HOTARU · SKU {dict(p["specs"])["SKU"]}</p>
    <button class="remove" type="button">Remover</button>
  </div>
  <div class="right">
    <strong>{brl(p["price"] * q)}</strong>
    <div class="stepper"><button type="button">−</button><span>{q}</span><button type="button">+</button></div>
  </div>
</div>''' for p, q in CART)

carrinho = f'''
<div class="pagehead">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">Início</a> &nbsp;/&nbsp; Carrinho</p>
    <h1>Seu carrinho</h1>
    <p>Três itens reservados por 30 minutos. O estoque só sai do site quando o pagamento entra.</p>
  </div>
</div>

<div class="wrap">
  <div class="cartpage">
    <div class="lines">{lines}</div>

    <aside class="summary">
      <h3>Resumo</h3>
      <div class="row"><span>Subtotal</span><b>{brl(sub)}</b></div>
      <div class="row free"><span>Frete (PE — 50000-000)</span><b>Grátis</b></div>
      <div class="row"><span>Desconto</span><b>—</b></div>

      <div class="cupom">
        <input type="text" placeholder="Cupom de desconto" aria-label="Cupom">
        <button type="button">Aplicar</button>
      </div>

      <div class="total"><span>Total</span><strong>{brl(sub)}</strong></div>
      <p class="pixnote">ou <b>{brl(sub * 0.9)}</b> à vista no PIX · 6x de {brl(sub / 6)} sem juros</p>

      <a class="btn btn-gold btn-block" href="#">Finalizar compra</a>
      <a class="btn btn-navy btn-block" href="loja.html" style="margin-top:10px">Continuar comprando</a>

      <ul class="perks" style="margin-top:22px">
        <li><svg><use href="#i-shield"/></svg> Pagamento processado em ambiente seguro.</li>
      </ul>
    </aside>
  </div>
</div>
'''

page("carrinho", "Carrinho — HOTARU", carrinho)


# --------------------------------------------------------------------------
# Sobre
# --------------------------------------------------------------------------

sobre = f'''
<div class="pagehead">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">Início</a> &nbsp;/&nbsp; Sobre nós</p>
    <h1>Uma paixão por cartas<br>que virou loja</h1>
    <p>Brilhe em novos universos — o lema veio antes da loja, junto com o primeiro binder.</p>
  </div>
</div>

<section class="wrap">
  <div class="story">
    <p class="first">
      A HOTARU começou com a paixão por colecionar cartas. Primeiro foi um binder, depois outro,
      depois a mania de conferir cada borda, cada edição e cada idioma antes de guardar uma carta.
      Quando a coleção começou a sobrar, ficou claro que dava para abrir uma loja.
    </p>
    <p>
      O nome é a palavra japonesa para vaga-lume. A gente gosta da ideia porque uma carta boa faz
      o mesmo: aparece de repente no meio do pacote, brilha por um segundo e some no binder de
      alguém. É pouca luz e dura pouco, mas é o motivo pelo qual se abre o próximo pacote.
    </p>
    <p>
      Hoje a HOTARU é uma loja 100% virtual. E para quem quer ir além das cartas, o nosso canal
      do YouTube ensina mais sobre colecionismo.
    </p>
  </div>
</section>

<section class="store">
  <div class="wrap">
    <div>
      <p class="eyebrow">No YouTube</p>
      <h2>Aprenda mais sobre colecionismo</h2>
      <p>No canal @Ericthm_ a gente ensina mais sobre colecionismo de cartas. É o lugar para entender a coleção, não só para comprar a próxima carta.</p>
      <a class="btn btn-gold" href="{YT}" target="_blank" rel="noopener">Ver o canal</a>
    </div>
    {CANAL}
  </div>
</section>

<section class="slogan">
  <div class="wrap">
    <img class="sig" src="assets/logo-card.png" alt="">
    <p>Brilhe em novos universos</p>
  </div>
</section>
'''

page("sobre", "Sobre nós — HOTARU | Recife/PE", sobre, "sobre.html")


# --------------------------------------------------------------------------
# Ajuda
# --------------------------------------------------------------------------

FAQ = [
    ("Vocês têm loja física?",
     "Não. A HOTARU é uma loja 100% virtual, sem endereço para visitar."),
    ("Onde aprendo mais sobre colecionar cartas?",
     f'No nosso <a href="{YT}" target="_blank" rel="noopener">canal do YouTube</a>, @Ericthm_, '
     "onde a gente ensina mais sobre colecionismo de cartas."),
    ("Como falo com a HOTARU?",
     'Pelo e-mail <a href="mailto:hotaru.loja@gmail.com">hotaru.loja@gmail.com</a>.'),
]

faq_html = "\n".join(
    f"<details{' open' if i == 0 else ''}><summary>{q}</summary><p>{a}</p></details>"
    for i, (q, a) in enumerate(FAQ))

ajuda = f'''
<div class="pagehead">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">Início</a> &nbsp;/&nbsp; Ajuda</p>
    <h1>Ajuda</h1>
    <p>Ficou alguma dúvida? Escreva para hotaru.loja@gmail.com.</p>
  </div>
</div>

<section class="wrap" id="faq">
  <div class="section-head"><div><p class="eyebrow">Dúvidas</p><h2>Perguntas frequentes</h2></div></div>
  <div class="faq">{faq_html}</div>
</section>
'''

page("ajuda", "Ajuda — HOTARU", ajuda)

print("ok")
