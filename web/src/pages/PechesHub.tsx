import { useState } from 'react';

import HubTabs from '../components/HubTabs';
import PageBanner from '../components/PageBanner';
import { IconFish, IconReceipt, IconReport } from '../components/Icons';
import CapturesPage from './CapturesPage';
import QuotasPage from './QuotasPage';
import RedevancesPage from './RedevancesPage';

type Tab = 'captures' | 'quotas' | 'redevances';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
  initialTab?: Tab;
};

export default function PechesHub({ token, onError, initialTab = 'captures' }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <section className="stage stage-wide ds-hub">
      <PageBanner photo="quai" eyebrow="Ressources" title="Pêches et ressources">
        <p>Déclarations de captures, suivi des quotas, taxe à la production et quittances.</p>
      </PageBanner>
      <HubTabs
        tabs={[
          { id: 'captures', label: 'Captures', icon: IconFish },
          { id: 'quotas', label: 'Quotas', icon: IconReport },
          { id: 'redevances', label: 'Redevances', icon: IconReceipt },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="ds-hub-panel">
        {tab === 'captures' ? <CapturesPage token={token} onError={onError} /> : null}
        {tab === 'quotas' ? <QuotasPage token={token} onError={onError} /> : null}
        {tab === 'redevances' ? <RedevancesPage token={token} onError={onError} /> : null}
      </div>
    </section>
  );
}
