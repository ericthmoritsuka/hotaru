#!/usr/bin/env python3
"""
Gera as páginas estáticas da HOTARU. As cartas, os selados e o blog não
moram aqui: o navegador lê tudo do Supabase (assets/catalogo.js, assets/blog.js).

    python3 build.py

Os fragmentos compartilhados ficam em _parts/. Tudo que sai daqui é HTML
puro — o GitHub Pages serve os arquivos como estão, sem build no servidor.
"""

import hashlib
import json
import pathlib

ROOT = pathlib.Path(__file__).parent
PARTS = ROOT / "_parts"


def part(name):
    return (PARTS / f"{name}.html").read_text(encoding="utf-8")


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
# O blog (assets/blog.js, um módulo) só na home e nas páginas do blog. A
# versão no link segue os dois arquivos; blog-render.js, que ele importa, vem
# sem versão e pode levar até 10 minutos para atualizar no cache do Pages.
BLOG_V = hashlib.sha256((ROOT / "assets/blog.js").read_bytes() + (ROOT / "assets/blog-render.js").read_bytes()).hexdigest()[:10]
BLOG_JS = f'<script type="module" src="assets/blog.js?v={BLOG_V}"></script>'


SITE = "https://lojahotaru.com.br"
DESCRIPTION = "HOTARU, loja virtual de cartas colecionáveis: cartas avulsas e selados."


def page(name, title, body, active=None, desc=None, noindex=False, base=None):
    # Toda página carrega o catálogo: o link Carrinho do cabeçalho conta as
    # cartas do carrinho. O conteúdo vai dentro de <main>, e o link "Pular
    # para o conteúdo" é a primeira parada do teclado.
    url = f"{SITE}/" if name == "index" else f"{SITE}/{name}.html"
    extra = ""
    if base:
        extra += f'<base href="{base}">\n'
    if noindex:
        extra += '<meta name="robots" content="noindex">\n'
    head = (part("head")
            .replace("{{HEAD_EXTRA}}", extra)
            .replace("{{TITLE}}", title)
            .replace("{{DESCRIPTION}}", desc or DESCRIPTION)
            .replace("{{URL}}", url))
    skip = '<a class="skip" href="#conteudo">Pular para o conteúdo</a>\n'
    html = head + skip + part("sprite") + part("header") + '<main id="conteudo" tabindex="-1">' + body + "</main>\n" + CATALOGO_JS + part("footer")
    html = html.replace('href="assets/style.css"', f'href="assets/style.css?v={CSS_V}"', 1)
    if active:
        html = html.replace(f'<a href="{active}">', f'<a href="{active}" aria-current="page">', 1)
    (ROOT / f"{name}.html").write_text(html, encoding="utf-8")
    return name


# --------------------------------------------------------------------------
# Home
# --------------------------------------------------------------------------

YT = "https://www.youtube.com/@Ericthm_"

# Vídeos de coleções que podem aparecer no quadro do YouTube. A cada vez que a
# página abre, o navegador sorteia um deles; sem JavaScript, fica o primeiro.
# Para incluir um vídeo, acrescente o ID dele (o trecho depois de "v=" ou de
# "/shorts/" no link) e rode python3 build.py.
VIDEOS = [
    "EME_g29ZMVo",  # Conheça a coleção Storm Emeralda (JP/KO)
    "c0Azny49uPQ",  # Conheça os Produtos da Primeira Leva da Coleção de 30 anos
    "qkAC4Uh-Aw0",  # Conheça a Coleção Parceiro Inicial Série 2
    "TErW8C_WeT8",  # Conheça a minha coleção de Kanto!
]

YT_EMBED = "https://www.youtube-nocookie.com/embed/"
YT_THUMB = "https://i.ytimg.com/vi/"

# O quadro do YouTube é uma fachada (revisão de QA, QA-03): a miniatura do
# vídeo e um botão de tocar. O player do YouTube (cerca de 4 MB de scripts)
# só entra quando alguém clica, e é o youtube-nocookie. A miniatura só carrega
# perto da tela (loading="lazy"), e o vídeo é sorteado antes de ela começar a
# carregar, sem uma primeira requisição jogada fora. O clique é tratado em
# assets/catalogo.js (watchVideos). Sem JavaScript, fica o link do canal.
CANAL = f'''<div class="ytbox">
      <div class="ytframe">
        <script>(function (v, box) {{
          var id = v[Math.floor(Math.random() * v.length)];
          var button = document.createElement("button");
          var img = document.createElement("img");
          var mark = document.createElement("span");
          button.type = "button";
          button.className = "yt-play";
          button.dataset.id = id;
          button.setAttribute("aria-label", "Assistir ao vídeo do canal Ericthm no YouTube");
          img.className = "yt-thumb";
          img.alt = "";
          img.width = 480;
          img.height = 360;
          img.loading = "lazy";
          img.src = "{YT_THUMB}" + id + "/hqdefault.jpg";
          mark.className = "yt-mark";
          mark.setAttribute("aria-hidden", "true");
          mark.innerHTML = '<svg width="22" height="22" viewBox="0 0 12 12"><path d="M2 1l9 5-9 5z" fill="currentColor"/></svg>';
          button.append(img, mark);
          box.append(button);
        }})({json.dumps(VIDEOS)}, document.currentScript.parentNode);</script>
      </div>
      <a class="plate" href="{YT}" target="_blank" rel="noopener">
        <b>@Ericthm_ · Jornada do Eric</b>
        <em>Assistir no YouTube &rarr;</em>
      </a>
    </div>'''

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
        <a class="btn btn-ghost" href="selados.html">Ver os selados</a>
      </div>
    </div>
    <!-- Uma carta por categoria à venda (Eric, 2026-11-24): cada uma leva à
         sua página. Uma categoria nova ganha a sua carta aqui. -->
    <nav class="hero-cards hero-cards-2" aria-label="Categorias">
      {tcard("m-card", "Avulsas", href="avulsas.html", title="Ver as cartas avulsas")}
      {tcard("m-booster", "Selados", href="selados.html", title="Ver os selados")}
    </nav>
  </div>
</section>

<section class="cartas-home kits-home" id="kits" hidden>
  <div class="wrap">
    <div class="section-head">
      <div>
        <p class="eyebrow">Kits</p>
        <h2>Leve junto, pague menos</h2>
        <p>Cartas que saem juntas por menos do que separadas.</p>
      </div>
      <a class="more" href="avulsas.html">Ver as cartas</a>
    </div>
    <div data-catalog="homekits"></div>
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

<section class="cartas-home blog-home" id="blog" hidden>
  <div class="wrap">
    <div class="section-head">
      <div>
        <p class="eyebrow">Blog</p>
        <h2>Do blog da HOTARU</h2>
        <p>Textos sobre Pokémon TCG, coleção e o que mais aparecer por aqui.</p>
      </div>
      <a class="more" href="blog.html">Ver todos</a>
    </div>
    <div data-blog="home"></div>
  </div>
</section>
{BLOG_JS}

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

page("index", "HOTARU | Cartas colecionáveis e selados | Loja virtual", home, "index.html",
     desc="Cartas avulsas de Pokémon TCG e alguns selados, direto da coleção do Eric. Loja virtual de Recife/PE.")
print("index.html")


# --------------------------------------------------------------------------
# Cartas à venda (lidas no navegador por assets/catalogo.js)
# --------------------------------------------------------------------------

avulsas = f'''
<div class="pagehead">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">Início</a> &nbsp;/&nbsp; Cartas</p>
    <h1>Cartas avulsas</h1>
    <p>As cartas à venda agora. Ponha no carrinho, feche o pedido e pague com Pix: a entrega é combinada com você.</p>
  </div>
</div>

<section class="wrap cartas">
  <div class="kits-all" data-catalog="kits" hidden></div>
  <div data-catalog="all"><p class="card-note card-loading" role="status">Carregando as cartas…</p></div>
</section>
'''

page("avulsas", "Cartas avulsas | HOTARU", avulsas, "avulsas.html",
     desc="As cartas avulsas de Pokémon TCG à venda na HOTARU. Ponha no carrinho, feche o pedido e pague com Pix.")
print("avulsas.html")

carta = f'''
<div class="pagehead compact">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">Início</a> &nbsp;/&nbsp; <a href="avulsas.html">Cartas</a> &nbsp;/&nbsp; <span data-crumb>Carta</span></p>
  </div>
</div>

<section class="wrap cartas">
  <div data-catalog="card"><p class="card-note card-loading" role="status">Carregando a carta…</p></div>
</section>
'''

page("carta", "Carta | HOTARU", carta, "avulsas.html",
     desc="Uma carta avulsa de Pokémon TCG à venda na HOTARU.")
print("carta.html")

# Um kit (Eric, 2026-11-25): várias cartas vendidas juntas, montado na tela
# Shop do card tracker. A página lê o kit de store_bundles pelo id.
kit = f'''
<div class="pagehead compact">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">Início</a> &nbsp;/&nbsp; <a href="avulsas.html">Cartas</a> &nbsp;/&nbsp; <span data-crumb>Kit</span></p>
  </div>
</div>

<section class="wrap cartas">
  <div data-catalog="kit"><p class="card-note card-loading" role="status">Carregando o kit…</p></div>
</section>
'''

page("kit", "Kit | HOTARU", kit, "avulsas.html",
     desc="Um kit de cartas de Pokémon TCG vendidas juntas na HOTARU, por menos do que separadas.")
print("kit.html")

pedido = f'''
<div class="pagehead">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">Início</a> &nbsp;/&nbsp; Carrinho</p>
    <h1>Carrinho</h1>
    <p>O carrinho não reserva as cartas: elas ficam com quem fechar o pedido primeiro. Fechado o pedido, você paga com Pix em até 48 horas.</p>
  </div>
</div>

<section class="wrap cartas">
  <div data-catalog="order"><p class="card-note card-loading" role="status">Carregando o carrinho…</p></div>
</section>
{PEDIDO_JS}
'''

page("pedido", "Carrinho | HOTARU", pedido, desc="O seu carrinho na HOTARU.")
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
  <div data-catalog="sealed"><p class="card-note card-loading" role="status">Carregando os selados…</p></div>
</section>
'''

page("selados", "Selados | HOTARU", selados, "selados.html",
     desc="Boosters, boxes e outros produtos lacrados à venda na HOTARU, com fotos do próprio produto.")
print("selados.html")

selado = f'''
<div class="pagehead compact">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">Início</a> &nbsp;/&nbsp; <a href="selados.html">Selados</a> &nbsp;/&nbsp; <span data-crumb>Selado</span></p>
  </div>
</div>

<section class="wrap cartas">
  <div data-catalog="sealedone"><p class="card-note card-loading" role="status">Carregando o produto…</p></div>
</section>
'''

page("selado", "Selado | HOTARU", selado, "selados.html",
     desc="Um produto lacrado de Pokémon TCG à venda na HOTARU.")
print("selado.html")

# --------------------------------------------------------------------------
# Blog (lido no navegador por assets/blog.js)
# --------------------------------------------------------------------------

blog = f'''
<div class="pagehead">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">Início</a> &nbsp;/&nbsp; Blog</p>
    <h1>Blog</h1>
    <p>Textos sobre Pokémon TCG, coleção e outros universos.</p>
  </div>
</div>

<section class="wrap cartas">
  <div data-blog="list"><p class="card-note card-loading" role="status">Carregando os posts…</p></div>
</section>
{BLOG_JS}
'''

page("blog", "Blog | HOTARU", blog, "blog.html",
     desc="Textos sobre Pokémon TCG, coleção e outros universos, no blog da HOTARU.")
print("blog.html")

post = f'''
<div class="pagehead post-pagehead">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">Início</a> &nbsp;/&nbsp; <a href="blog.html">Blog</a> &nbsp;/&nbsp; <span data-blog-crumb>Post</span></p>
  </div>
</div>

<section class="wrap cartas">
  <div data-blog="post"><p class="card-note card-loading" role="status">Carregando o post…</p></div>
</section>
{BLOG_JS}
'''

page("post", "Blog | HOTARU", post, "blog.html",
     desc="Um texto do blog da HOTARU, sobre Pokémon TCG e coleção.")
print("post.html")

# A administração dos selados, dos destaques e do blog: só para o Eric, sem
# link no site, fora dos buscadores. O login é por link no e-mail, com a
# conta do card tracker (assets/admin.js). O editor do blog (Quill) só
# carrega aqui.
ADMIN_V = hashlib.sha256((ROOT / "assets/admin.js").read_bytes() + (ROOT / "assets/blog-render.js").read_bytes()).hexdigest()[:10]
admin = f'''
<div class="pagehead">
  <div class="wrap">
    <h1>Administração</h1>
    <p>Os selados, os destaques e o blog da loja. As cartas têm preço na tela Shop do card tracker.</p>
  </div>
</div>

<link rel="stylesheet" href="assets/vendor/quill-2.0.3.snow.css">
<section class="wrap cartas">
  <div data-admin><p class="card-note" role="status">Abrindo…</p></div>
</section>
<script src="assets/vendor/quill-2.0.3.js" defer></script>
<script type="module" src="assets/admin.js?v={ADMIN_V}"></script>
'''

page("admin", "Administração | HOTARU", admin)
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
  <div data-catalog="mine"><p class="card-note card-loading" role="status">Carregando os seus pedidos…</p></div>
</section>
{PEDIDO_JS}
'''

page("meus-pedidos", "Meus pedidos | HOTARU", meus, desc="Os seus pedidos na HOTARU.")
print("meus-pedidos.html")


# --------------------------------------------------------------------------
# Endereços da maquete antiga
# --------------------------------------------------------------------------

# A HOTARU começou como maquete (loja.html, carrinho.html e doze produto-*.html,
# com produtos e preços inventados). Os endereços continuam existindo para quem
# guardou um link, mas agora só levam à página de verdade mais parecida, sem
# entrar nos buscadores. O conteúdo da maquete fica no histórico do git.
REDIRECTS = {
    "loja": "avulsas.html",
    "carrinho": "pedido.html",
    "produto-booster-box-destinos": "selados.html",
    "produto-etb-coroa-estelar": "selados.html",
    "produto-blister-triplo": "selados.html",
    "produto-charizard-ex-psa10": "avulsas.html",
    "produto-pikachu-alt-art": "avulsas.html",
    "produto-binder-premium": "index.html",
    "produto-playmat-vagalume": "index.html",
    "produto-sleeves-matte": "index.html",
    "produto-toploader-35pt": "index.html",
    "produto-chaveiro-acrilico": "index.html",
    "produto-photocard-newjeans": "index.html",
    "produto-nendoroid-frieren": "index.html",
}

for old, new in REDIRECTS.items():
    (ROOT / f"{old}.html").write_text(f'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>HOTARU</title>
<meta http-equiv="refresh" content="0; url={new}">
<script>location.replace("{new}")</script>
</head>
<body>
<p><a href="{new}">Continuar para a HOTARU</a></p>
</body>
</html>
''', encoding="utf-8")
print(f"{len(REDIRECTS)} redirecionamentos")


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

<section>
  <div class="wrap">
  <div class="story">
    <p class="first">
      A HOTARU nasceu de uma paixão que começou no final dos anos 90, quando o Pokémon TCG chegou
      ao Brasil. Naquela época, tudo começou com alguns boosters e duas caixas de decks
      pré-construídos. O que parecia ser apenas uma curiosidade de infância acabou se transformando
      em uma paixão que, mesmo depois de tantos anos, nunca desapareceu por completo.
    </p>
    <p>
      Mais de duas décadas depois, essa paixão reacendeu. Primeiro vieram algumas cartas avulsas,
      depois decks, binders, sleeves, toploaders... e, pouco a pouco, uma coleção que não parava de
      crescer. Até que surgiu uma ideia: por que não transformar esse hobby em algo que pudesse
      alcançar outras pessoas e ajudar a manter viva essa mesma paixão?
    </p>
    <p>
      Foi assim que nasceu a HOTARU.
    </p>
    <p>
      Hotaru é a palavra japonesa para vaga-lume. Escolhemos esse nome porque acreditamos que uma
      carta tem algo em comum com esses pequenos pontos de luz: ela brilha, desperta encantamento e
      pode iluminar o dia de alguém. Para alguns, é uma pequena alegria ao abrir um pacote, uma carta
      talvez guardada no binder logo em seguida. Para outros, é uma descoberta especial, uma peça
      importante em uma coleção construída ao longo de muitos anos. Em qualquer caso, cada carta tem
      sua própria luz.
    </p>
    <p>
      Hoje, a HOTARU é uma loja 100% virtual, que está começando sua jornada atendendo conhecidos e
      pessoas próximas, com o desejo de alcançar cada vez mais colecionadores.
    </p>
    <p>
      E, se você também quer conhecer melhor o universo do Pokémon TCG, visite nosso canal no
      YouTube. Por lá, compartilhamos dicas e conteúdos para quem está começando ou simplesmente quer
      descobrir ainda mais sobre esse hobby.
    </p>
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

<section class="slogan">
  <div class="wrap">
    <img class="sig" src="assets/logo-card.png" alt="">
    <p>Brilhe em novos universos</p>
  </div>
</section>
'''

page("sobre", "Sobre nós | HOTARU, Recife/PE", sobre, "sobre.html",
     desc="A história da HOTARU: uma paixão por cartas Pokémon que virou loja virtual em Recife/PE.")


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

<section id="faq">
  <div class="wrap">
    <div class="section-head"><div><p class="eyebrow">Dúvidas</p><h2>Perguntas frequentes</h2></div></div>
    <div class="faq">{faq_html}</div>
  </div>
</section>
'''

page("ajuda", "Ajuda | HOTARU", ajuda, desc="Perguntas frequentes sobre a HOTARU.")

# --------------------------------------------------------------------------
# Página não encontrada
# --------------------------------------------------------------------------

# O GitHub Pages serve este arquivo para qualquer endereço que não existe, em
# qualquer profundidade (/a/b/c), por isso o <base href="/">: sem ele, o CSS e
# os links relativos quebrariam.
naofound = f'''
<div class="pagehead">
  <div class="wrap">
    <p class="crumbs"><a href="index.html">Início</a> &nbsp;/&nbsp; Página não encontrada</p>
    <h1>Página não encontrada</h1>
    <p>O endereço que você abriu não existe ou mudou de lugar. Volte para o início ou veja as cartas à venda.</p>
  </div>
</div>

<section class="wrap cartas">
  <div class="notfound-actions">
    <a class="btn btn-gold" href="avulsas.html">Ver as cartas</a>
    <a class="btn btn-navy" href="index.html">Voltar para o início</a>
  </div>
</section>
'''

page("404", "Página não encontrada | HOTARU", naofound, desc="Esta página não existe na HOTARU.", noindex=True, base="/")

print("ok")
