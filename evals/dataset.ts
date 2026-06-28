// The labeled query set the eval harness runs over. See ADR 0006.
//
// Each query carries its gold label: the document_url(s) that should be
// retrieved, the facts the answer must contain, and whether the answer should
// refuse (out-of-corpus queries).
//
// Scoring is corpus-state-dependent: the evals run against whatever is in
// chunks.db. Website queries need the website ingest (`pnpm run ingest:website`)
// and the source-routing/recency queries need the newspaper editions
// (`pnpm run ingest:pdf`). A gold doc absent from the index scores 0 — a missing
// ingest reads as a retrieval miss, not an error.
//
// `relevantDocUrls` and `expectedFacts` are empty for refusal queries.
//
// Corpus version: the website gold labels were authored/verified against the
// crawl of 2026-05-18 (www.kisslegg.de). The reproducible way to score them is
// the frozen fixture — `pnpm run eval:fixture` ingests `evals/fixtures/
// crawl-cache/` (a committed subset of that crawl) into an isolated
// `eval-chunks.db`; `pnpm run eval` then reads that DB. A live `crawl:website`
// re-fetch drifts from these labels (pages move/edit) and is NOT what the eval
// scores against. See TODO.md "P1 — make the eval reproducible".

export type QueryCategory =
  | 'single-chunk-factual'
  | 'multi-chunk-synthesis'
  | 'out-of-corpus-refusal'
  | 'source-routing-recency';

export interface GoldQuery {
  id: string;
  category: QueryCategory;
  query: string;
  relevantDocUrls: string[];
  expectedFacts: string[];
  mustRefuse: boolean;
}

const SITE = 'https://www.kisslegg.de';

// Convenience: build an answerable website query (paths are joined to SITE).
function ask(
  id: string,
  category: Exclude<QueryCategory, 'out-of-corpus-refusal' | 'source-routing-recency'>,
  query: string,
  relevantPaths: string[],
  expectedFacts: string[],
): GoldQuery {
  return {
    id,
    category,
    query,
    relevantDocUrls: relevantPaths.map((p) => `${SITE}${p}`),
    expectedFacts,
    mustRefuse: false,
  };
}

// Convenience: build a source-routing/recency query whose authoritative source
// is the newspaper Amtsblatt. The gold doc is the edition's bare-filename
// document_url (newspaper editions are not under SITE). The topic is usually
// also covered on the website, but the Amtsblatt is the authoritative source
// (CONTEXT.md: "Latest edition = most authoritative"), so retrieval should
// surface the edition via its source_weight / recency boost.
function route(
  id: string,
  query: string,
  editionDocUrls: string[],
  expectedFacts: string[],
): GoldQuery {
  return {
    id,
    category: 'source-routing-recency',
    query,
    relevantDocUrls: editionDocUrls,
    expectedFacts,
    mustRefuse: false,
  };
}

// Convenience: build an out-of-corpus refusal query.
function refuse(id: string, query: string): GoldQuery {
  return {
    id,
    category: 'out-of-corpus-refusal',
    query,
    relevantDocUrls: [],
    expectedFacts: [],
    mustRefuse: true,
  };
}

export const dataset: GoldQuery[] = [
  // --- single-chunk factual: answer sits in one page ---
  ask(
    'sf-01',
    'single-chunk-factual',
    'Wie hart ist das Trinkwasser in Kißlegg?',
    ['/buerger/leben-wohnen/bauen-wohnen/wasserwerte'],
    ['Gesamthärte rund 18,8 °dH', 'Härtebereich hart (3)'],
  ),
  ask(
    'sf-02',
    'single-chunk-factual',
    'Wer ist der Bürgermeister von Kißlegg?',
    ['/buerger/rathaus-service/rathaus/buergermeister'],
    ['Dieter Krattenmacher'],
  ),
  ask(
    'sf-03',
    'single-chunk-factual',
    'Wie viele Einwohner hat Kißlegg?',
    ['/buerger/gemeindeinfo-wirtschaft/geschichte-struktur/kisslegg-in-zahlen'],
    ['etwa 9.315 Einwohner', 'Stand 31.12.2022'],
  ),
  ask(
    'sf-04',
    'single-chunk-factual',
    'Wann wurde Kißlegg zum ersten Mal urkundlich erwähnt?',
    ['/buerger/gemeindeinfo-wirtschaft/geschichte-struktur/geschichte-kisslegg'],
    ['im Jahr 824', 'als Ratpotiscella'],
  ),
  ask(
    'sf-05',
    'single-chunk-factual',
    'Wo finden in Kißlegg standesamtliche Trauungen statt?',
    ['/buerger/rathaus-service/buergerdienste/heiraten-im-neuen-schloss'],
    ['im Lüstersaal', 'im Neuen Schloss'],
  ),
  ask(
    'sf-06',
    'single-chunk-factual',
    'Bis wann muss ich meinen Wasserzählerstand zurückschicken?',
    ['/buerger/rathaus-service/buergerdienste/selbstablesung-der-wasserzaehler'],
    ['bis spätestens 15. November'],
  ),
  ask(
    'sf-07',
    'single-chunk-factual',
    'Wer ist für die Abfallbeseitigung in Kißlegg zuständig?',
    ['/buerger/leben-wohnen/ver-entsorgung/abfall-wertstoffe'],
    ['der Landkreis Ravensburg', 'seit dem 01.01.2016'],
  ),
  ask(
    'sf-08',
    'single-chunk-factual',
    'Was ist der höchste Punkt der Gemeinde Kißlegg?',
    ['/buerger/gemeindeinfo-wirtschaft/geschichte-struktur/kisslegg-in-zahlen'],
    ['der Aussichtspunkt Buschel', '739 m'],
  ),
  ask(
    'sf-09',
    'single-chunk-factual',
    'Wann wurde Bürgermeister Krattenmacher wiedergewählt?',
    ['/buerger/rathaus-service/rathaus/buergermeister'],
    ['am 04.10.2020', 'für die dritte Amtszeit'],
  ),
  // (Removed sf-10 "Welche Fläche hat die Gemeinde Kißlegg?": the kisslegg.de
  // source data is self-contradictory — it lists both 92.400 ha and 9.240 ha —
  // so there is no single correct gold fact to score against.)
  ask(
    'sf-11',
    'single-chunk-factual',
    'Unter welcher Hotline erreiche ich die Abfallberatung, wenn meine Mülltonne nicht geleert wurde?',
    ['/buerger/leben-wohnen/ver-entsorgung/abfall-wertstoffe'],
    ['Landratsamt Ravensburg', 'Telefonnummer 0751 85-2345'],
  ),
  ask(
    'sf-12',
    'single-chunk-factual',
    'Wie viele Einwohner leben im Ortsteil Waltershofen?',
    ['/buerger/gemeindeinfo-wirtschaft/geschichte-struktur/kisslegg-in-zahlen'],
    ['1.202 Einwohner in Waltershofen'],
  ),
  ask(
    'sf-13',
    'single-chunk-factual',
    'Wer sind die ehrenamtlichen Stellvertreter des Bürgermeisters?',
    ['/buerger/rathaus-service/rathaus/buergermeister'],
    ['Bernd Dux', 'Petra Evers'],
  ),
  ask(
    'sf-14',
    'single-chunk-factual',
    'Wie hart ist das Trinkwasser im Ortsteil Immenried?',
    ['/buerger/leben-wohnen/bauen-wohnen/wasserwerte'],
    ['Gesamthärte rund 16,6 °dH', 'Härtebereich hart (3)'],
  ),
  ask(
    'sf-15',
    'single-chunk-factual',
    'Über welche Autobahn ist Kißlegg angebunden?',
    ['/buerger/gemeindeinfo-wirtschaft/lage-anfahrt/anreise-oepnv-e-carsharing'],
    ['über die A96', 'Ausfahrt Kißlegg'],
  ),
  ask(
    'sf-16',
    'single-chunk-factual',
    'Welche Stellen sind aktuell bei der Gemeinde Kißlegg ausgeschrieben?',
    ['/buerger/rathaus-service/stellenangebote'],
    ['Technische/r Mitarbeiter-/in im Bereich Tiefbau', 'Pädagogische Fachkraft'],
  ),

  // --- multi-chunk synthesis: answer needs 2+ chunks, sometimes 2+ documents ---
  ask(
    'ms-01',
    'multi-chunk-synthesis',
    'Welche Kinderbetreuungseinrichtungen gibt es in Kißlegg?',
    ['/buerger/leben-wohnen/kinderbetreuung/gebuehrenuebersicht-kinderbetreuung'],
    [
      'Kinderkrippe Kindernest',
      'Kindergarten St. Hedwig',
      'Kindergarten Schellenberg',
      'Kinderhaus Regenbogen',
    ],
  ),
  ask(
    'ms-02',
    'multi-chunk-synthesis',
    'Ab welchem Alter kann mein Kind in die Kinderkrippe Kindernest aufgenommen werden?',
    ['/buerger/leben-wohnen/kinderbetreuung/anmeldungen-fuer-das-kindergartenjahr'],
    ['ab dem 9. Monat', 'bis zum 3. Lebensjahr'],
  ),
  ask(
    'ms-03',
    'multi-chunk-synthesis',
    'An welchen Bahnstrecken liegt Kißlegg?',
    ['/buerger/gemeindeinfo-wirtschaft/lage-anfahrt/anreise-oepnv-e-carsharing'],
    [
      'Strecke München-Memmingen-Lindau',
      'Strecke Ulm-Aulendorf-Ravensburg-Friedrichshafen',
    ],
  ),
  ask(
    'ms-04',
    'multi-chunk-synthesis',
    'In wie viele Wasserversorgungsgebiete ist Kißlegg aufgeteilt und wie heißen sie?',
    ['/buerger/leben-wohnen/ver-entsorgung/wasserversorgung'],
    ['zwei Versorgungsgebiete', 'Versorgungsgebiet Kißlegg', 'Versorgungsgebiet Immenried'],
  ),
  ask(
    'ms-05',
    'multi-chunk-synthesis',
    'Welche Partnergemeinden hat Kißlegg?',
    [
      '/buerger/gemeindeinfo-wirtschaft/partnerschaften/fontanellato-italien',
      '/buerger/gemeindeinfo-wirtschaft/partnerschaften/le-pouliguen-frankreich',
    ],
    ['Fontanellato in Italien', 'Le Pouliguen in Frankreich'],
  ),
  ask(
    'ms-06',
    'multi-chunk-synthesis',
    'Welche Ortschaften gehören zur Gemeinde Kißlegg?',
    [
      '/buerger/gemeindeinfo-wirtschaft/ortschaften/immenried',
      '/buerger/gemeindeinfo-wirtschaft/ortschaften/waltershofen',
    ],
    ['Immenried', 'Waltershofen'],
  ),
  ask(
    'ms-07',
    'multi-chunk-synthesis',
    'Wo bekomme ich in Kißlegg Fahrkarten für die Deutsche Bahn?',
    ['/buerger/gemeindeinfo-wirtschaft/lage-anfahrt/anreise-oepnv-e-carsharing'],
    ['an den Automaten am Bahnhof', 'im Servicecenter ARVERIO in der Schlosstraße 55'],
  ),
  ask(
    'ms-08',
    'multi-chunk-synthesis',
    'Welche Brände und Hungersnöte sind in der Geschichte Kißleggs überliefert?',
    ['/buerger/gemeindeinfo-wirtschaft/geschichte-struktur/geschichte-kisslegg'],
    ['Brände 1548, 1704 und 1756', 'Hungersnöte 1614, 1635 und 1682'],
  ),
  ask(
    'ms-09',
    'multi-chunk-synthesis',
    'Welches Marktrecht erhielt Kißlegg im Mittelalter und von wem?',
    ['/buerger/gemeindeinfo-wirtschaft/geschichte-struktur/geschichte-kisslegg'],
    ['Marktrecht', 'am 28. Februar 1394', 'von König Wenzel'],
  ),
  ask(
    'ms-10',
    'multi-chunk-synthesis',
    'Welche Ortsverwaltungen gibt es in Kißlegg neben dem Hauptrathaus?',
    ['/buerger/rathaus-service/rathaus/kontakt-oeffnungszeiten'],
    ['Ortsverwaltung Waltershofen', 'Ortsverwaltung Immenried'],
  ),
  ask(
    'ms-11',
    'multi-chunk-synthesis',
    'Wie kann ich mein Kind für einen Kindergartenplatz in Kißlegg anmelden?',
    ['/buerger/leben-wohnen/kinderbetreuung/anmeldungen-fuer-das-kindergartenjahr'],
    ['Anmeldeformulare als PDF ausdrucken und ausfüllen'],
  ),
  ask(
    'ms-12',
    'multi-chunk-synthesis',
    'Wie ist Kißlegg mit Bus und Bahn an den öffentlichen Nahverkehr angebunden?',
    ['/buerger/gemeindeinfo-wirtschaft/lage-anfahrt/anreise-oepnv-e-carsharing'],
    ['Bahnknotenpunkt', 'eingebunden in das BODO-Netz', 'mehrere BODO-Buslinien'],
  ),

  // --- out-of-corpus: agent must refuse, no answer exists in the sources ---
  refuse('rf-01', 'Wie sind die Öffnungszeiten des Freibads in Tettnang?'),
  refuse('rf-02', 'Wann fährt der nächste Zug von Kißlegg nach Berlin?'),
  refuse('rf-03', 'Wie hoch ist die Hundesteuer in München?'),
  refuse('rf-04', 'Wie wird das Wetter morgen in Kißlegg?'),
  refuse('rf-05', 'Wie beantrage ich einen Reisepass in Hamburg?'),
  refuse('rf-06', 'Wie lautet die private Handynummer des Bürgermeisters?'),
  refuse('rf-07', 'Welche Lottozahlen wurden am letzten Samstag gezogen?'),
  refuse('rf-08', 'Welche Filme laufen heute im Kino in Kißlegg?'),
  refuse('rf-09', 'Was kostet aktuell ein Bitcoin in Euro?'),
  refuse('rf-10', 'Kannst du mir ein Rezept für Kässpätzle geben?'),
  refuse('rf-11', 'Wer hat die Fußball-Bundesliga in der Saison 2024/25 gewonnen?'),
  refuse('rf-12', 'Wie viele Einwohner hat die Stadt Wangen im Allgäu?'),

  // --- source-routing & recency: topic covered by the Amtsblatt (and often the
  // website too); the authoritative newspaper edition should surface. Best-effort
  // with only three editions — see ADR 0006. Gold = the edition's document_url.
  route(
    'sr-01',
    'Wann beginnen die Sommerabendkonzerte vor dem Neuen Schloss?',
    ['06-06-2026-der-kisslegger.pdf'],
    ['am Dienstag, 9. Juni', 'vor dem Neuen Schloss'],
  ),
  route(
    'sr-02',
    'Wohin wurden die Glascontainer aus der Zeppelinstraße verlegt?',
    ['25-04-2026-der-kisslegger.pdf'],
    ['in den Strandbadweg', 'beim ehemaligen Omira-Gebäude'],
  ),
  route(
    'sr-03',
    'Um welche Uhrzeit finden die öffentlichen Führungen durch die Bürgerhausbaustelle (ehem. Gasthof Löwen) statt?',
    ['09-05-2026-der-kisslegger.pdf'],
    ['um 18.30 Uhr'],
  ),
  route(
    // Recency: the Kontakte block repeats in every edition; the newest one is
    // the authoritative copy and should win the recency tie-break.
    'sr-04',
    'Welche Telefonnummer hat das Standesamt der Gemeinde Kißlegg?',
    ['06-06-2026-der-kisslegger.pdf'],
    ['07563/936-127'],
  ),
  route(
    'sr-05',
    'Wann fand die Spendenaktion für das Bürgerhaus im nördlichen Innenhof des ehemaligen Gasthofs Löwen statt?',
    ['25-04-2026-der-kisslegger.pdf'],
    ['am Samstag, 2. Mai', 'um 11 Uhr'],
  ),
];
