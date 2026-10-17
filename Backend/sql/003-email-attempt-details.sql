-- Udkast til godkendelse. Kør kun én gang efter 001 og 002.
-- Tilføjer fejlkode og tidspunkt uden at ændre eksisterende tilmeldinger.
IF DB_NAME() <> N'roomReady'
    THROW 50001, 'Vælg udviklingsdatabasen roomReady først.', 1;

ALTER TABLE dbo.notification_subscriptions ADD
    email_last_error nvarchar(100) NULL,
    email_attempted_at datetime2 NULL;
