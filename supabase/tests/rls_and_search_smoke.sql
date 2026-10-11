-- Test de fumée RLS + recherche géographique. Exécutable dans l'éditeur SQL Supabase
-- (rôle postgres). Tout est annulé à la fin : le bloc se termine par une exception
-- qui contient les résultats. Les données insérées sont explicitement FICTIVES.
-- Résultat attendu (base vide) :
--   texte=2 typo=2 cat+ville=2 rayon1km=1 dist_lointaine_m≈8220 bbox=1 suggestions≥1
--   anon_voit=2 anon_profiles=0 anon_insert=refusé anon_paiement=refusé
do $$
declare
  v_cat uuid := (select id from public.categories where slug = 'pharmacies');
  v_unit uuid := (select id from public.geographic_units where slug = 'makiso' and type_key = 'commune');
  r text := '';
  n int;
begin
  insert into public.places (name, primary_category_id, administrative_unit_id, latitude, longitude, geographic_precision, publication_status)
  values ('[FICTIF] Pharmacie Test Élan', v_cat, v_unit, 0.5153, 25.1910, 'exact', 'published'),
         ('[FICTIF] Pharmacie Lointaine', v_cat, v_unit, 0.5600, 25.2500, 'exact', 'published'),
         ('[FICTIF] Brouillon caché', v_cat, v_unit, 0.5150, 25.1900, 'exact', 'draft');

  select count(*) into n from public.search_places(p_query => 'pharmacie elan');                 r := r || ' texte=' || n;
  select count(*) into n from public.search_places(p_query => 'farmacie');                       r := r || ' typo=' || n;
  select count(*) into n from public.search_places(p_category_slug => 'sante',
    p_unit_id => (select id from public.geographic_units where slug = 'kisangani' and type_key = 'ville')); r := r || ' cat+ville=' || n;
  select count(*) into n from public.search_places(p_latitude => 0.5153, p_longitude => 25.1910, p_radius_m => 1000, p_sort => 'distance');
  r := r || ' rayon1km=' || n;
  select round(distance_m) into n from public.search_places(p_latitude => 0.5153, p_longitude => 25.1910, p_sort => 'distance')
    where name like '%Lointaine';                                                                r := r || ' dist_lointaine_m=' || n;
  select count(*) into n from public.places_in_bbox(25.18, 0.50, 25.20, 0.53);                  r := r || ' bbox=' || n;
  select count(*) into n from public.search_suggestions('pharm');                               r := r || ' suggestions=' || n;

  set local role anon;
  select count(*) into n from public.places where name like '[FICTIF]%';                        r := r || ' anon_voit=' || n;
  select count(*) into n from public.profiles;                                                  r := r || ' anon_profiles=' || n;
  begin
    insert into public.places (name) values ('pirate');
    r := r || ' anon_insert=AUTORISE!!';
  exception when others then r := r || ' anon_insert=refusé';
  end;
  begin
    perform public.confirm_manual_payment(gen_random_uuid(), 'x', 'y');
    r := r || ' anon_paiement=AUTORISE!!';
  exception when others then r := r || ' anon_paiement=refusé';
  end;
  reset role;
  raise exception 'RESULTATS:%', r;
end $$;
