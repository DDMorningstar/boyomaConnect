-- =============================================================================
-- BOYOMA CONNECT — Malipo (1/2) : nouveau fournisseur de paiement (décision D33)
-- Migration séparée : une valeur d'énumération ajoutée doit être validée avant d'être utilisée.
-- =============================================================================
alter type public.payment_provider add value if not exists 'malipo';
