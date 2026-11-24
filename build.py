#!/usr/bin/env python3
"""
Gera as páginas estáticas da HOTARU a partir de um catálogo único.

    python3 build.py

Os fragmentos compartilhados ficam em _parts/. Tudo que sai daqui é HTML
puro — o GitHub Pages serve os arquivos como estão, sem build no servidor.
"""

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


def tcard(motif, label, cls=""):
    return f'''<div class="tcard {cls}">
  <div class="tcard-inner">
    {corners()}
    <svg class="motif" viewBox="0 0 64 64" aria-hidden="true"><use href="#{motif}"/></svg>
    <span class="label">{label}</span>
  </div>
</div>'''


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


def page(name, title, body, active=None):
    html = part("head").replace("{{TITLE}}", title) + part("sprite") + part("header") + body + part("footer")
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
        <b>Canal no YouTube</b>
        @Ericthm_ · colecionismo de cartas
        <em>Ver o canal no YouTube &rarr;</em>
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
        Cartas avulsas conferidas uma a uma e alguns selados lacrados de fábrica,
        enviados protegidos em sleeve, toploader e caixa. Somos uma loja virtual que
        nasceu da paixão por colecionar cartas e despacha para o Brasil inteiro.
      </p>
      <div class="actions">
        <a class="btn btn-gold" href="#avisos">Quero ser avisado</a>
        <a class="btn btn-ghost" href="#conferencia">Como conferimos</a>
      </div>
    </div>
    <div class="hero-cards">
      {tcard("m-booster", "Selados")}
      {tcard("m-card", "Singles")}
      {tcard("m-sleeve", "Protegida")}
    </div>
  </div>
</section>

<section id="conferencia">
  <div class="wrap">
  <div class="split">
    <div class="side">
      <p class="eyebrow">Singles</p>
      <h2>Toda carta passa<br>por <em>duas conferências</em>.</h2>
      <p>
        Avaliamos centralização, bordas, superfície e quinas sob luz direta antes de
        anunciar, e fotografamos a carta exata que vai para o envelope. O que está no
        anúncio é o que chega — sem "foto ilustrativa".
      </p>
      <a class="btn btn-gold" href="#avisos">Quero ser avisado</a>
    </div>
    <div class="art">
      <div class="fan">
        {tcard("m-card", "NM")}
        {tcard("m-card", "PSA 10")}
        {tcard("m-sleeve", "Protegido")}
      </div>
    </div>
  </div>
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
        Hoje somos uma loja 100% virtual, sem balcão e sem endereço para visitar. Cada
        pedido é separado com o cuidado de quem coleciona e enviado para todo o Brasil.
        E no nosso canal do YouTube a gente ensina mais sobre colecionismo de cartas.
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

<section class="news" id="avisos">
  <div class="wrap">
    <p class="eyebrow">Em breve</p>
    <h2>As cartas disponíveis <em>chegam aqui</em></h2>
    <p>O catálogo de cartas está quase pronto. Deixe seu e-mail e a gente avisa quando as primeiras cartas e os selados entrarem no site.</p>
    <form class="field" onsubmit="return false">
      <input type="email" placeholder="seu@email.com.br" aria-label="Seu e-mail">
      <button class="btn btn-gold" type="submit">Avisar</button>
    </form>
  </div>
</section>
'''

page("index", "HOTARU — Cartas colecionáveis e selados | Loja virtual", home, "index.html")
print("index.html")


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
      A HOTARU é uma loja 100% virtual: não tem balcão nem endereço para visitar. Cada pedido é
      separado com o mesmo cuidado de quem coleciona e enviado para o Brasil inteiro. E para quem
      quer ir além da compra, o nosso canal do YouTube ensina mais sobre colecionismo de cartas.
    </p>
  </div>
</section>

<section class="wrap">
  <div class="section-head">
    <div><p class="eyebrow">Como trabalhamos</p><h2>Três coisas que não negociamos</h2></div>
  </div>
  <div class="values">
    <div class="value">
      <svg viewBox="0 0 24 24"><use href="#i-cards"/></svg>
      <h3>A foto é a carta</h3>
      <p>Todo single é fotografado individualmente. Nada de imagem de catálogo — o que está no anúncio é a unidade que entra no envelope.</p>
    </div>
    <div class="value">
      <svg viewBox="0 0 24 24"><use href="#i-shield"/></svg>
      <h3>Embalagem não é extra</h3>
      <p>Sleeve, toploader e envelope rígido em todo pedido, do booster de R$ 34 ao graded de R$ 1.800. Não cobramos por isso.</p>
    </div>
    <div class="value">
      <svg viewBox="0 0 24 24"><use href="#i-yt"/></svg>
      <h3>Colecionar se aprende</h3>
      <p>No <a href="{YT}" target="_blank" rel="noopener">canal do YouTube</a> a gente ensina mais sobre colecionismo de cartas, para quem está no primeiro binder e para quem já tem a coleção organizada.</p>
    </div>
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

<section class="wrap">
  <div class="numbers">
    <div><strong>2.648</strong><span>produtos no catálogo</span></div>
    <div><strong>100%</strong><span>loja virtual</span></div>
    <div><strong>4,9</strong><span>média de avaliação</span></div>
    <div><strong>2 dias</strong><span>entrega média no Recife</span></div>
  </div>
</section>

<section class="slogan">
  <div class="wrap">
    <img class="sig" src="assets/logo-card.png" alt="">
    <p>Brilhe em novos universos</p>
  </div>
</section>
'''

page("sobre", "Sobre nós — HOTARU | Recife/PE", sobre, "index.html#sobre")


# --------------------------------------------------------------------------
# Ajuda
# --------------------------------------------------------------------------

FAQ = [
    ("Como vocês avaliam a condição de um single?",
     "Conferimos centralização, bordas, quinas e superfície sob luz direta, e classificamos em Mint, "
     "Near Mint, Lightly Played ou Played. Cartas graded vêm no slab original, com o número do "
     "certificado no anúncio para você conferir na PSA ou na CGC."),
    ("O que significa 'lacrado de fábrica'?",
     "Que o produto está exatamente como saiu da distribuidora, com o filme original intacto. "
     "Não abrimos, não conferimos por dentro e não revendemos caixa reembalada."),
    ("Vocês têm loja física?",
     "Não. A HOTARU é uma loja 100% virtual, sem endereço para visitar. Todo pedido sai embalado "
     "e com código de rastreio para qualquer lugar do Brasil."),
    ("Como o pedido é embalado?",
     "Toda carta sai em sleeve e toploader, dentro de envelope rígido. Selados vão em caixa com "
     "preenchimento. Isso vale para qualquer valor de pedido e não é cobrado à parte."),
    ("Qual o prazo de entrega?",
     "Recife e região metropolitana em até 2 dias úteis; capitais do Nordeste em 3 a 5; demais "
     "regiões em 5 a 9. O prazo começa a contar depois da confirmação do pagamento."),
    ("Posso trocar ou devolver?",
     "Pode, em até 7 dias corridos depois do recebimento, com o item do jeito que chegou. Se o "
     "problema foi nosso, o frete de volta é por nossa conta."),
    ("Vocês compram coleção?",
     "Compramos. Mande fotos e a lista das cartas por e-mail e a gente responde com a avaliação. "
     "Se fechar negócio, combinamos o envio."),
    ("Como funciona a pré-venda?",
     "Você garante a unidade pagando na hora, e o envio sai na data indicada no anúncio. Se a "
     "distribuidora atrasar, avisamos por e-mail e a devolução fica disponível a qualquer momento."),
    ("Onde aprendo mais sobre colecionar cartas?",
     f'No nosso <a href="{YT}" target="_blank" rel="noopener">canal do YouTube</a>, @Ericthm_, '
     "onde a gente ensina mais sobre colecionismo de cartas."),
]

faq_html = "\n".join(
    f"<details{' open' if i == 0 else ''}><summary>{q}</summary><p>{a}</p></details>"
    for i, (q, a) in enumerate(FAQ))

ajuda = f'''
<div class="pagehead">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">Início</a> &nbsp;/&nbsp; Ajuda</p>
    <h1>Ajuda</h1>
    <p>Prazos, trocas, embalagem e como a gente avalia carta. Se faltar alguma coisa aqui, chame no WhatsApp.</p>
  </div>
</div>

<div class="wrap" style="padding-top:44px">
  <div class="helpnav">
    <a href="#faq">Perguntas frequentes</a>
    <a href="#fretes">Prazos e fretes</a>
    <a href="#trocas">Trocas e devoluções</a>
    <a href="#pagamento">Pagamento</a>
  </div>
</div>

<section class="wrap" style="padding-top:0" id="faq">
  <div class="section-head"><div><p class="eyebrow">Dúvidas</p><h2>Perguntas frequentes</h2></div></div>
  <div class="faq">{faq_html}</div>
</section>

<section class="wrap" id="fretes">
  <div class="section-head"><div><p class="eyebrow">Envio</p><h2>Prazos e fretes</h2>
    <p>Prazos em dias úteis, contados da confirmação do pagamento.</p></div></div>
  <div class="ship scroller">
    <table>
      <thead><tr><th>Destino</th><th>Prazo</th><th>Frete</th><th>Acima de R$ 249</th></tr></thead>
      <tbody>
        <tr><td>Recife e região metropolitana</td><td>1 a 2 dias</td><td>R$ 14,90</td><td>Grátis</td></tr>
        <tr><td>Interior de Pernambuco</td><td>2 a 4 dias</td><td>R$ 21,90</td><td>Grátis</td></tr>
        <tr><td>Capitais do Nordeste</td><td>3 a 5 dias</td><td>R$ 26,90</td><td>Grátis</td></tr>
        <tr><td>Sudeste e Centro-Oeste</td><td>4 a 7 dias</td><td>R$ 32,90</td><td>Grátis</td></tr>
        <tr><td>Sul</td><td>5 a 8 dias</td><td>R$ 34,90</td><td>Grátis</td></tr>
        <tr><td>Norte</td><td>6 a 9 dias</td><td>R$ 39,90</td><td>Grátis</td></tr>
      </tbody>
    </table>
  </div>
</section>

<section class="wrap" id="trocas">
  <div class="section-head"><div><p class="eyebrow">Depois da compra</p><h2>Trocas e devoluções</h2></div></div>
  <div class="story">
    <p>Sete dias corridos a partir do recebimento, para qualquer item, desde que ele volte do jeito
    que chegou — selado ainda lacrado, single ainda no toploader.</p>
    <p>Se o item chegou diferente do anunciado, danificado ou trocado, o erro é nosso: a gente manda
    a etiqueta de devolução e você escolhe entre reembolso integral ou a unidade correta.</p>
    <p>Para desistência sem defeito, o frete de retorno fica por conta de quem comprou. O reembolso
    sai em até 5 dias úteis depois de o item voltar para a gente e ser conferido.</p>
  </div>
</section>

<section class="wrap" id="pagamento">
  <div class="section-head"><div><p class="eyebrow">Formas de pagamento</p><h2>Como dá para pagar</h2></div></div>
  <div class="values">
    <div class="value"><svg viewBox="0 0 24 24"><use href="#i-star"/></svg>
      <h3>PIX com 10% off</h3><p>Desconto aplicado no checkout. A confirmação costuma sair em segundos e o pedido entra na fila na hora.</p></div>
    <div class="value"><svg viewBox="0 0 24 24"><use href="#i-cards"/></svg>
      <h3>Cartão em até 6x</h3><p>Sem juros a partir de R$ 120, nas bandeiras Visa, Mastercard e Elo. Parcela mínima de R$ 20.</p></div>
    <div class="value"><svg viewBox="0 0 24 24"><use href="#i-shield"/></svg>
      <h3>Boleto</h3><p>Compensa em até 3 dias úteis. O estoque fica reservado enquanto o boleto estiver dentro do prazo.</p></div>
  </div>
</section>
'''

page("ajuda", "Ajuda — HOTARU", ajuda)

print("ok")
