/* Kodulinna Maja — server.
   Väike ja loetav: üks fail marsruutide jaoks, üks andmebaasi jaoks,
   üks sisselogimise jaoks. Raamistikku ei ole, sest siin ei ole midagi,
   mille jaoks teda vaja oleks. */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { q, yks } = require("./db");
const auth = require("./auth");
const { AMETID, kehtiv, naebKassat, annabOigusi, haldabLiikmeid } = require("./ametid");

/* Ametid, mis ameteid jagavad. Võtame nimekirja ametid.js-ist, et
   SQL ja õigused ei läheks kunagi lahku. */
const ANDJAD = AMETID.filter(a => a.annab).map(a => a.id);

const PORT = Number(process.env.PORT || 3000);
const AVALIK = path.join(__dirname, "public");

/* MTÜ ei ole käibemaksukohustuslane. See käib väljavõttele kaasa, et
   raamatupidajal ei tekiks küsimust, kuhu käibemaks jäi. */
const KAIBEMAKS = "MTÜ Tallinna Noorte Klubi Kodulinn ei ole "
  + "käibemaksukohustuslane — hinnad on lõplikud, käibemaksu ei ole.";

/* Hind: number, null kui vigane. Tühi väli tähendab tasuta (0). */
const hinnaks = v => {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};
const onMaja = async id => !!(id && await yks("SELECT id FROM majad WHERE id = $1", [id]));

const json = (res, kood, data) => {
  res.writeHead(kood, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
};
const tekst = (res, kood, t) => {
  res.writeHead(kood, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(t);
};
const keha = req => new Promise(r => {
  let d = ""; req.on("data", c => { d += c; if (d.length > 1e6) req.destroy(); });
  req.on("end", () => { try { r(JSON.parse(d || "{}")); } catch { r({}); } });
});

const TYYBID = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };

function fail(res, nimi) {
  const p = path.join(AVALIK, nimi);
  if (!p.startsWith(AVALIK) || !fs.existsSync(p)) return tekst(res, 404, "Ei leia");
  res.writeHead(200, { "Content-Type": TYYBID[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  const tee = u.pathname;
  const alus = "http://" + (req.headers.host || "localhost:" + PORT);

  try {
    /* ── sisselogimine ────────────────────────────────────────── */
    if (tee === "/api/logi-sisse" && req.method === "POST") {
      const b = await keha(req);
      const r = await auth.kysiLink(b.epost, alus);
      if (r.viga) return json(res, 400, { viga: r.viga });
      /* Kui kiri läks teele, ei anna me linki vastuses — muidu saaks
         igaüks teise inimese lingi kätte. Kui postiteenust ei ole,
         tuleb link ekraanile, sest muidu ei saaks keegi sisse. */
      return json(res, 200, {
        ok: true, kiriSaadetud: !!r.kiriSaadetud,
        arenduseLink: r.link || null, postitaTa: !!r.postitaTa
      });
    }

    if (tee === "/sisene") {
      const s = await auth.sisene(u.searchParams.get("mark") || "");
      if (!s) {
        res.writeHead(303, { Location: "/?viga=aegunud" });
        return res.end();
      }
      res.writeHead(303, { Location: "/", "Set-Cookie": s.kupsis });
      return res.end();
    }

    if (tee === "/api/valja" && req.method === "POST") {
      res.writeHead(200, { "Set-Cookie": auth.valjaKupsis, "Content-Type": "application/json" });
      return res.end('{"ok":true}');
    }

    /* ── kes ma olen ──────────────────────────────────────────── */
    const mina = await auth.kesOn(req);
    if (tee === "/api/mina") return json(res, 200, {
      mina: mina && Object.assign({}, mina, {
        naebKassat: naebKassat(mina), annabOigusi: annabOigusi(mina),
        haldabLiikmeid: haldabLiikmeid(mina)
      }),
      ametid: AMETID
    });

    /* Edasi ei lasta ilma sisselogimiseta. */
    if (tee.startsWith("/api/") && !mina) return json(res, 401, { viga: "Logi sisse." });

    /* ── müük ─────────────────────────────────────────────────── */
    if (tee === "/api/myyk" && (req.method === "GET" || req.method === "HEAD")) {
      /* Kogu maja müüki näeb administraator, teised näevad oma müüki.
         See kontroll on serveris, mitte ekraanil — nii ei saa sellest
         mööda minna, ükskõik mida brauseris teha. */
      const koik = naebKassat(mina);
      const read = await q(
        `SELECT m.id, m.aeg, m.kogus, m.hind, m.summa,
                t.nimetus, o.nimi AS osa, l.nimi AS myyja, m.myyja_id
         FROM myygid m
         JOIN tooted t ON t.id = m.toode_id
         LEFT JOIN myyk_osad o ON o.id = t.osa_id
         LEFT JOIN liikmed l ON l.id = m.myyja_id
         ${koik ? "" : "WHERE m.myyja_id = $1"}
         ORDER BY m.aeg DESC`, koik ? [] : [mina.id]);
      const kokku = read.reduce((a, r) => ({
        kordi: a.kordi + 1, tk: a.tk + r.kogus, eur: a.eur + Number(r.summa)
      }), { kordi: 0, tk: 0, eur: 0 });
      return json(res, 200, { koikNahtav: koik, read, kokku });
    }

    /* Müügi sisestamine. Seda teeb igaüks ise ja alati enda nimele —
       müüja tuleb küpsisest, mitte vormist, nii ei saa keegi kanda müüki
       teise inimese arvele. */
    if (tee === "/api/myyk" && req.method === "POST") {
      const b = await keha(req);
      const kogus = Number(b.kogus);
      if (!Number.isInteger(kogus) || kogus < 1 || kogus > 9999)
        return json(res, 400, { viga: "Kogus peab olema täisarv 1 kuni 9999." });

      const toode = await yks(
        "SELECT id, nimetus, hind FROM tooted WHERE id = $1", [b.toode_id]);
      if (!toode) return json(res, 400, { viga: "Sellist toodet ei ole." });

      /* Hind kirjutatakse müügireale kaasa. Kui hinnakirja hiljem
         muudetakse, jääb vana müük ikka selle hinnaga, millega ta müüdi.
         Summat me ise ei arvuta — see on andmebaasis tuletatud veerg
         (kogus × hind), nii ei saa see kunagi ridadega lahku minna. */
      const r = await yks(
        `INSERT INTO myygid (toode_id, kogus, hind, myyja_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, aeg, kogus, hind, summa`,
        [toode.id, kogus, toode.hind, mina.id]);
      return json(res, 200, { ok: true, myyk: Object.assign({ nimetus: toode.nimetus }, r) });
    }

    /* Eksimuse saab ise ära võtta. Teiste müüki kustutab ainult see,
       kes kogu kassa eest vastutab. */
    if (tee === "/api/myyk" && req.method === "DELETE") {
      const b = await keha(req);
      const oma = await yks("SELECT myyja_id FROM myygid WHERE id = $1", [b.id]);
      if (!oma) return json(res, 404, { viga: "Sellist müüki ei ole." });
      if (oma.myyja_id !== mina.id && !naebKassat(mina))
        return json(res, 403, { viga: "Kustutada saad ainult oma müüki." });
      await q("DELETE FROM myygid WHERE id = $1", [b.id]);
      return json(res, 200, { ok: true });
    }

    /* Hinnakiri müügi sisestamiseks: osad ja nende tooted. */
    if (tee === "/api/tooted" && req.method === "GET") {
      const osad = await q("SELECT id, nimi FROM myyk_osad ORDER BY jrk, nimi");
      const tooted = await q(
        "SELECT id, osa_id, nimetus, hind FROM tooted ORDER BY nimetus");
      return json(res, 200, osad.map(o => Object.assign({}, o, {
        tooted: tooted.filter(t => t.osa_id === o.id)
      })).concat(
        tooted.some(t => !t.osa_id)
          ? [{ id: null, nimi: "Muu", tooted: tooted.filter(t => !t.osa_id) }] : []));
    }

    /* Hinnakirja haldamine. Toodet ei kustutata ära, kui tal on müüke —
       muidu kaoks vana müük koos temaga ja kassa jääks valeks. */
    if (tee === "/api/tooted" && req.method === "POST") {
      const b = await keha(req);
      const nimetus = String(b.nimetus || "").trim();
      if (!nimetus) return json(res, 400, { viga: "Nimetus on täitmata." });
      const hind = hinnaks(b.hind);
      if (hind === null) return json(res, 400, { viga: "Hind peab olema number, 0 või rohkem." });
      const r = await yks(
        `INSERT INTO tooted (osa_id, nimetus, hind) VALUES ($1, $2, $3)
         RETURNING id, osa_id, nimetus, hind`,
        [b.osa_id || null, nimetus, hind]);
      return json(res, 200, { ok: true, toode: r });
    }

    if (tee === "/api/tooted" && req.method === "PATCH") {
      const b = await keha(req);
      const nimetus = String(b.nimetus || "").trim();
      if (!nimetus) return json(res, 400, { viga: "Nimetus on täitmata." });
      const hind = hinnaks(b.hind);
      if (hind === null) return json(res, 400, { viga: "Hind peab olema number, 0 või rohkem." });
      const r = await yks(
        `UPDATE tooted SET nimetus = $2, hind = $3, osa_id = coalesce($4, osa_id)
         WHERE id = $1 RETURNING id, osa_id, nimetus, hind`,
        [b.id, nimetus, hind, b.osa_id || null]);
      if (!r) return json(res, 404, { viga: "Sellist toodet ei ole." });
      return json(res, 200, { ok: true, toode: r });
    }

    if (tee === "/api/tooted" && req.method === "DELETE") {
      const b = await keha(req);
      const n = await yks("SELECT count(*)::int AS n FROM myygid WHERE toode_id = $1", [b.id]);
      if (n.n > 0) return json(res, 400, {
        viga: "Sellel tootel on " + n.n + " müüki. Kustutamine kaotaks need kassast ära."
      });
      await q("DELETE FROM tooted WHERE id = $1", [b.id]);
      return json(res, 200, { ok: true });
    }

    if (tee === "/api/osad" && req.method === "GET")
      return json(res, 200, await q("SELECT id, nimi FROM myyk_osad ORDER BY jrk, nimi"));

    if (tee === "/api/majad" && req.method === "GET")
      return json(res, 200, await q("SELECT id, nimi FROM majad ORDER BY jrk, nimi"));

    /* ── üritused ─────────────────────────────────────────────── */
    if (tee === "/api/yritused" && req.method === "GET") {
      return json(res, 200, await q(
        `SELECT y.id, y.koht_id, y.pealkiri, y.algus, y.lopp, y.asukoht,
                y.kirjeldus, m.nimi AS maja
         FROM yritused y LEFT JOIN majad m ON m.id = y.koht_id
         ORDER BY y.algus`));
    }

    if (tee === "/api/yritused" && req.method === "POST") {
      const b = await keha(req);
      const pealkiri = String(b.pealkiri || "").trim();
      if (!pealkiri) return json(res, 400, { viga: "Ürituse nimi on täitmata." });
      if (!b.algus) return json(res, 400, { viga: "Algusaeg on valimata." });
      if (!await onMaja(b.koht_id)) return json(res, 400, { viga: "Vali maja." });
      const r = await yks(
        `INSERT INTO yritused (koht_id, pealkiri, algus, lopp, asukoht, kirjeldus, autor)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, koht_id, pealkiri, algus, lopp`,
        [b.koht_id, pealkiri, b.algus, b.lopp || null,
         String(b.asukoht || "").trim() || null,
         String(b.kirjeldus || "").trim() || null, mina.id]);
      return json(res, 200, { ok: true, yritus: r });
    }

    if (tee === "/api/yritused" && req.method === "PATCH") {
      const b = await keha(req);
      const pealkiri = String(b.pealkiri || "").trim();
      if (!pealkiri) return json(res, 400, { viga: "Ürituse nimi on täitmata." });
      if (!b.algus) return json(res, 400, { viga: "Algusaeg on valimata." });
      if (!await onMaja(b.koht_id)) return json(res, 400, { viga: "Vali maja." });
      const r = await yks(
        `UPDATE yritused SET koht_id=$2, pealkiri=$3, algus=$4, lopp=$5,
                asukoht=$6, kirjeldus=$7
         WHERE id = $1 RETURNING id`,
        [b.id, b.koht_id, pealkiri, b.algus, b.lopp || null,
         String(b.asukoht || "").trim() || null, String(b.kirjeldus || "").trim() || null]);
      if (!r) return json(res, 404, { viga: "Sellist üritust ei ole." });
      return json(res, 200, { ok: true });
    }

    /* Kes tuleb. Vastus on alati enda oma — küpsisest, mitte vormist. */
    if (tee === "/api/osalemine" && req.method === "POST") {
      const b = await keha(req);
      if (!["jah", "ei"].includes(b.vastus))
        return json(res, 400, { viga: "Vastus saab olla „jah“ või „ei“." });
      const y = await yks("SELECT id FROM yritused WHERE id = $1", [b.yritus_id]);
      if (!y) return json(res, 404, { viga: "Sellist üritust ei ole." });
      await q(
        `INSERT INTO osalemine (yritus_id, liige_id, vastus) VALUES ($1,$2,$3)
         ON CONFLICT (yritus_id, liige_id) DO UPDATE SET vastus = $3, aeg = now()`,
        [b.yritus_id, mina.id, b.vastus]);
      return json(res, 200, { ok: true });
    }

    if (tee === "/api/osalemine" && req.method === "GET")
      return json(res, 200, await q(
        `SELECT o.yritus_id, o.liige_id, o.vastus, l.nimi
         FROM osalemine o JOIN liikmed l ON l.id = o.liige_id`));

    if (tee === "/api/yritused" && req.method === "DELETE") {
      const b = await keha(req);
      const r = await yks("DELETE FROM yritused WHERE id = $1 RETURNING id", [b.id]);
      if (!r) return json(res, 404, { viga: "Sellist üritust ei ole." });
      return json(res, 200, { ok: true });
    }

    /* ── kalendri tööd ────────────────────────────────────────────
       Töö on kas ühekordne (kuup) või korduv (nädalapäevad). Kellaaeg
       ei ole kohustuslik: „lilled tuleb kasta“ käib ükskõik millal. */
    if (tee === "/api/tood" && req.method === "GET") {
      const tood = await q(
        `SELECT t.id, t.koht_id, t.nimi, t.algus, t.lopp, t.kuup, t.algab, t.markus,
                m.nimi AS maja
         FROM tood t LEFT JOIN majad m ON m.id = t.koht_id ORDER BY t.nimi`);
      const paevad = await q("SELECT too_id, paev FROM too_paevad ORDER BY paev");
      const tehtud = await q(
        `SELECT h.too_id, h.kuup, l.nimi AS kes
         FROM too_tehtud h LEFT JOIN liikmed l ON l.id = h.kes_id`);
      const vahele = await q("SELECT too_id, kuup FROM too_vahele");
      return json(res, 200, {
        tood: tood.map(t => Object.assign({}, t, {
          paevad: paevad.filter(p => p.too_id === t.id).map(p => p.paev)
        })), tehtud, vahele
      });
    }

    if (tee === "/api/tood" && req.method === "POST") {
      const b = await keha(req);
      const nimi = String(b.nimi || "").trim();
      if (!nimi) return json(res, 400, { viga: "Töö nimi on täitmata." });
      if (!await onMaja(b.koht_id)) return json(res, 400, { viga: "Vali maja." });

      const paevad = Array.isArray(b.paevad)
        ? [...new Set(b.paevad.map(Number).filter(p => Number.isInteger(p) && p >= 0 && p <= 6))]
        : [];
      if (!paevad.length && !b.kuup)
        return json(res, 400, { viga: "Vali kuupäev või korduvad nädalapäevad." });
      if (b.algus && b.lopp && String(b.lopp) <= String(b.algus))
        return json(res, 400, { viga: "Lõpp peab olema pärast algust." });

      /* Korduv töö algab sellest päevast, kust ta lisati — muidu ilmuks
         ta ka möödunud nädalatesse, kus teda kunagi ei olnud. */
      const r = await yks(
        `INSERT INTO tood (koht_id, nimi, algus, lopp, kuup, algab, markus)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [b.koht_id, nimi, b.algus || null, b.lopp || null,
         paevad.length ? null : b.kuup, b.kuup || null,
         String(b.markus || "").trim() || null]);
      for (const p of paevad)
        await q("INSERT INTO too_paevad (too_id, paev) VALUES ($1,$2)", [r.id, p]);
      return json(res, 200, { ok: true, id: r.id });
    }

    /* Korduva töö saab kustutada ühe korra kaupa või tervikuna. */
    if (tee === "/api/tood" && req.method === "DELETE") {
      const b = await keha(req);
      if (b.kuup) {
        await q(`INSERT INTO too_vahele (too_id, kuup) VALUES ($1,$2)
                 ON CONFLICT DO NOTHING`, [b.id, b.kuup]);
        return json(res, 200, { ok: true, kord: true });
      }
      const r = await yks("DELETE FROM tood WHERE id = $1 RETURNING id", [b.id]);
      if (!r) return json(res, 404, { viga: "Sellist tööd ei ole." });
      return json(res, 200, { ok: true });
    }

    /* Tehtud-märge käib päeva kohta: töö teeb see, kes parajasti majas on. */
    if (tee === "/api/tood/tehtud" && req.method === "POST") {
      const b = await keha(req);
      if (!b.kuup) return json(res, 400, { viga: "Päev on valimata." });
      await q(
        `INSERT INTO too_tehtud (too_id, kuup, kes_id) VALUES ($1,$2,$3)
         ON CONFLICT (too_id, kuup) DO UPDATE SET kes_id = $3, aeg = now()`,
        [b.id, b.kuup, mina.id]);
      return json(res, 200, { ok: true });
    }

    if (tee === "/api/tood/tehtud" && req.method === "DELETE") {
      const b = await keha(req);
      await q("DELETE FROM too_tehtud WHERE too_id = $1 AND kuup = $2", [b.id, b.kuup]);
      return json(res, 200, { ok: true });
    }

    /* ── töö graafik ──────────────────────────────────────────────
       Nädalapäeva kaupa, maja kaupa. Ühel päeval võib olla mitu
       inimest — üks hommikul, teine õhtul. */
    if (tee === "/api/graafik" && req.method === "GET") {
      return json(res, 200, {
        graafik: await q(
          `SELECT g.id, g.koht_id, g.liige_id, g.paev, g.algus, g.lopp, l.nimi
           FROM graafik g JOIN liikmed l ON l.id = g.liige_id
           ORDER BY g.paev, g.algus NULLS LAST, l.nimi`),
        puudumised: await q(
          `SELECT p.id, p.liige_id, p.algus, p.lopp, p.liik, p.markus, l.nimi
           FROM puudumised p JOIN liikmed l ON l.id = p.liige_id
           ORDER BY p.algus DESC`)
      });
    }

    if (tee === "/api/graafik" && req.method === "POST") {
      const b = await keha(req);
      const paev = Number(b.paev);
      if (!Number.isInteger(paev) || paev < 0 || paev > 6)
        return json(res, 400, { viga: "Vali nädalapäev." });
      if (!await onMaja(b.koht_id)) return json(res, 400, { viga: "Vali maja." });
      if (!b.liige_id) return json(res, 400, { viga: "Vali inimene." });
      if (b.algus && b.lopp && String(b.lopp) <= String(b.algus))
        return json(res, 400, { viga: "Lõpp peab olema pärast algust." });
      const r = await yks(
        `INSERT INTO graafik (koht_id, liige_id, paev, algus, lopp)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [b.koht_id, b.liige_id, paev, b.algus || null, b.lopp || null]);
      return json(res, 200, { ok: true, id: r.id });
    }

    if (tee === "/api/graafik" && req.method === "DELETE") {
      const b = await keha(req);
      await q("DELETE FROM graafik WHERE id = $1", [b.id]);
      return json(res, 200, { ok: true });
    }

    /* ── puhkused ja haiguslehed ──────────────────────────────── */
    if (tee === "/api/puudumised" && req.method === "POST") {
      const b = await keha(req);
      if (!b.liige_id) return json(res, 400, { viga: "Vali inimene." });
      if (!b.algus || !b.lopp) return json(res, 400, { viga: "Vali algus ja lõpp." });
      if (String(b.lopp) < String(b.algus))
        return json(res, 400, { viga: "Lõpp ei saa olla enne algust." });
      /* Need kolm on andmebaasis lubatud; „haigus“ on haigusleht. */
      const liik = ["puhkus", "haigus", "vaba"].includes(b.liik) ? b.liik : "vaba";
      const r = await yks(
        `INSERT INTO puudumised (liige_id, algus, lopp, liik, markus)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [b.liige_id, b.algus, b.lopp, liik, String(b.markus || "").trim() || null]);
      return json(res, 200, { ok: true, id: r.id });
    }

    if (tee === "/api/puudumised" && req.method === "DELETE") {
      const b = await keha(req);
      await q("DELETE FROM puudumised WHERE id = $1", [b.id]);
      return json(res, 200, { ok: true });
    }

    /* ── maja info ────────────────────────────────────────────── */
    if (tee === "/api/info" && req.method === "GET")
      return json(res, 200, await q(
        `SELECT i.id, i.pealkiri, i.sisu, i.muudetud, l.nimi AS autor
         FROM info i LEFT JOIN liikmed l ON l.id = i.autor
         ORDER BY i.pealkiri`));

    if (tee === "/api/info" && req.method === "POST") {
      const b = await keha(req);
      const pealkiri = String(b.pealkiri || "").trim();
      if (!pealkiri) return json(res, 400, { viga: "Pealkiri on täitmata." });
      const r = await yks(
        `INSERT INTO info (pealkiri, sisu, autor) VALUES ($1,$2,$3) RETURNING id`,
        [pealkiri, String(b.sisu || ""), mina.id]);
      return json(res, 200, { ok: true, id: r.id });
    }

    if (tee === "/api/info" && req.method === "PATCH") {
      const b = await keha(req);
      const pealkiri = String(b.pealkiri || "").trim();
      if (!pealkiri) return json(res, 400, { viga: "Pealkiri on täitmata." });
      const r = await yks(
        `UPDATE info SET pealkiri = $2, sisu = $3, autor = $4, muudetud = now()
         WHERE id = $1 RETURNING id`,
        [b.id, pealkiri, String(b.sisu || ""), mina.id]);
      if (!r) return json(res, 404, { viga: "Sellist teksti ei ole." });
      return json(res, 200, { ok: true });
    }

    if (tee === "/api/info" && req.method === "DELETE") {
      const b = await keha(req);
      await q("DELETE FROM info WHERE id = $1", [b.id]);
      return json(res, 200, { ok: true });
    }

    /* ── aruanne ──────────────────────────────────────────────────
       Ainult kassaõigusega. Aruanne on kogu maja raha kokkuvõte —
       see on täpselt see, mis ei ole kõigile nähtav. */
    if (tee === "/api/aruanne" || tee === "/api/aruanne.csv") {
      if (!naebKassat(mina)) return json(res, 403, {
        viga: "Aruannet näevad raamatupidaja, ülemus ja administraator."
      });
      const algus = u.searchParams.get("algus") || "2000-01-01";
      const lopp = u.searchParams.get("lopp") || "2999-12-31";
      const read = await q(
        `SELECT m.aeg, m.kogus, m.hind, m.summa, t.nimetus,
                coalesce(o.nimi, 'Muu') AS osa, coalesce(l.nimi, '—') AS myyja
         FROM myygid m
         JOIN tooted t ON t.id = m.toode_id
         LEFT JOIN myyk_osad o ON o.id = t.osa_id
         LEFT JOIN liikmed l ON l.id = m.myyja_id
         WHERE m.aeg::date BETWEEN $1 AND $2
         ORDER BY m.aeg`, [algus, lopp]);

      if (tee === "/api/aruanne") {
        const kogum = (võti) => {
          const kaart = new Map();
          for (const r of read) {
            const k = r[võti];
            const s = kaart.get(k) || { nimi: k, kordi: 0, tk: 0, eur: 0 };
            s.kordi++; s.tk += r.kogus; s.eur += Number(r.summa);
            kaart.set(k, s);
          }
          return [...kaart.values()].sort((a, b) => b.eur - a.eur);
        };
        return json(res, 200, {
          algus, lopp, read,
          kokku: read.reduce((a, r) => ({
            kordi: a.kordi + 1, tk: a.tk + r.kogus, eur: a.eur + Number(r.summa)
          }), { kordi: 0, tk: 0, eur: 0 }),
          osade: kogum("osa"), toodete: kogum("nimetus"), myyjate: kogum("myyja"),
          kaibemaks: KAIBEMAKS
        });
      }

      /* Väljavõte raamatupidajale. Semikoolon ja koma, sest Eesti Excel
         ootab neid; BOM, et täpitähed ei läheks katki. */
      const koma = v => Number(v).toFixed(2).replace(".", ",");
      const puhas = t => '"' + String(t == null ? "" : t).replace(/"/g, '""') + '"';
      const jooned = [["Kuupäev", "Kellaaeg", "Osa", "Nimetus", "Kogus", "Hind", "Summa", "Müüja"]
        .map(puhas).join(";")];
      for (const r of read) {
        const d = new Date(r.aeg), p = n => String(n).padStart(2, "0");
        jooned.push([
          puhas(p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear()),
          puhas(p(d.getHours()) + ":" + p(d.getMinutes())),
          puhas(r.osa), puhas(r.nimetus), r.kogus,
          puhas(koma(r.hind)), puhas(koma(r.summa)), puhas(r.myyja)
        ].join(";"));
      }
      const summa = read.reduce((a, r) => a + Number(r.summa), 0);
      jooned.push("");
      jooned.push([puhas("KOKKU"), "", "", "", read.reduce((a, r) => a + r.kogus, 0),
        "", puhas(koma(summa)), ""].join(";"));
      jooned.push([puhas(KAIBEMAKS), "", "", "", "", "", "", ""].join(";"));
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="kodulinna-maja-myyk.csv"'
      });
      return res.end("﻿" + jooned.join("\r\n") + "\r\n");
    }

    if (tee === "/api/liikmed" && req.method === "GET") {
      return json(res, 200, await q(
        `SELECT id, nimi, roll, amet, telefon, epost, pilt,
                (epost IS NOT NULL) AS onEpost
         FROM liikmed ORDER BY nimi`));
    }

    /* Liikmeid lisab ja kutseid teeb iga liige — maja on ühine.
       Ainult ameti muutmine on lukus, sest amet avab kassa. */
    if (tee === "/api/liikmed" && req.method === "POST") {
      const b = await keha(req);
      const nimi = String(b.nimi || "").trim();
      if (!nimi) return json(res, 400, { viga: "Nimi on täitmata." });
      /* Kassaõigusega liikme saab luua ainult see, kes ameteid jagab.
         Muidu teeks igaüks endale kõrvale konto ja annaks sellele kassa. */
      let amet = kehtiv(b.amet) ? b.amet : "liige";
      if (!annabOigusi(mina) && amet !== "liige") amet = "liige";
      const r = await yks(
        `INSERT INTO liikmed (nimi, roll, amet, administraator)
         VALUES ($1, $2, $3, $4) RETURNING id, nimi, amet`,
        [nimi, String(b.roll || "").trim() || null, amet, annabOigusi({ amet })]);
      return json(res, 200, { ok: true, liige: r });
    }

    if (tee === "/api/liikmed" && req.method === "PATCH") {
      const b = await keha(req);
      const nimi = String(b.nimi || "").trim();
      if (!nimi) return json(res, 400, { viga: "Nimi on täitmata." });
      if (b.amet !== undefined && !kehtiv(b.amet))
        return json(res, 400, { viga: "Tundmatu amet." });

      /* Nime ja tööd majas muudab igaüks. Ametit ainult see, kes ameteid
         jagab — muidu annaks igaüks endale kassaõiguse. */
      const olemas = await yks("SELECT amet FROM liikmed WHERE id = $1", [b.id]);
      if (!olemas) return json(res, 404, { viga: "Sellist liiget ei ole." });
      if (b.amet !== undefined && b.amet !== olemas.amet && !annabOigusi(mina))
        return json(res, 403, {
          viga: "Ameteid muudab ainult administraator — see otsustab, kes kassat näeb."
        });

      /* Keegi peab ameteid jagada saama, muidu ei pääseks kassa juurde
         enam kunagi kedagi juurde panna. */
      if (b.amet !== undefined && !annabOigusi({ amet: b.amet })) {
        const n = await yks(
          `SELECT count(*)::int AS n FROM liikmed
           WHERE amet = ANY($2) AND id <> $1`, [b.id, ANDJAD]);
        if (n.n === 0) return json(res, 400, {
          viga: "Keegi peab ameteid jagama. Anna enne kellelegi teisele administraatori amet."
        });
      }

      const uusAmet = b.amet !== undefined ? b.amet : null;
      const r = await yks(
        `UPDATE liikmed SET nimi = $2, roll = $3,
            amet = coalesce($4, amet),
            administraator = (coalesce($4, amet) = ANY($5)),
            telefon = CASE WHEN $6::boolean THEN $7 ELSE telefon END,
            pilt    = CASE WHEN $8::boolean THEN $9 ELSE pilt END
         WHERE id = $1 RETURNING id, nimi, amet, telefon, pilt`,
        [b.id, nimi, String(b.roll || "").trim() || null, uusAmet, ANDJAD,
         b.telefon !== undefined, String(b.telefon || "").trim() || null,
         b.pilt !== undefined, String(b.pilt || "").trim() || null]);
      if (!r) return json(res, 404, { viga: "Sellist liiget ei ole." });
      return json(res, 200, { ok: true, liige: r });
    }

    /* Liikme eemaldamine. Tema müügid jäävad alles ja müüja väli läheb
       tühjaks — lahkunud inimese müüdud raha ei tohi kassast kaduda.
       Seepärast ütleme ka ette, mitu rida jääb nimeta. */
    if (tee === "/api/liikmed" && req.method === "DELETE") {
      const b = await keha(req);
      if (b.id === mina.id)
        return json(res, 400, { viga: "Iseennast ei saa majast välja võtta." });
      const kes = await yks("SELECT id, amet FROM liikmed WHERE id = $1", [b.id]);
      if (!kes) return json(res, 404, { viga: "Sellist liiget ei ole." });
      /* Administraatorit puutub ainult administraator. Maja ei jää seeläbi
         kunagi ilma administraatorita: iseennast välja võtta ei saa, nii et
         see, kes kustutab, jääb ise alles. */
      if (annabOigusi(kes) && !annabOigusi(mina))
        return json(res, 403, { viga: "Administraatori saab välja võtta ainult administraator." });
      const m = await yks("SELECT count(*)::int AS n FROM myygid WHERE myyja_id = $1", [b.id]);
      await q("DELETE FROM liikmed WHERE id = $1", [b.id]);
      return json(res, 200, { ok: true, myyke: m.n });
    }

    if (tee === "/api/kutse" && req.method === "POST") {
      const b = await keha(req);
      const k = await auth.teeKutse(b.liige_id, alus);
      if (!k) return json(res, 404, { viga: "Sellist liiget ei ole." });
      return json(res, 200, k);
    }

    /* ── lehed ────────────────────────────────────────────────── */
    /* Brauser küsib ikooni ise; ilma vastuseta täidab ta konsooli veaga. */
    if (tee === "/favicon.ico") {
      res.writeHead(200, { "Content-Type": "image/svg+xml" });
      return res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">'
        + '<text y="13" font-size="13">🏠</text></svg>');
    }
    if (tee === "/") return fail(res, mina ? "app.html" : "login.html");
    if (tee === "/tervis") return json(res, 200, { ok: true, aeg: new Date().toISOString() });
    return fail(res, tee.replace(/^\//, ""));
  } catch (e) {
    console.error("VIGA", tee, e.message);
    return json(res, 500, { viga: "Midagi läks serveris valesti." });
  }
});

/* Kõige tavalisem viga ei ole viga: server juba töötab teises aknas.
   Sellele ei tohi vastata veapinuga, vaid ühe selge lausega. */
server.on("error", e => {
  if (e.code === "EADDRINUSE") {
    console.log("\n  Kodulinna Maja juba töötab.");
    console.log("  Ava brauseris: http://localhost:" + PORT);
    console.log("\n  Kui tahad uuesti käivitada, sulge enne see teine must aken.\n");
    process.exit(0);
  }
  console.error("\n  Server ei käivitunud: " + e.message + "\n");
  process.exit(1);
});

/* Oma arvutis kuulame ainult iseennast — ilma selleta oleks rakendus
   nähtav kõigile samas võrgus. Majutuses peab ta kuulama kõiki, sest
   päringud tulevad väljastpoolt. */
const MAJUTUS = process.env.NODE_ENV === "production";
const HOST = process.env.HOST || (MAJUTUS ? "0.0.0.0" : "127.0.0.1");

server.listen(PORT, HOST, () => {
  const yksi = HOST === "127.0.0.1" || HOST === "localhost";
  console.log("\n  Kodulinna Maja töötab.");
  console.log("  Ava brauseris: http://localhost:" + PORT);
  console.log(yksi
    ? "\n  Ligi pääseb ainult sinu arvutist. Keegi teine seda ei näe."
    : "\n  TÄHELEPANU: ligi pääsevad kõik, kes on samas võrgus.");
  console.log("  Jäta see aken lahti. Sulgemine peatab serveri.\n");
});
