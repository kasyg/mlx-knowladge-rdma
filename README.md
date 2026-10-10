# VetAtlas 3D

Interaktivní 3D anatomický atlas zvířat pro studenty veterinární medicíny – kůň, skot, koza, pes a kočka.
Web aplikace funguje na mobilu, tabletu i počítači (responzivní UI, dotykové ovládání, haptická odezva).

## Co aplikace umí

- **Výběr zvířete** na úvodní scéně: klepnutím se model otočí o 360°, načtou se jeho anatomická data a otevře se atlas.
- **Oblasti těla** (hlava, tlama, krk, hrudník, břicho, hřbet, pánev, obě hrudní a obě pánevní končetiny, ocas) – klepnutím na bod v modelu
  nebo na čip v panelu kamera plynule přiletí a zaostří na oblast.
- **Vrstvy** (kůže → svaly → šlachy a vazy → chrupavky → kosti) se odkrývají **kolečkem myši nebo lištou hloubky** (dotykem).
  Kůže se „rozpouští“ shora dolů, pod ní se objeví svalstvo, pak šlachy, nakonec kostra. Každou vrstvu lze i ručně připnout / vypnout
  (např. šlachy spolu s kostmi).
- **Orgánové soustavy**: cévní (tlukot srdce, proudění krve v tepnách a žilách), dýchací (dýchací pohyby plic a bránice, proud vzduchu),
  trávicí (posun potravy jícnem, žaludkem/předžaludky a střevem), nervová a močová.
- **Pohyb končetiny**: v oblasti končetiny lze spustit krokový cyklus – svaly se zkracují/prodlužují, šlachy se napínají ve fázi opory,
  aktivní svaly jsou zvýrazněny a vypsány.
- **Popisky v bublinách** s vodicími čarami (latinsky / česky / anglicky, přepínatelné), dvousloupcové akademické rozložení.
- **Detail struktury**: popis, začátek, úpon, funkce, druhové zvláštnosti, související struktury, vlastní poznámky (ukládané na server),
  označení „umím“.
- **Vyhledávání** ve všech názvech (la/cs/en).
- **Procvičování**: aplikace zvýrazní strukturu v modelu a student vybírá její název ze čtyř možností; správné odpovědi se ukládají jako „naučené“.
- **Dvojklik** vrátí kameru na vybranou oblast, **trojklik** navíc obnoví výchozí natočení pohledu.
- Nastavení: jazyk rozhraní (CZ/EN), jazyk popisků, velikost popisků, světlý/tmavý vzhled, haptika, omezení animací, rychlost animací.

Dataset obsahuje ~200 struktur na druh (970 celkem) s latinskými, českými a anglickými názvy, popisy a u svalů začátek/úpon/funkce,
včetně druhových rozdílů (např. kůň nemá žlučník, přežvýkavci mají bachor/čepec/knihu/slez, kočka nemá šíjový vaz, vzdušný vak koně…).

## Architektura

```
client/   React 19 + TypeScript + Vite + three.js (react-three-fiber, drei, camera-controls, zustand)
server/   Node 22 + Express 5 + SQLite (vestavěný node:sqlite) – REST API, poznámky, nastavení, pokrok, kvíz
shared/   typy, i18n, anatomický katalog, parametry druhů a „rig“ (výpočet anatomických bodů)
tests/    vitest testy datasetu + Playwright průchod aplikací (desktop / iPad / iPhone) se screenshoty
docs/     screenshoty z ověření
```

### Procedurální 3D modely

Žádné externí modely se nestahují – každé zvíře je generováno v prohlížeči z parametrického **rigu** (`shared/src/species.ts`,
`shared/src/rig.ts`): poloha kloubů, obratlů, žeber, lebky atd. v metrech. Z něj se staví:

- kůže (loft trupu, krku a hlavy, končetiny, uši, ocas, hříva, rohy, vemeno, oči, nozdry, kopyta/paznehty/tlapky) s procedurální srstí
  (hnědák s černými odznaky, holštýnské skvrny, mourovaté pruhy…),
- kostra (lebka, dolní čelist, zuby, obratle s trny a příčnými výběžky, žebra, hrudní kost, lopatka, pánev, dlouhé kosti, zápěstní/zánártní
  kůstky, záprstí dle druhu – jedna holenní kost + bodcové kosti / srostlá kost paznehtníků / 5 záprstních kostí, články prstů, sezamské kosti),
- svaly: u koně jako **svalové pláty** (`shared/src/anatomy/sheets_horse.ts`) – Coonsovy plochy definované v souřadnicích
  parametrického povrchu těla (`client/src/three/surface.ts`), vytlačené dovnitř s klenutou tloušťkou, rýhami na okrajích a texturou
  vláken; kůže i pláty vycházejí ze stejného povrchu, takže na sebe přesně navazují (povrchové svaly dle écorché: m. trapezius,
  latissimus dorsi, serratus ventralis, obliquus externus, gluteální svaly, triceps, extenzory a flexory předloktí, biceps femoris,
  semitendinosus, gastrocnemius, žvýkací a mimické svaly…). U ostatních druhů zatím vřetenovité „sweep“ geometrie mezi začátkem
  a úponem. Dále šlachy (zploštělé šlachy ohýbačů a mezikostního vazu), vazy, cévy (hladké křivky přes klouby), nervy, orgány.
- vrstvy se navzájem zakrývají: neporušená kůže skryje vše pod sebou, neporušená svalová vrstva skryje osovou kostru, pletence,
  proximální dlouhé kosti, zuby a kloubní chrupavky (příznak `covered` ve `shared/src/anatomy/skeleton.ts`).

Všechny „měkké“ struktury jsou definovány přes anatomické body (`shared/src/anatomy/*.ts`), takže se při animaci pohybu končetiny
přepočítávají v reálném čase. Nahradit procedurální model skenovaným GLB modelem lze na úrovni `client/src/three/builders.ts`
(speciální builder `skin` apod.) – datová vrstva zůstává stejná.

## Spuštění

Požadavky: Node.js ≥ 22.18 (bez dalších nativních závislostí – SQLite je součástí Node).

```bash
npm install
npm run dev          # API na :8787 + Vite dev server na :5173 (proxy /api)
```

Produkce:

```bash
npm run build        # sestaví klienta do client/dist
npm start            # server na http://localhost:8787 (servíruje i klienta)
```

Docker:

```bash
docker build -t vetatlas .
docker run -p 8787:8787 -v vetatlas-data:/data vetatlas
```

Proměnné prostředí: `PORT` (8787), `VETATLAS_DB` (cesta k SQLite souboru), `CLIENT_DIST`.

## API

| Metoda | Cesta | Popis |
| --- | --- | --- |
| GET | `/api/health` | stav serveru |
| GET | `/api/species` | seznam druhů (metadata) |
| GET | `/api/species/:id` | kompletní data druhu (rig, oblasti, struktury) |
| GET | `/api/species/:id/structures/:sid` | jedna struktura |
| GET | `/api/search?species=horse&q=hum` | fulltext v názvech |
| GET/POST/PUT/DELETE | `/api/notes` | poznámky uživatele (`deviceId`) |
| GET/PUT | `/api/settings/:deviceId` | nastavení |
| GET/POST | `/api/progress/:deviceId`, `/api/progress` | naučené struktury |
| GET | `/api/quiz?species=horse&n=10&group=muscles` | otázky k procvičování |

## Ovládání

| | Myš | Dotyk |
| --- | --- | --- |
| otáčení | tažení levým tlačítkem | jeden prst |
| posun | tažení pravým tlačítkem | dva prsty |
| přiblížení | Ctrl + kolečko / tlačítka | roztažení prstů |
| odkrývání vrstev | kolečko myši | lišta hloubky vpravo |
| návrat na oblast | dvojklik | dvojité klepnutí |
| návrat + výchozí natočení | trojklik | trojité klepnutí |

Klávesy: `Esc` zpět, `1–5` vrstvy, `Q W E R T` soustavy, `↑/↓` hloubka, mezerník animace, `L` popisky, `H` výchozí pohled.

## Testy a ověření

```bash
npm test             # vitest – integrita datasetu (každý recept odkazuje na existující anatomický bod, úplné názvy/popisy…)
npm run typecheck
npm run verify:all   # build + Playwright průchod (desktop, iPad, iPhone): animace, přechody, vrstvy, popisky, poznámky, screenshoty do docs/screenshots
```
