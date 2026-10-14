-- The content seed: the bracket settings of src/lib/data/settings.seed.ts and the
-- DESIGN §5.1 catalogue of src/lib/configurator/catalog.seed.ts, generated from
-- those files. The real values arrive in PR-7. Projects and reviews stay empty:
-- only real ones, with consent, are ever stored. Re-runnable (on conflict do nothing).

-- settings: one row, the bracket seed of src/lib/data/settings.seed.ts (DESIGN §8).
insert into public.settings (id, data) values (1, '{"workshop_name":"[Nume atelier]","legal_name":"[Denumire firmă SRL]","cui":"[___]","reg_com":"[J__/____/____]","registered_office":"[Sediul social]","address":"[Strada, nr., Localitate]","city":"[Localitate]","phone_public":"[07xx xxx xxx]","whatsapp_number":"","email_public":"[contact@domeniu.ro]","hours":"[Luni–Vineri, 9:00–18:00]","visits_note":"[cu programare]","instagram_url":"","facebook_url":"","google_profile_url":"","google_rating":"","google_reviews_count":"","response_time":"[24 de ore]","lead_time":"[4–6] săptămâni","warranty_structure_years":"[X]","warranty_upholstery_years":"[Y]","delivery_zone":"[Zona: oraș, județ, țară]","delivery_note":"[Zonele în care livrați și montați, și cât costă transportul.]","measurement_note":"[gratuit în Localitate]","offer_days":"[X]","installation_note":"[inclus în zona X]","deposit_pct":"[X]","mattresses_note":"[Da / nu. Dacă da: ce tipuri și de la ce producători.]","sample_limit":5,"samples_free":"[gratuit]","samples_delivery":"[2–3 zile lucrătoare]","show_prices":false,"structure_text":"[Lemn masiv de fag / pin uscat / alt material]","slats_text":"[Lamele de fag curbate, cu reglaj / fixă]","foam_text":"[Densitate, tip]","fabrics_text":"[Furnizori, colecții]","founded_year":"[anul]","team_size":"[X]","story_text":"[Una-două fraze despre ce vă diferențiază.]","leg_height_cm":"[12]","oil_refresh_interval":"[o dată pe an]"}'::jsonb)
  on conflict (id) do nothing;

-- models (DESIGN §5.1)
insert into public.models (id, name, note, code, sort) values
  ('capitonat', 'Capitonat', 'Tapițat, cu nasturi', 'CAP', 0),
  ('arcuit', 'Arcuit', 'Linie curbă, bordură', 'ARC', 1),
  ('canale', 'Canale', 'Cusături verticale', 'CAN', 2),
  ('lamele', 'Lamele', 'Lemn masiv', 'LAM', 3)
  on conflict (id) do nothing;

-- material families, with the DESIGN §4.3 description and specs
insert into public.material_families (id, name, code, tab, description, specs, sort) values
  ('catifea', 'Catifea', 'CT', 'textile', 'Moale, cu un luciu discret. Culorile arată intens și se schimbă ușor după cum cade lumina.', '[{"k":"Compoziție","v":"[100% poliester]"},{"k":"Frecare","v":"[___] cicluri Martindale"},{"k":"Întreținere","v":"[aspirare, lavetă umedă]"},{"k":"Animale","v":"[potrivit / nepotrivit]"}]'::jsonb, 0),
  ('boucle', 'Bouclé', 'BC', 'textile', 'Fir buclat, cu textură vizibilă de aproape. Arată cel mai bine pe forme rotunjite, cum e modelul Arcuit.', '[{"k":"Compoziție","v":"[___]"},{"k":"Frecare","v":"[___] cicluri Martindale"},{"k":"Întreținere","v":"[___]"},{"k":"Animale","v":"[nerecomandat: se agață ghearele]"}]'::jsonb, 1),
  ('stofa', 'Stofă', 'SF', 'textile', 'Țesătură densă și mată. Alegerea practică pentru un pat folosit intens, în fiecare zi.', '[{"k":"Compoziție","v":"[___]"},{"k":"Frecare","v":"[___]"},{"k":"Întreținere","v":"[___]"},{"k":"Animale","v":"[___]"}]'::jsonb, 2),
  ('piele', 'Piele ecologică', 'PE', 'textile', 'Se șterge ușor cu o lavetă umedă. Aspect curat, de hotel, potrivit pentru tăblii cu canale.', '[{"k":"Compoziție","v":"[___]"},{"k":"Grosime","v":"[___] mm"},{"k":"Întreținere","v":"[lavetă umedă, fără solvenți]"},{"k":"Animale","v":"[___]"}]'::jsonb, 3),
  ('lemn', 'Lemn masiv', 'LM', 'lemn', 'Pentru modelul Lamele și pentru picioare. Lemn [uscat în cuptor], tăiat și finisat în atelier.', '[{"k":"Esențe","v":"stejar, nuc, frasin"},{"k":"Umiditate","v":"[sub 10%]"},{"k":"Finisaj","v":"ulei, lac mat sau baiț"},{"k":"Proveniență","v":"[___]"}]'::jsonb, 4)
  on conflict (id) do nothing;

-- materials: the colours, in catalogue order; `featured` marks the eight swatches of Acasă 03
insert into public.materials (id, family_id, name, code, hex, featured, sort) values
  ('ct-verde', 'catifea', 'Verde sticlă', 'CT01', '#2F4B3C', true, 0),
  ('ct-bleumarin', 'catifea', 'Bleumarin', 'CT02', '#1F2A44', false, 1),
  ('ct-mustar', 'catifea', 'Muștar', 'CT03', '#B98A2E', true, 2),
  ('ct-roz', 'catifea', 'Roz pudrat', 'CT04', '#C99A93', false, 3),
  ('ct-antracit', 'catifea', 'Antracit', 'CT05', '#3B3D41', false, 4),
  ('ct-caramiziu', 'catifea', 'Cărămiziu', 'CT06', '#9A4E3A', false, 5),
  ('bc-alb', 'boucle', 'Alb lapte', 'BC01', '#E7E2D8', true, 0),
  ('bc-nisip', 'boucle', 'Nisip', 'BC02', '#CDBFA6', true, 1),
  ('bc-perla', 'boucle', 'Gri perlă', 'BC03', '#BDBAB4', false, 2),
  ('bc-taupe', 'boucle', 'Taupe', 'BC04', '#8E8174', false, 3),
  ('sf-gri', 'stofa', 'Gri deschis', 'SF01', '#B9BCBF', false, 0),
  ('sf-melanj', 'stofa', 'Gri melanj', 'SF02', '#7B7E83', true, 1),
  ('sf-denim', 'stofa', 'Albastru denim', 'SF03', '#4A5F7A', false, 2),
  ('sf-salvie', 'stofa', 'Verde salvie', 'SF04', '#8F9E89', false, 3),
  ('sf-bej', 'stofa', 'Bej', 'SF05', '#CBB99B', false, 4),
  ('pe-coniac', 'piele', 'Coniac', 'PE01', '#8A5A35', true, 0),
  ('pe-ciocolata', 'piele', 'Ciocolată', 'PE02', '#4A3328', false, 1),
  ('pe-negru', 'piele', 'Negru', 'PE03', '#232323', false, 2),
  ('pe-alb', 'piele', 'Alb', 'PE04', '#E9E6E0', false, 3),
  ('lm-stejar', 'lemn', 'Stejar natur', 'LM01', '#C9A574', true, 0),
  ('lm-afumat', 'lemn', 'Stejar afumat', 'LM02', '#7A5A3C', false, 1),
  ('lm-nuc', 'lemn', 'Nuc', 'LM03', '#5C3F2C', true, 2),
  ('lm-frasin', 'lemn', 'Frasin', 'LM04', '#D8C3A0', false, 3),
  ('lm-negru', 'lemn', 'Negru mat', 'LM05', '#262626', false, 4)
  on conflict (id) do nothing;

-- which families go on which model (Model.families)
insert into public.model_families (model_id, family_id) values
  ('capitonat', 'catifea'),
  ('capitonat', 'boucle'),
  ('capitonat', 'stofa'),
  ('capitonat', 'piele'),
  ('arcuit', 'catifea'),
  ('arcuit', 'boucle'),
  ('arcuit', 'stofa'),
  ('arcuit', 'piele'),
  ('canale', 'catifea'),
  ('canale', 'boucle'),
  ('canale', 'stofa'),
  ('canale', 'piele'),
  ('lamele', 'lemn')
  on conflict do nothing;

-- bases
insert into public.bases (id, name, note, code, sort) values
  ('lemn', 'Picioare din lemn', 'Stejar, [12] cm', 'PL', 0),
  ('metal', 'Picioare metalice', 'Negru mat, [12] cm', 'PM', 1),
  ('lada', 'Ladă de depozitare', 'Somieră rabatabilă', 'LD', 2),
  ('sertare', 'Sertare', '2 sertare pe lateral', 'SR', 3)
  on conflict (id) do nothing;
