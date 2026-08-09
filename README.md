# Kodulinna Maja

MTÜ Tallinna Noorte Klubi Kodulinn sisemine tööleht: müügiarvestus,
töögraafik, kalender, liikmed.

Sisselogimine käib ühekordse lingiga, parooli ei ole. Andmed on ühises
andmebaasis (Neon Postgres), seega kõik liikmed näevad sama seisu.

Õigused: kõik liikmed haldavad kõike — infot, üritusi, kalendrit, graafikut,
liikmeid ja sisselogimislinke. **Ühiskassa on erand.** Kogu maja müüki ja
aruannet näevad ainult raamatupidaja, ülemus ja administraator; teised näevad
oma müüki. Ameteid — mis kassa lahti teevad — jagavad ülemus ja administraator.

**Kogu juhend on failis [LOE.md](LOE.md)** — käivitamine, sisselogimine,
majutus ja mis enne jagamist korda peab olema.

## Lühidalt

```
npm install
npm start        # http://localhost:3000
npm test         # 49 kontrolli
```

Salajased seaded on failis `.env`, mida siin hoidlas ei ole ja kunagi ei tohi olla.
