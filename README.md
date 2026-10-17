# Hotel Room Status

DIS-studieprototype med gæstens bookingopslag og e-mailtilmelding samt
personalets dagsoversigt og statusændringer. Bygget med HTML/CSS/JavaScript,
Express, Azure SQL og Nodemailer. Brug kun fiktive bookingoplysninger.

## Installation og konfiguration

Brug Node.js 24 eller nyere. Kør fra projektets rodmappe:

```sh
npm ci
cp -n .env.example .env
```

`cp -n` bevarer en eksisterende `.env`. Udfyld filen lokalt; den ignoreres af Git.

| Miljøvariabel | Indhold |
|---|---|
| `PORT` | Lokal port, som standard `3002` |
| `DB_SERVER` | Azure SQL-serverens fulde værtsnavn |
| `DB_DATABASE` | Den fælles udviklingsdatabase `roomReady` |
| `DB_USER`, `DB_PASSWORD` | Appens SQL-login |
| `MAIL_ENABLED` | `false` indtil mailopsætningen er klar; `true` aktiverer afsendelse |
| `GMAIL_USER` | Projektets Gmail-konto og afsender |
| `GMAIL_APP_PASSWORD` | Kontoens Google-app-password, ikke dens almindelige adgangskode |
| `MAIL_TEST_RECIPIENT` | Én testindbakke, som gruppen kontrollerer |

Bevar anførselstegn om adgangskoder, så fx `#` ikke bliver en kommentar.
Del ikke `.env` eller credentials i chat eller Git. Appens SQL-konto skal have
begrænsede rettigheder, og Azure-firewallen skal tillade udviklingsmaskinens IP.

Den fælles database er allerede sat op; kør ikke SQL-scripts igen.
Ved ny databaseopsætning følges [SQL-vejledningen](Backend/sql/README.md).
Et læsende forbindelses- og skematjek kan køres med `npm run db:check`.

Til Gmail bruges totrinsbekræftelse og et
[Google-app-password](https://support.google.com/accounts/answer/185833).
Funktionen er ikke tilgængelig på alle arbejds-/skolekonti. Alle mails går til
`MAIL_TEST_RECIPIENT`. Aktivering kan også behandle eksisterende ventende beskeder.

## Start og brug

```sh
npm run dev
```

- Gæsteside: <http://127.0.0.1:3002/>
- Personaleside: <http://127.0.0.1:3002/staff.html>

`npm run dev` genstarter ved backendændringer. Genindlæs browseren efter
frontendændringer. Stop med `Ctrl+C`; ændringer i `.env` kræver manuel genstart.
`npm start` starter uden automatisk genstart. Lad kun én server køre på samme port.
Hvis porten er optaget, stop den tidligere server eller vælg fx
`PORT=43127 npm start` og brug den port i browseren.

Find bookingoplysninger og opholdsdatoer i [demodata](Backend/sql/README.md#demodata).
Personalesiden viser dagens ophold efter dansk dato. Efter en statusændring
skal gæsten slå bookingen op igen for at hente den nye status.

## Tests

```sh
npm test
```

De lokale tests erstatter database og SMTP-transport og sender ingen mails.
De dækker blandt andet bookingadgang, statusændringer, tilmelding og mailfejl.
`GET /api/health` kontrollerer kun, at Express svarer; det tester ikke Azure eller Gmail.

Testene beviser ikke faktisk levering eller låsesamspil på Azure. Se
[docs.md](docs.md#verifikation-og-begrænsninger) for testenes rækkevidde.

Ved en særskilt aftalt manuel mailtest bruges en fiktiv booking uden tidligere
tilmelding og gruppens testindbakke: sæt Ikke klar, slå op og tilmeld, sæt Klar,
og kontrollér mailstatus og indbakke. Gentag opslaget for at kontrollere, at
tilmeldingen er bevaret. Der er højst ét forsøg pr. tilmelding; en tilbageførsel
nulstiller ikke mailhistorikken. Nye mailtestforløb kræver nye aftalte demodata.

## Fejlsøgning og afgrænsning

- **Siden kan ikke åbnes:** Kontrollér, at serveren kører, og at URL og port passer.
- **Azure-fejl:** Kontrollér `.env`, SQL-rettigheder og adgang fra din IP med `npm run db:check`.
- **Ingen mail:** Kontrollér mailopsætning og gemt `email_status`/`email_last_error`.
  `failed` og `processing` efter afbrydelse undersøges manuelt; nulstil ikke et
  forsøg blindt. Mailen kan allerede være accepteret. Se [mailforløbet](docs.md#asynkront-mailforløb).

Appen lytter kun på `127.0.0.1`. Deployment er ikke opsat. Før offentlig drift
kræves HTTPS, netværksbegrænsning af personaleside og personale-API, separat
produktionsdatabase og valg af en kompatibel mailtransport, jf. [specs.md](specs.md).

Se [docs.md](docs.md) for implementeringen og [AGENTS.md](AGENTS.md) for arbejdsregler.
