# DESIGN.md — Site atelier de paturi la comandă

> Specificația completă de design pentru implementare cu Claude Code.
> Sursa: canvasul „Site atelier paturi” (Acasă, Configurator, Materiale, plus versiunile de mobil).
> Arhitectura tehnică e în `docs/ARHITECTURA.md`. Regulile de lucru pentru Claude Code sunt în `CLAUDE.md`.

---

## 0. Cum se folosește documentul

- Implementează **exact** valorile de aici (culori, mărimi, spațieri, texte). Unde un text e între `[paranteze]`, e un **placeholder**: vine din `settings` sau din catalogul din Supabase și nu se inventează niciodată.
- Copy-ul e în română, cu diacritice cu virgulă: **ș ț Ș Ț** (U+0219, U+021B, U+0218, U+021A), niciodată cu sedilă (ş ţ).
- Prototipul din canvas a fost construit din `div`-uri, ca să poată fi editat vizual. În producție, desenele (patul din configurator, modelele, banda configuratorului) se fac în **SVG**, pe geometria din secțiunea 5.
- Casetele hașurate „FOTO NN” din design se înlocuiesc cu poze reale. Componenta de placeholder rămâne doar pentru dev și pentru pozele care lipsesc.
- Nu adăuga recenzii, cifre, ani de activitate sau prețuri care nu vin din date reale.

---

## 1. Conceptul: „fișa de atelier”

Fiecare pat e desenat și măsurat înainte să fie construit. Site-ul împrumută limbajul vizual al desenului de tâmplărie: cote cu linii de măsură, etichete în font mono, o „fișă de proiect” pe fiecare lucrare, hârtie milimetrică în configurator. Pozele reale, calde, ale paturilor livrate fac contrapunctul.

**Semnăturile vizuale (nu se scot):**
1. **Liniile de cotă** (dimension lines): linie subțire cu capete perpendiculare și eticheta în DM Mono („180 cm”).
2. **Fișa** (job ticket): card alb cu bordură de 1,5px în culoarea cernelii, bară de titlu neagră, rânduri `dt/dd` în mono.
3. **Desenul la scară** al patului în configurator, pe hârtie cu grilă fină.
4. **Numerotarea secțiunilor** ca pe o fișă tehnică: „01 — Cum lucrăm”, „02 — Modele”…
5. **Un singur accent**: verde sticlă `#1E4D3B`. Restul e cerneală, hârtie și griuri.

**Tonul vocii:** direct, concret, la persoana a doua singular („patul tău”, „alegi”). Fraze scurte. Fără superlative („cel mai bun”, „premium”). Cifre concrete în loc de adjective. Promisiuni doar dacă atelierul le confirmă.

---

## 2. Design tokens

### 2.1 Culori

| Token | Hex | Folosire |
|---|---|---|
| `paper` | `#F3F3F0` | fundalul paginii |
| `paper-2` | `#E9E9E4` | secțiuni alternative (recenzii, cerere), panoul desenelor din cardurile de model |
| `card` | `#F7F7F4` | carduri (proces, modele, opțiuni neselectate), umplutura desenelor line-art |
| `white` | `#FFFFFF` | formulare, fișe, desenul din configurator, opțiuni selectate |
| `drafting` | `#FAFAF8` | hârtia desenului la scară (cu grilă) |
| `ink` | `#18191B` | text principal, borduri accentuate, footer, bara fișei |
| `ink-2` | `#4A4D52` | text secundar (paragrafe, descrieri). Contrast 7,6:1 pe `paper` |
| `muted` | `#5F6268` | etichete mono, eyebrows, meta. Contrast 5,5:1 pe `paper` |
| `rule` | `#CFD0CC` | linii despărțitoare, borduri de card |
| `field` | `#8C8F94` | bordura câmpurilor de formular |
| `placeholder` | `#DEDFD9` | fundalul casetelor FOTO (cu hașură) |
| `accent` | `#1E4D3B` | butoane principale, numere de pași, linkuri în carduri, banda configuratorului, starea selectată |
| `accent-hover` | `#163A2C` | hover pe butoanele principale |
| `on-dark` | `#F3F3F0` | text pe `ink` și pe `accent` |
| `on-dark-2` | `#B9BBBF` | text secundar în footer |
| `on-dark-3` | `#9A9DA2` | etichete mono în footer |
| `dark-rule` | `#3A3C40` | linii în footer |
| `led` | `#FFC46B` | banda LED din desen (cu glow `rgba(255,176,72,.55)`) |

Pe `accent`, textul secundar e `rgba(255,255,255,.86)`, iar eyebrow-ul e `rgba(255,255,255,.75)`. Albul pe `accent` are contrast 9,6:1.

### 2.2 Tipografie

**Fonturi** (Google Fonts, prin `next/font/google`):
- **Archivo**, variabil: `wght 100–900` și axa `wdth 62–125`. Subsets: `latin`, `latin-ext` (pentru ș, ț). În `next/font`: `axes: ['wdth']`.
- **DM Mono**, greutăți 400 și 500. Subsets: `latin`, `latin-ext`.

Fallback-uri: Archivo → `'Helvetica Neue', Helvetica, Arial, sans-serif`. DM Mono → `ui-monospace, Menlo, monospace`.

| Rol | Font | Mărime | Line-height | Greutate | Altele |
|---|---|---|---|---|---|
| H1 hero (Acasă) | Archivo | `clamp(40px, 4.2vw, 60px)` | 1.02 | 600 | `letter-spacing: -0.025em; text-wrap: balance` |
| H1 pagină | Archivo | `clamp(36px, 3.9vw, 56px)` | 1.04 | 600 | `-0.025em` |
| H2 secțiune | Archivo | `clamp(30px, 3.3vw, 48px)` | 1.08 | 600 | `-0.02em; text-wrap: balance` |
| H2 cerere | Archivo | `clamp(28px, 3vw, 42px)` | 1.1 | 600 | `-0.02em` |
| H2 familie material | Archivo | `26px` | 1.15 | 600 | `-0.015em` |
| H3 card | Archivo | `19–20px` | 1.25 | 600 | |
| H3 confirmare | Archivo | `28px` | 1.15 | 600 | |
| Lead (paragraf hero) | Archivo | `clamp(17px, 1.35vw, 19px)` | 1.55 | 400 | culoare `ink-2`, `max-width: 520px` |
| Body | Archivo | `17px` | 1.55 | 400 | |
| Body mic | Archivo | `15–16px` | 1.55 | 400 | carduri, FAQ, formulare |
| Legendă opțiune | Archivo | `13px` | 1.35 | 400 | `ink-2` |
| Eyebrow | DM Mono | `12px` | 1.55 | 400 | `uppercase; letter-spacing: .08em; color: muted` |
| Date mono | DM Mono | `12–13px` | 1.4–1.5 | 400/500 | fișe, legende, cote |
| Număr de pas | DM Mono | `34px` | 1 | 400 | culoare `accent` (cardurile de proces) |
| Logo | Archivo | `21px` | 1.1 | 700 | `font-stretch: 112%; letter-spacing: -0.01em` |
| Sub-logo | DM Mono | `11px` | 1.1 | 400 | `uppercase; letter-spacing: .1em; muted` |

### 2.3 Layout și spațiere

- **Container**: `max-width: 1240px; margin: 0 auto; padding-inline: clamp(16px, 4vw, 48px)`.
- **Padding de secțiune**: `padding-block: clamp(64px, 8vw, 112px)`. Hero: `clamp(40px, 6vw, 80px)` sus și `clamp(48px, 6vw, 80px)` jos. Banda configuratorului: `clamp(56px, 7vw, 96px)`.
- **Antetul de secțiune** (eyebrow + H2): `gap: 16px`. Între antet și conținut: `clamp(32px, 4vw, 56px)`.
- **Gap-uri de grilă**: 16px (proces, recenzii), `clamp(12px, 2vw, 24px)` (modele), `clamp(16px, 2vw, 24px)` (lucrări), 12px (mostre).
- **Coloane**: totul cu `flex-wrap` + `flex-basis`, sau cu `grid-template-columns: repeat(auto-fit, minmax(min(<min>px, 100%), 1fr))`. Un singur breakpoint explicit: **960px**, la care se schimbă meniul și poziția fișei din configurator.
- **Raze de colț**: `2px` la butoane și câmpuri, `0` la carduri. Pernele din desen au colțuri rotunjite.
- **Borduri**: `1px rule` pentru despărțiri și carduri; `1.5px ink` pentru elementele „de atelier” (fișe, formulare, desene, butoane secundare). Linii întrerupte `1px dashed rule` în fișe și carduri de proces.
- **Umbre**: niciuna. Excepția e glow-ul LED din desen.

### 2.4 Texturi și modele grafice

```css
/* Caseta FOTO (placeholder hașurat) */
.photo-placeholder {
  background-color: #DEDFD9;
  background-image: repeating-linear-gradient(135deg, rgba(24,25,27,.07) 0 1px, transparent 1px 12px);
}

/* Hârtia desenului la scară */
.drafting {
  background-color: #FAFAF8;
  background-image:
    linear-gradient(rgba(24,25,27,.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(24,25,27,.05) 1px, transparent 1px);
  background-size: 20px 20px;
}
```

**Texturile mostrelor** (fallback cât timp lipsesc pozele reale; peste culoarea mostrei):

| Familie | `background-image` (+ `size` / `position`) |
|---|---|
| Catifea | `linear-gradient(160deg, rgba(255,255,255,.12), rgba(0,0,0,.18))` |
| Bouclé | `radial-gradient(circle, rgba(255,255,255,.55) 0 1.2px, transparent 1.7px)` 6px/6px la 0 0 + `radial-gradient(circle, rgba(0,0,0,.16) 0 1.2px, transparent 1.7px)` 7px/7px la 3px 3px |
| Stofă | `repeating-linear-gradient(0deg, rgba(0,0,0,.10) 0 1px, transparent 1px 3px)` + `repeating-linear-gradient(90deg, rgba(255,255,255,.09) 0 1px, transparent 1px 3px)` |
| Piele ecologică | `radial-gradient(circle, rgba(0,0,0,.16) 0 .8px, transparent 1.3px)` 5px/5px + `linear-gradient(160deg, rgba(255,255,255,.16), rgba(0,0,0,.14))` 100%/100% |
| Lemn masiv | `repeating-linear-gradient(93deg, rgba(60,35,10,.16) 0 1px, transparent 1px 6px, rgba(60,35,10,.08) 6px 7px, transparent 7px 13px)` |

### 2.5 Iconițe

SVG inline cu contur (`stroke: currentColor; stroke-width: 1.6; fill: none`), fără bibliotecă de iconițe și fără emoji:
- săgeată: `viewBox 0 0 16 10`, `M0 5h15M11 1l4 4-4 4`
- meniu: `viewBox 0 0 18 12`, `M0 1h18M0 6h18M0 11h18`
- închide: `viewBox 0 0 12 12`, `M1 1l10 10M11 1L1 11`
- bifă: `viewBox 0 0 12 10`, `M1 5l3.5 3.5L11 1` (stroke 1.8)

### 2.6 Interacțiune, focus, mișcare

- Hover pe butonul principal: fundal `accent-hover`. Pe cel secundar: fundal `ink`, text `white`. Pe linkuri: subliniere. `transition: background-color 150ms, color 150ms`.
- **Focus** (nu exista în prototip, e obligatoriu): `:focus-visible { outline: 2px solid #1E4D3B; outline-offset: 2px; }`. Pe fundal `accent`: outline `#FFFFFF`.
- Desenul se actualizează instant, fără animație. `prefers-reduced-motion` dezactivează orice tranziție.
- Ținte de atingere de minimum 44×44px.

### 2.7 Tailwind v4 — `@theme`

```css
@import "tailwindcss";

@theme {
  --color-paper: #F3F3F0;
  --color-paper-2: #E9E9E4;
  --color-card: #F7F7F4;
  --color-drafting: #FAFAF8;
  --color-ink: #18191B;
  --color-ink-2: #4A4D52;
  --color-muted: #5F6268;
  --color-rule: #CFD0CC;
  --color-field: #8C8F94;
  --color-placeholder: #DEDFD9;
  --color-accent: #1E4D3B;
  --color-accent-hover: #163A2C;
  --color-on-dark-2: #B9BBBF;
  --color-on-dark-3: #9A9DA2;
  --color-dark-rule: #3A3C40;
  --color-led: #FFC46B;

  --font-sans: var(--font-archivo), "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-mono: var(--font-dm-mono), ui-monospace, Menlo, monospace;

  --breakpoint-nav: 60rem; /* 960px: meniul complet și fișa lângă desen */
  --radius-ui: 2px;
}

@layer base {
  html { background: var(--color-paper); color: var(--color-ink); }
  body { font-family: var(--font-sans); font-size: 17px; line-height: 1.55; }
  :focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
}
```

---

## 3. Componente

### 3.1 Header

- Fundal `paper`, bordură jos `1px rule`. Rândul: `min-height: 76px`, `justify-content: space-between`, `gap: 20px`.
- **Logo** (link spre `/`): două rânduri, „[Nume atelier]” (stilul Logo) și „Paturi la comandă” (stilul Sub-logo), cu 2px între ele.
- **≥ 960px**: navigația are 6 linkuri (15px, `padding: 12px 0`, `gap: 4px 26px`): Lucrări, Modele, Materiale, Configurator, Atelierul, Contact. Pagina curentă: `aria-current="page"`, `font-weight: 600`, sublinie de 2px în `accent` (`box-shadow: inset 0 -2px 0 #1E4D3B`). În dreapta: telefonul `[07xx xxx xxx]` (DM Mono 14px, `tel:`) și butonul principal „Cere ofertă” (46px, 15px).
- **< 960px**: logo + butonul „Meniu” (secundar, 46px, iconiță de meniu, `aria-expanded`, `aria-controls="meniu-mobil"`). Deschis, devine „Închide”, iar sub antet apare `nav#meniu-mobil`: linkuri de 18px, câte un rând de 52px cu bordură jos `rule`, apoi două butoane pe un rând (`flex: 1 1 140px`): „Cere ofertă” (principal) și „Sună acum” (secundar). Un click pe link închide meniul.
- Pe Configurator și Materiale, butonul „Cere ofertă” din header lipsește (Configurator are propriul CTA; pe Materiale, mostrele trimit spre configurator). Pe mobil, pe Materiale, în locul meniului e un buton secundar „Configurator”. În producție se poate folosi peste tot meniul standard.

### 3.2 Butoane

| Variantă | Stil |
|---|---|
| Principal | fundal `accent`, text alb, `font-weight: 600`, 16px, `min-height: 50–52px`, `padding: 0 24–26px`, rază 2px |
| Secundar | transparent, `border: 1.5px solid ink`, text `ink`, aceleași dimensiuni |
| Invers (pe `accent`) | fundal alb, text `ink` |
| Link text | culoare `accent`, `font-weight: 600`, 15px, subliniat, `min-height: 44px` |

CTA-urile mari au săgeata la dreapta (`gap: 10px`). Pe mobil, grupurile de butoane fac wrap (`flex-wrap: wrap; gap: 12px`). În contact și în meniul mobil, butoanele cresc (`flex: 1 1 140–200px`).

### 3.3 Eyebrow și antet de secțiune

`<span class="eyebrow">01 — Cum lucrăm</span>` deasupra unui H2 (`max-width: 720–760px`). Antetul cu paragraf în dreapta: `display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 20px`. Paragraful din dreapta are `max-width: 380px`, 16px, `ink-2`.

### 3.4 Foto și caseta FOTO

- Producție: `next/image` cu `sizes` corect, `object-fit: cover`, raport fix (5:4 hero, 4:3 galerie și modele, 4:5 atelier, 1:1 mostre).
- Placeholder (dev / poză lipsă): `.photo-placeholder`, iar în colțul stânga-sus (16px) eticheta „FOTO NN” (DM Mono 12px, 500, `letter-spacing: .06em`) și descrierea cadrului (DM Mono 12px, `ink-2`, line-height 1.45).
- **Legenda** sub poză: DM Mono 12px, `ink-2`, după șablonul `[Model] · [160 × 200] · [material, culoare] · [oraș]`.

### 3.5 Linia de cotă

- **Orizontală**: element de 14–16px înălțime, cu `border-left` și `border-right` de `1.5px ink` (capetele), o linie orizontală de `1.5px` la mijloc și eticheta centrată (DM Mono 12px, line-height 16px, `padding: 0 8–10px`, fundalul identic cu cel de dedesubt, ca să „taie” linia).
- **Verticală**: aceeași logică rotită. Capetele sunt `border-top/bottom`, linia e verticală, iar eticheta e în `writing-mode: vertical-rl; transform: rotate(180deg)` (se citește de jos în sus).
- Pe hero: cota „180 cm” deasupra pozei, pe toată lățimea ei, la 8px de sus. Poza începe la 34px.

### 3.6 Fișa (job ticket)

```
┌──────────────────────────────────────┐  border: 1.5px solid ink; fundal alb
│ FIȘĂ PROIECT                Nr. [___] │  bară ink, text paper, DM Mono 11px uppercase .08em, padding 8px 14px
├──────────────────────────────────────┤
│ Model      Capitonat                  │  <dl> grid: auto 1fr; gap 5px 16px; DM Mono 12px
│ Saltea     180 × 200 cm               │  <dt> culoare muted
│ Material   Catifea, verde sticlă      │
│ Bază       Ladă de depozitare         │
│ Livrat     [Oraș, lună an]            │
└──────────────────────────────────────┘
```

Pe hero e suprapusă peste poză (stânga-jos, 16px, `width: min(310px, calc(100% - 32px))`). În configurator e „Fișă de configurare” și are 13px, rânduri cu `gap: 7px 18px`, blocul de preț și butoanele (vezi 4.2).

### 3.7 Rândul de repere (sub hero)

Grilă `auto-fit, minmax(min(220px, 100%), 1fr)`, `gap: 0 32px`, borduri sus și jos `rule`. Fiecare item: `padding-block: 22px`, eyebrow + valoare (Archivo 600, 18px). Conținut: vezi 4.1.

### 3.8 Cardul de proces

`<ol>` fără bulină. Card: `padding: 24px`, `border: 1px rule`, fundal `card`, coloană cu `gap: 12px`. Conține numărul (DM Mono 34px, `accent`), H3 (20px, `margin-top: 6px`), paragraful (16px, `ink-2`) și, la bază, meta-ul (`margin-top: auto; padding-top: 12px; border-top: 1px dashed rule`, DM Mono 12px, `muted`).

### 3.9 Cardul de model și desenul line-art

Card: `border: 1px rule`, fundal `card`. Sus, panoul de desen (raport 4:3, fundal `paper-2`, bordură jos `rule`). Jos, conținutul (`padding: clamp(14px, 1.8vw, 22px)`, `gap: 8px`): H3 19px, descriere 15px `ink-2`, prețul „de la [___] lei · 160 × 200” (DM Mono 12px, `muted`, `margin-top: auto`) și linkul „Configurează” → `/configurator?m=<model>`.

**Desenul line-art (SVG)**, `viewBox="0 0 200 150"` (y în jos în SVG; coordonatele de mai jos sunt măsurate de la podea, deci `svgY = 150 - y - h`):

| Element | x | y (de la jos) | lățime | înălțime | Stil |
|---|---|---|---|---|---|
| podea | 10 → 190 | 20 | — | — | linie `1.5 ink` |
| tăblie | 30 | 20 | 140 | 100 | contur `1.5 ink`, umplere `card`, model după tipul de tăblie |
| picior stânga | 34 | 20 | 6 | 10 | contur, umplere `card` |
| picior dreapta | 160 | 20 | 6 | 10 | idem |
| cadru | 26 | 30 | 148 | 25 | contur, umplere `card` |
| saltea | 32 | 55 | 136 | 15 | contur, umplere `white` |
| pernă 1 | 44 | 70 | 52 | 14 | contur, alb, `rx 5` |
| pernă 2 | 104 | 70 | 52 | 14 | idem |

Ordinea desenării: podea, tăblie, picioare, cadru, saltea, perne. Toate contururile cu `vector-effect="non-scaling-stroke"`.

**Tăbliile** (umplerea `card` + modelul, în `ink`):
- **Capitonat**: colțuri sus `rx ≈ 4`. Nasturi: `pattern` de 13×13 cu un punct `r=1` la (3,3) și altul la (9.5,9.5) (romb).
- **Arcuit**: arc eliptic sus (`border-top-left/right-radius: 50% 58%` în prototip), adică `path` cu arcuri de rază `rx = w/2`, `ry = 0.58·h`. Are și o bordură interioară paralelă la ~4 unități (linia de cusătură).
- **Canale**: colțuri sus `rx ≈ 10`, linii verticale la fiecare 13 unități.
- **Lamele**: dreptunghi, linii verticale la fiecare 8 unități (lamelele).

### 3.10 Mostra (swatch)

- **În grilă (Acasă, Materiale)**: pătrat 1:1, `border: 1px solid rgba(24,25,27,.25)`, cu poza mostrei sau, ca fallback, culoarea plus textura familiei (2.4). Sub ea: numele (14px, 600) și familia (Acasă) sau codul (Materiale) (DM Mono 12px, `muted`).
- **În configurator**: buton 48×48 cu `aria-label` = numele culorii și `aria-pressed`. Selectat: `outline: 2px solid ink; outline-offset: 3px`.
- **În Materiale**: tot tile-ul e un link (`<a>`) spre configurator, cu familia și culoarea preselectate: `/configurator?f=<familie>&c=<culoare>`. Pentru familia Lemn masiv se adaugă `m=lamele`; pentru celelalte familii modelul rămâne cel implicit. Sub mostră: numele culorii (14px, 600) și codul (DM Mono 12px, `muted`).

### 3.11 Banda configuratorului

Fundal `accent`, text alb, full-bleed. Două coloane: text (`flex: 1 1 420px`) și desen (`flex: 1 1 420px; max-width: 600px`, raport 4:3). Desenul e line-art-ul de la 3.9 cu contur `on-dark` (`#F3F3F0`), umplere `accent`, nasturii capitonatului în `on-dark` (pattern de 24 px în prototip). Are cota orizontală „160 cm” sub podea (pe lățimea cadrului) și cota verticală „120 cm” la dreapta tăbliei (`x ≈ 89%`).

### 3.12 Tile de galerie

`<li>`: poza 4:3, apoi legenda mono (`gap: 10px`). Grila: `auto-fit, minmax(min(300px, 100%), 1fr)`, adică 3 coloane pe desktop și 1 pe mobil.

### 3.13 Lista de specificații (`<dl>`)

`display: grid; grid-template-columns: auto 1fr`, bordură sus `rule`. `dt`: DM Mono 12px uppercase `.06em`, `muted`, `padding: 12px 20px 12px 0`, bordură jos `rule`. `dd`: 15–16px, `padding: 12px 0`, bordură jos `rule`.

### 3.14 Cardul de recenzie

`<figure>`: `padding: 24px`, fundal `card`, `border: 1px rule`. `<blockquote>` 17px, apoi `<figcaption>` (`margin-top: auto`): „[Prenume], [Oraș]” (14px, 600) și „[Model · dimensiune]” (DM Mono 12px, `muted`). **Se afișează doar recenzii reale, cu acordul clientului.**

### 3.15 Întrebări frecvente

`<details>` nativ, cu bordură jos `rule`, într-o listă cu `border-top: 1px solid ink`. `<summary>`: 18px, 600, `padding: 20px 0`, cursor pointer. Răspunsul: 16px `ink-2`, `max-width: 640px`, `margin: 0 0 20px`. Se poate adăuga un indicator +/− din SVG.

### 3.16 Formulare

- Eticheta deasupra câmpului (14px, 600, `gap: 6px`).
- `input`, `select`: `min-height: 48px; padding: 0 14px; border: 1px solid #8C8F94; border-radius: 2px; font-size: 16px` (16px, ca iOS să nu facă zoom). `textarea`: `padding: 12px 14px; resize: vertical`.
- `input[type=file]`: `padding: 12px; border: 1px dashed #8C8F94`.
- Checkbox 20×20, `accent-color: #1E4D3B`, într-un `label` flex cu `gap: 12px`.
- Containerul formularului: fundal alb, `border: 1.5px solid ink`, `padding: clamp(20px, 3vw, 32–36px)`, `gap: 18px`.
- Erori (nu existau în prototip): text de 14px în `#9B2C2C` sub câmp, `aria-describedby`, `aria-invalid="true"` și bordura câmpului în aceeași culoare. Pe trimitere, focusul merge la primul câmp cu eroare.
- Butonul de trimitere, în timpul trimiterii: `aria-busy`, textul „Se trimite…”, dezactivat.
- **Emailul e obligatoriu în ambele formulare** (cerere de ofertă, configurator): notificările se trimit doar pe email, nu prin SMS. Câmpul are `type="email"`, `autocomplete="email"`, `required`.

### 3.17 Footer

- **Complet (Acasă)**: fundal `ink`, text `on-dark`. Sus, trei coloane cu wrap (`gap: 36px`): brandul (Logo 24px + „Paturi construite la comandă, în atelierul din [Localitate].”), „Pagini” (Lucrări, Materiale, Configurator, Contact) și „Contact” (telefon, email, Instagram, Facebook). Etichetele sunt mono, `on-dark-3`. Jos, după `border-top: 1px dark-rule`, în DM Mono 12px: „© 2026 [Denumire firmă SRL] · CUI [___] · [J__/____/____]” și linkurile Confidențialitate, Cookies, Termeni.
- **Compact (Configurator, Materiale)**: un singur rând mono: „© 2026 [Nume atelier] · [Denumire firmă SRL] · CUI [___]” și linkurile legale. Se poate folosi footerul complet peste tot.

---

## 4. Pagini

Rutele: `/`, `/configurator`, `/materiale`, `/lucrari`, `/contact`, `/confidentialitate`, `/cookies`, `/termeni` (detalii în ARHITECTURA.md).

### 4.1 Acasă (`/`)

Ordinea secțiunilor: Header → Hero → Repere → 01 Proces → 02 Modele → 03 Materiale → 04 Banda configuratorului → 05 Lucrări → 06 Atelierul → 07 Clienți → 08 Întrebări → 09 Contact → Footer. Secțiunile 02, 03, 06, 07, 08 și 09 au `border-top: 1px rule`. Clienți are fundal `paper-2`.

#### Hero
Două coloane cu wrap, `align-items: center`, `gap: clamp(36px, 5vw, 64px)`. Textul: `flex: 1.2 1 540px`. Poza: `flex: 1 1 440px`.
- Eyebrow: **Atelier de paturi la comandă · [Localitate]**
- H1: **Paturi construite pe măsura camerei tale.**
- Lead: **Alegi forma, dimensiunea și materialele. Noi desenăm patul, îl construim în atelierul nostru și îl montăm la tine acasă. Fără stoc și fără compromisuri de dimensiune.**
- Butoane: principal „Configurează-ți patul →” (`/configurator`), secundar „Vezi lucrări” (`#lucrari`).
- Sub butoane (DM Mono 13px, `muted`): **Ofertă gratuită · răspundem în [24 de ore]**
- Dreapta: cota „180 cm” peste poza FOTO 01 (5:4), plus fișa proiectului (3.6) în colțul stânga-jos al pozei. Datele fișei vin din proiectul marcat `hero` în portofoliu.
- Spațierea coloanei de text: `gap: 26px`.

#### Repere (4 itemi)
| Eyebrow | Valoare |
|---|---|
| Fabricat | În atelierul din [Localitate] |
| Termen | [4–6] săptămâni |
| Garanție | [X] ani la structură |
| Livrare + montaj | [Zona: oraș, județ, țară] |

#### 01 — Cum lucrăm
- H2: **De la o schiță pe hârtie la patul din dormitorul tău.**
- 4 carduri de proces, grilă `auto-fit, minmax(min(240px,100%),1fr)`, `gap: 16px`:

| Nr. | Titlu | Text | Meta |
|---|---|---|---|
| 01 | Discutăm și măsurăm | Ne spui ce îți dorești — la telefon, pe WhatsApp sau în atelier. Dacă e nevoie, venim să măsurăm camera. | Măsurători: [gratuit în Localitate] |
| 02 | Desenăm și facem oferta | Primești schița patului cu dimensiunile exacte, materialele alese și prețul final. Nu începem nimic până nu confirmi. | Ofertă în [X] zile lucrătoare |
| 03 | Construim în atelier | Structura, tapițeria și finisajele se fac la noi, de la prima tăietură până la ultimul nasture. | Execuție: [4–6] săptămâni |
| 04 | Livrăm și montăm | Aducem patul, îl montăm și plecăm cu ambalajele. Tu doar pui așternuturile. | Montaj: [inclus în zona X] |

#### 02 — Modele (`#modele`)
- H2: **Patru modele de pornire. Fiecare se adaptează.**
- Paragraf dreapta: **Schimbi dimensiunea, înălțimea tăbliei, materialul și baza. Dacă ai o idee proprie, o desenăm de la zero.**
- Grilă `auto-fit, minmax(min(160px,100%),1fr)`: 4 coloane pe desktop, 2 pe mobil.

| Model | Descriere |
|---|---|
| Capitonat | Tăblie tapițată, cu nasturi îmbrăcați în același material. Clasic, merge în orice cameră. |
| Arcuit | Linie curbă, tapițerie netedă și bordură cusută. Arată cel mai bine în bouclé și catifea. |
| Lamele | Tăblie din lamele de lemn masiv, finisată cu ulei. Pentru cine vrea lemn, nu stofă. |
| Canale | Tapițerie cusută în canale verticale. Modern și înalt, potrivit pentru tavane înalte. |

Fiecare card: „de la [___] lei · 160 × 200” și linkul „Configurează”. Prețul „de la” vine din grila de prețuri; dacă `settings.show_prices = false`, rândul dispare.

#### 03 — Materiale (`#materiale`)
- H2: **Atingi materialele înainte să alegi.**
- Paragraf: **Catifea, bouclé, stofă, piele ecologică sau lemn masiv. Le vezi în atelier, [cu programare].**
- Buton (dreapta): doar cel principal, „Toate materialele” → `/materiale`.
- Grilă de 8 mostre `auto-fit, minmax(min(100px,100%),1fr)`, `gap: 12px` (8 pe un rând pe desktop, 3 pe rând pe mobil): Verde sticlă (Catifea), Muștar (Catifea), Alb lapte (Bouclé), Nisip (Bouclé), Gri melanj (Stofă), Coniac (Piele ecologică), Stejar natur (Lemn masiv), Nuc (Lemn masiv). În producție: materialele marcate `featured`.

#### 04 — Configurator (bandă pe fundal `accent`)
- Eyebrow (alb 75%): **04 — Configurator**
- H2: **Construiește-ți patul pe ecran, în două minute.**
- Paragraf (alb 86%): **Alegi modelul, dimensiunea, materialul și baza. Vezi desenul la scară și trimiți configurația direct atelierului. Oferta finală o primești după o discuție scurtă.**
- Buton invers: „Deschide configuratorul →”.
- Desenul de la 3.11.

#### 05 — Lucrări (`#lucrari`)
- H2: **Paturi livrate. Fiecare a pornit de la o discuție.**
- Paragraf dreapta: **Proiecte reale, fotografiate la clienți acasă, cu dimensiunile și materialele folosite.**
- 6 tile-uri (3.12). Pe Acasă apar proiectele `featured`, cu link spre `/lucrari`. Cadrele cerute: FOTO 02, 03 (paturi întregi), 04 (detaliu tăblie), 05 (lada deschisă), 06 (pat întreg), 07 (dimensiune nestandard).

#### 06 — Atelierul (`#atelier`)
Două coloane: poza FOTO 08 (4:5, `max-height: 640px`, `flex: 1 1 420px`) și textul (`flex: 1 1 440px`, `gap: 20px`).
- H2: **Facem un singur lucru: paturi.**
- Paragraf: **Lucrăm din [anul] într-un atelier din [Localitate]. Suntem [X] oameni, tâmplari și tapițeri, și fiecare pat trece prin mâinile noastre de la desen până la montaj. [Una-două fraze despre ce vă diferențiază.]**
- Lista de specificații (3.13):

| | |
|---|---|
| Structură | [Lemn masiv de fag / pin uscat / alt material] |
| Somieră | [Lamele de fag curbate, cu reglaj / fixă] |
| Burete | [Densitate, tip] |
| Stofe | [Furnizori, colecții] |
| Vizite | În atelier, [cu programare] |

#### 07 — Clienți (`#recenzii`, fundal `paper-2`)
- H2: **Ce spun clienții**. În dreapta, DM Mono 13px: „Google: [4,9] din [___] recenzii” (din `settings`, doar dacă e completat).
- 3 carduri de recenzie (3.14), grilă `auto-fit, minmax(min(280px,100%),1fr)`.

#### 08 — Întrebări (`#intrebari`)
Două coloane: titlul (`flex: 1 1 300px`) și lista (`flex: 2 1 520px`).
- H2: **Ce ne întreabă toată lumea**

| Întrebare | Răspuns |
|---|---|
| Cât costă un pat la comandă? | Depinde de model, dimensiune și material. Un pat de 160 × 200 cm pornește de la [___] lei. Prețul final îl primești în scris, după ce stabilim toate detaliile. |
| Cât durează? | [4–6] săptămâni de la confirmarea comenzii și plata avansului de [X]%. |
| Faceți și dimensiuni nestandard? | Da. Construim pe orice dimensiune de saltea, [între 80 și 220 cm lățime]. |
| Pot vedea materialele înainte? | Da, în atelier, [cu programare]. |
| Livrați și în afara orașului? | [Zonele în care livrați și montați, și cât costă transportul.] |
| Ce garanție are patul? | [X] ani pentru structură și [Y] ani pentru tapițerie. |
| Vindeți și saltele? | [Da / nu. Dacă da: ce tipuri și de la ce producători.] |

#### 09 — Contact (`#contact`)
Două coloane: informațiile (`flex: 1 1 380px`, `gap: 22px`) și formularul (`flex: 1 1 440px`).
- H2: **Spune-ne ce pat îți dorești.**
- Paragraf: **O poză cu camera și dimensiunea saltelei sunt suficiente ca să începem.**
- Lista de contact (3.13): Telefon `[07xx xxx xxx]` (tel:), Email `[contact@domeniu.ro]` (mailto:), Atelier „[Strada, nr., Localitate] · vizite [cu programare]”, Program „[Luni–Vineri, 9:00–18:00]”.
- Butoane: „Scrie-ne pe WhatsApp” (principal, `https://wa.me/<număr>`) și „Sună acum” (secundar).
- Harta: 220px înălțime. Embed Google Maps încărcat doar după un click („Arată harta”), ca să nu seteze cookies fără consimțământ. Altfel, o imagine statică cu link spre Google Maps.
- **Formularul** „Cerere de ofertă”. Bara de sus (DM Mono 12px uppercase, bordură jos `rule`): „Cerere de ofertă” · „Răspuns în [24h]”. Câmpurile:
  1. Nume + Telefon (pe un rând, `flex: 1 1 200px` fiecare)
  2. Email (obligatoriu)
  3. Dimensiunea saltelei (select): Încă nu știu / 90 × 200 cm / 120 × 200 cm / 140 × 200 cm / 160 × 200 cm / 180 × 200 cm / 200 × 200 cm / Altă dimensiune
  4. Ce pat îți dorești? (textarea, 4 rânduri)
  5. Poze cu camera sau cu un pat care îți place (opțional): file, multiple, imagini
  6. ☐ Vreau să veniți la măsurători
  7. ☐ Sunt de acord cu prelucrarea datelor conform Politicii de confidențialitate. (obligatoriu)
  8. Butonul „Trimite cererea”
- **Confirmarea** (înlocuiește formularul): eyebrow `accent` „Cerere trimisă”, H3 „Mulțumim! Te sunăm în [24 de ore].”, textul „Între timp, poți să te uiți prin materiale sau să încerci configuratorul.” și butoanele „Configurator” / „Trimite altă cerere”.

### 4.2 Configurator (`/configurator`)

**Antetul paginii** (`padding: clamp(32px,4vw,56px) 0 clamp(24px,3vw,40px)`):
- Breadcrumb mono: „Acasă / Configurator”
- H1: **Configurează-ți patul**
- Paragraf: **Desenul se schimbă la fiecare alegere și e la scară. Trimiți configurația, iar prețul final îl confirmăm după o discuție scurtă, fără obligații.**
- În dreapta, DM Mono 13px: „6 pași · aproximativ 2 minute”

**Corpul**: două coloane cu wrap, `align-items: flex-start`, `gap: clamp(28px, 4vw, 56px)`.
- **Stânga** (`flex: 1.4 1 600px`, `position: sticky; top: 16px`, `gap: 20px`):
  1. **Desenul** (`<figure>`, fundal alb, `border: 1.5px ink`):
     - bara de sus (DM Mono 11px uppercase, bordură jos `rule`, `padding: 10px 14px`): „Desen la scară · vedere din față” · `{cod}`
     - zona desenului: hârtie `.drafting`, raport `320 / 180`. În dreapta, o coloană de 40px pentru cota verticală (vezi 5.5).
     - `<figcaption>` (15px, `ink-2`, bordură sus `rule`): legenda configurației (5.6)
  2. **Fișa de configurare** (doar ≥ 960px; sub 960px se mută după pasul 06):
     - bara: „Fișă de configurare” · `{cod}`
     - rândurile (5.6), DM Mono 13px
     - blocul de preț (bordură sus dashed): „Preț orientativ” (15px, 600) · „{preț} lei” (DM Mono 20px, 500), iar dedesubt nota (DM Mono 11px, `muted`): „Calculat din grila atelierului: model × dimensiune + material + opționale. Prețul final se confirmă în scris.”
     - butoanele: „Cere ofertă pentru acest pat” (principal, `#cerere`) și „Trimite pe WhatsApp” (secundar, `wa.me` cu mesajul din 5.6)
- **Dreapta** (`flex: 1 1 400px`): 6 `fieldset`-uri, fiecare cu `padding: 28px 0` și bordură jos `rule`. `legend`: numărul în DM Mono 13px `accent` + titlul (19px, 600), `gap: 12px`.

| Pas | Titlu | Control |
|---|---|---|
| 01 | Model | 4 butoane-card (`aria-pressed`), grilă `minmax(min(150px,100%),1fr)`, `gap: 10px`. Fiecare: iconița tăbliei (64×40), numele (16px, 600) și nota (13px). Selectat: `border: 2px solid accent`, fundal alb. Neselectat: `1px rule`, fundal `card`. |
| 02 | Dimensiunea saltelei | „Pastile” (DM Mono 14px, `min-height: 44px`, `border: 1.5px ink`, rază 2px): „90 × 200” … „200 × 200”, „Altă dimensiune”. Selectată: fundal `ink`, text alb. „Altă dimensiune” deschide două `input[type=number]`: „Lățime saltea (cm)” (80–220) și „Lungime saltea (cm)” (180–220). |
| 03 | Material și culoare | Tab-uri de familie (15px, cea activă 600 cu sublinie `inset 0 -2px 0 accent`, `min-height: 44px`), filtrate după model (5.2). Dedesubt, mostrele 48×48 (`gap: 10px`). Apoi rândul „**{Familie}** · {Culoare} `[cod furnizor]`” și linkul „Vezi toate materialele” → `/materiale`. |
| 04 | Înălțimea tăbliei | Control segmentat (`border: 1.5px ink`) cu 3 butoane egale: „100 cm” / „120 cm” / „140 cm”. Selectat: fundal `ink`. Nota (14px `ink-2`): „Măsurată de la podea. Peste 120 cm arată bine în camere cu tavan înalt.” |
| 05 | Baza patului | 4 butoane-card ca la pasul 01, fără iconiță: titlu + notă. |
| 06 | Extra | 2 checkbox-uri tip card (`padding: 14px`, `border: 1px rule`, fundal `card`): titlu (16px, 600) + notă (13px). |

**07 — Trimite configurația** (`#cerere`, fundal `paper-2`, bordură sus, `padding: clamp(56px,7vw,96px)`). Două coloane cu wrap: textul (`flex: 1 1 320px`) și formularul (`flex: 2 1 520px`).
- H2: **Primești oferta finală după o discuție scurtă.**
- Lista numerotată (bordură sus, fiecare rând cu bordură jos, numărul mono `accent`):
  1. Te sunăm în [24 de ore] să clarificăm detaliile.
  2. Venim la măsurători sau confirmăm dimensiunile cu tine.
  3. Primești desenul final și prețul, în scris.
- Formularul:
  - caseta „Configurația atașată” · `{cod}` (fundal `paper`, `border: 1px dashed field`, DM Mono 13px)
  - grilă `minmax(min(220px,100%),1fr)`: Nume · Telefon · Email (obligatoriu) · Localitate
  - Detalii (opțional): textarea, 3 rânduri
  - ☐ Vreau să veniți la măsurători
  - ☐ Sunt de acord cu prelucrarea datelor conform Politicii de confidențialitate.
  - butonul „Trimite configurația”
- Confirmarea: eyebrow „Configurație trimisă · {cod}”, H3 „Mulțumim! Te sunăm în [24 de ore].”, textul „Am primit desenul și alegerile tale.” și butonul „Modifică configurația” (revine la formular cu aceeași configurație).

### 4.3 Materiale (`/materiale`)

**Antetul**: breadcrumb „Acasă / Materiale”, H1 **Materiale** și paragraful: **Tot ce vezi aici se poate alege în configurator. Apasă pe o mostră ca s-o vezi pe patul tău, sau vino să le vezi în atelier, [cu programare].**

**Corpul**: conținutul pe toată lățimea containerului, fără `aside` și fără cutie sticky: tab-urile, articolele de familie, blocul „Finisaje pentru lemn” și cardurile „Picioare și baze”. Pagina e o bibliotecă: nu are formular și nu reține nimic în browser.

- **Tab-uri** (bordură jos `1px ink`, 17px, `min-height: 48px`, cel activ 600 cu sublinie de 3px `accent`), fiecare cu un contor mono: „Textile 4 familii” · „Lemn masiv 5 esențe” · „Picioare și baze 3”.
- **Familia** (`article`, `padding-block: 32px`, bordură jos `rule`). Două coloane: info (`flex: 1 1 260px`) și grila de mostre (`flex: 2 1 420px`, `auto-fill, minmax(min(118px,100%),1fr)`, `gap: 16px 12px`).
  - info: H2 (26px), descrierea (16px, `ink-2`) și specificațiile ca `<dl>` mono 12px (`auto 1fr`, `gap: 6px 16px`).
  - grila: tile-urile-link de la 3.10 („În Materiale”). Fiecare mostră deschide `/configurator?f=<familie>&c=<culoare>` (cu `m=lamele` pentru Lemn masiv), iar sub ea stau numele culorii (14px, 600) și codul (DM Mono 12px, `muted`).

| Familie | Descriere | Specificații |
|---|---|---|
| Catifea | Moale, cu un luciu discret. Culorile arată intens și se schimbă ușor după cum cade lumina. | Compoziție [100% poliester] · Frecare [___] cicluri Martindale · Întreținere [aspirare, lavetă umedă] · Animale [potrivit / nepotrivit] |
| Bouclé | Fir buclat, cu textură vizibilă de aproape. Arată cel mai bine pe forme rotunjite, cum e modelul Arcuit. | Compoziție [___] · Frecare [___] cicluri Martindale · Întreținere [___] · Animale [nerecomandat: se agață ghearele] |
| Stofă | Țesătură densă și mată. Alegerea practică pentru un pat folosit intens, în fiecare zi. | Compoziție · Frecare · Întreținere · Animale (toate [___]) |
| Piele ecologică | Se șterge ușor cu o lavetă umedă. Aspect curat, de hotel, potrivit pentru tăblii cu canale. | Compoziție [___] · Grosime [___] mm · Întreținere [lavetă umedă, fără solvenți] · Animale [___] |
| Lemn masiv | Pentru modelul Lamele și pentru picioare. Lemn [uscat în cuptor], tăiat și finisat în atelier. | Esențe: stejar, nuc, frasin · Umiditate [sub 10%] · Finisaj: ulei, lac mat sau baiț · Proveniență [___] |

- **Tab-ul Lemn** are în plus blocul „Finisaje pentru lemn”, cu 3 carduri: **Ulei natural** (Mat, se simte lemnul la atingere. Se reîmprospătează [o dată pe an].), **Lac mat** (Protecție mai bună la pete și zgârieturi.), **Baiț + ulei** (Pentru nuanțe închise pe stejar sau frasin.).
- **Tab-ul Picioare și baze** are 3 carduri cu poză 4:3: **Picioare din lemn** (Stejar masiv, înălțime [12] cm, finisaj ca tăblia.), **Picioare metalice** (Oțel vopsit negru mat, înălțime [12] cm.), **Bază până la podea** (Pentru ladă de depozitare sau sertare, cu plintă retrasă.).

### 4.4 Lucrări (`/lucrari`) — propusă, nedesenată în canvas

- Antetul ca la Materiale: breadcrumb, H1 **Lucrări** și paragraful „Proiecte reale, fotografiate la clienți acasă, cu dimensiunile și materialele folosite.”
- Filtrul: pastilele de la pasul 02, pe modele: Toate · Capitonat · Arcuit · Canale · Lamele. Starea stă în URL (`?model=capitonat`).
- Grila: tile-urile de la 3.12. Click → lightbox (`<dialog>`) cu toate pozele proiectului, fișa proiectului (3.6) și CTA-ul „Vreau unul asemănător” → `/configurator?…` precompletat din configurația proiectului.

### 4.5 Contact (`/contact`)

Reia secțiunea 09 de pe Acasă, ca pagină separată (H1 în loc de H2), plus harta mare.

### 4.6 Paginile legale

Text simplu, `max-width: 720px`, H1 + H2 + paragrafe de 17px, liste. Conținutul îl dă atelierul (sau un jurist). Vezi ARHITECTURA.md, secțiunea GDPR.

### 4.7 404

H1 „Pagina nu există.”, un paragraf scurt și două butoane: „Acasă” / „Configurator”.

### 4.8 Admin (`/admin`)

Panoul atelierului (ARHITECTURA.md §8), construit în PR-7 … PR-9 din `docs/PLAN.md`. Nu e desenat în canvas și nu primește nimic nou: aceleași tokenuri (§2), aceleași roluri tipografice și aceleași componente (§3). Ce se adaugă e doar compunerea lor, în `src/components/admin/ui.tsx`:

- **Layout**: header lipicios ca §3.1 (logo cu numele atelierului, sub-logo „Admin”, linkurile Panou / Cereri / Setări / „Vezi site-ul” și butonul secundar „Ieși” la mărimea header), conținutul în `.container-site`, fără footer. Pagina de login e o singură fișă (§3.16 FormCard) centrată, max 420px.
- **Titluri**: H1 de ecran cu rolul `h2-request`, secțiuni cu `h3-card`, antete de tabel cu `eyebrow`, metadate cu `mono-13`.
- **Fișe**: cardul alb cu bordură 1.5px ink din §3.16; fișa cererii e `Ticket` (§3.6) la mărimea `md`.
- **Formulare**: exact §3.16 (Field, Label, Input, Select, Textarea, Checkbox, FieldError), câmpurile în grila `minmax(min(220px, 100%), 1fr)`; butonul primar „Salvează”, mesajele într-un `Notice` cu bordură 1px (accent pentru succes, `error` pentru eroare, `rule` pentru informare), anunțat prin `role="status"` / `role="alert"`.
- **Tabele**: `<table>` nativ, 15px, rânduri despărțite cu 1px `rule`, derulare orizontală pe mobil. Statusul cererii e o etichetă mono 12px uppercase cu bordură 1px: `nou` în accent, `câștigat` pe fundal accent, `pierdut` și `spam` în `muted`.
- **Catalog și prețuri** (PR-8): în tabelele de materiale culoarea e un pătrat de 28px cu poza sau cu hex-ul; codurile (`CT01`, `CAP`) și stările („Activ” / „Inactiv”, „Acasă”) sunt aceleași etichete mono. Poza se încarcă dintr-un câmp cu previzualizare (pătrat pentru mostre, 4:3 pentru baze) peste `FileInput` din §3.16. Grila de prețuri e un `<table>` cu un rând pe model și o coloană pe lățime standard, fiecare celulă un `Input`; previzualizarea celor trei configurații tipice folosește aceleași funcții pure ca site-ul (§5.7).
- **Lucrări și recenzii** (PR-9): aceleași tabele și formulare; pozele unui proiect sunt o listă cu miniatura 4:3, textul alternativ, ordinea și bifa „Șterge”, plus câmpul de încărcare pentru o poză nouă; prima poză din ordine e cea de pe tile (§3.12) și din hero (§4.1). Etichetele de stare sunt „Publicat” / „Nepublicat”, „Acasă”, „Hero”, „Fără acord”. Poza atelierului (FOTO 08) se încarcă din Setări, grupul „Atelier”, prin același câmp.
- Textele sunt ale atelierului, scurte, cu diacritice cu virgulă; nicio cifră care nu vine din baza de date. `/admin` e `noindex` și, din PR-10, blocat în `robots.txt`.

---

## 5. Configuratorul: date, reguli, geometrie

Logica stă într-un modul pur, `lib/configurator/`, folosit și de client (UI, desen), și de server (validare, recalculare cod/preț, email, PNG). Codul de mai jos e scris în TypeScript și e gata de pus în proiect. Catalogul e un seed: în producție vine din Supabase (ARHITECTURA.md §5), cu aceleași câmpuri.

### 5.1 Tipuri și catalog

```ts
// lib/configurator/types.ts
export type ModelId = 'capitonat' | 'arcuit' | 'canale' | 'lamele';
export type FamilyId = 'catifea' | 'boucle' | 'stofa' | 'piele' | 'lemn';
export type BaseId = 'lemn' | 'metal' | 'lada' | 'sertare';
export type SizeKey = '90' | '120' | '140' | '160' | '180' | '200' | 'custom';
export type HeadboardHeight = 100 | 120 | 140;

export interface Model { id: ModelId; name: string; note: string; code: string; families: FamilyId[] }
export interface Color { id: string; name: string; hex: string; code: string } // code stabil (ex. CT01), nu indexul
export interface Family { id: FamilyId; name: string; code: string; colors: Color[] }
export interface Base { id: BaseId; name: string; note: string; code: string }

export interface Config {
  model: ModelId;
  size: SizeKey;
  customW: number; // cm, folosit doar când size = 'custom'
  customL: number;
  family: FamilyId;
  color: string;   // Color.id
  hb: HeadboardHeight;
  base: BaseId;
  led: boolean;
  nightstands: boolean;
}

export interface Catalog { models: Model[]; families: Family[]; bases: Base[] }
```

```ts
// lib/configurator/catalog.seed.ts — seed; în producție se citește din Supabase
import type { Catalog, Config } from './types';

const TEXTILE = ['catifea', 'boucle', 'stofa', 'piele'] as const;

export const SEED_CATALOG: Catalog = {
  models: [
    { id: 'capitonat', name: 'Capitonat', note: 'Tapițat, cu nasturi', code: 'CAP', families: [...TEXTILE] },
    { id: 'arcuit', name: 'Arcuit', note: 'Linie curbă, bordură', code: 'ARC', families: [...TEXTILE] },
    { id: 'canale', name: 'Canale', note: 'Cusături verticale', code: 'CAN', families: [...TEXTILE] },
    { id: 'lamele', name: 'Lamele', note: 'Lemn masiv', code: 'LAM', families: ['lemn'] },
  ],
  families: [
    { id: 'catifea', name: 'Catifea', code: 'CT', colors: [
      { id: 'ct-verde', name: 'Verde sticlă', hex: '#2F4B3C', code: 'CT01' },
      { id: 'ct-bleumarin', name: 'Bleumarin', hex: '#1F2A44', code: 'CT02' },
      { id: 'ct-mustar', name: 'Muștar', hex: '#B98A2E', code: 'CT03' },
      { id: 'ct-roz', name: 'Roz pudrat', hex: '#C99A93', code: 'CT04' },
      { id: 'ct-antracit', name: 'Antracit', hex: '#3B3D41', code: 'CT05' },
      { id: 'ct-caramiziu', name: 'Cărămiziu', hex: '#9A4E3A', code: 'CT06' },
    ] },
    { id: 'boucle', name: 'Bouclé', code: 'BC', colors: [
      { id: 'bc-alb', name: 'Alb lapte', hex: '#E7E2D8', code: 'BC01' },
      { id: 'bc-nisip', name: 'Nisip', hex: '#CDBFA6', code: 'BC02' },
      { id: 'bc-perla', name: 'Gri perlă', hex: '#BDBAB4', code: 'BC03' },
      { id: 'bc-taupe', name: 'Taupe', hex: '#8E8174', code: 'BC04' },
    ] },
    { id: 'stofa', name: 'Stofă', code: 'SF', colors: [
      { id: 'sf-gri', name: 'Gri deschis', hex: '#B9BCBF', code: 'SF01' },
      { id: 'sf-melanj', name: 'Gri melanj', hex: '#7B7E83', code: 'SF02' },
      { id: 'sf-denim', name: 'Albastru denim', hex: '#4A5F7A', code: 'SF03' },
      { id: 'sf-salvie', name: 'Verde salvie', hex: '#8F9E89', code: 'SF04' },
      { id: 'sf-bej', name: 'Bej', hex: '#CBB99B', code: 'SF05' },
    ] },
    { id: 'piele', name: 'Piele ecologică', code: 'PE', colors: [
      { id: 'pe-coniac', name: 'Coniac', hex: '#8A5A35', code: 'PE01' },
      { id: 'pe-ciocolata', name: 'Ciocolată', hex: '#4A3328', code: 'PE02' },
      { id: 'pe-negru', name: 'Negru', hex: '#232323', code: 'PE03' },
      { id: 'pe-alb', name: 'Alb', hex: '#E9E6E0', code: 'PE04' },
    ] },
    { id: 'lemn', name: 'Lemn masiv', code: 'LM', colors: [
      { id: 'lm-stejar', name: 'Stejar natur', hex: '#C9A574', code: 'LM01' },
      { id: 'lm-afumat', name: 'Stejar afumat', hex: '#7A5A3C', code: 'LM02' },
      { id: 'lm-nuc', name: 'Nuc', hex: '#5C3F2C', code: 'LM03' },
      { id: 'lm-frasin', name: 'Frasin', hex: '#D8C3A0', code: 'LM04' },
      { id: 'lm-negru', name: 'Negru mat', hex: '#262626', code: 'LM05' },
    ] },
  ],
  bases: [
    { id: 'lemn', name: 'Picioare din lemn', note: 'Stejar, [12] cm', code: 'PL' },
    { id: 'metal', name: 'Picioare metalice', note: 'Negru mat, [12] cm', code: 'PM' },
    { id: 'lada', name: 'Ladă de depozitare', note: 'Somieră rabatabilă', code: 'LD' },
    { id: 'sertare', name: 'Sertare', note: '2 sertare pe lateral', code: 'SR' },
  ],
};

export const SIZES = ['90', '120', '140', '160', '180', '200'] as const; // × 200 cm
export const HEIGHTS = [100, 120, 140] as const;
export const CUSTOM_W = { min: 80, max: 220 } as const;
export const CUSTOM_L = { min: 180, max: 220 } as const;

export const DEFAULT_CONFIG: Config = {
  model: 'capitonat', size: '160', customW: 150, customL: 200,
  family: 'catifea', color: 'ct-verde', hb: 120, base: 'lemn',
  led: false, nightstands: false,
};
```

### 5.2 Reguli

```ts
// lib/configurator/rules.ts
import type { Catalog, Config, Family, Color, Model, Base } from './types';
import { CUSTOM_W, CUSTOM_L } from './catalog.seed';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const SIZE_KEYS = ['90', '120', '140', '160', '180', '200', 'custom'] as const;

export interface Resolved {
  cfg: Config; model: Model; family: Family; color: Color; base: Base;
  w: number; l: number; // dimensiunea saltelei, cm
}

/** Aplică regulile și întoarce o configurație validă (aceeași funcție rulează și pe server). */
export function resolve(input: Config, cat: Catalog): Resolved {
  const model = cat.models.find(m => m.id === input.model) ?? cat.models[0];
  const familyId = model.families.includes(input.family) ? input.family : model.families[0];
  const family = cat.families.find(f => f.id === familyId)!;
  const color = family.colors.find(c => c.id === input.color) ?? family.colors[0];
  const base = cat.bases.find(b => b.id === input.base) ?? cat.bases[0];
  const size = SIZE_KEYS.includes(input.size) ? input.size : '160';
  const custom = size === 'custom';
  const w = custom ? clamp(Math.round(input.customW) || 150, CUSTOM_W.min, CUSTOM_W.max) : Number(size);
  const l = custom ? clamp(Math.round(input.customL) || 200, CUSTOM_L.min, CUSTOM_L.max) : 200;
  const hb = ([100, 120, 140] as const).includes(input.hb) ? input.hb : 120;
  return {
    cfg: { ...input, size, model: model.id, family: family.id, color: color.id, base: base.id, hb },
    model, family, color, base, w, l,
  };
}
```

- **Lamele** acceptă doar `lemn`. Celelalte modele acceptă doar textile. Când schimbi modelul, familia și culoarea se resetează la prima disponibilă dacă nu se potrivesc.
- La schimbarea familiei, culoarea devine prima din familie.
- Lista de familii din pasul 03 e `model.families`.
- Regulile noi (de ex. „bouclé nu se face capitonat”) se adaugă în `model.families` sau într-o tabelă de excluderi (ARHITECTURA.md §5).

### 5.3 Starea în URL

Configurația stă în query string, ca să poată fi trimisă pe WhatsApp și reluată exact:

| Parametru | Valori | Exemplu |
|---|---|---|
| `m` | model id | `capitonat` |
| `s` | `90…200` sau `custom` | `160` |
| `w`, `l` | cm (doar la `custom`) | `150`, `200` |
| `f` | family id | `catifea` |
| `c` | color id | `ct-verde` |
| `h` | `100/120/140` | `120` |
| `b` | base id | `lada` |
| `led`, `n` | `1` dacă e bifat | `1` |

`/configurator?m=capitonat&s=160&f=catifea&c=ct-verde&h=120&b=lada&led=1`. Actualizarea se face cu `router.replace` (fără intrări noi în istoric), iar parametrii invalizi se normalizează prin `resolve()`.

### 5.4 Geometria desenului (vedere din față, la scară)

Unitatea e **centimetrul**. Lumea are 320 × 180 cm, cu podeaua la y = 24 (y crește în sus, de la baza lumii). Dacă patul cu noptiere nu încape, lumea se lățește.

```ts
// lib/configurator/geometry.ts
import type { Resolved } from './rules';

export interface Rect { x: number; y: number; w: number; h: number } // y = marginea de jos, măsurată în sus

export interface BedDrawing {
  world: { w: number; h: number; floor: number };
  headboard: Rect;
  frame: Rect;
  mattress: Rect;
  pillows: Rect[];
  legs: Rect[];          // gol dacă baza merge până la podea
  plinth?: Rect;         // plinta retrasă (ladă / sertare)
  hidden: Rect[];        // linii ascunse, întrerupte: ladă sau sertare
  led?: Rect;
  nightstands: { box: Rect; legs: Rect[] }[];
  dimWidth: { x1: number; x2: number; label: string };
  dimHeight: { y1: number; y2: number; label: string };
}

export function bedGeometry(r: Resolved): BedDrawing {
  const H = 180, FLOOR = 24;
  const { w } = r;
  const { hb, led, nightstands } = r.cfg;
  const fw = w + 10;                        // cadrul: saltea + 5 cm pe fiecare parte
  const hbw = fw + 4;                       // tăblia: cu 2 cm mai lată pe fiecare parte
  const W = Math.max(320, hbw + (nightstands ? 2 * (4 + 44) : 0) + 16);
  const CX = W / 2;
  const onLegs = r.base.id === 'lemn' || r.base.id === 'metal';
  const frameBottom = onLegs ? FLOOR + 12 : FLOOR + 2;
  const frameTop = FLOOR + 36;

  const legs: Rect[] = [];
  if (onLegs) {
    const lw = r.base.id === 'metal' ? 3.5 : 5;
    legs.push({ x: CX - fw / 2 + 7, y: FLOOR, w: lw, h: 12 });
    legs.push({ x: CX + fw / 2 - 7 - lw, y: FLOOR, w: lw, h: 12 });
  }

  const hidden: Rect[] = [];
  const inner = frameTop - frameBottom;
  if (r.base.id === 'lada') hidden.push({ x: CX - fw / 2 + 5, y: frameBottom + 4, w: fw - 10, h: inner - 8 });
  if (r.base.id === 'sertare') {
    const dw = (fw - 16) / 2;
    hidden.push({ x: CX - fw / 2 + 5, y: frameBottom + 5, w: dw, h: inner - 10 });
    hidden.push({ x: CX + 3, y: frameBottom + 5, w: dw, h: inner - 10 });
  }

  const pillows: Rect[] = [];
  const pillowY = frameTop + 18;            // pe saltea
  if (w >= 140) {
    const pw = (w - 16) / 2;
    pillows.push({ x: CX - 2 - pw, y: pillowY, w: pw, h: 16 }, { x: CX + 2, y: pillowY, w: pw, h: 16 });
  } else {
    const pw = Math.min(w - 20, 70);
    pillows.push({ x: CX - pw / 2, y: pillowY, w: pw, h: 16 });
  }

  const stands = nightstands
    ? [CX - hbw / 2 - 4 - 44, CX + hbw / 2 + 4].map(sx => ({
        box: { x: sx, y: FLOOR + 8, w: 44, h: 38 },
        legs: [{ x: sx + 4, y: FLOOR, w: 3, h: 8 }, { x: sx + 37, y: FLOOR, w: 3, h: 8 }],
      }))
    : [];

  return {
    world: { w: W, h: H, floor: FLOOR },
    headboard: { x: CX - hbw / 2, y: FLOOR, w: hbw, h: hb },
    frame: { x: CX - fw / 2, y: frameBottom, w: fw, h: inner },
    mattress: { x: CX - w / 2, y: frameTop, w, h: 18 },
    pillows,
    legs,
    plinth: onLegs ? undefined : { x: CX - fw / 2 + 4, y: FLOOR, w: fw - 8, h: 2 },
    hidden,
    led: led ? { x: CX - fw / 2 + 10, y: onLegs ? FLOOR + 10 : FLOOR + 0.6, w: fw - 20, h: 1.2 } : undefined,
    nightstands: stands,
    dimWidth: { x1: CX - w / 2, x2: CX + w / 2, label: `${w} cm` },
    dimHeight: { y1: FLOOR, y2: FLOOR + hb, label: `${hb} cm` },
  };
}

/** Conversia din coordonatele lumii (y în sus) în SVG (y în jos). */
export const svgY = (rect: Rect, worldH: number) => worldH - rect.y - rect.h;
```

### 5.5 Randarea (SVG + etichete HTML)

- `<svg viewBox="0 0 {W} 180" preserveAspectRatio="xMidYMid meet">` într-un container cu `aspect-ratio: W / 180` și fundalul `.drafting`. Toate contururile: `stroke="#18191B" stroke-width="1.5" vector-effect="non-scaling-stroke"`.
- **Ordinea desenării**: podea (linie pe toată lățimea, la `floor`) → noptiere → tăblie → picioare → plintă → LED → cadru → linii ascunse → saltea → perne.
- **Umpluturi**:
  - tăblie, cadru, noptiere: `color.hex`, plus o suprapunere cu modelul tăbliei și textura familiei (vezi mai jos)
  - picioare din lemn `#B48A5A` (cu fibra lemnului), picioare metalice și picioarele noptierelor `#26282B`
  - plinta: `#18191B`
  - salteaua: `#FBFBF9`, cu o linie de cusătură subțire `rgba(24,25,27,.25)` la ~1,5 cm deasupra bazei
  - pernele: `#FFFFFF`, `rx = 4`
  - liniile ascunse: fără umplere, `stroke-dasharray="4 3"`, `rgba(24,25,27,.7)`
  - LED: `#FFC46B`, plus `filter` gaussian blur (σ ≈ 3) sub el, ca glow `rgba(255,176,72,.55)`
  - noptiera: o linie de sertar la mijlocul înălțimii
- **Modelele de tăblie** (SVG `pattern`, `patternUnits="userSpaceOnUse"`, în cm):
  - Capitonat: celulă 10×10 cu nasturi `r=0.75` la (2.5, 2.5) și (7.5, 7.5), `fill rgba(0,0,0,.42)`. Colțuri sus `rx = 3`.
  - Canale: celulă 10×10 cu o linie verticală de 0,7 cm la x = 9.3, `rgba(0,0,0,.30)`. Colțuri sus `rx = 8`.
  - Lamele: celulă 7×10 cu un rost de 0,9 cm la x = 6.1, `rgba(0,0,0,.45)`. Colțuri drepte.
  - Arcuit: `path` cu un singur arc eliptic de la stânga la dreapta (`rx = w/2`, `ry = 0.58·h`), cu laturile drepte până la podea, plus o cusătură interioară (același contur, decalat ~3,5 cm, `stroke rgba(0,0,0,.32)`, 1px).
- **Texturile de familie în desen** (discrete): catifea și piele primesc un `linearGradient` de 160° de la `rgba(255,255,255,.10)` la `rgba(0,0,0,.16)`; lemnul primește linii de fibră (pattern 2 cm, `rgba(60,35,10,.16)`); bouclé și stofă rămân plate.
- **Cotele și scara** sunt HTML suprapus peste SVG, poziționat în procente din lume, ca textul să rămână de 12px la orice lățime:
  - cota de lățime: de la `dimWidth.x1` la `x2`, jos (`bottom: 2.2%`), înaltă de 14px, cu eticheta „{w} cm” pe fundalul `#FAFAF8`
  - cota de înălțime: în coloana de 40px din dreapta desenului, de la `floor` la `floor + hb` (`bottom` = `floor/180`, `height` = `hb/180`), cu eticheta verticală „{hb} cm”
  - scara: o bară de 50 cm (`left: 1.5%`, `bottom: 3.2%`, 6px înălțime, jumătate plină), cu eticheta „0 — 50 cm” (DM Mono 10px)
- Desenul e decorativ pentru cititoarele de ecran (`aria-hidden`). Informația e în `<figcaption>` și în fișă.
- **PNG pentru email**: același SVG serializat pe server și randat cu `@resvg/resvg-js`, la 1600px lățime (vezi ARHITECTURA.md §6).

### 5.6 Cod, legendă, fișă, mesaj WhatsApp

```ts
// lib/configurator/format.ts
import type { Resolved } from './rules';

export function configCode(r: Resolved): string {
  const { led, nightstands, hb } = r.cfg;
  return `${r.model.code}-${r.w}x${r.l}-${r.color.code}-H${hb}-${r.base.code}` +
    (led ? '-LED' : '') + (nightstands ? '-N2' : '');
} // ex.: CAP-160x200-CT01-H120-LD-LED

export function sizeLabel(r: Resolved) { return `${r.w} × ${r.l} cm`; }

export function caption(r: Resolved): string {
  return `${r.model.name} · ${r.family.name.toLowerCase()}, ${r.color.name.toLowerCase()} · ` +
    `${sizeLabel(r)} · tăblie ${r.cfg.hb} cm · ${r.base.name.toLowerCase()}`;
}

export function ticketRows(r: Resolved): { k: string; v: string }[] {
  const extras = [r.cfg.led && 'LED sub pat', r.cfg.nightstands && '2 noptiere'].filter(Boolean) as string[];
  return [
    { k: 'Model', v: r.model.name },
    { k: 'Saltea', v: sizeLabel(r) },
    { k: 'Material', v: `${r.family.name}, ${r.color.name.toLowerCase()}` },
    { k: 'Tăblie', v: `${r.cfg.hb} cm de la podea` },
    { k: 'Bază', v: r.base.name },
    { k: 'Extra', v: extras.length ? extras.join(', ') : '—' },
  ];
}

export function whatsappText(r: Resolved, shareUrl: string): string {
  const rows = ticketRows(r).map(x => `${x.k}: ${x.v}`).join('; ');
  return `Bună ziua! Aș vrea o ofertă pentru patul configurat pe site (${configCode(r)}): ${rows}. ${shareUrl}`;
}
```

Linkul WhatsApp: `https://wa.me/<număr în format internațional, fără +>?text=${encodeURIComponent(whatsappText(r, url))}`.

### 5.7 Prețul

- În fișă: „Preț orientativ: {X} lei”, rotunjit la 50 lei și formatat cu `Intl.NumberFormat('ro-RO')`. Formula și grila sunt în ARHITECTURA.md §7.
- `settings.show_prices = false` ascunde prețul din fișă și de pe cardurile de model. Nota rămâne: „Prețul final îl confirmăm în scris, după o discuție scurtă.”
- Prețul se recalculează pe server la trimitere. Cel trimis de client nu e folosit niciodată.

### 5.8 Comportamentul pe mobil (< 960px)

- Ordinea: antetul paginii → desenul → pașii 01–06 → fișa → formularul de cerere.
- Recomandat (nu era în prototip): o bară fixă jos, care apare după ce desenul iese din ecran, cu miniatura desenului (48px), codul, prețul și butonul „Cere ofertă” (spre `#cerere`). Așa clientul vede efectul alegerilor fără să urce înapoi. Bara are `padding-bottom: env(safe-area-inset-bottom)`.

---

## 6. Rezumat responsive

| Element | ≥ 960px | < 960px |
|---|---|---|
| Header | logo + 6 linkuri + telefon + CTA | logo + „Meniu” (overlay pe 52px/rând) |
| Hero | 2 coloane (text 1.2 : poză 1) | o coloană: text, apoi poză |
| Repere | 4 coloane | 1 coloană (2 de la ~500px) |
| Proces | 4 coloane | 1 coloană |
| Modele | 4 coloane | 2 coloane |
| Mostre (Acasă) | 8 pe un rând | 3 pe rând |
| Lucrări | 3 coloane | 1 coloană |
| Atelierul, Întrebări, Contact | 2 coloane | o coloană |
| Configurator | desen + fișă sticky în stânga, pașii în dreapta | desen, pașii, fișa, cererea + bară fixă |
| Materiale | conținut pe toată lățimea | o coloană |

Grilele se fac cu `auto-fit/auto-fill + minmax(min(Xpx,100%),1fr)`. Valorile minime: repere 220, proces 240, modele 160, mostre 100, lucrări 300, recenzii 280, opțiuni din configurator 150, mostre din Materiale 118, câmpurile cererii 220.

## 7. Accesibilitate (obligatoriu)

- Contrastul e verificat în tabelul de culori. Nu folosi text `muted` sub 12px.
- Fiecare opțiune selectabilă e un `<button aria-pressed>` sau un `<input type="radio">` într-un `<fieldset>` cu `<legend>`. Checkbox-urile sunt `<input type="checkbox">` reale.
- Fiecare câmp are `<label for>`. Erorile se leagă prin `aria-describedby`.
- Meniul mobil: `aria-expanded`, `aria-controls`, Escape îl închide, iar focusul revine pe buton.
- Desenul are `aria-hidden="true"`. Rezumatul configurației e și în `figcaption`, și în fișă (`aria-live="polite"` pe cod).
- Linkurile de ancoră au `scroll-margin-top: 88px` (headerul e sticky).
- Ținte de minimum 44px, focus vizibil (2.6), `lang="ro"`.

## 8. Placeholdere și lista de poze

**Toate placeholderele** (vin din `settings` sau din tabele): [Nume atelier], [Localitate], [cu programare] (`visits_note`), [07xx xxx xxx], [contact@domeniu.ro], [Strada, nr., Localitate], [Luni–Vineri, 9:00–18:00], [24 de ore], [4–6] săptămâni, [X] ani garanție structură / [Y] tapițerie, [Zona de livrare], [gratuit în Localitate] (măsurători), [X] zile lucrătoare (ofertă), [inclus în zona X] (montaj), [anul], [X] oameni, structură / somieră / burete / stofe, avans [X]%, interval de dimensiuni nestandard, saltele da/nu, rating Google, [Denumire firmă SRL], CUI, Nr. Reg. Com., înălțimea picioarelor [12] cm, [cod furnizor] pe fiecare material.

**Lista de poze** (cadrele din design):

| Cod | Cadru | Unde apare |
|---|---|---|
| FOTO 01 | Pat finalizat, în dormitorul unui client. Lumină naturală, cadru orizontal, fără blitz. | Hero (5:4) |
| FOTO 02, 03, 06 | Paturi întregi, în cameră, din față sau din 3/4 | Lucrări (4:3) |
| FOTO 04 | Detaliu de tăblie: cusături, nasturi, colțuri | Lucrări |
| FOTO 05 | Pat cu ladă, cu somiera ridicată | Lucrări |
| FOTO 07 | Proiect atipic: mansardă, nișă, pat de copil | Lucrări |
| FOTO 08 | Oamenii din atelier, la lucru: tapițare, capitonare, montajul structurii | Atelierul (4:5) |
| Picioare | Picior din stejar, picior metalic, bază cu ladă | Materiale › Picioare și baze (4:3) |
| Mostre | Fiecare culoare, de sus, la lumină de zi, cu card gri în primul cadru | Materiale, Acasă, configurator (1:1) |

**Alte resurse**: logo vectorial (SVG), favicon + `apple-touch-icon` generate din logo, imaginea Open Graph de 1200×630 (desenul capitonat pe hârtie, cu numele atelierului).
