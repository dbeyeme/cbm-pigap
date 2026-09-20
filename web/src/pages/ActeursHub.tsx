import { useState } from 'react';

import HubTabs from '../components/HubTabs';
import { IconBuilding, IconCard, IconBadge, IconInbox } from '../components/Icons';
import Illustration from '../components/Illustration';
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
};

export default function ActeursHub({
  token,
  demandesBadge,
  onError,
  colorFor,
  onOpenTrajectory,
  initialTab = 'demandes',
  isSuperAdmin = false,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <section className="stage stage-wide ds-hub">
      <div className="stage-head page-head-with-icon page-head-illustrated">
        <Illustration name="acteurs" size={104} className="page-illustration" />
        <div>
          <p className="eyebrow">Registre</p>
          <h1>Acteurs</h1>
          <p>Demandes de licence, pêcheurs, organisations et abonnements.</p>
        </div>
      </div>
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
