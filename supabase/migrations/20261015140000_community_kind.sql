-- =============================================================================
-- BOYOMA CONNECT — Photos proposées par la communauté (1/2) : nouveau type de média (décision D34)
-- Migration séparée : une valeur d'énumération doit être validée avant d'être utilisée.
-- =============================================================================
alter type public.media_kind add value if not exists 'community';
