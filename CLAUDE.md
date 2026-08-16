# Kodulinna Maja

Maja sisemine veebileht: vestlus, üritused, üldinfo, failid, müük, töögraafik
ja kontaktid. Raamistikku ei ole ja seda ei tooda ka juurde — siin ei ole
midagi, mille jaoks teda vaja oleks.

## Keel

**Kõik on eesti keeles**: liides, kood, muutujate nimed, kommentaarid,
commit'ide tekstid ja vastused kasutajale. Ingliskeelset nime ei teki isegi
sisemisele abifunktsioonile.

## Kellele see tehtud on

Sihtrühm on **vanemad inimesed, kes halvasti näevad**. Sellest tuleneb kõik
ülejäänu ja see ei ole maitseküsimus:

- Suur kiri, suured nupud, iga tegevus omas sõnades lahti seletatud.
- **Ainult arvutile.** Mobiilivaadet ei tehta.
- Kõikidel liikmetel on **võrdsed õigused** — üks erand on administraator,
  kes näeb kogu maja kassat.
- Rakenduse nimi on ekraanil fikseeritud „Kodulinna Maja", selle all on
  sisseloginu nimi.
- Kontaktid on külgribal **viimane**.

## Kaks teemat

`hele` (sinine taust, valged kaardid) ja `tume` (soe must, oranž aktsent).
Iga ekraani puudutav muudatus peab töötama mõlemas.

Värviõppetund, mis on kallilt makstud: tumedal taustal **neoon ärritab ja
pastell näib udune**. Töötab keskmine küllastus ühtlase heledusega. Roheline
ja türkiis paistavad seal alati eredamad kui sama heledusega sinine või
violett — arvesta sellega, ära lisa neid samas tugevuses.

## Kuidas kontrollida

Kolm asja, kolm eri otstarvet. Ainult esimesest **ei piisa**.

```
npm test                  kõik testid: andmed, õigused, marsruudid
node tools/ekraan.js      ekraanipilt igast vaatest × mõlemad teemad
node tools/axe.js         ligipääsetavus ja kontrast, axe-core
```

`npm test` vaatab andmeid ja õigusi, aga **paigutust ta ei näe**.
Nimekonflikti ja ekraanilt kadunud välja leidis omal ajal ainult
ekraanipilt — kumbki test ei öelnud midagi. Seega: **kui muutsid midagi,
mis ekraanile paistab, tee pilt ja vaata seda päriselt.**

Kitsamalt: `node tools/ekraan.js myyk tume`, `node tools/axe.js tume`.

Pildid lähevad `pildid/` kausta ja on `.gitignore`-is — vt allpool, miks.

## Õigused käivad serveris

Kes mida näeb ja muudab, otsustatakse **serveris**, mitte ekraanil.
Prototüübis oli see ainult kokkulepe, millest sai mööda minna nime
vahetades. Sama kehtib andmete kuju kohta: `pilt.js` kontrollib profiilipilti
serveris, sest ekraani tehtud 128×128 JPEG on brauseri lubadus, mitte tõsiasi.

Kui lisad välja, mis tuleb brauserist, küsi endalt: mis juhtub, kui keegi
saadab siia midagi muud?

## Hoidla on avalik

Maja andmetes on päris nimed, telefonid, kirjavahetus ja kassa. Siia ei tohi
sattuda varukoopiaid ega ekraanipilte — mõlemad on `.gitignore`-is ja seda
rida ei võeta ära.

`.env` sisaldab Neoni parooli ja sisselogimise saladust. Samuti `.gitignore`-is.

## Enne majutust

Kaks lahtist ust, mis on meelega olemas ja mis tuleb enne jagamist sulgeda:

- `KOHE_SISSE` `.env` failis logib su ilma lingita sisse. Kehtib ainult
  oma arvutis, aga võta rida välja, enne kui rakendust kellegagi jagad.
- `AVALIK_PROOVIREZIIM=jah` avab lehe kõigile. Niipea kui majja tulevad
  päris nimed, tuleb see ära võtta.

Sisselogimine käib e-kirjale saadetava lingiga, parooli ei ole. Esimene
sisselogija saab administraatori konto.

## Failid

```
server.js     marsruudid
db.js         pg-kogum ja .env lugeja
auth.js       sisselogimine, märgid, KOHE_SISSE
seis.js       maja seis ühe tükina — tõlgib andmebaasi ekraani keelde
ametid.js     kes näeb kassat, kes jagab õigusi
pilt.js       profiilipildi kontroll
post.js       e-kirjad
public/       app.html, login.html, stiil.css
tools/        käsurea abilised: andmebaas, skeem, ava, ekraan, axe
test/         npm test jookseb need läbi
```

## Stiil

Kommentaar ütleb **miks**, mitte mida. Olemasolev kood näitab tooni ette —
kirjuta nii, nagu ümberringi juba kirjutatud on. Muuda ainult seda, mida
ülesanne nõuab; kõrvalisi kohti ei „paranda".
