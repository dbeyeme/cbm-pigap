import { useState } from 'react';

import HubTabs from '../components/HubTabs';
import PageBanner from '../components/PageBanner';
import { IconFish, IconGauge, IconReceipt } from '../components/Icons';
import CapturesPage from './CapturesPage';
import CommandesPage from './CommandesPage';
import QuotasPage from './QuotasPage';
import RedevancesPage from './RedevancesPage';

type Tab = 'captures' | 'quotas' | 'redevances' | 'commandes';

type Props = {
  token: string;
  role: string | null;
  onError: (msg: string | null) => void;
  initialTab?: Tab;
};

export default function PechesHub({ token, role, onError, initialTab = 'captures' }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <section className="stage stage-wide ds-hub">
      <PageBanner
        photo="quai"
        eyebrow="Ressources"
        title="Pêches et ressources"
        aide={{
          titre: 'Des captures aux quotas',
          texte:
            'Les captures déclarées alimentent le suivi des quotas : une alerte est émise à 90 % d’un quota. La taxe à la production et les quittances se trouvent dans l’onglet Redevances. Les commandes sont des réservations sans paiement en ligne.',
        }}
      >
        <p>Déclarations de captures, suivi des quotas, taxe à la production, quittances et commandes.</p>
      </PageBanner>
      <HubTabs
        tabs={[
          { id: 'captures', label: 'Captures', icon: IconFish },
          { id: 'quotas', label: 'Quotas', icon: IconGauge },
          { id: 'redevances', label: 'Redevances', icon: IconReceipt },
          { id: 'commandes', label: 'Commandes', icon: IconFish },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="ds-hub-panel">
        {tab === 'captures' ? <CapturesPage token={token} onError={onError} /> : null}
        {tab === 'quotas' ? <QuotasPage token={token} onError={onError} /> : null}
        {tab === 'redevances' ? <RedevancesPage token={token} onError={onError} /> : null}
        {tab === 'commandes' ? (
          <CommandesPage token={token} role={role} onError={onError} />
        ) : null}
      </div>
    </section>
  );
}
