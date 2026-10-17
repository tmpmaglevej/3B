# DIS Eksamensprojekt – Kravspecifikation

**Projekt:** Hotel Room Status  
**Status:** Udkast – version 1.5  
**Kontekst:** Computernetværk og Distribuerede Systemer, CBS, efterår 2026

## 1. Formål

Vi udvikler en webapplikation, hvor hotelgæster kan kontrollere, om deres allerede bookede værelse er klar til check-in. Hvis værelset ikke er klar, kan gæsten tilmelde sig en e-mail, der forsøges sendt, når hotelpersonalet markerer værelset som klar.

Løsningen er en studieprototype til undersøgelse af klient-server-kommunikation, HTTP/TCP/IP, asynkronitet, ydeevne og sikkerhed. Projektet må ikke fremstille udokumenterede effekter, eksempelvis reduceret kø eller garanteret levering.

## 2. Afgrænsning

Første version omfatter:
- Ét fiktivt hotel, fiktive gæster og bookinger samt allerede tildelte værelser.
- Gæsteside til bookingopslag, status og e-mailtilmelding.
- Personaleside til værelsesoversigt og statusændringer.
- Node.js/Express-backend med HTTP API.
- Azure SQL Database til varige data.
- Nodemailer til automatisk e-mailafsendelse.
- Lokal udvikling med GitHub og deployment til den eksisterende DigitalOcean Droplet.

Uden for første version: betaling, køb/bestilling af tidlig check-in, AI-chatbot, SMS, integration med rigtige hotel- eller bookingsystemer og øvrige hoteladministrative funktioner.

## 3. Gæste-UI

### 3.1 Find booking

Gæsten indtaster **bookingreference** og den e-mailadresse, der er tilknyttet bookingen, og trykker på "Se status". Backend validerer begge oplysninger og slår bookingen op i Azure SQL. Ved match vises status for netop den booking; ellers vises en neutral fejlmeddelelse, som ikke afslører, hvilken oplysning der var forkert.

**Valgt:** Bookingreference + e-mail er adgangsmetoden i første version. Der implementeres ikke gæstelogin eller engangskoder. Bookingreferencer skal være svære at gætte, og gentagne opslag skal begrænses. Dette er en forenklet adgangsmetode til fiktive demodata, ikke stærk autentifikation.

### 3.2 Vis værelsesstatus

Status tilhører den konkrete booking/ophold og kan være:
- **Ikke klar:** Værelset er endnu ikke frigivet til denne gæst.
- **Klar:** Hotelpersonalet har frigivet værelset til denne gæst.

Vis "Klar" tydeligt, eksempelvis grønt, og oplys at gæsten kan henvende sig i receptionen efter nøglen. Ved "Ikke klar" vises en tydelig, eksempelvis orange, status og mulighed for e-mailtilmelding.

Netværksfejl og databasefejl må ikke fortolkes som "Ikke klar"; de skal vises som fejl.

### 3.3 Tilmelding til e-mail

Når bookingen er "Ikke klar", kan gæsten vælge "Send mig besked".

Systemet skal:
- Registrere højst én tilmelding pr. booking og gemme tidspunktet.
- Bekræfte en vellykket registrering; gentagne klik må ikke oprette dubletter.
- Knytte tilmeldingen til bookingen, aldrig til værelset permanent.
- Håndtere konkurrerende tilmelding og statusændring. Gæsten må ikke efterlades som ventende, hvis bookingen allerede er blevet "Klar".
- Ikke vise en fejl som en vellykket tilmelding.

**Foreløbigt forslag:** Brug e-mailadressen fra den verificerede booking; gæsten skal ikke indtaste en ny modtageradresse.

## 4. Personale-UI

### 4.1 Værelsesoversigt

Personaleoversigten består af fire kolonner:

| Værelse | Status | Næste gæst (bookingreference) | Handling |
|---|---|---|---|
| 301 | Klar | OP123456 | Ikke klar |
| 302 | Ikke klar | OP123457 | Klar |
| 303 | Ikke klar | OP123458 | Klar |

Eksemplerne er fiktive. Status vises med tekst og farve. Status redigeres direkte i tabellen uden særskilt redigeringsside eller dropdown.

**Valgt:** Der udvikles **intet personalelogin** i første version. Personalesiden er en afgrænset studie- og demonstrationsfunktion med fiktive data. Ved offentlig deployment må personalesiden og dens API-endpoints dog ikke være frit tilgængelige; de adgangsbegrænses på Nginx-/netværksniveau uden at indføre et login i applikationen.

### 4.2 Statusændring

- Ved "Ikke klar" hedder handlingsknappen "Klar"; ved "Klar" hedder den "Ikke klar".
- Frontend sender den **ønskede** status til backend, ikke en blind toggle-operation.
- Backend validerer ændringen og gemmer den i databasen. Adgang til status-API'et begrænses ved offentlig deployment på Nginx-/netværksniveau; der implementeres ikke personalelogin.
- UI opdateres først, når serveren har bekræftet ændringen; ved fejl vises fejlbesked.
- Samtidige opdateringer fra flere medarbejdere må ikke lydløst overskrive nyere ændringer.

**Uafklaret:** Regler ved tilbageførsel fra "Klar" til "Ikke klar", især når en e-mail allerede er accepteret af mailtjenesten.

## 5. Datamodel – Azure SQL Database

**Valgt: Azure SQL Database (Microsoft SQL Server).** Den oprettede database **roomReady** bruges som fælles udviklingsdatabase. En separat produktionsdatabase planlægges, før løsningen går live.

Første version har **tre logiske tabeller**:

| Tabel | Ansvar | Væsentlige felter |
|---|---|---|
| `rooms` | Hotellets værelser | `id`, `room_number` |
| `bookings` | Ophold, gæsteidentifikation og værelsesstatus | `id`, `booking_reference`, `email`, `room_id`, opholdsdatoer, `status` |
| `notification_subscriptions` | Tilmelding **og** status for den tilhørende e-mail | `id`, `booking_id`, `subscribed_at`, `email_status`, `email_attempts`, `email_accepted_at`, evt. fejloplysning |

Der oprettes **ingen separat `email_jobs`-tabel i første version**. En række i `notification_subscriptions` repræsenterer både tilmelding og det eventuelle afsendelsesforløb.

### 5.1 Relationer og begrænsninger

- Ét værelse kan have flere bookinger over tid; én booking refererer til ét tildelt værelse.
- Status gælder **bookingen** og ikke værelset for evigt.
- Højst én e-mailtilmelding pr. booking håndhæves med en unik databasebegrænsning.
- Bookingreferencer skal være entydige i den valgte datamodel.
- Fremmednøgler, relevante tjekbegrænsninger og parameteriseret SQL anvendes.
- Den endelige SQL-struktur, datatyper, opholdsafgrænsning og eventuelle versionsfelter fastlægges ved implementering.

### 5.2 Status på e-mail

Et enkelt felt `email_status` skal tydeligt skelne mellem eksempelvis:
- `waiting_for_ready`: Gæsten er tilmeldt; bookingen er endnu ikke klar.
- `pending`: Bookingen er klar; e-mail skal forsøges afsendt.
- `processing`: Et afsendelsesforsøg er i gang.
- `accepted`: Mailtjenesten har accepteret e-mailen, **ikke** nødvendigvis leveret den.
- `failed`: Afsendelsesforsøg fejlede.

`email_attempts` og tidsstempler understøtter fejlsøgning. Præcis håndtering af retries, usikre udfald og tilstanden `processing` efter genstart besluttes før afsendelsesdelen implementeres.

### 5.3 Transaktioner og samtidighed

Følgende skal håndteres atomisk, hvor det er nødvendigt:
- Bookingens ændring til "Klar" og ændring af eksisterende tilmeldings `email_status` til `pending`.
- Registrering af en tilmelding under en samtidig statusændring, uden at efterlade en uberettiget ventende tilmelding.
- Gentagne eller konkurrerende ændringer med hensigtsmæssige SQL-låse/versionskontrol.

**Selve e-mailafsendelsen foregår efter commit, aldrig inde i databasetransaktionen.** Forbindelser til Azure SQL genbruges i en pool og har timeouts og fejlhåndtering.

## 6. E-mail med Nodemailer

**Valgt beskedkanal: E-mail med Nodemailer.**

Når en booking bliver "Klar", og der findes en relevant tilmelding, registrerer backend, at en e-mail skal sendes. Afsendelsen forsøges asynkront, og resultatet registreres i `notification_subscriptions`.

- Gentagne tilmeldinger og identiske statuskald må ikke oprette unødvendige beskedforsøg.
- Fejl skal gemmes, så relevante uafsluttede forløb kan undersøges efter genstart.
- En mailtjenestes accept er ikke garanti for levering eller læsning.
- Præcis én levering kan ikke garanteres ved uklare udfald, eksempelvis hvis processen stopper mellem ekstern accept og lokal statusopdatering.
- Udvikling og automatiske tests må ikke sende e-mails til virkelige gæster.

### 6.1 Transport

Mailudbyder og Nodemailer-transport er endnu ikke valgt. Transporten skal fungere både lokalt og fra DigitalOcean. De almindelige udgående SMTP-porte 25, 465 og 587 er begrænset på DigitalOcean Droplets; løsningen skal derfor anvende en kompatibel transport, eksempelvis en understøttet HTTPS-baseret mailtjeneste.

API-nøgler og credentials skal ligge i miljøvariabler, ikke i kode eller Git.

**Uafklaret:** Mailudbyder, transportmetode, retries og adfærd ved tilbageførsel af status.

## 7. Teknisk arkitektur og arbejdsform

### 7.1 Teknologistak

- **Frontend:** HTML, CSS, JavaScript og browserens `fetch()`.
- **Backend:** Node.js, Express, JSON-baseret HTTP API, `mssql` som forventet databasedriver og Nodemailer.
- **Database:** Azure SQL Database / T-SQL, adskilte udviklings- og produktionsmiljøer.
- **Deployment:** DigitalOcean Droplet, Nginx som reverse proxy og HTTPS.

Frontend og API bruger som udgangspunkt samme origin. Browseren kommunikerer aldrig direkte med SQL-databasen.

### 7.2 Lokal udvikling

Gruppemedlemmerne udvikler på egne computere i VS Code med GitHub til versionsstyring. Hver lokal Express-backend kan forbinde til den fælles Azure SQL-udviklingsdatabase `roomReady`.

Delte testdata kan påvirkes af flere udviklere. Derfor skal tests og initialiseringsscripts undgå destruktive ændringer i andres data. SQL-skema, ændringsscripts og sikre eksempeldata versionsstyres; hemmeligheder gør ikke.

### 7.3 Deployment og produktion

Når en version er testet og godkendt, deployes den til den eksisterende DigitalOcean Droplet, uden at overskrive tidligere øvelsesprojekter. Den offentlige app skal være tilgængelig via HTTPS.

Den deployede Express-server kommunikerer via en krypteret og certifikatvalideret SQL-forbindelse til en **separat Azure SQL-produktionsdatabase**. Dette produktionsmiljø er besluttet som mål, men er ikke nødvendigvis oprettet endnu.

Deployment skal være gentageligt, og opdateringer af kode må ikke automatisk nulstille produktionsdata. Backend kører som administreret proces, og konfiguration håndteres via miljøvariabler.

Før personalesiden og dens ændrings-API gøres tilgængelige på en offentligt eksponeret Droplet, skal Nginx/netværkskonfigurationen begrænse adgangen til de aftalte udvikler-/demonstrationsadresser. Dette er adgangsbegrænsning uden personalelogin og ikke en sikkerhedsløsning for et rigtigt hotel.

### 7.4 Netværk og adgang

- Klientens browser → HTTPS → Nginx → Express → Azure SQL over en krypteret netværksforbindelse.
- Databaseforbindelser skal genbruges og håndtere timeout, forbindelsesbrud og afvisninger.
- SQL-serverens firewall må kun give adgang fra nødvendige klient-IP'er (udviklingsmaskiner og senere Dropletten).
- Der må ikke anvendes åbne firewallregler eller administratorlogin som varig applikationskonfiguration.
- Personalesiden og personale-API'et skal ved offentlig deployment have netværksbaseret adgangsbegrænsning; en ukendt URL alene beskytter dem ikke.
- Der skal vælges passende backup- og gendannelsesprocedure.

## 8. API

Backend skal kunne håndtere:

| Funktion | Formål |
|---|---|
| Bookingopslag | Kontrollere adgang og hente status for egen booking |
| E-mailtilmelding | Registrere tilmelding til en booking |
| Værelsesoversigt | Vise relevante data til personalesiden (uden login; netværksbegrænset ved deployment) |
| Statusændring | Ændre bookingens status med validering og dataintegritet; adgang begrænses ved deployment |

Endpoint-navne, HTTP-metoder, JSON-felter og statuskoder fastlægges under implementering. Brug relevante HTTP-statuskoder og et enkelt, konsekvent fejlformat.

## 9. Sikkerhed

- Input valideres på serveren; SQL-forespørgsler parameteriseres.
- Gæsten får adgang til bookingstatus gennem bookingreference og matchende e-mail. Dette er en bevidst forenklet løsning til fiktive data; opslag skal ratebegrænses.
- Der er intet personalelogin. Personaleside og personale-API sikres ikke gennem brugerautentifikation, men må ved offentlig deployment kun kunne tilgås fra tilladte netværksadresser via Nginx. Denne begrænsning skal beskrives åbent til eksamen; løsningen er ikke egnet til ægte hoteldata uden stærkere adgangskontrol.
- Bookingopslag skal beskyttes mod automatiserede gæt og utilsigtet informationslæk.
- SQL-forbindelser skal bruge kryptering og certifikatvalidering.
- Databasekonti gives kun nødvendige rettigheder; firewall begrænses.
- Credentials opbevares i miljøvariabler; ingen hemmeligheder eller persondata i Git eller offentlige logs.
- Den offentlige app bruger HTTPS; adgangskontrol må ikke baseres på skjulte knapper eller URL'er.
- Udvikling og produktion skal have adskilte databaser.

**Uafklaret:** Databaseautentifikation. Gæstens bookingopslag og fravalg af personalelogin er besluttet.

## 10. Fejlhåndtering og tests

Systemet skal bevidst håndtere og, hvor relevant, teste:
1. Ugyldige bookingoplysninger og adgangsfejl.
2. Netværksfejl, timeout eller utilgængelig Azure SQL.
3. Gentagen tilmelding og gentagne statuskald.
4. Tilmelding samtidig med statusændring.
5. To medarbejdere, der ændrer samme booking samtidig.
6. Fejl eller timeout hos mailtjenesten.
7. Genstart, mens en tilmelding har status `processing`.
8. Uklare udfald, hvor en mail kan være accepteret, men databasen ikke er opdateret.

Tests skal bruge fiktive data og kontrolleret mailtransport. Ingen reelle mailafsendelser som rutinemæssig automatisk test.

## 11. Faglige undersøgelsesmuligheder (DIS)

- HTTP request/response, DNS, TCP/IP og HTTPS/TLS mellem browser og DigitalOcean.
- Netværkskommunikation, latenstid, timeouts og forbindelsespuljer mellem Express og Azure SQL.
- Asynkrone SQL-kald og e-mailoperationer i Node.js.
- Responstid, samtidighed, throughput og fejlrater.
- Databasetransaktioner, konkurrerende opdateringer og eksterne tjenester.
- Eventuel belastningstest og load balancing som **supplerende undersøgelser**, ikke MVP-krav.

Faglige påstande om performance, pålidelighed eller brugerfordele kræver egne observationer og målinger. Rapportens faglige indhold udarbejdes efter gældende CBS-/kursusregler.

## 12. Acceptkriterier for første version

Første version kan demonstreres, når:
- Gæsten kan identificere sin booking og se korrekt status.
- Gæsten kan tilmelde sig e-mail ved "Ikke klar" uden dubletter.
- Personalesiden kan vise værelsesoversigten og ændre status uden applikationslogin; ved offentlig deployment er siden og personale-API'et netværksbegrænsede.
- Statusændringer gemmes i Azure SQL og afspejles i gæste-UI.
- En tilmelding kan udløse et e-mailforsøg gennem Nodemailer.
- E-mailstatus og relevante fejl gemmes i `notification_subscriptions`.
- Varige data overlever genstart af Express.
- Væsentlige netværksfejl, gentagne kald og samtidighedssituationer håndteres.
- Appen kan køres lokalt og deployes til DigitalOcean over HTTPS med separat produktionsdatabase.

Alle kriterier skal kontrolleres ved faktiske tests, før de markeres som opfyldt.

## 13. Beslutningsoversigt

| Beslutning | Status |
|---|---|
| Beskedkanal | **Valgt: E-mail med Nodemailer** |
| Database | **Valgt: Azure SQL Database (SQL Server)** |
| Datamodel | **Valgt: Tre tabeller; ingen særskilt email_jobs-tabel** |
| Udvikling | **Valgt: Lokalt + GitHub + fælles Azure SQL-udviklingsdatabase** |
| Deployment | **Valgt: Eksisterende DigitalOcean Droplet** |
| Miljøadskillelse | **Valgt: Separat database til produktion** |
| Databasebibliotek | Forventet: `mssql` |
| Azure SQL-produktionsdatabase og pris | Skal verificeres/oprettes |
| Mailudbyder og transportmetode | Ikke valgt |
| Gæstens adgangsmetode | **Valgt: Bookingreference + e-mail (uden gæstelogin)** |
| Personalelogin | **Fravalgt i første version; netværksbaseret adgangsbegrænsning ved offentlig deployment** |
| Databaseautentifikation | Ikke valgt |
| Tilbageførsel af "Klar" og evt. ny mail | Ikke valgt |
| Regler for genforsøg og uklare mailudfald | Ikke valgt |

Dette er en levende kravspecifikation. Ikke-vedtagne forslag må ikke behandles som endelige implementeringskrav.
