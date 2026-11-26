import { useEffect, useState } from 'react';

import {
  ApiError,
  downloadRapportZonePdf,
  getRapportZone,
  type CibleZone,
  type GroupeCaptures,
  type RapportZone,
} from '../api';
import { IconDownload } from './Icons';

type Props = {
  token: string;
  cible: CibleZone | null;
  onError?: (msg: string | null) => void;
};

function kg(n: number): string {
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg`;
}

function GroupeTable({ titre, g }: { titre: string; g: GroupeCaptures }) {
  return (
    <section className="rapport-zone-bloc">
      <h4>
        {titre}
        <em>
          {kg(g.quantite_kg)} · {g.nb_declarations} déclaration{g.nb_declarations > 1 ? 's' : ''}
        </em>
      </h4>
      {g.par_espece.length ? (
        <table className="ds-table">
          <thead>
            <tr>
              <th>Espèce</th>
              <th>Quantité</th>
              <th>Déclarations</th>
            </tr>
          </thead>
          <tbody>
            {g.par_espece.map((e) => (
              <tr key={e.espece}>
                <td>{e.nom}</td>
                <td>{kg(e.quantite_kg)}</td>
                <td>{e.nb_declarations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="fiche-vide">Aucune déclaration dans ce groupe.</p>
      )}
    </section>
  );
}

/**
 * Tableaux du rapport de zone (activité, embarcations, captures, alertes) et export PDF.
 * Rôles : autorité, agent de contrôle, administrateur, chercheur (403 pour les autres).
 */
export default function RapportZoneVue({ token, cible, onError }: Props) {
  const [data, setData] = useState<RapportZone | null>(null);
  const [chargement, setChargement] = useState(false);
  const [pdf, setPdf] = useState(false);
  const [interdit, setInterdit] = useState(false);

  useEffect(() => {
    if (!cible?.zone_id && !cible?.secteur) {
      setData(null);
      setInterdit(false);
      return;
    }
    let stop = false;
    setChargement(true);
    setInterdit(false);
    onError?.(null);
    void getRapportZone(token, cible)
      .then((r) => {
        if (!stop) setData(r);
      })
      .catch((err) => {
        if (stop) return;
        setData(null);
        if (err instanceof ApiError && err.status === 403) {
          setInterdit(true);
          return;
        }
        onError?.(err instanceof Error ? err.message : 'Rapport de zone indisponible');
      })
      .finally(() => {
        if (!stop) setChargement(false);
      });
    return () => {
      stop = true;
    };
  }, [token, cible?.zone_id, cible?.secteur, cible?.debut, cible?.fin, onError]);

  async function exporter() {
    if (!cible) return;
    setPdf(true);
    onError?.(null);
    try {
      await downloadRapportZonePdf(token, cible);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Export PDF impossible');
    } finally {
      setPdf(false);
    }
  }

  if (!cible?.zone_id && !cible?.secteur) {
    return <p className="fiche-vide">Choisissez une zone ou un secteur pour produire le rapport.</p>;
  }
  if (interdit) {
    return <p className="fiche-vide">Votre rôle ne donne pas accès au rapport de zone.</p>;
  }
  if (chargement) return <p className="empty-list">Calcul du rapport…</p>;
  if (!data) return null;

  const debut = new Date(data.periode.debut).toLocaleDateString('fr-FR');
  const fin = new Date(data.periode.fin).toLocaleDateString('fr-FR');

  return (
    <div className="rapport-zone">
      <header className="rapport-zone-tete">
        <div>
          <strong>{data.zone.nom}</strong>
          <span>
            Du {debut} au {fin}
            {data.regle.statut ? ` · règle ${data.regle.statut}` : ''}
          </span>
        </div>
        <button type="button" className="ghost compact" onClick={() => void exporter()} disabled={pdf}>
          <IconDownload size={14} /> {pdf ? 'Préparation…' : 'Télécharger le PDF'}
        </button>
      </header>

      <ul className="rapport-zone-chiffres">
        <li>
          <em>Heures d’activité</em>
          <strong>{data.activite.heures_activite.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} h</strong>
        </li>
        <li>
          <em>Embarcations actives</em>
          <strong>{data.activite.nb_embarcations_actives}</strong>
        </li>
        <li>
          <em>Embarcations présentes</em>
          <strong>{data.nb_embarcations_presentes}</strong>
        </li>
        <li>
          <em>Alertes</em>
          <strong>{data.alertes.total}</strong>
        </li>
      </ul>

      <section className="rapport-zone-bloc">
        <h4>Embarcations présentes</h4>
        {data.embarcations.length ? (
          <table className="ds-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Immatriculation</th>
                <th>Heures</th>
                <th>Relevés</th>
              </tr>
            </thead>
            <tbody>
              {data.embarcations.map((e) => (
                <tr key={e.embarcation_id}>
                  <td>{e.nom}</td>
                  <td>{e.immatriculation}</td>
                  <td>{e.heures_activite.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} h</td>
                  <td>{e.nb_releves}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="fiche-vide">Aucune embarcation dans la zone sur cette période.</p>
        )}
      </section>

      <GroupeTable titre="Captures dans la zone" g={data.captures.dans_la_zone} />
      <GroupeTable titre="Captures sans lieu de pêche" g={data.captures.sans_position} />
      <GroupeTable titre="Captures hors de la zone" g={data.captures.positionnees_hors_zone} />

      <section className="rapport-zone-bloc">
        <h4>
          Alertes
          {data.alertes.sans_position > 0 ? (
            <em>{data.alertes.sans_position} sans lieu, non rattachées à une zone</em>
          ) : null}
        </h4>
        {data.alertes.elements.length ? (
          <table className="ds-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Gravité</th>
                <th>État</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {data.alertes.elements.map((a) => (
                <tr key={a.id}>
                  <td>{a.type}</td>
                  <td>{a.niveau_gravite}</td>
                  <td>{a.statut}</td>
                  <td>{new Date(a.horodatage).toLocaleString('fr-FR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="fiche-vide">Aucune alerte rattachée à cette zone sur la période.</p>
        )}
      </section>
    </div>
  );
}
