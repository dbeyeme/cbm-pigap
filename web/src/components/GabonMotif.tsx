/** Motif silhouette Gabon (Natural Earth 110m) — sidebar / fonds. */

type Props = {
  className?: string;
  /** Affiche un motif répété (pattern) plutôt qu’une seule silhouette. */
  patterned?: boolean;
};

const GABON_PATH =
  'M 53.57,7.54 L 62.69,6.00 L 74.35,9.14 L 85.71,6.12 L 88.10,7.40 L 86.70,17.64 L 92.07,29.77 L 106.35,27.85 L 111.14,32.52 L 102.83,59.70 L 111.91,73.58 L 114.00,91.91 L 111.58,107.51 L 105.69,118.60 L 88.75,117.62 L 78.49,106.35 L 76.96,116.75 L 64.02,119.62 L 57.43,125.52 L 64.67,141.04 L 50.06,154.00 L 30.34,130.31 L 17.65,110.94 L 6.00,86.70 L 6.62,78.90 L 10.81,71.39 L 15.47,54.31 L 19.34,36.90 L 25.81,35.55 L 53.73,35.79 L 53.57,7.54 Z';

export default function GabonMotif({ className, patterned = false }: Props) {
  if (patterned) {
    return (
      <div className={`gabon-motif-pattern ${className ?? ''}`} aria-hidden>
        <svg className="gabon-motif-defs" width="0" height="0" aria-hidden>
          <defs>
            <pattern
              id="gabon-tile"
              x="0"
              y="0"
              width="72"
              height="96"
              patternUnits="userSpaceOnUse"
            >
              <path d={GABON_PATH} transform="scale(0.52)" fill="currentColor" />
            </pattern>
          </defs>
        </svg>
        <svg className="gabon-motif-fill" viewBox="0 0 144 192" preserveAspectRatio="xMidYMid slice">
          <rect width="144" height="192" fill="url(#gabon-tile)" />
        </svg>
      </div>
    );
  }

  return (
    <div className={`gabon-motif ${className ?? ''}`} aria-hidden>
      <svg viewBox="0 0 120 160" width="100" height="132">
        <path d={GABON_PATH} fill="currentColor" />
        {/* vague légère côte ouest */}
        <path
          d="M 8 90 Q 4 100 8 110 Q 12 100 8 90"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}
