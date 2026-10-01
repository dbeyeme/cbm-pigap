import { useEffect, useState } from 'react';

import { verifPublique, type VerifPublique } from '../api';
import { IconCheckCircle, IconShield, IconXCircle } from '../components/Icons';

type Props = {
  type: 'licence' | 'quittance';
  numero: string;
};

const LIBELLES: Record<string, string> = {
  valide: 'Licence valide',
  sans_date: 'Licence valide',
  expiree: 'Autorisation annuelle expirée',
  suspendue: 'Titulaire suspendu',
  inconnue: 'Numéro inconnu au registre',
  payee: 'Quittance payée',
  en_attente: 'Quittance en attente de paiement',
  annulee: 'Quittance annulée',
};

/** Page publique ouverte depuis le QR code d'une licence ou d'une quittance. */
export default function VerifPage({ type, numero }: Props) {
  const [data, setData] = useState<VerifPublique | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    verifPublique(type, numero)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Vérification indisponible'));
  }, [type, numero]);

  const ok = data?.valide === true;

  return (
    <main className="verif-page">
      <section className={`verif-card${data ? (ok ? ' verif-card--ok' : ' verif-card--ko') : ''}`}>
        <p className="eyebrow">
          <IconShield size={14} /> CBM-PIGAP · vérification {type === 'licence' ? 'de licence' : 'de quittance'}
        </p>
        <h1>{numero}</h1>
        {error ? <p className="error">{error}</p> : null}
        {!data && !error ? <p>Vérification en cours…</p> : null}
        {data ? (
          <>
            <p className="verif-status">
              {ok ? <IconCheckCircle size={22} /> : <IconXCircle size={22} />}
              {LIBELLES[data.statut] ?? data.statut}
            </p>
            <dl>
              {data.date_expiration ? (
                <div>
                  <dt>Valable jusqu'au</dt>
                  <dd>{new Date(data.date_expiration).toLocaleDateString('fr-FR')}</dd>
                </div>
              ) : null}
              {type === 'licence' ? (
                <div>
                  <dt>Embarcations rattachées</dt>
                  <dd>{data.nb_embarcations}</dd>
                </div>
              ) : null}
              {data.montant_fcfa != null ? (
                <div>
                  <dt>Montant</dt>
                  <dd>{data.montant_fcfa.toLocaleString('fr-FR')} FCFA</dd>
                </div>
              ) : null}
            </dl>
            <p className="verif-note">
              Cette page n'affiche aucune donnée personnelle. Pour la fiche complète, un agent se connecte
              au portail et utilise la vérification de licence.
            </p>
          </>
        ) : null}
        <a className="verif-link" href="/">
          Accéder au portail
        </a>
      </section>
    </main>
  );
}
