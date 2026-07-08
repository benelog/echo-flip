-- Short per-deck sequence backing the Base62 URL slug (/decks/{slug}).
-- Existing rows are backfilled automatically by the identity default.
alter table decks add column seq bigint generated always as identity;
alter table decks add constraint decks_seq_key unique (seq);
