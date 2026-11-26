import { FormEvent, useEffect, useState } from 'react';

import {
  getProfilMoi,
  getProfilMoiQrUrl,
  patchProfilMoi,
  type ProfilMoi,
  type TarifProfil,
} from '../api';
import { friendlyApiError } from '../lib/apiErrors';
import ProfilVue from './ProfilVue';
import { IconSave } from './Icons';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
};

/**
 * Réglages de la page de profil de l'acteur connecté (pêcheur ou organisation).
 */
export default function ProfilEditeur({ token, onError }: Props) {
  const [moi, setMoi] = useState<ProfilMoi | null>(null);
  const [presentation, setPresentation] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const [tarifsVisibles, setTarifsVisibles] = useState(false);
  const [masquees, setMasquees] = useState<string[]>([]);
  const [tarifs, setTarifs] = useState<TarifProfil[]>([]);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    onError(null);
    void getProfilMoi(token)
      .then((p) => {
        if (stop) return;
        setMoi(p);
        setPresentation(p.presentation ?? '');
        setOuvert(p.ouvert_au_public);
        setTarifsVisibles(p.tarifs_visibles);
        setMasquees(p.especes_masquees);
        setTarifs(p.mes_tarifs);
      })
      .catch((err) => onError(err instanceof Error ? err.message : 'Page de profil indisponible'));
    return () => {
      stop = true;
    };
  }, [token, onError]);

  useEffect(() => {
    if (!ouvert || !moi) {
      if (qr) URL.revokeObjectURL(qr);
      setQr(null);
      return;
    }
    let stop = false;
    void getProfilMoiQrUrl(token)
      .then((url) => {
        if (stop) URL.revokeObjectURL(url);
        else setQr(url);
      })
      .catch(() => setQr(null));
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, token, moi?.acteur_id]);

  function toggleMasque(code: string) {
    setMasquees((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  function setPrix(espece: string, prix: string) {
    const n = Number(prix.replace(',', '.'));
    setTarifs((prev) => {
      const sans = prev.filter((t) => t.espece !== espece);
      if (!Number.isFinite(n) || n <= 0) return sans;
      const connu = prev.find((t) => t.espece === espece);
      return [...sans, { espece, unite: connu?.unite ?? 'kg', prix_fcfa: Math.round(n) }];
    });
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    try {
      const p = await patchProfilMoi(token, {
        presentation,
        especes_masquees: masquees,
        tarifs: tarifs.map((t) => ({ espece: t.espece, unite: t.unite, prix_fcfa: t.prix_fcfa })),
        tarifs_visibles: tarifsVisibles,
        ouvert_au_public: ouvert,
      });
      setMoi(p);
      setPresentation(p.presentation ?? '');
      setOuvert(p.ouvert_au_public);
      setTarifsVisibles(p.tarifs_visibles);
      setMasquees(p.especes_masquees);
      setTarifs(p.mes_tarifs);
    } catch (err) {
      onError(friendlyApiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!moi) return <p className="empty-list">Chargement de votre page…</p>;
  const max = moi.limites.presentation_max_caracteres;

  return (
    <div className="profil-editeur">
      <ProfilVue profil={moi} />
      <form className="login-form compact-form" onSubmit={(e) => void enregistrer(e)}>
        <h3 className="side-sub">Réglages de votre page</h3>
        <label>
          Présentation
          <textarea
            rows={4}
            maxLength={max}
            value={presentation}
            onChange={(e) => setPresentation(e.target.value)}
            placeholder="Décrivez votre activité, sans adresse ni numéro de téléphone."
          />
          <span className="form-hint">
            {presentation.length} / {max} · aucun e-mail, aucun site, aucune suite de plus de six chiffres
          </span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={ouvert} onChange={(e) => setOuvert(e.target.checked)} />
          Ouvrir cette page au public (lien et QR)
        </label>
        {ouvert && moi.lien_public ? (
          <p className="gfw-panel-meta">
            Lien public : <a href={moi.lien_public}>{moi.lien_public}</a>
          </p>
        ) : null}
        {qr ? <img className="profil-qr" src={qr} alt="QR code du lien public" width={120} height={120} /> : null}
        <label className="toggle-row">
          <input type="checkbox" checked={tarifsVisibles} onChange={(e) => setTarifsVisibles(e.target.checked)} />
          Afficher les tarifs indicatifs
        </label>
        {moi.especes_declarees.length ? (
          <fieldset className="profil-masques">
            <legend>Espèces visibles</legend>
            {moi.especes_declarees.map((e) => (
              <label key={e.espece} className="toggle-row">
                <input
                  type="checkbox"
                  checked={!masquees.includes(e.espece)}
                  onChange={() => toggleMasque(e.espece)}
                />
                {e.nom}
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="fiche-vide">Les espèces apparaissent dès que des captures sont déclarées.</p>
        )}
        {tarifsVisibles && moi.especes_declarees.length ? (
          <fieldset className="profil-masques">
            <legend>Tarifs (FCFA le kilo), facultatifs</legend>
            {moi.especes_declarees
              .filter((e) => !masquees.includes(e.espece))
              .map((e) => (
                <label key={e.espece}>
                  {e.nom}
                  <input
                    type="number"
                    min={1}
                    max={moi.limites.prix_max_fcfa}
                    value={tarifs.find((t) => t.espece === e.espece)?.prix_fcfa ?? ''}
                    onChange={(ev) => setPrix(e.espece, ev.target.value)}
                  />
                </label>
              ))}
          </fieldset>
        ) : null}
        <button type="submit" disabled={busy}>
          <IconSave size={16} /> {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </div>
  );
}
