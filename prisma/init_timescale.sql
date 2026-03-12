-- Upewnij się, że rozszerzenie jest aktywne
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Konwersja tabel na Hypertables
SELECT create_hypertable('machine_status_history', 'time', if_not_exists => true);
SELECT create_hypertable('scrap_events', 'time', if_not_exists => true);

-- Retention policy
SELECT add_retention_policy('machine_status_history', INTERVAL '90 days', if_not_exists => true);
SELECT add_retention_policy('scrap_events', INTERVAL '90 days', if_not_exists => true);
