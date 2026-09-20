import { useMemo, useState } from 'react';

import { aisStatutLabel, type AisLiveResponse, type AisVessel } from '../api';
import { IconRadar, IconRefresh } from './Icons';

type Props = {
  live: AisLiveResponse | null;
  vessels: AisVessel[];
  note: string;
  onRefresh: () => void;
  onSelect?: (mmsi: string) => void;
};

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm ? `${hh} h ${String(mm).padStart(2, '0')}` : `${hh} h`;
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h} h ${String(m).padStart(2, '0')}`;
}

function statutTone(statut: string): string {
  switch (statut) {
    case 'a_quai':
      return 'quai';
    case 'au_mouillage':
      return 'mouillage';
    case 'en_peche':
      return 'peche';
    case 'en_route':
    case 'en_route_voile':
      return 'route';
    default:
      return 'inconnu';
  }
}

/**
 * Panneau de surveillance AIS : état du flux, présence par port, liste des navires.
 * Les libellés sont destinés aux agents et autorités (aucun jargon technique).
 */
export default function AisPanel({ live, vessels, note, onRefresh, onSelect }: Props) {
  const [portFilter, setPortFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const stream = live?.stream ?? null;
  const ports = live?.ports ?? [];
  const receivers = live?.recepteurs_locaux ?? 0;
  const approches = live?.approches ?? [];
  const real = useMemo(() => vessels.filter((v) => !v.demo), [vessels]);
  const demo = vessels.length > 0 && real.length === 0;

  const filtered = useMemo(() => {
    const list = portFilter ? vessels.filter((v) => v.port_id === portFilter) : vessels;
    return [...list].sort((a, b) => a.age_s - b.age_s);
  }, [vessels, portFilter]);
  const shown = expanded ? filtered : filtered.slice(0, 6);

  const flowTone = stream?.connected ? 'ok' : stream?.configured ? 'warn' : 'off';
  const flowLabel = stream?.connected
    ? 'Flux AIS connecté'
    : stream?.configured
      ? 'Flux AIS en reconnexion'
      : 'Flux AIS non configuré';
  const flowDetail = stream?.connected
    ? stream.last_message_at
      ? `dernier message il y a ${formatAge(
          Math.max(0, Math.round((Date.now() - new Date(stream.last_message_at).getTime()) / 1000)),
        )}`
      : 'aucun message reçu pour les eaux gabonaises'
    : stream?.last_error
      ? stream.last_error
      : 'clé du fournisseur absente';

  return (
    <section className="ais-panel" aria-label="Surveillance AIS">
      <header className="ais-panel-head">
        <span className="ais-panel-icon" aria-hidden>
          <IconRadar size={16} />
        </span>
        <div className="ais-panel-title">
          <strong>Navires AIS</strong>
          <span>
            {real.length} navire{real.length > 1 ? 's' : ''} suivi{real.length > 1 ? 's' : ''}
            {demo ? ' · données de démonstration' : ''}
          </span>
        </div>
        <button
          type="button"
          className="ais-refresh ds-icon-btn"
          onClick={onRefresh}
          aria-label="Actualiser la surveillance AIS"
          title="Actualiser"
        >
          <IconRefresh size={15} />
        </button>
      </header>

      <ul className="ais-flow">
        <li className={`ais-flow-item ais-flow-${flowTone}`}>
          <i aria-hidden />
          <span>
            <strong>{flowLabel}</strong>
            <small>{flowDetail}</small>
          </span>
        </li>
        <li className={`ais-flow-item ais-flow-${receivers > 0 ? 'ok' : 'off'}`}>
          <i aria-hidden />
          <span>
            <strong>
              {receivers > 0
                ? `${receivers} récepteur${receivers > 1 ? 's' : ''} local${receivers > 1 ? 'aux' : ''} actif${receivers > 1 ? 's' : ''}`
                : 'Aucun récepteur local raccordé'}
            </strong>
            <small>
              {receivers > 0
                ? 'couverture portuaire assurée'
                : 'nécessaire pour Owendo et Port-Gentil'}
            </small>
          </span>
        </li>
      </ul>

      {ports.length > 0 ? (
        <div className="ais-ports" role="group" aria-label="Présence par port">
          <button
            type="button"
            className={`ais-port-chip${portFilter === null ? ' is-on' : ''}`}
            onClick={() => setPortFilter(null)}
          >
            <span>Toutes les eaux</span>
            <b>{real.length}</b>
          </button>
          {ports.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`ais-port-chip${portFilter === p.id ? ' is-on' : ''}${p.navires === 0 ? ' is-empty' : ''}`}
              onClick={() => setPortFilter(portFilter === p.id ? null : p.id)}
              title={`${p.nom} · ${p.a_quai} à quai · ${p.au_mouillage} au mouillage · ${p.en_route} en route`}
            >
              <span>{p.nom.replace(/^(Port d[e’']|Port de |Terminal de |Port môle de )/u, '')}</span>
              <b>{p.navires}</b>
            </button>
          ))}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="ais-empty">
          {portFilter
            ? 'Aucun navire AIS détecté dans ce port pour le moment.'
            : 'Aucun navire AIS reçu pour les eaux gabonaises. Les réseaux communautaires ne couvrent pratiquement pas le littoral gabonais : un récepteur AIS local est nécessaire pour voir les navires au port.'}
        </p>
      ) : (
        <ul className="ais-list">
          {shown.map((v) => (
            <li
              key={v.mmsi}
              className={`ais-row ais-row--${statutTone(v.statut_nav)}${onSelect ? ' is-clickable' : ''}`}
              onClick={onSelect ? () => onSelect(v.mmsi) : undefined}
              title="Ouvrir la fiche navire"
            >
              <span className="ais-row-dot" aria-hidden />
              <span className="ais-row-body">
                <span className="ais-row-title">
                  {v.nom}
                  {v.type_label ? <em> · {v.type_label}</em> : null}
                </span>
                <span className="ais-row-meta">
                  {v.pavillon ? `${v.pavillon} · ` : ''}
                  {aisStatutLabel(v.statut_nav)}
                  {v.port_proche ? ` · ${v.port_proche}` : ''}
                  {v.sog_kn != null && v.sog_kn >= 0.5 ? ` · ${v.sog_kn.toFixed(1)} nd` : ''}
                  {` · il y a ${formatAge(v.age_s)}`}
                </span>
              </span>
              <span className="ais-row-mmsi">MMSI {v.mmsi}</span>
            </li>
          ))}
        </ul>
      )}
      {filtered.length > 6 ? (
        <button type="button" className="linkish ais-more" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Réduire la liste' : `Afficher les ${filtered.length - 6} autres navires`}
        </button>
      ) : null}
      {approches.length > 0 ? (
        <div className="ais-approches">
          <h4>
            Navires en approche <small>route extrapolée depuis le golfe de Guinée</small>
          </h4>
          <ul className="ais-list">
            {approches.slice(0, 8).map((v) => (
              <li
                key={v.mmsi}
                className={`ais-row ais-row--approche${onSelect ? ' is-clickable' : ''}`}
                onClick={onSelect ? () => onSelect(v.mmsi) : undefined}
                title="Ouvrir la fiche navire"
              >
                <span className="ais-row-dot" aria-hidden />
                <span className="ais-row-body">
                  <span className="ais-row-title">
                    {v.nom}
                    {v.type_label ? <em> · {v.type_label}</em> : null}
                  </span>
                  <span className="ais-row-meta">
                    {v.pavillon ? `${v.pavillon} · ` : ''}
                    {v.sog_kn != null ? `${v.sog_kn.toFixed(1)} nd` : ''}
                    {v.cog_deg != null ? ` · route ${Math.round(v.cog_deg)}°` : ''}
                    {v.entree_prevue_h != null
                      ? ` · entrée prévue dans ${formatHours(v.entree_prevue_h)}`
                      : ''}
                  </span>
                </span>
                <span className="ais-row-mmsi">MMSI {v.mmsi}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {note ? <p className="ais-note">{note}</p> : null}
    </section>
  );
}
