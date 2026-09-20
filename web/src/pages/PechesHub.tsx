import { useState } from 'react';

import HubTabs from '../components/HubTabs';
import { IconFish, IconReport } from '../components/Icons';
import CapturesPage from './CapturesPage';
import QuotasPage from './QuotasPage';

type Tab = 'captures' | 'quotas';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
  initialTab?: Tab;
};

export default function PechesHub({ token, onError, initialTab = 'captures' }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <section className="stage stage-wide ds-hub">
      <div className="stage-head">
        <p className="eyebrow">Ressources</p>
        <h1>Pêches & Ressources</h1>
        <p>Déclarations de captures et suivi des quotas.</p>
      </div>
      <HubTabs
        tabs={[
          { id: 'captures', label: 'Captures', icon: IconFish },
          { id: 'quotas', label: 'Quotas', icon: IconReport },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="ds-hub-panel">
        {tab === 'captures' ? <CapturesPage token={token} onError={onError} /> : null}
        {tab === 'quotas' ? <QuotasPage token={token} onError={onError} /> : null}
      </div>
    </section>
  );
}
