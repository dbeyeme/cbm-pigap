import type { GfwAttribution } from '../api';

/** Mention exigée par l'éditeur sur tout écran qui montre ces données. */
export default function GfwMention({ attribution }: { attribution: GfwAttribution }) {
  return (
    <p className="gfw-mention">
      <a href={attribution.lien} target="_blank" rel="noreferrer">
        {attribution.mention}
      </a>
    </p>
  );
}
