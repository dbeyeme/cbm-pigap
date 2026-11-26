import { useState } from 'react';

import HubTabs from '../components/HubTabs';
import { IconBuilding, IconCard, IconBadge, IconInbox } from '../components/Icons';
import PageBanner from '../components/PageBanner';
import AbonnementsPage from './AbonnementsPage';
import DemandesPage from './DemandesPage';
import LicencesPage from './LicencesPage';
import OrganisationsPage from './OrganisationsPage';
import type { TrajectorySegment } from '../api';

type Tab = 'demandes' | 'licences' | 'organisations' | 'abonnements';

type Props = {
  token: string;
  demandesBadge: number;
  onError: (msg: string | null) => void;
  colorFor: (id: string) => string;
  onOpenTrajectory: (s: TrajectorySegment) => void;
  initialTab?: Tab;
  isSuperAdmin?: boolean;
  /** Recherche à poser dans l'onglet des pêcheurs (recherche globale). */
  initialQuery?: string;
  role?: string | null;
};

export default function ActeursHub({
  token,
  demandesBadge,
  onError,
  colorFor,
  onOpenTrajectory,
  initialTab = 'demandes',
  isSuperAdmin = false,
  initialQuery,
  role = null,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <section className="stage stage-wide ds-hub">
      <PageBanner
        photo="peche"
        eyebrow="Registre"
        title="Acteurs"
        aide={{
          titre: 'Le registre',
          texte:
            'Instruisez d’abord les demandes de licence. Une demande approuvée crée le pêcheur ; le numéro de licence et, si besoin, l’immatriculation de l’embarcation sont attribués automatiquement.',
        }}
      >
        <p>Demandes de licence, pêcheurs, organisations et abonnements.</p>
      </PageBanner>
      <HubTabs
        tabs={[
          { id: 'demandes', label: 'Demandes', badge: demandesBadge, icon: IconInbox, hint: 'Demandes de licence à traiter' },
          { id: 'licences', label: 'Pêcheurs et licences', icon: IconBadge, hint: 'Registre des pêcheurs' },
          { id: 'organisations', label: 'Organisations', icon: IconBuilding, hint: 'Coopératives, sociétés, associations' },
          { id: 'abonnements', label: 'Abonnements', icon: IconCard, hint: 'Licences et abonnements réglés' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="ds-hub-panel">
        {tab === 'demandes' ? <DemandesPage token={token} onError={onError} /> : null}
        {tab === 'licences' ? (
          <LicencesPage
            token={token}
            onError={onError}
            colorFor={colorFor}
            onOpenTrajectory={onOpenTrajectory}
            initialQuery={initialQuery}
            role={role}
          />
        ) : null}
        {tab === 'organisations' ? <OrganisationsPage token={token} onError={onError} /> : null}
        {tab === 'abonnements' ? (
          <AbonnementsPage token={token} onError={onError} isSuperAdmin={isSuperAdmin} />
        ) : null}
      </div>
    </section>
  );
}
