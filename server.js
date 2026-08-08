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

const PORT = Number(process.env.PORT || 3000);
const AVALIK = path.join(__dirname, "public");

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
        ok: true, kiriSaadetud: !!r.kiriSaadetud, arenduseLink: r.link || null
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
    if (tee === "/api/mina") return json(res, 200, { mina });

    /* Edasi ei lasta ilma sisselogimiseta. */
    if (tee.startsWith("/api/") && !mina) return json(res, 401, { viga: "Logi sisse." });

    /* ── müük ─────────────────────────────────────────────────── */
    if (tee === "/api/myyk") {
      /* Kogu maja müüki näeb administraator, teised näevad oma müüki.
         See kontroll on serveris, mitte ekraanil — nii ei saa sellest
         mööda minna, ükskõik mida brauseris teha. */
      const koik = mina.administraator;
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

    if (tee === "/api/liikmed" && req.method === "GET") {
      return json(res, 200, await q(
        `SELECT id, nimi, roll, administraator, (epost IS NOT NULL) AS onEpost
         FROM liikmed ORDER BY nimi`));
    }

    /* Liikmete lisamine ja kutsed on administraatori asi. */
    if (tee === "/api/liikmed" && req.method === "POST") {
      if (!mina.administraator) return json(res, 403, { viga: "Ainult administraator." });
      const b = await keha(req);
      const nimi = String(b.nimi || "").trim();
      if (!nimi) return json(res, 400, { viga: "Nimi on täitmata." });
      const r = await yks(
        `INSERT INTO liikmed (nimi, roll, administraator)
         VALUES ($1, $2, $3) RETURNING id, nimi`,
        [nimi, String(b.roll || "").trim() || null, !!b.administraator]);
      return json(res, 200, { ok: true, liige: r });
    }

    if (tee === "/api/liikmed" && req.method === "PATCH") {
      if (!mina.administraator) return json(res, 403, { viga: "Ainult administraator." });
      const b = await keha(req);
      const nimi = String(b.nimi || "").trim();
      if (!nimi) return json(res, 400, { viga: "Nimi on täitmata." });
      /* Viimast administraatorit ei tohi ilma jätta — muidu ei saa keegi
         enam kedagi kutsuda ega õigusi anda. */
      if (b.administraator === false) {
        const n = await yks(
          "SELECT count(*)::int AS n FROM liikmed WHERE administraator AND id <> $1", [b.id]);
        if (n.n === 0) return json(res, 400, {
          viga: "Vähemalt üks administraator peab alles jääma."
        });
      }
      const r = await yks(
        `UPDATE liikmed SET nimi = $2, roll = $3,
            administraator = coalesce($4, administraator)
         WHERE id = $1 RETURNING id, nimi`,
        [b.id, nimi, String(b.roll || "").trim() || null,
         typeof b.administraator === "boolean" ? b.administraator : null]);
      if (!r) return json(res, 404, { viga: "Sellist liiget ei ole." });
      return json(res, 200, { ok: true, liige: r });
    }

    if (tee === "/api/kutse" && req.method === "POST") {
      if (!mina.administraator) return json(res, 403, { viga: "Ainult administraator." });
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
