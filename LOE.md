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
esimest kasutajat tekitama. Majutuses on see väljas — vt allpool.

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
| `test/` | `npm test` — 28 komplekti |
| `tools/` | varukoopia, andmebaas, sisselogimislingid, kes-olen |

## Mis rakenduses on

Üleval paremal saab vahetada **hele ja tume teema** — valik jääb selle
brauseri sisse meelde.

| Vaade | Mida teeb |
|---|---|
| **Müük** | vali kogus, klõpsa tootel. Oma müük on kohe all näha. Allpool toodete kaupa kokkuvõte ja — kassaõigusega — müüjate kaupa. Vajuta müüja nimel, tema alla tuleb kalender; vajuta kuupäeval ja näed, mida ta sel päeval müüs |
| **Vestlus** | kolm asja: **teemat** näevad kõik liikmed; **gruppi** ainult need, kelle sa ise valid („Torni tiim“); **kirja** näete kahekesi. Grupp on püsiv — nime saab muuta, inimesi lisada ja välja jätta, ja igaüks saab ise välja astuda. Kirjutuskasti kõrval on **☺**, kust saab teksti sisse emotsiooni panna. Sõnumi peale minnes tulevad nähtavale **märgid** (👍 ❤️ 😊 😮 🙏 ✅) — nii saab „selge, aitäh“ ära öelda ilma uue sõnumita. Oma sõnumi saab **tagasi võtta**, teise oma mitte. Nimekirja kohal on **otsing** — käib nii vestluste nimede kui ka sõnumite teksti seest, leitud sõna on esile tõstetud. Päises on **Kustuta**: teema kaob kõigi jaoks, grupp kõigi liikmete jaoks, kirjast kaovad ainult sinu enda sõnumid |
| **Üritused** | nimekiri suure kuupäevaga: „Osalen“ / „Ei osale“, „Olen tutvunud“, ülesanded („kes toob koogi“) ja küsimused iga ürituse all |
| **Üldinfo** | tähtis info kõigile. Kinnitust nõudva ploki all on „Olen tutvunud“ ja kes on juba tutvunud |
| **Failid** | dokumendid, mida teistel vaja läheb. Üks fail kuni 5 MB, hoitakse andmebaasis — eraldi failihoidlat ei ole vaja |
| **Kalender** | üritused ja tööd ühes kalendris, maja vahetatakse ülal („Kõik“ näitab mõlemat). Korduv töö (näiteks lillede kastmine kolmapäeval ja laupäeval), kellaajaga või ilma. Tehtud töö nimi läheb roheliseks. Ürituse saab järele muuta ja vastata „Tulen“ / „Ei tule“ |
| **Töö graafik** | mõlema maja nädalagraafik üksteise all, ühel päeval võib olla mitu vahetust. Puhkused ja haiguslehed |
| **Kontaktid** | nimed, töö majas, telefoninumbrid ja pildid. Number kopeeritakse, helistamislinki ei ole — see rakendus on arvutis. Pilt tehakse brauseris 96 piksli peale väikeseks, failihoidlat ei ole vaja |
| **Aruanne** | ainult kassaõigusega. Kokkuvõte müüjate, osade ja toodete kaupa ning väljavõte raamatupidajale (CSV, Eesti Exceli jaoks) |
| **Seaded** | maja info, hinnakiri, liikmed ja sisselogimislingid, liikme majast välja võtmine |

Kui liige majast välja võetakse, **jäävad tema müügid kassasse alles** ja
müüja väli läheb tühjaks. Lahkunud inimese müüdud raha ei tohi arvestusest
kaduda. Rakendus ütleb enne, mitu rida nimeta jääb.

## Õigused

Kõik liikmed haldavad kõike — infot, üritusi, kalendrit, graafikut, liikmeid
ja sisselogimislinke. **Ühiskassa on erand.**

| | Liige | Raamatupidaja | Ülemus | Administraator |
|---|---|---|---|---|
| Kogu maja kassa ja aruanne | ei (ainult oma müük) | jah | jah | jah |
| Müügi lisamine teise nime alla | ei | ei | jah | jah |
| Teise müügi kustutamine | ei | ei | jah | jah |
| Teise nime, telefoni, pildi muutmine | ei | ei | jah | jah |
| Sisselogimislingi tegemine teisele | ei | ei | jah | jah |
| Teise puhkus, haigusleht, tööaeg | ei | ei | jah | jah |
| Teise „tehtud“ märgi mahavõtmine | ei | ei | jah | jah |
| Liikme majast välja võtmine | ei | ei | jah | jah |
| Teise nime alla kirjutamine | ei | ei | jah | jah |
| Kõik muu | jah | jah | jah | jah |
| Ameti muutmine | ei | ei | ei | **jah** |

**Sisselogimislink annab konto kätte.** Seepärast teevad teisele inimesele
lingi ainult ülemus ja administraator. Iseendale saab igaüks — see on sama
konto, kuhu ta juba sees on. Kui iga liige saaks teha lingi
administraatorile, ei loeks ükski ülejäänud rida selles tabelis midagi.

Müügi kirjapanek käib alati enda nime alla — teistel ei ole aknas müüja
valikut. Ka raamatupidaja ei kirjuta teise nime alla, kuigi ta kogu kassat
näeb: müük on tõend selle kohta, kes mida tegi, ja teise nime alla
kirjutamine ei ole raamatupidamine, vaid tema töö ümberkirjutamine.

**Kirjad ja grupid on erand teistpidi:** neid ei näe ka administraator, kui
ta ise sees ei ole. Kahe inimese kiri ja valitud seltskonna jutt ei tule
serverist üldse välja kellelegi, kes sinna ei kuulu — see ei ole ekraani
peal peidetud, vaid päriselt saatmata.

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

### Kõige lihtsam viis sisse saada

**Topeltklõps failil `Ava rakendus.cmd`.** See teeb sisselogimislingi ja
avab majutatud lehe kohe brauseris — kopeerima ei pea midagi. Pärast
sisenemist püsid sees 60 päeva.

Oma arvutis proovides ei ole sisselogimist üldse vaja: pane `.env` faili
rida `KOHE_SISSE=sinu@epost.ee`, käivita `Käivita.cmd` ja oled kohe sees.
See kehtib **ainult sinu arvutis** — majutuses ei tööta ta kunagi. Enne
rakenduse jagamist võta see rida välja.

**Kelle nime all sa proovides sees oled**, vahetab `Kes olen.cmd`
(topeltklõps näitab valikuid) või:

```
node tools/kesolen.js                          nimekiri
node tools/kesolen.js proovija@...             tavaline liige
node tools/kesolen.js ailexica@proton.me       administraator
node tools/kesolen.js valja                    proovirežiim maha
```

Nii saab sama rakendust vaadata mõlema silmadega, ilma et peaks kaks
brauserit lahti hoidma. Pärast vahetust käivita server uuesti.

### Majutatud leht ilma sisselogimiseta (ainult proovimise ajaks)

Kuni `https://kodulinna-maja.onrender.com` peal ei ole päris andmeid, saab
sisselogimise sealt hoopis ära võtta. Renderis **Environment** all lisa
kaks rida:

| Nimi | Väärtus |
|---|---|
| `KOHE_SISSE` | `ailexica@proton.me` (või `proovija@kodulinnamaja.test`) |
| `AVALIK_PROOVIREZIIM` | `jah` |

Salvesta — Render käivitab teenuse ise uuesti. Pärast seda avaneb aadress
kohe sisse logituna. Kelle nime all, otsustab `KOHE_SISSE` rida: sama
moodi saab seal administraatori ja tavakasutaja vahel vahetada.

Ekraani ülaservas käib siis **punane riba**: „PROOVIREŽIIM — see leht on
lahti kõigile, kes aadressi teavad." Riba on meelega tüütu.

**Enne kui majja tulevad päris nimed, telefonid ja kassa, kustuta mõlemad
read Renderist ära.** Ilma nendeta küsib leht jälle sisselogimist. Üks
rida üksi midagi ei ava — mõlemad peavad korraga olema.

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

## Varukoopia

**Andmed on ühes kohas ja see ei ole piisav.** Ühine andmebaas kaitseb selle
vastu, et üks arvuti läheb katki. Ta ei kaitse kogemata kustutamise, konto
sulgemise ega teenuse tingimuste muutumise vastu.

**Topeltklõps `Varukoopia.cmd`** — kogu andmebaas läheb ühte faili kausta
`varukoopiad\`. Fail on tavaline tekst, teda saab avada ja lugeda.

```
node tools/varukoopia.js                       koopia kausta varukoopiad/
node tools/varukoopia.js D:\malupulk           koopia mujale
node tools/varukoopia.js --taasta fail.json    paneb andmed tagasi
```

**Hoia koopiat ka mujal kui selles arvutis** — mälupulgal, pilves või
e-kirjas iseendale. Arvutis olev koopia kaob koos arvutiga.

**Taastamine kirjutab praeguse sisu üle.** Ta küsib enne kinnitust (pead
kirjutama sõna `TAASTA`) ja teeb igaks juhuks praegusest seisust omaette
koopia — kui taastasid vale faili, ei ole eelmine seis kadunud. Kui midagi
läheb keskel katki, pööratakse kõik tagasi: andmebaas jääb endisesse seisu.

Koopia ja taastamine on läbi proovitud päris tühja andmebaasi peal: andmed
kustutati ära ja tulid täies mahus tagasi, koos seostega (müük jäi õige
inimese nimele).

### Öine automaatne koopia

`.github/workflows/varukoopia.yml` teeb seda igal ööl ise. **Enne
sisselülitamist peab hoidla olema privaatne** — koopias on päris nimed,
telefonid ja kassa, ja avalikus hoidlas saaks igaüks need alla laadida.
Töö keeldub avalikus hoidlas jooksmast. Juhend on faili päises.

## Andmebaas

Neon, projekt `kodulinna-maja` (`frosty-cell-73142129`), haru `main`. 26 tabelit.

Kogu kuju on kaustas `andmebaas/`, nummerdatud failidena. `001-alus.sql` on
terve andmebaas ühes failis — sellega saab tühjast baasist maja üles seada.
Iga hilisem muudatus on eraldi fail.

```
npm run andmebaas             teeb tegemata muudatused
node tools/andmebaas.js --vaata    näitab, mis on tegemata
node tools/andmebaas.js --tehtud   märgib tehtuks, midagi tegemata
```

Andmebaas peab ise arvet: tabel `migratsioonid` ütleb, mis on juba tehtud.
Iga fail käib ühe tehinguna — pooleli jäänud muudatust ei jää alles.

**`001-alus.sql` on masina kirjutatud** (`npm run skeem`) ja kirjeldab seda,
mis andmebaasis päriselt on. Käsitsi sinna midagi juurde ei kirjutata: uus
muudatus tuleb uue nummerdatud failina. Fail on kontrollitud päris tühja
andmebaasi peal — 26 tabelit, 142 veergu ja 82 piirangut tulevad täpselt
samad, mis päris baasis.

## Proovimine

```
npm test
```

Kontrollib, et server vastab, sisselogimine töötab, märk kehtib ainult üks
kord, võltsitud küpsis ei kõlba ja müük tuleb andmebaasist õigete summadega.

## Mis on tehtud ja mis mitte

**Tehtud:** kõik vaated, mis on ülal tabelis — vestlus (teemad, grupid,
kirjad, emotsioonid, otsing), üritused, üldinfo, failid, müük, töö graafik,
kontaktid, aruanne koos CSV-väljavõttega. Sisselogimine, õigused serveris,
majutus Renderis, andmebaasi taastamine nullist, varukoopia.

**Tegemata, teadlikult:**

* **Postiteenus** ei ole ühendatud. `post.js` oskab Resendi kaudu saata,
  aga võtit ei ole. Ilma selleta teeb sisselogimislingi ülemus või
  administraator rakenduse seest. See on tegelik lünk, mitte mugavus:
  umbes 60 päeva pärast kasutuselevõttu aeguvad kõigi küpsised samal
  nädalal ja siis peab keegi olema, kes lingid teha saab.
* **Fail üle 400 kB** salvestub praegu tühjana ja alla laadida saab
  ainult sama lehe avamise ajal lisatud faili. Failide osa vajab veel tööd.
* **Kaks korraga töötavat inimest** võivad teineteise ridu kaotada: kes
  hiljem salvestab, selle pilt jääb peale. Kaheksa inimese majas juhtub
  seda harva, aga juhtub.
* **Muudatuste ajalugu** ei ole. Kes mida muutis, ei jää kuhugi kirja.
  Varukoopiad annavad sama kaitse ilma uue mõisteta.

## Enne majutusse panekut

1. `.env` failis peab `SESSIOONI_SALADUS` olema pikk ja juhuslik. On tehtud.
2. `.env` ei tohi kunagi avalikku kohta sattuda — `.gitignore` hoiab teda
   eemal. **Kontrollitud: `.env` ei ole kunagi hoidlas olnud.**
3. **Hoidla on praegu avalik.** Kood ise on avalikult loetav — see ei ole
   ohtlik, sest turvalisus ei toetu saladuses hoidmisele. Aga varukoopia ei
   tohi sinna kunagi sattuda ja öine automaatne koopia nõuab privaatset
   hoidlat.
4. Arenduse otsetee (`arenduseLink`) jääb sisse — ta ei kehti majutuses
   kunagi ja testid vajavad teda. Seda EI OLE vaja ära võtta.
5. Kui panid Renderis `KOHE_SISSE` ja `AVALIK_PROOVIREZIIM` sisse, võta
   nad enne päris andmeid ära ja kontrolli inkognito-aknas, et leht küsib
   sisselogimist.
