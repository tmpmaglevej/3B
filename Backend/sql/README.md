# SQL til projektet

Den fælles udviklingsdatabase `roomReady` er allerede sat op. Gruppen har kørt
001 og 002; 003 blev kørt efter konkret godkendelse og skemaet verificeret
den 17. oktober 2026. **Kør ikke scripts igen i den fælles database.**

## Scripts og rækkefølge

Scripts opretter ikke selve Azure SQL-databasen. Ved opsætning af en ny
udviklingsdatabase skal den først oprettes særskilt. Scripts kræver navnet
`roomReady` og er ikke en opskrift til produktionsopsætning.

Efter godkendelse vælges databasen i SQL-værktøjet, og scripts køres én gang
i denne rækkefølge med de nødvendige skema- og skriverettigheder:

| Script | Forudsætning | Virkning |
|---|---|---|
| [001-create-tables.sql](001-create-tables.sql) | Projekttabellerne findes ikke | Opretter `rooms`, `bookings` og `notification_subscriptions` |
| [002-seed-demo.sql](002-seed-demo.sql) | De nye tabeller er tomme | Indsætter to fiktive værelser og bookinger i én transaktion |
| [003-email-attempt-details.sql](003-email-attempt-details.sql) | 001/002 er kørt; mailfelterne findes ikke | Ændrer den eksisterende tilmeldingstabel med `ALTER TABLE` og tilføjer `email_last_error` og `email_attempted_at` |

003 tilføjer nullable kolonner; eksisterende tilmeldinger bevares og får NULL
i de nye felter. Ingen scripts sletter eksisterende tabeller eller rækker.
Gentagen kørsel er ikke understøttet, og scripts må ikke køres samtidigt.

001 har ingen samlet transaktion: en fejl kan efterlade nogle tabeller oprettet.
002 bruger `SET XACT_ABORT ON`, så kørselsfejl ruller indsættelserne tilbage.
Stop ved fejl og undersøg den faktiske tilstand og eventuelle åbne transaktioner;
slet ikke tabeller og genkør ikke scripts blindt. Appen kører aldrig scripts ved opstart.

## Appens adgang

Den almindelige SQL-bruger skal have SELECT på alle tre tabeller, UPDATE på
`bookings` og `notification_subscriptions` samt INSERT på
`notification_subscriptions`. Skemarettigheder bruges kun til opsætning.
Scripts opretter ikke brugere eller tildeler rettigheder.

`npm run db:check` fra projektets rodmappe læser kolonnenavne og datatyper uden
at ændre data. Se [README](../../README.md) for miljøvariabler og forbindelse.
Datamodel, versionskontrol og transaktioner beskrives i [docs](../../docs.md#data-og-transaktioner).
Sammenligning af reference og e-mail følger databasens collation; API'et trimmer
input og konverterer referencen til store bogstaver.

## Demodata

| Reference | E-mail | Værelse | Startstatus |
|---|---|---|---|
| DEMO-7F82C9A46B105DE3 | ready@example.com | 301 | Klar |
| DEMO-93B5E20D8A764FC1 | waiting@example.com | 302 | Ikke klar |

Opholdene er 17.–19. oktober 2026 og vises i personaleoversigten den 17. og 18.
oktober. Gæstens bookingopslag har intet datofilter. Statusserne i tabellen er
startværdier fra 002 og kan være ændret gennem appen. Referencerne er offentlige
testdata. Nye demodata aftales særskilt; 002 nulstiller ikke bookinger eller mailforsøg.

Gruppens gennemførte manuelle mailtest og resterende testbegrænsninger er
beskrevet i [docs](../../docs.md#verifikation-og-begrænsninger).
