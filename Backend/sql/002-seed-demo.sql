-- Udkast til godkendelse. Kør kun én gang, efter oprettelse af tabellerne.
-- Alle oplysninger er fiktive. Eksisterende data slettes eller opdateres ikke.
IF DB_NAME() <> N'roomReady'
    THROW 50001, 'Vælg udviklingsdatabasen roomReady først.', 1;

-- Gem demodata samlet; en kørselsfejl ruller transaktionen tilbage.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

INSERT INTO dbo.rooms (room_number)
VALUES (N'301'), (N'302');

-- Find værelsets id via nummeret i stedet for at antage id 1 og 2.
INSERT INTO dbo.bookings
    (booking_reference, email, room_id, arrival_date, departure_date, status)
SELECT 'DEMO-7F82C9A46B105DE3', N'ready@example.com', id, '20261017', '20261019', 'ready'
FROM dbo.rooms WHERE room_number = N'301';

INSERT INTO dbo.bookings
    (booking_reference, email, room_id, arrival_date, departure_date, status)
SELECT 'DEMO-93B5E20D8A764FC1', N'waiting@example.com', id, '20261017', '20261019', 'not_ready'
FROM dbo.rooms WHERE room_number = N'302';

COMMIT TRANSACTION;
