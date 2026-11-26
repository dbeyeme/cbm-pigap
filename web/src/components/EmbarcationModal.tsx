import { FormEvent, useEffect, useState } from 'react';

import { createEmbarcation, type Embarcation, type Pecheur } from '../api';
import ComplementsFields, { complementsPayload, complementsVides, type ComplementsSaisie } from './ComplementsFields';
import EquipementsFields, { emptyEquipements, equipementsPayload, type Equipements } from './EquipementsFields';
import { IconSave, IconXCircle } from './Icons';
import Modal from './Modal';

type Props = {
  open: boolean;
  token: string;
  pecheur: Pecheur;
  onClose: () => void;
  onCreated: (b: Embarcation) => void;
};

/** Fenêtre de création d'une embarcation au registre, informations complémentaires comprises. */
export default function EmbarcationModal({ open, token, pecheur, onClose, onCreated }: Props) {
  const [nom, setNom] = useState('');
  const [immat, setImmat] = useState('');
  const [type, setType] = useState('pirogue');
  const [longueur, setLongueur] = useState('');
  const [equip, setEquip] = useState<Equipements>(emptyEquipements());
  const [complements, setComplements] = useState<ComplementsSaisie>(complementsVides());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNom('');
    setImmat('');
    setType('pirogue');
    setLongueur('');
    setEquip(emptyEquipements());
    setComplements(complementsVides());
    setError(null);
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const b = await createEmbarcation(token, {
        pecheur_id: pecheur.id,
        nom: nom.trim(),
        immatriculation: immat.trim(),
        type: type || null,
        longueur: longueur.trim() ? Number(longueur.replace(',', '.')) : null,
        equipements: equipementsPayload(equip),
        ...complementsPayload(complements),
      });
      onCreated(b);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'L’embarcation n’a pas pu être enregistrée.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Ajouter une embarcation"
      onClose={onClose}
      illustration="navire"
      wide
      footer={
        <div className="row-actions">
          <button type="button" className="ghost" onClick={onClose}>
            <IconXCircle size={16} /> Annuler
          </button>
          <button type="submit" form="form-embarcation" className="btn-primary" disabled={busy}>
            <IconSave size={16} /> {busy ? 'Enregistrement…' : 'Enregistrer l’embarcation'}
          </button>
        </div>
      }
    >
      <form id="form-embarcation" className="stack-form form-grille" onSubmit={(e) => void submit(e)}>
        <p className="form-hint form-grille-large">
          Titulaire : {pecheur.prenom} {pecheur.nom}, licence {pecheur.numero_licence}.
        </p>
        <label>
          Nom de l’embarcation
          <input value={nom} onChange={(e) => setNom(e.target.value)} required />
        </label>
        <label>
          Immatriculation
          <input value={immat} onChange={(e) => setImmat(e.target.value)} required />
        </label>
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="pirogue">Pirogue</option>
            <option value="chaloupe">Chaloupe</option>
            <option value="navire">Navire de pêche</option>
          </select>
        </label>
        <div className="form-grille-large">
          <EquipementsFields value={equip} onChange={setEquip} longueur={longueur} onLongueur={setLongueur} />
        </div>
        <div className="form-grille-large">
          <ComplementsFields value={complements} onChange={setComplements} />
        </div>
        {error ? (
          <p className="form-error form-grille-large" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
