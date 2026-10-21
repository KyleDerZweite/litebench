# LiteBench design

## A personal writing bench

LiteBench records Kyle's writing preferences as they develop. The useful result
is an inspectable example: what the prompt asked for, what the model wrote, and
which wording deserves criticism. Visitors can disagree with the rubric or
annotations after seeing the same evidence.

The existing generations demonstrate the page and evaluation workflow. Their
job is to reveal flaws we can fix. They are not a controlled experiment for
claiming that a model or reasoning effort is generally better.

## Inspect the writing

Keep every candidate answer unchanged. Show the full input prompt next to the
answer, with an option to inspect exact passages flagged by the AI judge. A
highlight must quote the candidate exactly. Missing required content appears as
a written explanation, since there is no passage to highlight.

Call these AI annotations. Kyle has not supplied human ratings for this batch.
Future human comments must identify their author so visitors can distinguish
them from the current GPT-6-Astra xhigh judgments.

The chart and table provide an index into examples. Show percentages, criterion
reasons, and the separate brief-compliance assessment. Do not imply that a small
score difference predicts performance on other tasks. A best-observed effort
view selects within these existing examples, which favors lucky configurations.

## The rubric

The frozen protocol in `benches/judge-astra-v0.1.json` defines four criteria for
each collection. Their integer scores range from 0 to 5. An answer's indicator
is their equal-weight mean multiplied by 20; a configuration's indicator is the
mean across that collection's tasks.

CopyBench covers brief fit, copy craft, clarity, and natural style. NaturalBench
covers idiom, voice, specificity, and natural style. CEFRBench covers vocabulary,
syntax, and cohesion at the requested level, plus natural style. Its total is
75% level fit and 25% personal style preference.

The unslop snapshot informs the style criterion and cited issues. It describes
habits Kyle dislikes, not a detector of AI authorship. Context matters more
than matching a suspicious word. The detailed evaluation procedure belongs in
`EVALUATION.md`.

## Data boundaries

Store raw generations, AI evaluations, and the derived page data separately.
The build derives every total from validated judgments and original generation
metadata. Hashes connect the evaluation to its prompt, public task file, source
generation, protocol, and skill snapshot. Only public generation directories may
supply text to the static page.

Old judgments have been removed at Kyle's request and remain recoverable in
Git history. The 120 legacy CopyBench answers retain their unedited text and
generation metadata, without ratings. They are excluded from the page.

Generation cost and latency are historical context. Keep evaluation costs
separate, preserve unknown usage as unknown, and avoid presenting estimated
spend as a reconciled provider bill.

## Later work

Review examples with Kyle, record personal disagreements, and revise the next
rubric using those observations. Keep a frozen protocol for each judging batch.
Then rebuild generation with more distinct briefs, recorded settings, and a
clear purpose for repeated attempts. Generation changes are deliberately
deferred in the current demonstration pass.

OrcaBench develops separately. It compares complete coding-agent configurations
through checked artifacts and preference votes from Kyle and a friend. Those
human votes need their own result records and scoring rules.

## Ergebnisansicht und Navigation

Am 21. Oktober 2026 hat Kyle Charts und Ergebnisse als Startseite gewählt.
Score erhält einen eigenen Bereich unter `/score/`. AgentBench bleibt unter
`/agentbench/`. Ein gemeinsamer kompakter Header verbindet diese Bereiche.

Die Gestaltung orientiert sich an Slopalytics: warme dunkle Flächen, dünne
Trennlinien, eine kleine Kopfzeile und eine rechte Modell-Sidebar. Die Umsetzung
bleibt eigenständig im bestehenden Next.js-, React- und Recharts-Stack. Ein
öffentliches Slopalytics-Repository und eine Projektlizenz wurden bei der
Referenzprüfung nicht gefunden. Es wird kein Bundle-Code übernommen.

Der gemeinsame Header besitzt Navigation und aktive Bereichsmarkierung. Die
Writing-Ergebnisansicht besitzt Suite, Achse, Modellfilter und Ranking-Auswahl.
Chart und Ranking stehen vor dem Antwortbrowser. Der Modellfilter verwendet
Konfigurationsschlüssel aus `model::reasoning_effort` und steuert Chart und
Ranking gemeinsam. Auswahl über Suite-Wechsel und Best observed effort bleiben
wie bisher erhalten. Der Antwortbrowser darf
weiterhin sämtliche Originalantworten lesen und besitzt Prompt-Auswahl und
Highlight-Schalter. Ein Ranking-Eintrag öffnet die zugehörige Antwort.
Der Header importiert keine Benchmark-Daten. Ergebnisansicht, Score und
AgentBench verwenden den Header, importieren aber keine fremde Bewertungslogik.
Score besitzt seine eigene Suite-Auswahl und übergibt `suiteId` an das
Arena-Modul. Score verwendet weiterhin das Arena-Modul und denselben localStorage-Key.
ELO, Generationen, Bewertungen und AgentBench-Kennzahlen ändern sich nicht.

Auf Desktop steht die 248px breite Filter-Sidebar neben Chart und Ranking.
Unter 900px ersetzt ein Button sie durch einen nativen modalen Filterdialog.
Der mobile Hook und die CSS-Regeln verwenden dieselbe 900px-Grenze. Escape,
Fokus-Rückgabe und Wechsel über diese Grenze gehören zur Dialogprüfung.
Prompts und Antworten verwenden normalen Seitenscroll und lesbare Textgrößen.
Dekoratives Raster, Noise, Glow und Scanline entfallen. Modellfarben sind
voneinander unterscheidbar und bleiben für Daten reserviert.

Die Lieferung erfolgt in einem gemeinsamen Integrations-PR mit drei prüfbaren
Schritten: gemeinsamer Rahmen mit Ergebnis-Startseite und Score-Route, Modellfilter
mit mobiler Bedienung sowie Angleichung von Antwortbrowser und AgentBench.
Die Verifikation prüft direkte Routen inklusive Pages-Base-Path, Filter und leere
Auswahl, Ranking zu Antwort, Suite-Wechsel, unveränderte Originaltexte, Highlights,
Votes über Reload und Bereichswechsel sowie Import, Export und Reset.
Desktop und Mobile werden gerendert und mit Tastatur bedient. TypeScript,
ELO- und Evidence-Tests, Datenvalidierung und der statische Pages-Build bleiben
verbindliche Checks. Owner-Akzeptanz des neuen Designs bleibt Kyle vorbehalten.

## Prüfstand des Redesigns

Am 21. Oktober 2026 wurde der Implementierungsstand `f72cd75` gegen `ce3f13b`
geprüft. Die unabhängigen Standards- und Spec-Reviews meldeten keine offenen
Befunde. Der vorherige Vertragsreview wurde mit den oben genannten
Präzisierungen zu Suite-Besitz, Filterschlüsseln und Dialogbedienung eingearbeitet.

`bun run check`, `bun app/elo.test.ts`, `bun app/evidence.test.ts` und
`bun run build:pages` bestanden im Visualizer. Im Repository bestanden
`python3 bench.py check`, `evaluation-check`, `arena-check` und `self-test`.

Eine echte Chromium-Prüfung lief gegen den Entwicklungsserver und anschließend
gegen den statischen Pages-Export unter `/litebench/`. Sie prüfte Startseite,
Filter und leere Auswahl mit Wiederherstellung, Suite- und Achsenwechsel,
Ranking zu Originalantwort, exakte Antworttexte mit und ohne Highlights,
Score-Votes samt Reload, Bereichs- und Suite-Wechsel, Skip, Import, Export,
Reset und AgentBench-Modellauswahl. Die Layoutprüfung von 320 bis 1440px
fand keinen bleibenden horizontalen Seitenüberlauf. Escape, Fokus-Rückgabe,
Dialogsuche und der Wechsel über 900px bestanden. Es gab keine Page-Errors
oder externen Netzwerkanfragen. Desktop-, Mobile- und AgentBench-Render wurden
visuell geprüft.

Die T3-Screenshot-Automation lieferte Timeouts. Die Render- und Bedienprüfung
verwendete deshalb den bereits installierten lokalen Chromium über Playwright.
Echte Touch-Hardware und Screenreader wurden nicht geprüft. Die gestalterische
Owner-Akzeptanz durch Kyle steht aus. Das Redesign wurde noch nicht gemergt
oder auf GitHub Pages veröffentlicht. Der bestehende Workflow läuft erst nach
einem Push auf `main`, daher gibt es für diesen PR keinen eigenen CI-Lauf.
