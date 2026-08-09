# Kodulinna Maja — päris rakendus

See on prototüübi järglane: sama asi, aga andmed on ühises andmebaasis, mitte
ühes brauseris. Kaks inimest näevad siin teineteise sisu.

## Käivitamine

```
npm install
npm start
```

Ava `http://localhost:3000`.

## Sisselogimine

Parooli ei ole. Sisenetakse ühekordse lingiga ja pärast seda püsib inimene
sees 60 päeva.

**Esimene sisselogija saab administraatori konto.** Nii ei pea kuskil käsitsi
esimest kasutajat tekitama.

### Kuidas teised inimesed sisse saavad

**Administraator teeb neile lingi ja annab ise kätte** — rakenduses kaardil
„Liikmed ja sisselogimine". Link kehtib 7 päeva ja ühe korra.

Postiteenust ei ole vaja. Kaheksa inimese majas on lingi kättetoimetamine
telefonis või sõnumiga lihtsam ja usaldusväärsem kui kolmas osapool vahel.

### Kui tahad ikkagi automaatseid e-kirju

Vabatahtlik. `post.js` oskab saata Resendi kaudu:

1. tee tasuta konto `resend.com`
2. loo API võti
3. kirjuta ta `.env` faili ritta `RESEND_VOTI=`
4. käivita server uuesti

Kui võti on olemas, saadetakse päris kiri ja link **ei ilmu enam ekraanile**.
Kui võtit ei ole, ilmub link ekraanile — muidu ei saaks keegi sisse.

## Failid

| | |
|---|---|
| `server.js` | marsruudid ja API |
| `db.js` | ühendus andmebaasiga |
| `auth.js` | sisselogimine, küpsis, märgid |
| `public/login.html` | sisselogimise leht |
| `ametid.js` | ametid ja õigused ühes kohas |
| `public/app.html` | rakendus — kõik vaated |
| `andmebaas/*.sql` | andmebaasi muudatused, nummerdatud |
| `test/` | `npm test` — 10 komplekti, üle 130 kontrolli |

## Mis rakenduses on

| Vaade | Mida teeb |
|---|---|
| **Müük** | vali kogus, klõpsa tootel. Oma müük on kohe all näha |
| **Kalender** | üritused ja tööd ühes kalendris, maja vahetatakse ülal („Kõik“ näitab mõlemat). Korduv töö (näiteks lillede kastmine kolmapäeval ja laupäeval), kellaajaga või ilma. Tehtud töö nimi läheb roheliseks |
| **Töö graafik** | mõlema maja nädalagraafik üksteise all, ühel päeval võib olla mitu vahetust. Puhkused ja haiguslehed |
| **Kontaktid** | nimed, töö majas ja telefoninumbrid. Number kopeeritakse, helistamislinki ei ole — see rakendus on arvutis |
| **Aruanne** | ainult kassaõigusega. Kokkuvõte müüjate, osade ja toodete kaupa ning väljavõte raamatupidajale (CSV, Eesti Exceli jaoks) |
| **Seaded** | maja info, hinnakiri, liikmed ja sisselogimislingid |

## Õigused

Kõik liikmed haldavad kõike — infot, üritusi, kalendrit, graafikut, liikmeid
ja sisselogimislinke. **Ühiskassa on erand.**

| | Liige | Raamatupidaja | Ülemus | Administraator |
|---|---|---|---|---|
| Kogu maja kassa ja aruanne | ei (ainult oma müük) | jah | jah | jah |
| Kõik muu | jah | jah | jah | jah |
| Ameti muutmine | ei | ei | ei | **jah** |

Ameti muutmine on ainult administraatoril, sest amet otsustab, kes kassat
näeb. Kui igaüks saaks ametit muuta, annaks igaüks endale kassaõiguse ja
lukk ei loeks midagi. Samal põhjusel ei saa õiguseta liige luua uut liiget
kassaametiga.

## Kes rakendust näeb

Vaikimisi **ainult sinu enda arvuti**. `.env` failis on `HOST=127.0.0.1`.
Isegi samas WiFis olev inimene ei pääse ligi.

| Tahad | Tee nii |
|---|---|
| ainult ise proovida | jäta nii, nagu on |
| näidata kolleegile kõrvallauas | `HOST=0.0.0.0`, anna talle oma IP ja port |
| anda majale päriselt kasutada | vaja on majutust — vt allpool |

## Majutus — kuidas rakendus internetti saada

Rakendus on majutuseks valmis. Puudu on ainult konto teenusepakkuja juures,
mida ma sinu eest teha ei saa.

**Soovitus: Render** (render.com). Tasuta pakett sobib: leht magab, kui teda
tund aega ei kasutata, ja ärkab esimese avamisega ~30 sekundiga.

1. Pane kood GitHubi (tasuta konto). Repo on juba valmis — `git push` järele.
2. Renderis: **New → Web Service** → vali see repo. `render.yaml` seab
   ülejäänu ise paika.
3. Sisesta kaks saladust (Renderis, mitte faili):
   - `DATABASE_URL` — `.env` failist
   - `SESSIOONI_SALADUS` — `.env` failist
4. Saad aadressi kujul `https://kodulinna-maja.onrender.com`. Ava, logi sisse,
   proovi. Kui töötab, jaga aadress liikmetele.

`Dockerfile` on ka olemas, kui eelistad Fly.io-d, Railwayd või muud.

### Esimene sisselogimine majutatud lehele

Majutuses ei näidata sisselogimislinki ekraanil ja postiteenust ei pruugi
olla. Esimese lingi teed oma arvutist — sama andmebaas, seega link kehtib
ka majutatud lehel:

```
node tools/link.js sinu@epost.ee https://kodulinna-maja.onrender.com
```

Ilma e-postita näitab tööriist liikmete nimekirja. Edasi saad kõik teised
lingid teha juba rakenduse enda seest, kaardil „Liikmed ja sisselogimine".

### Mis majutuses automaatselt teistmoodi käib

| | Oma arvutis | Majutuses (`NODE_ENV=production`) |
|---|---|---|
| Kes ligi pääseb | ainult see arvuti | kõik, kes aadressi teavad |
| Esimene sisselogija saab administraatoriks | jah | **ei** |
| Sisselogimislink ekraanil | jah | **ei** — muidu piisaks sisenemiseks e-posti teadmisest |

Teine rida on tähtis: avalikul aadressil võiks juhuslik möödakäija muidu end
esimesena administraatoriks kirjutada. Kui pead majutuses siiski esimest kontot
tegema, lisa ajutiselt `ESIMENE_SISSELOGIJA=lubatud` ja võta pärast ära.

## Enne kui rakendust kellegagi jagad

1. **`SESSIOONI_SALADUS`** peab olema pikk ja juhuslik. On juba tehtud.
   Uue saab nii: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
2. **`.env` ei tohi kunagi avalikku kohta sattuda.** `.gitignore` hoiab teda eemal.
3. **Majutus.** Kodune arvuti ei sobi: ta peab olema pidevalt sees ja
   internetist nähtav. Tasuta variandid katavad selle maja vajaduse.
4. **Liikmed sisse.** Rakenduses kaardil „Liikmed ja sisselogimine" lisa
   inimesed ja tee neile lingid.

## Andmebaas

Neon, projekt `kodulinna-maja` (`frosty-cell-73142129`), haru `main`.
Skeem on prototüübi kaustas failis `skeem.sql`, 22 tabelit.

## Proovimine

```
npm test
```

Kontrollib, et server vastab, sisselogimine töötab, märk kehtib ainult üks
kord, võltsitud küpsis ei kõlba ja müük tuleb andmebaasist õigete summadega.

## Mis on tehtud ja mis mitte

Tehtud: sisselogimine, õigused serveris, müügivaade päris andmetest.

Tegemata: ülejäänud vaated (vestlus, üritused, kalender, üldinfo, failid,
graafik, kontaktid), müügi lisamine, aruanne, postiteenus, majutus.

## Enne majutusse panekut

1. `.env` failis vaheta `SESSIOONI_SALADUS` millegi juhusliku vastu.
2. Ühenda postiteenus ja võta arenduse otsetee (`arenduseLink`) ära.
3. `.env` ei tohi kunagi avalikku kohta sattuda — `.gitignore` hoiab teda eemal.
