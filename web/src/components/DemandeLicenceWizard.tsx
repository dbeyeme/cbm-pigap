import { FormEvent, useMemo, useState } from 'react';

import { createDemandeLicenceWithFiles } from '../api';
import { friendlyApiError } from '../lib/apiErrors';
import Modal from './Modal';
import { useToast } from './ToastProvider';

type Props = {
  open: boolean;
  onClose: () => void;
};

type PieceDraft = {
  id: string;
  file: File;
  type_piece: string;
};

const STEPS = [
  { id: 'type', label: 'Type' },
  { id: 'identite', label: 'Identité' },
  { id: 'activite', label: 'Activité' },
  { id: 'pieces', label: 'Justificatifs' },
  { id: 'recap', label: 'Envoi' },
] as const;

const PIECE_OPTIONS = [
  { value: 'piece_identite', label: 'Pièce d’identité' },
  { value: 'justificatif_domicile', label: 'Justificatif de domicile' },
  { value: 'registre_commerce', label: 'Registre / statuts' },
  { value: 'photo_embarcation', label: 'Photo embarcation' },
  { value: 'autre', label: 'Autre document' },
];

/**
 * Wizard modal — demande de licence FO (physique / morale + upload).
 */
export default function DemandeLicenceWizard({ open, onClose }: Props) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const [demandeType, setDemandeType] = useState<'personne_physique' | 'personne_morale'>(
    'personne_physique',
  );
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [tel, setTel] = useState('');
  const [mail, setMail] = useState('');
  const [orgNom, setOrgNom] = useState('');
  const [orgType, setOrgType] = useState('cooperative');
  const [orgRegistre, setOrgRegistre] = useState('');
  const [orgTel, setOrgTel] = useState('');
  const [orgMail, setOrgMail] = useState('');
  const [orgVille, setOrgVille] = useState('Libreville');
  const [zone, setZone] = useState('Estuaire');
  const [embNom, setEmbNom] = useState('');
  const [embImmat, setEmbImmat] = useState('');
  const [message, setMessage] = useState('');
  const [pieces, setPieces] = useState<PieceDraft[]>([]);
  const [pickType, setPickType] = useState('piece_identite');

  function reset() {
    setStep(0);
    setBusy(false);
    setErr(null);
    setOk(false);
    setDemandeType('personne_physique');
    setNom('');
    setPrenom('');
    setTel('');
    setMail('');
    setOrgNom('');
    setOrgType('cooperative');
    setOrgRegistre('');
    setOrgTel('');
    setOrgMail('');
    setOrgVille('Libreville');
    setZone('Estuaire');
    setEmbNom('');
    setEmbImmat('');
    setMessage('');
    setPieces([]);
    setPickType('piece_identite');
  }

  function handleClose() {
    reset();
    onClose();
  }

  const canNext = useMemo(() => {
    if (step === 0) return true;
    if (step === 1) {
      if (demandeType === 'personne_physique') {
        return Boolean(nom.trim() && prenom.trim() && (tel.trim() || mail.trim()));
      }
      return Boolean(orgNom.trim() && (orgTel.trim() || orgMail.trim()));
    }
    return true;
  }, [step, demandeType, nom, prenom, tel, mail, orgNom, orgTel, orgMail]);

  function onAddFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const next = [...pieces];
    for (const file of Array.from(fileList)) {
      if (next.length >= 5) break;
      next.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        type_piece: pickType,
      });
    }
    setPieces(next);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set('type_demande', demandeType);
      if (demandeType === 'personne_physique') {
        fd.set('nom', nom);
        fd.set('prenom', prenom);
        if (tel) fd.set('telephone', tel);
        if (mail) fd.set('email', mail);
        if (zone) fd.set('zone_activite', zone);
        if (embNom) fd.set('embarcation_nom', embNom);
        if (embImmat) fd.set('embarcation_immatriculation', embImmat);
      } else {
        fd.set('org_nom', orgNom);
        fd.set('org_type', orgType);
        if (orgRegistre) fd.set('numero_registre', orgRegistre);
        if (orgTel) fd.set('org_telephone', orgTel);
        if (orgMail) fd.set('org_email', orgMail);
        if (orgVille) fd.set('org_ville', orgVille);
        if (nom) fd.set('nom', nom);
        if (prenom) fd.set('prenom', prenom);
        if (zone) fd.set('zone_activite', zone);
      }
      if (message) fd.set('message', message);
      for (const p of pieces) {
        fd.append('type_pieces', p.type_piece);
        fd.append('pieces', p.file, p.file.name);
      }
      await createDemandeLicenceWithFiles(fd);
      setOk(true);
      setStep(STEPS.length - 1);
      toast.success(
        'Demande envoyée',
        'Un agent traitera votre dossier. Conservez vos coordonnées pour le suivi.',
      );
    } catch (error) {
      const msg = friendlyApiError(error);
      setErr(msg);
      toast.error('Envoi impossible', msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      wide
      title="Demande de licence"
      footer={
        ok ? (
          <button type="button" className="btn-primary" onClick={handleClose}>
            Fermer
          </button>
        ) : (
          <div className="wizard-actions">
            <button
              type="button"
              className="ghost"
              disabled={step === 0 || busy}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Retour
            </button>
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                className="btn-primary"
                disabled={!canNext || busy}
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              >
                Continuer
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => {
                  void onSubmit({ preventDefault() {} } as FormEvent);
                }}
              >
                {busy ? 'Envoi…' : 'Envoyer ma demande'}
              </button>
            )}
          </div>
        )
      }
    >
      <ol className="wizard-steps" aria-label="Étapes">
        {STEPS.map((s, i) => (
          <li key={s.id} className={i === step ? 'on' : i < step ? 'done' : ''}>
            <span className="wizard-step-num">{i + 1}</span>
            <span className="wizard-step-label">{s.label}</span>
          </li>
        ))}
      </ol>

      {ok ? (
        <div className="wizard-success">
          <p className="fo-ok">
            Demande envoyée. Un agent vérifiera votre dossier et vos justificatifs. Conservez vos
            coordonnées pour le suivi.
          </p>
        </div>
      ) : (
        <form className="wizard-pane" onSubmit={(e) => void onSubmit(e)}>
          {step === 0 ? (
            <div className="fo-type-switch wizard-type" role="group" aria-label="Type de demande">
              <button
                type="button"
                className={demandeType === 'personne_physique' ? 'on' : 'ghost'}
                onClick={() => setDemandeType('personne_physique')}
              >
                Pêcheur (personne)
              </button>
              <button
                type="button"
                className={demandeType === 'personne_morale' ? 'on' : 'ghost'}
                onClick={() => setDemandeType('personne_morale')}
              >
                Organisation (personne morale)
              </button>
              <p className="wizard-hint">
                Choisissez qui demande la licence. Les organisations (coopératives, sociétés) passent
                ensuite par le même contrôle.
              </p>
            </div>
          ) : null}

          {step === 1 && demandeType === 'personne_physique' ? (
            <div className="fo-form-grid">
              <label>
                Nom
                <input required value={nom} onChange={(e) => setNom(e.target.value)} />
              </label>
              <label>
                Prénom
                <input required value={prenom} onChange={(e) => setPrenom(e.target.value)} />
              </label>
              <label>
                Téléphone
                <input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="+241…" />
              </label>
              <label>
                E-mail
                <input type="email" value={mail} onChange={(e) => setMail(e.target.value)} />
              </label>
            </div>
          ) : null}

          {step === 1 && demandeType === 'personne_morale' ? (
            <div className="fo-form-grid">
              <label>
                Nom de l’organisation
                <input required value={orgNom} onChange={(e) => setOrgNom(e.target.value)} />
              </label>
              <label>
                Type
                <select value={orgType} onChange={(e) => setOrgType(e.target.value)}>
                  <option value="cooperative">Coopérative</option>
                  <option value="societe">Société</option>
                  <option value="association">Association</option>
                  <option value="autre">Autre</option>
                </select>
              </label>
              <label>
                N° registre
                <input value={orgRegistre} onChange={(e) => setOrgRegistre(e.target.value)} />
              </label>
              <label>
                Téléphone
                <input value={orgTel} onChange={(e) => setOrgTel(e.target.value)} />
              </label>
              <label>
                E-mail
                <input type="email" value={orgMail} onChange={(e) => setOrgMail(e.target.value)} />
              </label>
              <label>
                Ville
                <input value={orgVille} onChange={(e) => setOrgVille(e.target.value)} />
              </label>
              <label>
                Contact — nom
                <input value={nom} onChange={(e) => setNom(e.target.value)} />
              </label>
              <label>
                Contact — prénom
                <input value={prenom} onChange={(e) => setPrenom(e.target.value)} />
              </label>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="fo-form-grid">
              <label>
                Zone d’activité
                <input value={zone} onChange={(e) => setZone(e.target.value)} />
              </label>
              {demandeType === 'personne_physique' ? (
                <>
                  <label>
                    Nom de l’embarcation
                    <input value={embNom} onChange={(e) => setEmbNom(e.target.value)} />
                  </label>
                  <label>
                    Immatriculation
                    <input value={embImmat} onChange={(e) => setEmbImmat(e.target.value)} />
                  </label>
                </>
              ) : null}
              <label className="span-2">
                Message (optionnel)
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Précisez votre activité…"
                />
              </label>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="wizard-upload">
              <p className="wizard-hint">
                Ajoutez vos justificatifs (PDF, JPG, PNG — max 5 fichiers, 5 Mo chacun). Recommandé :
                pièce d’identité{demandeType === 'personne_morale' ? ', registre' : ''}.
              </p>
              <div className="wizard-upload-row">
                <label>
                  Type de document
                  <select value={pickType} onChange={(e) => setPickType(e.target.value)}>
                    {PIECE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="file-drop">
                  <span>Choisir un fichier</span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                    multiple
                    onChange={(e) => {
                      onAddFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <ul className="wizard-file-list">
                {pieces.length === 0 ? <li className="empty-list">Aucun fichier pour l’instant.</li> : null}
                {pieces.map((p) => (
                  <li key={p.id}>
                    <span>
                      <strong>
                        {PIECE_OPTIONS.find((o) => o.value === p.type_piece)?.label ?? p.type_piece}
                      </strong>
                      {' · '}
                      {p.file.name} ({Math.round(p.file.size / 1024)} Ko)
                    </span>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setPieces((all) => all.filter((x) => x.id !== p.id))}
                    >
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="wizard-recap">
              <dl className="demande-dl">
                <div>
                  <dt>Type</dt>
                  <dd>
                    {demandeType === 'personne_morale' ? 'Organisation' : 'Pêcheur'}
                  </dd>
                </div>
                <div>
                  <dt>Identité</dt>
                  <dd>
                    {demandeType === 'personne_morale'
                      ? orgNom
                      : `${prenom} ${nom}`.trim()}
                  </dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>
                    {demandeType === 'personne_morale'
                      ? `${orgTel || '—'} · ${orgMail || '—'}`
                      : `${tel || '—'} · ${mail || '—'}`}
                  </dd>
                </div>
                <div>
                  <dt>Justificatifs</dt>
                  <dd>
                    {pieces.length === 0
                      ? 'Aucun (vous pourrez les fournir plus tard auprès d’un agent)'
                      : `${pieces.length} fichier(s)`}
                  </dd>
                </div>
              </dl>
              <p className="wizard-hint">Vérifiez puis envoyez. Un agent traitera le dossier.</p>
            </div>
          ) : null}

          {err ? <p className="error">{err}</p> : null}
        </form>
      )}
    </Modal>
  );
}
