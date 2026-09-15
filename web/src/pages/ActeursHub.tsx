import { useState } from 'react';

import HubTabs from '../components/HubTabs';
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
};

export default function ActeursHub({
  token,
  demandesBadge,
  onError,
  colorFor,
  onOpenTrajectory,
  initialTab = 'demandes',
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <section className="stage stage-wide ds-hub">
      <div className="stage-head">
        <p className="eyebrow">Registre</p>
        <h1>Acteurs</h1>
        <p>Demandes de licence, pêcheurs, organisations et abonnements.</p>
      </div>
      <HubTabs
        tabs={[
          { id: 'demandes', label: 'Demandes', badge: demandesBadge },
          { id: 'licences', label: 'Licences' },
          { id: 'organisations', label: 'Organisations' },
          { id: 'abonnements', label: 'Abonnements' },
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
        {tab === 'abonnements' ? <AbonnementsPage token={token} onError={onError} /> : null}
      </div>
    </section>
  );
}
