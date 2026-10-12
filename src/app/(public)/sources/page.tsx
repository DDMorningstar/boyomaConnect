import type { Metadata } from "next";
import { InfoPage } from "@/components/ui/info-page";
import { createSupabasePublicClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sources et licences",
  description:
    "Origine des données de Boyoma Connect, licences, attribution et accès à la base dérivée d'OpenStreetMap (ODbL).",
};
export const revalidate = 3600;

type Source = {
  key: string;
  name: string;
  license: string;
  license_url: string | null;
  attribution: string;
  share_alike: boolean;
  homepage: string | null;
  is_active: boolean;
  notes: string | null;
};

export default async function SourcesPage() {
  const { data } = await createSupabasePublicClient()
    .from("import_sources")
    .select("key, name, license, license_url, attribution, share_alike, homepage, is_active, notes")
    .order("created_at");
  const sources = (data as Source[] | null) ?? [];

  return (
    <InfoPage
      title="Sources et licences"
      intro="D'où viennent les informations de Boyoma Connect, et comment les réutiliser."
    >
      <h2>Informations vérifiées par Boyoma Connect</h2>
      <p>
        Les fiches créées ou réclamées par les établissements, et celles vérifiées sur le terrain par nos
        agents, sont signalées comme telles sur chaque fiche. Les lieux importés restent « non vérifiés »
        jusqu&apos;à contrôle.
      </p>

      <h2>Sources de données réutilisables</h2>
      <ul>
        {sources.map((s) => (
          <li key={s.key}>
            <strong>{s.name}</strong>
            {s.is_active ? "" : " (prévue)"} — licence{" "}
            {s.license_url ? (
              <a href={s.license_url} target="_blank" rel="noopener noreferrer">
                {s.license}
              </a>
            ) : (
              s.license
            )}
            , attribution « {s.attribution} »
            {s.homepage && (
              <>
                {" "}
                (
                <a href={s.homepage} target="_blank" rel="noopener noreferrer">
                  conditions
                </a>
                )
              </>
            )}
            .{s.notes ? ` ${s.notes}` : ""}
          </li>
        ))}
      </ul>
      <p>
        Boyoma Connect n&apos;extrait aucune donnée de Google Maps ni d&apos;un service dont les conditions
        l&apos;interdisent. Le bouton « Itinéraire » ouvre simplement Google Maps sur votre appareil.
      </p>

      <h2>OpenStreetMap et Open Database License (ODbL)</h2>
      <p>
        Une partie des lieux provient d&apos;
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          OpenStreetMap
        </a>{" "}
        © Contributeurs OpenStreetMap, sous licence{" "}
        <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">
          ODbL 1.0
        </a>
        . Chaque fiche concernée indique sa source et renvoie vers l&apos;objet OpenStreetMap d&apos;origine.
      </p>
      <p>
        Conformément à l&apos;ODbL (partage à l&apos;identique), la base dérivée d&apos;OpenStreetMap utilisée
        par Boyoma Connect est mise à disposition sous la même licence :{" "}
        <a href="/api/exports/osm" download>
          télécharger l&apos;extrait (GeoJSON, ODbL)
        </a>
        . Les informations ajoutées par les établissements ou nos agents ne font pas partie de cet extrait.
      </p>

      <h2>Limites administratives</h2>
      <p>
        Référentiel Géographique Commun de la RDC (OCHA, 2019), diffusé par geoBoundaries, licence{" "}
        <a href="https://creativecommons.org/licenses/by/3.0/igo/" target="_blank" rel="noopener noreferrer">
          CC BY 3.0 IGO
        </a>
        . Contours simplifiés, à titre indicatif.
      </p>

      <h2>Fonds de carte</h2>
      <p>Tuiles OpenFreeMap, données © Contributeurs OpenStreetMap (ODbL).</p>

      <h2>Signaler une source ou proposer un partenariat</h2>
      <p>
        Les données transmises par des partenaires ou par des établissements ne sont intégrées qu&apos;avec un
        accord écrit ou leur consentement, et restent attribuées à leur auteur.
      </p>
    </InfoPage>
  );
}
