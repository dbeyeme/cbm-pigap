import { useMemo, useState } from 'react';

import type { EmbarcationPresence, PortPresenceResponse } from '../api';
import { IconPirogue, IconRefresh } from './Icons';

type Props = {
  data: PortPresenceResponse | null;
  loading?: boolean;
  onRefresh: () => void;
  onSelectEmbarcation?: (embarcationId: string) => void;
};

const STATUT_LABELS: Record<string, string> = {
  a_quai: 'À quai',
  en_manoeuvre: 'En manœuvre',
  en_mer: 'En mer',
  sans_signal: 'Sans signal',
};

const COHERENCE_LABELS: Record<string, string> = {
  coherente: 'Débarquement confirmé par le GPS',
  incoherente: 'Débarquement déclaré sans présence GPS au port',
  non_verifiable: 'Débarquement déclaré, GPS indisponible',
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h} h ${String(m).padStart(2, '0')}`;
}

function shortPort(nom: string): string {
  return nom.replace(/^(Port d[e’']|Port de |Terminal de |Port môle de )/u, '');
}

/**
 * Présence au port de la flotte PIGAP, calculée côté serveur depuis le GPS mobile.
 * Aucun matériel : même référentiel de ports que la couche AIS.
 */
export default function PortPresencePanel({ data, loading, onRefresh, onSelectEmbarcation }: Props) {
  const [portFilter, setPortFilter] = useState<string | null>(null);
  const [showSea, setShowSea] = useState(false);

  const ports = data?.ports ?? [];
  const aQuai = useMemo(
    () => ports.reduce((n, p) => n + p.a_quai + p.en_manoeuvre, 0),
    [ports],
  );
  const enMer = data?.en_mer ?? [];
  const incoherences = data?.incoherences ?? [];

  const visible: EmbarcationPresence[] = useMemo(() => {
    if (portFilter) return ports.find((p) => p.id === portFilter)?.embarcations ?? [];
    return ports.flatMap((p) => p.embarcations);
  }, [ports, portFilter]);

  const movements = useMemo(
    () => ports.reduce((acc, p) => ({ arr: acc.arr + p.arrivees, dep: acc.dep + p.departs }), { arr: 0, dep: 0 }),
    [ports],
  );

  return (
    <section className="ais-panel presence-panel" aria-label="Présence au port de la flotte PIGAP">
      <header className="ais-panel-head">
        <span className="ais-panel-icon presence-panel-icon" aria-hidden>
          <IconPirogue size={16} />
        </span>
        <div className="ais-panel-title">
          <strong>Flotte PIGAP · présence au port</strong>
          <span>
            {data
              ? `${aQuai} au port · ${enMer.length} en mer · ${data.sans_signal} sans signal · ${data.fenetre_heures} h`
              : 'Calcul depuis les positions GPS des embarcations'}
          </span>
        </div>
        <button
          type="button"
          className={`ais-refresh ds-icon-btn${loading ? ' is-loading' : ''}`}
          onClick={onRefresh}
          aria-label="Actualiser la présence au port"
          title="Actualiser"
        >
          <IconRefresh size={15} />
        </button>
      </header>

      {data ? (
        <ul className="ais-flow presence-moves">
          <li className="ais-flow-item ais-flow-ok">
            <i aria-hidden />
            <span>
              <strong>
                {movements.arr} arrivée{movements.arr > 1 ? 's' : ''} · {movements.dep} départ
                {movements.dep > 1 ? 's' : ''}
              </strong>
              <small>
                mouvements détectés sur {data.fenetre_heures} h · à quai après {data.seuil_minutes} min
                d’immobilité
              </small>
            </span>
          </li>
          {incoherences.length > 0 ? (
            <li className="ais-flow-item ais-flow-warn">
              <i aria-hidden />
              <span>
                <strong>
                  {incoherences.length} déclaration{incoherences.length > 1 ? 's' : ''} à vérifier
                </strong>
                <small>débarquement déclaré sans présence GPS au port indiqué</small>
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}

      {ports.length > 0 ? (
        <div className="ais-ports" role="group" aria-label="Présence par port">
          <button
            type="button"
            className={`ais-port-chip${portFilter === null ? ' is-on' : ''}`}
            onClick={() => setPortFilter(null)}
          >
            <span>Tous les ports</span>
            <b>{aQuai}</b>
          </button>
          {ports.map((p) => {
            const n = p.a_quai + p.en_manoeuvre;
            return (
              <button
                key={p.id}
                type="button"
                className={`ais-port-chip${portFilter === p.id ? ' is-on' : ''}${n === 0 ? ' is-empty' : ''}`}
                onClick={() => setPortFilter(portFilter === p.id ? null : p.id)}
                title={`${p.nom} · ${p.a_quai} à quai · ${p.en_manoeuvre} en manœuvre · ${p.arrivees} arrivées · ${p.departs} départs · ${p.debarquements_declares} débarquements déclarés`}
              >
                <span>{shortPort(p.nom)}</span>
                <b>{n}</b>
              </button>
            );
          })}
        </div>
      ) : null}

      {!data ? (
        <p className="ais-empty">Chargement de la présence au port…</p>
      ) : visible.length === 0 ? (
        <p className="ais-empty">
          {portFilter
            ? 'Aucune embarcation PIGAP à quai dans ce port actuellement.'
            : data.total_suivies === 0
              ? 'Aucune embarcation suivie pour votre périmètre.'
              : 'Aucune embarcation PIGAP à quai actuellement. Les embarcations apparaissent dès qu’une position GPS est relevée dans le rayon d’un port.'}
        </p>
      ) : (
        <ul className="ais-list">
          {visible.map((e) => (
            <li
              key={e.embarcation_id}
              className={`ais-row presence-row presence-row--${e.statut}${onSelectEmbarcation ? ' is-clickable' : ''}`}
              onClick={onSelectEmbarcation ? () => onSelectEmbarcation(e.embarcation_id) : undefined}
            >
              <span className="ais-row-dot" aria-hidden />
              <span className="ais-row-body">
                <span className="ais-row-title">
                  {e.nom}
                  <em> · {e.immatriculation}</em>
                </span>
                <span className="ais-row-meta">
                  {STATUT_LABELS[e.statut] ?? e.statut}
                  {e.port_nom ? ` · ${shortPort(e.port_nom)}` : ''}
                  {e.depuis ? ` · depuis ${formatTime(e.depuis)} (${formatDuration(e.depuis)})` : ''}
                </span>
                {e.declaration ? (
                  <span className={`presence-decl presence-decl--${e.declaration.coherence}`}>
                    {COHERENCE_LABELS[e.declaration.coherence] ?? e.declaration.coherence}
                    {` · ${e.declaration.quantite_kg.toLocaleString('fr-FR')} kg`}
                  </span>
                ) : null}
              </span>
              <span className="ais-row-mmsi">{formatTime(e.derniere_position)}</span>
            </li>
          ))}
        </ul>
      )}

      {enMer.length > 0 ? (
        <>
          <button type="button" className="linkish ais-more" onClick={() => setShowSea((v) => !v)}>
            {showSea ? 'Masquer les embarcations en mer' : `Voir les ${enMer.length} embarcation${enMer.length > 1 ? 's' : ''} en mer`}
          </button>
          {showSea ? (
            <ul className="ais-list">
              {enMer.map((e) => (
                <li
                  key={e.embarcation_id}
                  className={`ais-row presence-row presence-row--en_mer${onSelectEmbarcation ? ' is-clickable' : ''}`}
                  onClick={onSelectEmbarcation ? () => onSelectEmbarcation(e.embarcation_id) : undefined}
                >
                  <span className="ais-row-dot" aria-hidden />
                  <span className="ais-row-body">
                    <span className="ais-row-title">
                      {e.nom}
                      <em> · {e.immatriculation}</em>
                    </span>
                    <span className="ais-row-meta">
                      En mer
                      {e.dernier_port_nom
                        ? ` · parti de ${shortPort(e.dernier_port_nom)}${e.dernier_depart ? ` à ${formatTime(e.dernier_depart)}` : ''}`
                        : ' · port de départ inconnu sur la fenêtre'}
                    </span>
                  </span>
                  <span className="ais-row-mmsi">{formatTime(e.derniere_position)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
