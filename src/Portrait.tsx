export function Portrait({ id, accent }: { id: string; accent: string }) {
  return (
    <svg className="portrait" viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="32" fill={accent} opacity="0.18" />
      <circle cx="32" cy="32" r="22" fill="#2a241e" />
      <g
        fill="none"
        stroke={accent}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {mark(id)}
      </g>
    </svg>
  )
}

function mark(id: string) {
  if (id === 'jiangcheng') {
    return (
      <>
        <rect x="22" y="20" width="20" height="16" rx="2" />
        <path d="M22 36h20M26 40v4M38 40v4M28 44h8" />
      </>
    )
  }
  if (id === 'ali') {
    return (
      <>
        <rect x="27" y="18" width="10" height="18" rx="5" />
        <path d="M24 28v2a8 8 0 0 0 16 0v-2M32 38v6M27 46h10" />
      </>
    )
  }
  if (id === 'zhouye') {
    return (
      <>
        <path d="M18 40h28" />
        <path d="M20 40l6-10 5 6 4-5 9 9" />
        <circle cx="42" cy="24" r="2" fill="currentColor" stroke="none" />
      </>
    )
  }
  if (id === 'laoshen') {
    return (
      <>
        <circle cx="32" cy="32" r="10" />
        <path d="M32 26v6l4 3" />
      </>
    )
  }
  return (
    <>
      <path d="M32 18v4" />
      <path d="M26 24h12l2 14H24l2-14z" />
      <path d="M24 42h16" />
    </>
  )
}
