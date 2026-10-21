-- PR-6: the workshop does not send material samples. The three samples keys leave
-- the settings row (the reader ignores unknown keys, so this is tidiness only).
-- The enum value 'mostre' and the columns leads.address / leads.sample_material_ids
-- stay until the owner approves dropping them; no lead carries them any more.
update public.settings
set data = data - 'sample_limit' - 'samples_free' - 'samples_delivery'
where id = 1;
