-- 001 — andmebaasi alus.
--
-- Terve kuju ühes failis: nii saab tühjast andmebaasist maja üles
-- seada. Fail on masina kirjutatud (node tools/skeem.js) ja
-- kirjeldab seda, mis andmebaasis päriselt on — mitte seda, mida
-- keegi mäletab. Käsitsi siia midagi juurde ei kirjutata: uus
-- muudatus tuleb uue nummerdatud failina.
--
-- Ridu ei kustuta ega täida see fail — ainult kuju.

CREATE TABLE IF NOT EXISTS failid (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nimi text NOT NULL,
  kirjeldus text,
  suurus_baiti bigint,
  tyyp text,
  viit text,
  lisaja uuid,
  aeg timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS graafik (
  koht_id text NOT NULL,
  liige_id uuid NOT NULL,
  paev smallint NOT NULL,
  algus time,
  lopp time,
  id uuid DEFAULT gen_random_uuid() NOT NULL
);

CREATE TABLE IF NOT EXISTS grupp (
  id boolean DEFAULT true NOT NULL,
  nimi text NOT NULL,
  ametlik text,
  regkood text,
  kaibemaksukohustuslane boolean DEFAULT false NOT NULL,
  varundatud timestamptz,
  aadress text,
  aadress2 text,
  telefon text,
  epost text,
  lahti text
);

CREATE TABLE IF NOT EXISTS hinnakiri (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  osa_id uuid NOT NULL,
  nimetus text NOT NULL,
  hind numeric(10,2)
);

CREATE TABLE IF NOT EXISTS info (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  pealkiri text NOT NULL,
  sisu text DEFAULT ''::text NOT NULL,
  kinnitus_vaja boolean DEFAULT false NOT NULL,
  autor uuid,
  muudetud timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS kinnitused (
  tyyp text NOT NULL,
  kirje_id uuid NOT NULL,
  liige_id uuid NOT NULL,
  aeg timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS kommentaarid (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  yritus_id uuid,
  autor uuid,
  aeg timestamptz DEFAULT now() NOT NULL,
  tekst text NOT NULL,
  info_id uuid
);

CREATE TABLE IF NOT EXISTS liikmed (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nimi text NOT NULL,
  roll text,
  telefon text,
  epost text,
  administraator boolean DEFAULT false NOT NULL,
  pilt text,
  loodud timestamptz DEFAULT now() NOT NULL,
  amet text DEFAULT 'liige'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS loetud (
  liige_id uuid NOT NULL,
  votme text NOT NULL,
  aeg timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS majad (
  id text NOT NULL,
  nimi text NOT NULL,
  jrk integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS myygid (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  toode_id uuid NOT NULL,
  aeg timestamptz DEFAULT now() NOT NULL,
  kogus integer NOT NULL,
  hind numeric(10,2) NOT NULL,
  myyja_id uuid,
  summa numeric(12,2) GENERATED ALWAYS AS (((kogus)::numeric * hind)) STORED
);

CREATE TABLE IF NOT EXISTS myyk_osad (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nimi text NOT NULL,
  jrk integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS osalemine (
  yritus_id uuid NOT NULL,
  liige_id uuid NOT NULL,
  vastus text NOT NULL,
  aeg timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS puudumised (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  liige_id uuid NOT NULL,
  algus date NOT NULL,
  lopp date NOT NULL,
  liik text NOT NULL,
  markus text,
  kellast time,
  kellani time
);

CREATE TABLE IF NOT EXISTS sisselogimise_margid (
  mark text NOT NULL,
  liige_id uuid NOT NULL,
  loodud timestamptz DEFAULT now() NOT NULL,
  aegub timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS sonumi_margid (
  sonum_id uuid NOT NULL,
  liige_id uuid NOT NULL,
  marge text NOT NULL,
  aeg timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS sonumid (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  vestlus_id uuid NOT NULL,
  autor uuid,
  aeg timestamptz DEFAULT now() NOT NULL,
  tekst text NOT NULL
);

CREATE TABLE IF NOT EXISTS too_paevad (
  too_id uuid NOT NULL,
  paev smallint NOT NULL
);

CREATE TABLE IF NOT EXISTS too_tehtud (
  too_id uuid NOT NULL,
  kuup date NOT NULL,
  kes_id uuid,
  aeg timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS too_vahele (
  too_id uuid NOT NULL,
  kuup date NOT NULL
);

CREATE TABLE IF NOT EXISTS tood (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  koht_id text NOT NULL,
  nimi text NOT NULL,
  algus time,
  lopp time,
  kuup date,
  kes_id uuid,
  markus text,
  algab date,
  kinnita boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS tooted (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  osa_id uuid,
  nimetus text NOT NULL,
  hind numeric(10,2) DEFAULT 0 NOT NULL,
  loodud timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS ulesanded (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  yritus_id uuid NOT NULL,
  tekst text NOT NULL,
  votja_id uuid
);

CREATE TABLE IF NOT EXISTS vestluse_liikmed (
  vestlus_id uuid NOT NULL,
  liige_id uuid NOT NULL,
  lisatud timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS vestlused (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  liik text NOT NULL,
  pealkiri text,
  a_id uuid,
  b_id uuid,
  autor uuid,
  loodud timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS yritused (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  koht_id text,
  pealkiri text NOT NULL,
  algus timestamptz NOT NULL,
  lopp timestamptz,
  asukoht text,
  kirjeldus text,
  kinnitus_vaja boolean DEFAULT false NOT NULL,
  autor uuid,
  loodud timestamptz DEFAULT now() NOT NULL
);

-- Võtmed, viited ja kontrollid
ALTER TABLE failid DROP CONSTRAINT IF EXISTS failid_pkey;
ALTER TABLE failid ADD CONSTRAINT failid_pkey PRIMARY KEY (id);
ALTER TABLE graafik DROP CONSTRAINT IF EXISTS graafik_pkey;
ALTER TABLE graafik ADD CONSTRAINT graafik_pkey PRIMARY KEY (id);
ALTER TABLE grupp DROP CONSTRAINT IF EXISTS grupp_pkey;
ALTER TABLE grupp ADD CONSTRAINT grupp_pkey PRIMARY KEY (id);
ALTER TABLE hinnakiri DROP CONSTRAINT IF EXISTS hinnakiri_pkey;
ALTER TABLE hinnakiri ADD CONSTRAINT hinnakiri_pkey PRIMARY KEY (id);
ALTER TABLE info DROP CONSTRAINT IF EXISTS info_pkey;
ALTER TABLE info ADD CONSTRAINT info_pkey PRIMARY KEY (id);
ALTER TABLE kinnitused DROP CONSTRAINT IF EXISTS kinnitused_pkey;
ALTER TABLE kinnitused ADD CONSTRAINT kinnitused_pkey PRIMARY KEY (tyyp, kirje_id, liige_id);
ALTER TABLE kommentaarid DROP CONSTRAINT IF EXISTS kommentaarid_pkey;
ALTER TABLE kommentaarid ADD CONSTRAINT kommentaarid_pkey PRIMARY KEY (id);
ALTER TABLE liikmed DROP CONSTRAINT IF EXISTS liikmed_pkey;
ALTER TABLE liikmed ADD CONSTRAINT liikmed_pkey PRIMARY KEY (id);
ALTER TABLE loetud DROP CONSTRAINT IF EXISTS loetud_pkey;
ALTER TABLE loetud ADD CONSTRAINT loetud_pkey PRIMARY KEY (liige_id, votme);
ALTER TABLE majad DROP CONSTRAINT IF EXISTS majad_pkey;
ALTER TABLE majad ADD CONSTRAINT majad_pkey PRIMARY KEY (id);
ALTER TABLE myygid DROP CONSTRAINT IF EXISTS myygid_pkey;
ALTER TABLE myygid ADD CONSTRAINT myygid_pkey PRIMARY KEY (id);
ALTER TABLE myyk_osad DROP CONSTRAINT IF EXISTS myyk_osad_pkey;
ALTER TABLE myyk_osad ADD CONSTRAINT myyk_osad_pkey PRIMARY KEY (id);
ALTER TABLE osalemine DROP CONSTRAINT IF EXISTS osalemine_pkey;
ALTER TABLE osalemine ADD CONSTRAINT osalemine_pkey PRIMARY KEY (yritus_id, liige_id);
ALTER TABLE puudumised DROP CONSTRAINT IF EXISTS puudumised_pkey;
ALTER TABLE puudumised ADD CONSTRAINT puudumised_pkey PRIMARY KEY (id);
ALTER TABLE sisselogimise_margid DROP CONSTRAINT IF EXISTS sisselogimise_margid_pkey;
ALTER TABLE sisselogimise_margid ADD CONSTRAINT sisselogimise_margid_pkey PRIMARY KEY (mark);
ALTER TABLE sonumi_margid DROP CONSTRAINT IF EXISTS sonumi_margid_pkey;
ALTER TABLE sonumi_margid ADD CONSTRAINT sonumi_margid_pkey PRIMARY KEY (sonum_id, liige_id, marge);
ALTER TABLE sonumid DROP CONSTRAINT IF EXISTS sonumid_pkey;
ALTER TABLE sonumid ADD CONSTRAINT sonumid_pkey PRIMARY KEY (id);
ALTER TABLE too_paevad DROP CONSTRAINT IF EXISTS too_paevad_pkey;
ALTER TABLE too_paevad ADD CONSTRAINT too_paevad_pkey PRIMARY KEY (too_id, paev);
ALTER TABLE too_tehtud DROP CONSTRAINT IF EXISTS too_tehtud_pkey;
ALTER TABLE too_tehtud ADD CONSTRAINT too_tehtud_pkey PRIMARY KEY (too_id, kuup);
ALTER TABLE too_vahele DROP CONSTRAINT IF EXISTS too_vahele_pkey;
ALTER TABLE too_vahele ADD CONSTRAINT too_vahele_pkey PRIMARY KEY (too_id, kuup);
ALTER TABLE tood DROP CONSTRAINT IF EXISTS tood_pkey;
ALTER TABLE tood ADD CONSTRAINT tood_pkey PRIMARY KEY (id);
ALTER TABLE tooted DROP CONSTRAINT IF EXISTS tooted_pkey;
ALTER TABLE tooted ADD CONSTRAINT tooted_pkey PRIMARY KEY (id);
ALTER TABLE ulesanded DROP CONSTRAINT IF EXISTS ulesanded_pkey;
ALTER TABLE ulesanded ADD CONSTRAINT ulesanded_pkey PRIMARY KEY (id);
ALTER TABLE vestluse_liikmed DROP CONSTRAINT IF EXISTS vestluse_liikmed_pkey;
ALTER TABLE vestluse_liikmed ADD CONSTRAINT vestluse_liikmed_pkey PRIMARY KEY (vestlus_id, liige_id);
ALTER TABLE vestlused DROP CONSTRAINT IF EXISTS vestlused_pkey;
ALTER TABLE vestlused ADD CONSTRAINT vestlused_pkey PRIMARY KEY (id);
ALTER TABLE yritused DROP CONSTRAINT IF EXISTS yritused_pkey;
ALTER TABLE yritused ADD CONSTRAINT yritused_pkey PRIMARY KEY (id);
ALTER TABLE hinnakiri DROP CONSTRAINT IF EXISTS hinnakiri_osa_id_nimetus_key;
ALTER TABLE hinnakiri ADD CONSTRAINT hinnakiri_osa_id_nimetus_key UNIQUE (osa_id, nimetus);
ALTER TABLE graafik DROP CONSTRAINT IF EXISTS graafik_check;
ALTER TABLE graafik ADD CONSTRAINT graafik_check CHECK (((lopp IS NULL) OR (algus IS NOT NULL)));
ALTER TABLE graafik DROP CONSTRAINT IF EXISTS graafik_paev_check;
ALTER TABLE graafik ADD CONSTRAINT graafik_paev_check CHECK (((paev >= 0) AND (paev <= 6)));
ALTER TABLE grupp DROP CONSTRAINT IF EXISTS grupp_id_check;
ALTER TABLE grupp ADD CONSTRAINT grupp_id_check CHECK (id);
ALTER TABLE hinnakiri DROP CONSTRAINT IF EXISTS hinnakiri_hind_check;
ALTER TABLE hinnakiri ADD CONSTRAINT hinnakiri_hind_check CHECK (((hind IS NULL) OR (hind >= (0)::numeric)));
ALTER TABLE kinnitused DROP CONSTRAINT IF EXISTS kinnitused_tyyp_check;
ALTER TABLE kinnitused ADD CONSTRAINT kinnitused_tyyp_check CHECK ((tyyp = ANY (ARRAY['yritus'::text, 'info'::text])));
ALTER TABLE kommentaarid DROP CONSTRAINT IF EXISTS kommentaarid_yks_omanik;
ALTER TABLE kommentaarid ADD CONSTRAINT kommentaarid_yks_omanik CHECK (((yritus_id IS NULL) <> (info_id IS NULL)));
ALTER TABLE liikmed DROP CONSTRAINT IF EXISTS liikmed_amet_check;
ALTER TABLE liikmed ADD CONSTRAINT liikmed_amet_check CHECK ((amet = ANY (ARRAY['liige'::text, 'raamatupidaja'::text, 'ulemus'::text, 'administraator'::text])));
ALTER TABLE myygid DROP CONSTRAINT IF EXISTS myygid_hind_check;
ALTER TABLE myygid ADD CONSTRAINT myygid_hind_check CHECK ((hind >= (0)::numeric));
ALTER TABLE myygid DROP CONSTRAINT IF EXISTS myygid_kogus_check;
ALTER TABLE myygid ADD CONSTRAINT myygid_kogus_check CHECK ((kogus > 0));
ALTER TABLE osalemine DROP CONSTRAINT IF EXISTS osalemine_vastus_check;
ALTER TABLE osalemine ADD CONSTRAINT osalemine_vastus_check CHECK ((vastus = ANY (ARRAY['jah'::text, 'ei'::text])));
ALTER TABLE puudumised DROP CONSTRAINT IF EXISTS puudumised_check;
ALTER TABLE puudumised ADD CONSTRAINT puudumised_check CHECK ((lopp >= algus));
ALTER TABLE puudumised DROP CONSTRAINT IF EXISTS puudumised_kell_check;
ALTER TABLE puudumised ADD CONSTRAINT puudumised_kell_check CHECK (((kellani IS NULL) OR (kellast IS NOT NULL)));
ALTER TABLE puudumised DROP CONSTRAINT IF EXISTS puudumised_liik_check;
ALTER TABLE puudumised ADD CONSTRAINT puudumised_liik_check CHECK ((liik = ANY (ARRAY['puhkus'::text, 'haigus'::text, 'vaba'::text])));
ALTER TABLE sonumi_margid DROP CONSTRAINT IF EXISTS sonumi_margid_luhike;
ALTER TABLE sonumi_margid ADD CONSTRAINT sonumi_margid_luhike CHECK (((length(marge) >= 1) AND (length(marge) <= 8)));
ALTER TABLE too_paevad DROP CONSTRAINT IF EXISTS too_paevad_paev_check;
ALTER TABLE too_paevad ADD CONSTRAINT too_paevad_paev_check CHECK (((paev >= 0) AND (paev <= 6)));
ALTER TABLE tooted DROP CONSTRAINT IF EXISTS tooted_hind_check;
ALTER TABLE tooted ADD CONSTRAINT tooted_hind_check CHECK ((hind >= (0)::numeric));
ALTER TABLE vestlused DROP CONSTRAINT IF EXISTS vestlused_check;
ALTER TABLE vestlused ADD CONSTRAINT vestlused_check CHECK ((((liik = 'teema'::text) AND (pealkiri IS NOT NULL) AND (a_id IS NULL)) OR ((liik = 'kiri'::text) AND (a_id IS NOT NULL) AND (b_id IS NOT NULL) AND (a_id < b_id)) OR ((liik = 'grupp'::text) AND (pealkiri IS NOT NULL) AND (a_id IS NULL))));
ALTER TABLE vestlused DROP CONSTRAINT IF EXISTS vestlused_liik_check;
ALTER TABLE vestlused ADD CONSTRAINT vestlused_liik_check CHECK ((liik = ANY (ARRAY['teema'::text, 'kiri'::text, 'grupp'::text])));
ALTER TABLE yritused DROP CONSTRAINT IF EXISTS yritused_check;
ALTER TABLE yritused ADD CONSTRAINT yritused_check CHECK (((lopp IS NULL) OR (lopp >= algus)));
ALTER TABLE failid DROP CONSTRAINT IF EXISTS failid_lisaja_fkey;
ALTER TABLE failid ADD CONSTRAINT failid_lisaja_fkey FOREIGN KEY (lisaja) REFERENCES liikmed(id) ON DELETE SET NULL;
ALTER TABLE graafik DROP CONSTRAINT IF EXISTS graafik_koht_id_fkey;
ALTER TABLE graafik ADD CONSTRAINT graafik_koht_id_fkey FOREIGN KEY (koht_id) REFERENCES majad(id) ON DELETE CASCADE;
ALTER TABLE graafik DROP CONSTRAINT IF EXISTS graafik_liige_id_fkey;
ALTER TABLE graafik ADD CONSTRAINT graafik_liige_id_fkey FOREIGN KEY (liige_id) REFERENCES liikmed(id) ON DELETE CASCADE;
ALTER TABLE hinnakiri DROP CONSTRAINT IF EXISTS hinnakiri_osa_id_fkey;
ALTER TABLE hinnakiri ADD CONSTRAINT hinnakiri_osa_id_fkey FOREIGN KEY (osa_id) REFERENCES myyk_osad(id) ON DELETE CASCADE;
ALTER TABLE info DROP CONSTRAINT IF EXISTS info_autor_fkey;
ALTER TABLE info ADD CONSTRAINT info_autor_fkey FOREIGN KEY (autor) REFERENCES liikmed(id) ON DELETE SET NULL;
ALTER TABLE kinnitused DROP CONSTRAINT IF EXISTS kinnitused_liige_id_fkey;
ALTER TABLE kinnitused ADD CONSTRAINT kinnitused_liige_id_fkey FOREIGN KEY (liige_id) REFERENCES liikmed(id) ON DELETE CASCADE;
ALTER TABLE kommentaarid DROP CONSTRAINT IF EXISTS kommentaarid_autor_fkey;
ALTER TABLE kommentaarid ADD CONSTRAINT kommentaarid_autor_fkey FOREIGN KEY (autor) REFERENCES liikmed(id) ON DELETE SET NULL;
ALTER TABLE kommentaarid DROP CONSTRAINT IF EXISTS kommentaarid_info_id_fkey;
ALTER TABLE kommentaarid ADD CONSTRAINT kommentaarid_info_id_fkey FOREIGN KEY (info_id) REFERENCES info(id) ON DELETE CASCADE;
ALTER TABLE kommentaarid DROP CONSTRAINT IF EXISTS kommentaarid_yritus_id_fkey;
ALTER TABLE kommentaarid ADD CONSTRAINT kommentaarid_yritus_id_fkey FOREIGN KEY (yritus_id) REFERENCES yritused(id) ON DELETE CASCADE;
ALTER TABLE loetud DROP CONSTRAINT IF EXISTS loetud_liige_id_fkey;
ALTER TABLE loetud ADD CONSTRAINT loetud_liige_id_fkey FOREIGN KEY (liige_id) REFERENCES liikmed(id) ON DELETE CASCADE;
ALTER TABLE myygid DROP CONSTRAINT IF EXISTS myygid_myyja_id_fkey;
ALTER TABLE myygid ADD CONSTRAINT myygid_myyja_id_fkey FOREIGN KEY (myyja_id) REFERENCES liikmed(id) ON DELETE SET NULL;
ALTER TABLE myygid DROP CONSTRAINT IF EXISTS myygid_toode_id_fkey;
ALTER TABLE myygid ADD CONSTRAINT myygid_toode_id_fkey FOREIGN KEY (toode_id) REFERENCES tooted(id) ON DELETE CASCADE;
ALTER TABLE osalemine DROP CONSTRAINT IF EXISTS osalemine_liige_id_fkey;
ALTER TABLE osalemine ADD CONSTRAINT osalemine_liige_id_fkey FOREIGN KEY (liige_id) REFERENCES liikmed(id) ON DELETE CASCADE;
ALTER TABLE osalemine DROP CONSTRAINT IF EXISTS osalemine_yritus_id_fkey;
ALTER TABLE osalemine ADD CONSTRAINT osalemine_yritus_id_fkey FOREIGN KEY (yritus_id) REFERENCES yritused(id) ON DELETE CASCADE;
ALTER TABLE puudumised DROP CONSTRAINT IF EXISTS puudumised_liige_id_fkey;
ALTER TABLE puudumised ADD CONSTRAINT puudumised_liige_id_fkey FOREIGN KEY (liige_id) REFERENCES liikmed(id) ON DELETE CASCADE;
ALTER TABLE sisselogimise_margid DROP CONSTRAINT IF EXISTS sisselogimise_margid_liige_id_fkey;
ALTER TABLE sisselogimise_margid ADD CONSTRAINT sisselogimise_margid_liige_id_fkey FOREIGN KEY (liige_id) REFERENCES liikmed(id) ON DELETE CASCADE;
ALTER TABLE sonumi_margid DROP CONSTRAINT IF EXISTS sonumi_margid_liige_id_fkey;
ALTER TABLE sonumi_margid ADD CONSTRAINT sonumi_margid_liige_id_fkey FOREIGN KEY (liige_id) REFERENCES liikmed(id) ON DELETE CASCADE;
ALTER TABLE sonumi_margid DROP CONSTRAINT IF EXISTS sonumi_margid_sonum_id_fkey;
ALTER TABLE sonumi_margid ADD CONSTRAINT sonumi_margid_sonum_id_fkey FOREIGN KEY (sonum_id) REFERENCES sonumid(id) ON DELETE CASCADE;
ALTER TABLE sonumid DROP CONSTRAINT IF EXISTS sonumid_autor_fkey;
ALTER TABLE sonumid ADD CONSTRAINT sonumid_autor_fkey FOREIGN KEY (autor) REFERENCES liikmed(id) ON DELETE SET NULL;
ALTER TABLE sonumid DROP CONSTRAINT IF EXISTS sonumid_vestlus_id_fkey;
ALTER TABLE sonumid ADD CONSTRAINT sonumid_vestlus_id_fkey FOREIGN KEY (vestlus_id) REFERENCES vestlused(id) ON DELETE CASCADE;
ALTER TABLE too_paevad DROP CONSTRAINT IF EXISTS too_paevad_too_id_fkey;
ALTER TABLE too_paevad ADD CONSTRAINT too_paevad_too_id_fkey FOREIGN KEY (too_id) REFERENCES tood(id) ON DELETE CASCADE;
ALTER TABLE too_tehtud DROP CONSTRAINT IF EXISTS too_tehtud_kes_id_fkey;
ALTER TABLE too_tehtud ADD CONSTRAINT too_tehtud_kes_id_fkey FOREIGN KEY (kes_id) REFERENCES liikmed(id) ON DELETE SET NULL;
ALTER TABLE too_tehtud DROP CONSTRAINT IF EXISTS too_tehtud_too_id_fkey;
ALTER TABLE too_tehtud ADD CONSTRAINT too_tehtud_too_id_fkey FOREIGN KEY (too_id) REFERENCES tood(id) ON DELETE CASCADE;
ALTER TABLE too_vahele DROP CONSTRAINT IF EXISTS too_vahele_too_id_fkey;
ALTER TABLE too_vahele ADD CONSTRAINT too_vahele_too_id_fkey FOREIGN KEY (too_id) REFERENCES tood(id) ON DELETE CASCADE;
ALTER TABLE tood DROP CONSTRAINT IF EXISTS tood_kes_id_fkey;
ALTER TABLE tood ADD CONSTRAINT tood_kes_id_fkey FOREIGN KEY (kes_id) REFERENCES liikmed(id) ON DELETE SET NULL;
ALTER TABLE tood DROP CONSTRAINT IF EXISTS tood_koht_id_fkey;
ALTER TABLE tood ADD CONSTRAINT tood_koht_id_fkey FOREIGN KEY (koht_id) REFERENCES majad(id);
ALTER TABLE tooted DROP CONSTRAINT IF EXISTS tooted_osa_id_fkey;
ALTER TABLE tooted ADD CONSTRAINT tooted_osa_id_fkey FOREIGN KEY (osa_id) REFERENCES myyk_osad(id) ON DELETE SET NULL;
ALTER TABLE ulesanded DROP CONSTRAINT IF EXISTS ulesanded_votja_id_fkey;
ALTER TABLE ulesanded ADD CONSTRAINT ulesanded_votja_id_fkey FOREIGN KEY (votja_id) REFERENCES liikmed(id) ON DELETE SET NULL;
ALTER TABLE ulesanded DROP CONSTRAINT IF EXISTS ulesanded_yritus_id_fkey;
ALTER TABLE ulesanded ADD CONSTRAINT ulesanded_yritus_id_fkey FOREIGN KEY (yritus_id) REFERENCES yritused(id) ON DELETE CASCADE;
ALTER TABLE vestluse_liikmed DROP CONSTRAINT IF EXISTS vestluse_liikmed_liige_id_fkey;
ALTER TABLE vestluse_liikmed ADD CONSTRAINT vestluse_liikmed_liige_id_fkey FOREIGN KEY (liige_id) REFERENCES liikmed(id) ON DELETE CASCADE;
ALTER TABLE vestluse_liikmed DROP CONSTRAINT IF EXISTS vestluse_liikmed_vestlus_id_fkey;
ALTER TABLE vestluse_liikmed ADD CONSTRAINT vestluse_liikmed_vestlus_id_fkey FOREIGN KEY (vestlus_id) REFERENCES vestlused(id) ON DELETE CASCADE;
ALTER TABLE vestlused DROP CONSTRAINT IF EXISTS vestlused_a_id_fkey;
ALTER TABLE vestlused ADD CONSTRAINT vestlused_a_id_fkey FOREIGN KEY (a_id) REFERENCES liikmed(id) ON DELETE CASCADE;
ALTER TABLE vestlused DROP CONSTRAINT IF EXISTS vestlused_autor_fkey;
ALTER TABLE vestlused ADD CONSTRAINT vestlused_autor_fkey FOREIGN KEY (autor) REFERENCES liikmed(id) ON DELETE SET NULL;
ALTER TABLE vestlused DROP CONSTRAINT IF EXISTS vestlused_b_id_fkey;
ALTER TABLE vestlused ADD CONSTRAINT vestlused_b_id_fkey FOREIGN KEY (b_id) REFERENCES liikmed(id) ON DELETE CASCADE;
ALTER TABLE yritused DROP CONSTRAINT IF EXISTS yritused_autor_fkey;
ALTER TABLE yritused ADD CONSTRAINT yritused_autor_fkey FOREIGN KEY (autor) REFERENCES liikmed(id) ON DELETE SET NULL;
ALTER TABLE yritused DROP CONSTRAINT IF EXISTS yritused_koht_id_fkey;
ALTER TABLE yritused ADD CONSTRAINT yritused_koht_id_fkey FOREIGN KEY (koht_id) REFERENCES majad(id);

-- Indeksid
CREATE INDEX IF NOT EXISTS kommentaarid_info_idx ON public.kommentaarid USING btree (info_id);
CREATE INDEX IF NOT EXISTS margid_aegub ON public.sisselogimise_margid USING btree (aegub);
CREATE INDEX IF NOT EXISTS myygid_aeg ON public.myygid USING btree (aeg);
CREATE INDEX IF NOT EXISTS myygid_myyja ON public.myygid USING btree (myyja_id, aeg);
CREATE INDEX IF NOT EXISTS puudumised_vahemik ON public.puudumised USING btree (liige_id, algus, lopp);
CREATE INDEX IF NOT EXISTS sonumi_margid_sonum_idx ON public.sonumi_margid USING btree (sonum_id);
CREATE INDEX IF NOT EXISTS sonumid_vestlus_aeg ON public.sonumid USING btree (vestlus_id, aeg);
CREATE INDEX IF NOT EXISTS tooted_osa ON public.tooted USING btree (osa_id);
CREATE INDEX IF NOT EXISTS vestluse_liikmed_liige_idx ON public.vestluse_liikmed USING btree (liige_id);
CREATE UNIQUE INDEX IF NOT EXISTS vestlused_kiri_uniq ON public.vestlused USING btree (a_id, b_id) WHERE (liik = 'kiri'::text);
CREATE INDEX IF NOT EXISTS yritused_algus ON public.yritused USING btree (koht_id, algus);
