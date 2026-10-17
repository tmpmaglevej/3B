-- Udkast til godkendelse. Kør kun én gang i en tom roomReady-database.
-- Scriptet ændrer eller sletter ikke eksisterende tabeller.
IF DB_NAME() <> N'roomReady'
    THROW 50001, 'Vælg udviklingsdatabasen roomReady først.', 1;

CREATE TABLE dbo.rooms (
    id int IDENTITY(1,1) PRIMARY KEY,
    room_number nvarchar(20) NOT NULL UNIQUE
);

CREATE TABLE dbo.bookings (
    id int IDENTITY(1,1) PRIMARY KEY,
    booking_reference varchar(40) NOT NULL UNIQUE,
    email nvarchar(254) NOT NULL,
    room_id int NOT NULL REFERENCES dbo.rooms(id),
    arrival_date date NOT NULL,
    departure_date date NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'not_ready',
    version int NOT NULL DEFAULT 1,
    CHECK (departure_date > arrival_date),
    CHECK (status IN ('ready', 'not_ready'))
);

CREATE TABLE dbo.notification_subscriptions (
    id int IDENTITY(1,1) PRIMARY KEY,
    booking_id int NOT NULL UNIQUE REFERENCES dbo.bookings(id),
    subscribed_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
    email_status varchar(30) NOT NULL DEFAULT 'waiting_for_ready',
    email_attempts int NOT NULL DEFAULT 0,
    email_accepted_at datetime2 NULL,
    CHECK (email_attempts >= 0),
    CHECK (email_status IN ('waiting_for_ready', 'pending', 'processing', 'accepted', 'failed'))
);
