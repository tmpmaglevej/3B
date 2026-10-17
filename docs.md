# Implementeret arkitektur

## Dataflow og moduler

| Backendfil | Ansvar |
|---|---|
| `server.js` | Starter Express på loopback og mailbehandleren; afventer mailforsøget og lukker puljen ved stop |
| `app.js` | Alle HTTP-endpoints, inputvalidering, sikre fejlsvar og statiske frontendfiler |
| `database.js` | Genbrugt SQL-pulje, bookingopslag, dansk dagsdato, oversigt og statusændring |
| `notifications.js` | Tilmelding og hele mailforsøget: overtag i SQL, send, gem resultat |
| `mailer.js` | Genbrugt Gmail-transporter og sikre SMTP-fejlkoder |
| `check-database.js` | Selvstændigt, læsende forbindelses-/skematjek via `npm run db:check` |

- **Bookingopslag:** `script.js` → `app.js` → `database.findBooking` → Azure SQL → JSON → visning.
- **Statusændring:** `staff.js` → `app.js` → `database.changeBookingStatus` → SQL-transaktion → bekræftet status i tabellen.
- **Tilmelding:** `script.js` → `app.js` → `notifications.subscribe` → SQL-transaktion.
- **Mail:** `server.js` starter løkken i `notifications.js` → SQL overtager en besked → `mailer.js` sender → SQL gemmer resultatet.

Frontend har én HTML-side og én indgangsfil pr. arbejdsopgave samt fælles CSS.
Gæstens to formularer deler indsendelsesfunktionen; ændrede input rydder det gamle
bookingresultat. Personalet har én `busy`-tilstand og et flag for nødvendigt nyt opslag.
`api.js` deler fetch, JSON, 15 sekunders timeout og HTTP-fejl uden genforsøg.
Renderfunktioner viser tilstanden; dynamisk tekst bruger `textContent`.
Knapper/input deaktiveres under kald. Usikre personaleændringer kræver et nyt opslag.

## HTTP API

| Metode og sti | Input | Succes (200) |
|---|---|---|
| `GET /api/health` | Intet | `{ status: "ok" }`; tester ikke Azure/Gmail |
| `POST /api/bookings/lookup` | `{ bookingReference, email }` | `{ status, roomNumber }`, evt. `notificationStatus` |
| `POST /api/bookings/subscribe` | Samme bookingoplysninger | `{ status, roomNumber, notificationStatus }` |
| `GET /api/staff/rooms` | Intet | `{ date, rooms }` |
| `PATCH /api/staff/bookings/:id/status` | `{ status, version }` | `{ bookingId, status, version }` |

Reference og e-mail skal matche samme booking. Begge trimmes; referencen gøres
stor. Forkerte kombinationer giver samme neutrale 404. Opslag har intet datofilter.
En oversigtsrække har `roomId`, `roomNumber`, `bookingId`, `bookingReference`,
`status` og `version`. Bookingfelterne er null uden dagens ophold.

Fejl har formatet `{ error: "…" }`: 400 ugyldigt input/JSON, 413 body over 2 KB,
404 manglende ressource, 409 konflikt, 429 ratebegrænsning, 503 databasefejl og
500 uventet serverfejl. Interne fejl og credentials udleveres ikke.
Gæstekald og personale-API bruger `Cache-Control: no-store`.
Opslag og tilmelding deler 10 kald/IP/minut med `Retry-After`. Tælleren er lokal
for processen og nulstilles ved genstart. Proxy-headere betros ikke.

## Data og transaktioner

`mssql` bruger parameteriseret SQL, SQL-login, kryptering og certifikatvalidering.
Puljen har højst fem forbindelser og 10 sekunders forbindelses-/requesttimeout;
en fejlet oprettelse nulstilles. De tre tabeller og opsætningen beskrives i
[SQL-vejledningen](Backend/sql/README.md). Status tilhører en booking, og en unik
begrænsning sikrer højst én tilmelding pr. booking.

Tilmelding bruger `SERIALIZABLE` og låser først den verificerede booking med
`UPDLOCK`. Statusændringen låser samme booking via UPDATE. En allerede klar
booking får `pending`, mens gentagen tilmelding bevarer et brugt forsøg.

Statusændring kontrollerer version og dagens ophold i UPDATE. Dagsoversigten
bruger `arrival_date <= i dag < departure_date` efter `Europe/Copenhagen`;
overlappende ophold giver fejl. En forældet version afvises, og identisk status
med aktuel version ændrer intet. Bookingstatus og mailstatus gemmes i samme
transaktion eller rulles tilbage samlet. Kun beskeder uden forsøg flyttes mellem
`waiting_for_ready` og `pending`. `accepted`/`failed` og historik bevares;
tilbageførsel blokeres under `processing`.

## Asynkront mailforløb

`waiting_for_ready` → `pending` → `processing` → `accepted` eller `failed`.

Med `MAIL_ENABLED=true` behandler løkken én besked ad gangen med fem sekunders
pause. Konfiguration kontrolleres før overtagelse. En atomisk UPDATE kræver
`pending`, nul forsøg og en klar booking; den sætter `processing` og registrerer
forsøget. Status/forsøg kontrolleres også i den ydre UPDATE-betingelse, så to
behandlere ikke begge kan overtage samme forsøg. SMTP sker efter commit.

Nodemailer bruger Gmail med TLS og 10 sekunders timeouts. Afsender er `GMAIL_USER`,
modtager altid `MAIL_TEST_RECIPIENT`. Accept er SMTP-serverens bekræftelse af
modtageren, ikke dokumenteret levering eller læsning. Fejl gemmes kun som
`SMTP_AUTH_FAILED`, `SMTP_REJECTED` eller `OUTCOME_UNKNOWN`.

Lagringen af resultatet ligger uden for SMTP-fejlhåndteringen. Fejler SQL efter
overtagelsen, kan rækken blive stående som `processing`, også efter SMTP-accept.
Efter genstart behandles kun `pending` med nul forsøg. `processing` og `failed`
undersøges manuelt. Ingen automatiske genforsøg eller garanti for præcis én levering.

## Verifikation og begrænsninger

`npm test` erstatter Azure og SMTP. Testene dækker bookingadgang, gentagelser,
versionskonflikter, commit/rollback, testmodtager, mailfejl og stop under afsendelse.
Frontend er sammenlignet før/efter i lokal Chrome med fiktive API-svar: 56 tilstande
ved 390/1000 pixels med samme tekster, knaptilstande, farver og elementbredder.

Gruppen har tidligere modtaget en mail i en manuel test. Det nye refaktorerede
forløb er ikke integrationstestet mod Azure/Gmail. Låsesamspil mellem processer,
databasefejl og genstart under rigtig afsendelse kræver særskilt integrationstest.

Lokal loopbackbinding og samme origin er ikke offentlig adgangskontrol.
Deployment kræver HTTPS, netværksbegrænset personaleside/API, separat database
og valg af en kompatibel mailtransport. Se [specs.md](specs.md) for beslutninger
og [README.md](README.md) for opsætning og kommandoer.
