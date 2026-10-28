/** Ilustración de obra: barrera a rayas, grúa con gancho, conos y la señal de "hombre trabajando". */
export function IlustracionObra() {
  return (
    <svg viewBox="0 0 520 300" className="h-auto w-full max-w-[520px]" role="img" aria-label="Ilustración de obra en construcción">
      <defs>
        <pattern id="obra-rayas" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="14" height="28" fill="#0e2238" />
          <rect x="14" width="14" height="28" fill="#FACC15" />
        </pattern>
        <linearGradient id="obra-suelo" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#E2E8F0" />
          <stop offset="1" stopColor="#F8FAFC" />
        </linearGradient>
      </defs>

      {/* Suelo */}
      <ellipse cx="260" cy="268" rx="240" ry="20" fill="url(#obra-suelo)" />

      {/* Grúa */}
      <g stroke="#94A3B8" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M70 262 V60" />
        <path d="M84 262 V60" />
        {[80, 110, 140, 170, 200, 230].map((y) => <path key={y} d={`M70 ${y} L84 ${y + 26}`} />)}
        <path d="M58 60 H300" />
        <path d="M58 48 H300" strokeWidth="2" />
        {[90, 130, 170, 210, 250, 290].map((x) => <path key={x} d={`M${x - 20} 60 L${x} 48`} strokeWidth="2" />)}
        <path d="M77 60 L77 30 L58 60" strokeWidth="2" />
      </g>
      <rect x="40" y="54" width="22" height="16" rx="2" fill="#64748B" />
      {/* Gancho que se balancea */}
      <g className="obra-gancho" style={{ transformOrigin: '260px 60px' }}>
        <path d="M260 60 V138" stroke="#64748B" strokeWidth="2" />
        <path d="M253 138 h14 v8 a7 7 0 1 1 -7 7" stroke="#475569" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M260 156 L240 162 M260 156 L280 162" stroke="#64748B" strokeWidth="2" />
        <rect x="236" y="160" width="48" height="26" rx="3" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="2" />
        <path d="M236 173 H284" stroke="#94A3B8" strokeWidth="2" />
      </g>

      {/* Barrera a rayas */}
      <g>
        <rect x="150" y="214" width="250" height="22" rx="3" fill="url(#obra-rayas)" />
        <rect x="150" y="214" width="250" height="22" rx="3" fill="none" stroke="#0e2238" strokeWidth="2" />
        <rect x="166" y="236" width="8" height="30" fill="#475569" />
        <rect x="376" y="236" width="8" height="30" fill="#475569" />
        <rect x="158" y="262" width="24" height="6" rx="2" fill="#334155" />
        <rect x="368" y="262" width="24" height="6" rx="2" fill="#334155" />
      </g>

      {/* Conos */}
      {[108, 482].map((x) => (
        <g key={x}>
          <path d={`M${x - 15} 264 L${x - 5} 222 H${x + 5} L${x + 15} 264 Z`} fill="#F97316" />
          <path d={`M${x - 11} 248 H${x + 11} L${x + 9} 240 H${x - 9} Z`} fill="#FFFFFF" />
          <rect x={x - 20} y="262" width="40" height="6" rx="2" fill="#C2410C" />
        </g>
      ))}

      {/* Señal de "hombre trabajando" */}
      <g className="obra-senal" style={{ transformOrigin: '430px 150px' }}>
        <rect x="427" y="150" width="6" height="114" fill="#475569" />
        <rect x="417" y="262" width="26" height="6" rx="2" fill="#334155" />
        <g transform="translate(430 112) rotate(45)">
          <rect x="-46" y="-46" width="92" height="92" rx="8" fill="#FACC15" stroke="#0e2238" strokeWidth="5" />
        </g>
        {/* Trabajador con pala */}
        <g fill="#0e2238">
          <path d="M417 92 a9 9 0 0 1 18 0 h3 v3 h-24 v-3 z" />
          <circle cx="426" cy="100" r="6" />
          <path d="M419 108 h14 l4 22 h-6 l-2 -10 l-3 10 h-6 l-3 -10 z" />
          <path d="M431 112 l13 10 l-3 4 l-13 -9 z" />
          <path d="M440 120 l8 14 l-3 2 l-8 -14 z" />
          <path d="M443 133 l10 -2 l2 8 l-9 3 z" />
          <path d="M420 129 l-4 15 h5 l4 -12 z" />
          <path d="M431 129 l4 15 h-5 l-3 -11 z" />
          <ellipse cx="455" cy="141" rx="7" ry="3" />
        </g>
      </g>
    </svg>
  );
}
