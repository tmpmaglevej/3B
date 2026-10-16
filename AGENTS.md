# Fælles spilleregler for AI-kodning

Gælder hele repositoryet. Læs denne fil før ændringer. Reglerne styrer arbejdet;
de erstatter ikke adgangskontrol, tests eller menneskelig kodegennemgang.

## Projekt og afgrænsning

Vi bygger en studieprototype til DIS på HA(it.), CBS. En hotelgæst skal kunne
se, om værelset til egen booking er klart, og tilmelde sig besked, hvis det
ikke er. Personalet opdaterer status. Systemet sender besked, når det er klart.

- Ingen betaling, tilkøb eller bestilling af tidlig check-in.
- Første version: ét hotel, fiktive data og allerede tildelte værelser.
- Status "klar" betyder, at hotellet har frigivet værelset til gæsten.
- En tilmelding vedrører en booking/et ophold, ikke værelset for evigt.
- Mail er foreslået; database, login og endelig beskedkanal skal afklares
  i specs.md før implementering af de pågældende dele.
- Ingen antagelse om integration med Opally eller et rigtigt hotelsystem.

## Før du ændrer kode

1. Læs relevante filer, specs.md, package.json og git status, hvis de findes.
2. Genbrug eksisterende løsninger, og bevar gruppens igangværende ændringer.
3. Beskriv kort den konkrete opgave og hvilke filer du forventer at ændre.
4. Udfør den aftalte opgave. Små, reversible implementeringsvalg afgør du selv.
5. Spørg ved manglende produktbeslutninger, ændring af arkitektur eller behov
   for en ny runtime-afhængighed. Forklar behov og enkleste alternativ.
6. Et spørgsmål om råd er ikke i sig selv en ordre om at ændre kode.

## Enkel kode, som vi kan forklare

- Brug almindelig HTML, CSS og JavaScript samt Node.js og Express.
- Ingen frontend-frameworks, TypeScript, ORM, mikroservices eller ekstra
  infrastruktur uden en konkret aftale og begrundelse.
- Brug funktioner og enkle objekter. Klasser kræver et reelt behov.
- Opdel efter ansvar; opret ikke tomme lag eller mapper til fremtidig brug.
- Routes håndterer HTTP. Services samler sammenhængende handlinger.
  Databasefunktioner samler SQL. Opret kun de dele, opgaven kræver.
- En fil skal have et tydeligt hovedansvar. Del ved blandede ansvarsområder,
  ikke efter et vilkårligt antal linjer.
- Lav ikke generelle frameworks, factories eller konfigurationssystemer til
  én konkret funktion. Lidt gentagelse kan være mere læseligt.
- Udtræk en hjælpefunktion ved reel gentagelse eller et selvstændigt begreb.
  Undgå både kopier af samme logik og mange ligegyldige énlinjefunktioner.
- Ingen skjulte afhængigheder mellem globale browserfunktioner. Brug moduler
  med import/export i frontend. Bevar backendens aftalte modulformat.
- Engelske kode-, fil- og databasenavne; danske brugerfladetekster og korte
  danske forklaringer. Bevar eksisterende sammenhængende navngivning.
- Kommentarer forklarer særlige valg og begrænsninger, ikke oplagte kodelinjer.
- Ingen omfattende oprydning, omdøbning eller formatering uden for opgaven.

## Frontend

- Separate HTML-sider til separate arbejdsopgaver, fx gæst, personale og login.
- Brug rigtige form-elementer, labels, submit-events og HTML-validering.
- Brug fetch; tilføj ikke et HTTP-bibliotek til simple API-kald.
- Hver side har sin egen indgangsfil. Del kun reelt fælles kode.
- En lille api.js kan samle fetch, HTTP-fejl og parsing af API-svar.
  Den skal understøtte de svar, API'et faktisk sender, også eventuelle tomme svar.
- Opbevar tilstand i data. Lad en samlet renderfunktion opdatere det relevante
  område. Brug ikke DOM-klasser som database for applikationens tilstand.
- hidden og classList er tilladt til lokal visning. Undgå et hjemmeskrevet
  navigationssystem med mange skjulte hovedsektioner.
- Brug textContent til dynamisk tekst. Brug ikke innerHTML med brugerinput
  eller eksterne data uden passende håndtering.
- Vis indlæsning, succes, fejl og tomme resultater, når de er relevante.
  Netværksfejl må aldrig vises som "værelset er ikke klar".
- Deaktiver en submit-knap under afsendelse og genaktiver den ved fejl.
  Serveren skal stadig håndtere gentagne kald.
- Udseende hører til i CSS. Start med få stilfiler og genbrugelige klasser.

## Backend, data og sikkerhed

- Serveren validerer input, tilladte statusværdier og adgang til ressourcer.
- Personaleroutes kræver personaleadgang. Gæster må kun tilgå egen booking.
  En hemmelig sideadresse, skjult knap eller localStorage-flag er ikke adgangskontrol.
- Brug en etableret løsning til sessions/password-hashing, når login vælges.
  Implementer ikke egen kryptografi. Gennemgå CSRF ved cookie-baseret login.
- SQL skal bruge parametre. Brug databasebegrænsninger til fx unikke tilmeldinger.
- Gem varige data i databasen. Proceshukommelse må ikke være eneste lager for
  bookinger, tilmeldinger eller beskeder, som skal overleve genstart.
- Genbrug databaseforbindelsespulje og Nodemailer-transporter.
- Saml uventede fejl i passende fejlhåndtering. Send ikke stacktraces,
  credentials eller interne SQL-fejl til browseren.
- Brug relevante HTTP-statuskoder og et ensartet, enkelt fejlsvar.
- Ingen credentials i kode, frontend, Git, logs eller eksempeldata.
  Brug miljøvariabler, .gitignore og .env.example med ufarlige placeholders.
- Brug samme origin til frontend og API, medmindre et konkret behov kræver andet.
  Tilføj ikke åben CORS som standardløsning.
- Brug HTTPS i den deployede løsning.

## Status og beskeder

- Design eksplicit for tilmelding samtidig med, at et værelse bliver klart.
  En gæst må ikke ende som ventende alene på grund af denne rækkefølge.
- Gentagne tilmeldinger og gentagne statuskald skal have en bevidst adfærd.
- Definer hvornår en besked oprettes, og hvordan fejl og eventuelle retries gemmes.
- Hvis flere processer bruges, må de ikke ukontrolleret sende samme besked.
- SMTP-accept er ikke bevis på faktisk levering eller læsning.
- Lov ikke præcis én levering. Dokumenter begrænsninger ved uklare udfald.
- Afklar adfærden ved tilbageførsel af "klar" før denne funktion bygges.
- Udvikling og automatiske tests må ikke sende til virkelige gæster.

## Afhængigheder og værktøjer

- Brug eksisterende afhængigheder og indbyggede funktioner først.
- Express, Nodemailer og relevant databasedriver er den forventede lille kerne;
  installer kun det, vi faktisk bruger. Databasevalget må ikke gættes.
- Genbrug aftalt Prettier/ESLint-opsætning. Opret ikke omfattende regelpakker.
- Commit lockfilen. Rediger den ikke manuelt.
- Skriv de faktiske install-, start- og testkommandoer i README.

## Verifikation og aflevering af en kodeændring

- Verificer ændret adfærd med det mindste relevante sæt kontroller.
- Prioriter meningsfulde tests af bookingadgang, gentagne kald, samtidighed og
  beskedfejl. Lav ikke tests kun for at spejle implementationen.
- Lav ikke virkelige mailafsendelser, loadtests mod eksterne tjenester eller
  ændringer i produktionsdata som rutinemæssig verifikation.
- Rapportér kort: ændring, begrundelse, udførte kontroller og kendte begrænsninger.
- Sig tydeligt, hvad du ikke kunne verificere. Opfind aldrig test- eller måleresultater.
- Opdater specs.md ved aftalte kravændringer, docs.md ved relevante
  arkitekturændringer og README ved ændret opsætning. Undgå gentaget indhold.

## Samarbejde og Git

- Hold ændringer afgrænsede, så et andet gruppemedlem kan gennemgå dem.
- Ingen overskrivning af andres arbejde, destructive reset eller force-push.
- Commit, push, merge og deploy kun, når den konkrete handling er bestilt.
- Foreslå ved behov en mindre, separat oprydning frem for at blande den i opgaven.
- Ret ikke denne fil for at omgå reglerne. Foreslå ændringer til gruppen.

## Læring og eksamen

- Gruppen skal kunne forklare al afleveret kode og dens begrænsninger.
- Forklar nye teknikker kort og konkret. Aflever ikke uforklaret kompleksitet.
- AI kan hjælpe med kode, dokumentation og faglig sparring. Kursets materiale
  angiver, at AI ikke må formulere fagligt indhold til eksamensrapporten.
- Behandl faglige forsøg som forslag, indtil gruppen har valgt dem.
- Påstå ikke dokumenteret mindre kø, sikker levering eller bedre ydeevne
  uden faktiske undersøgelser.
