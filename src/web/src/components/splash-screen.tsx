import { useEffect, useState } from "preact/hooks"

interface SplashScreenProps {
  visible: boolean
  message?: string
  dir?: string
}

export function SplashScreen({ visible, message = "Scanning dependencies…", dir }: SplashScreenProps) {
  const [rendered, setRendered] = useState(visible)

  useEffect(() => {
    if (visible) {
      setRendered(true)
    } else {
      const timer = setTimeout(() => setRendered(false), 350)
      return () => clearTimeout(timer)
    }
  }, [visible])

  if (!rendered) return null

  return (
    <div
      class={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0d0d0d] transition-opacity duration-300 ease-out ${
        visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Ambient background glow spotlight */}
      <div class="absolute w-[360px] h-[360px] rounded-full bg-[#00d992]/5 blur-[90px] pointer-events-none -translate-y-6" />

      {/* Center Logo & Breathing Effect */}
      <div class="relative flex items-center justify-center mb-7">
        {/* Soft expanding pulse ring */}
        <div class="absolute w-24 h-24 rounded-full border border-[#00d992]/20 pulse-ring-ambient pointer-events-none" />

        {/* Outer Hex Container Badge */}
        <div class="relative flex items-center justify-center w-20 h-20 rounded-[18px] bg-[#141414] border border-[#2a2827] shadow-[0_8px_32px_rgba(0,0,0,0.6)] logo-glow-breathe">
          <svg
            width={48}
            height={48}
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            class="overflow-visible"
          >
            {/* Outer Hexagonal Isometric Prism */}
            <path
              d="M16 3L28 9.5V22.5L16 29L4 22.5V9.5L16 3Z"
              stroke="#00d992"
              strokeWidth="1.85"
              strokeLinejoin="round"
              strokeOpacity="0.95"
            />
            {/* Inner Isometric Axes */}
            <path
              d="M16 16L28 9.5M16 16V29M16 16L4 9.5"
              stroke="#00d992"
              strokeWidth="1.3"
              strokeLinejoin="round"
              strokeOpacity="0.45"
            />
            {/* Inner Concentric Frame */}
            <path
              d="M16 10L22 13.5V19.5L16 23L10 19.5V13.5L16 10Z"
              stroke="#00d992"
              strokeWidth="1.1"
              strokeLinejoin="round"
              strokeOpacity="0.3"
            />
            {/* Solid Vibrant Emerald Lightning Bolt (Seamless & Crisp) */}
            <path d="M18.5 4.5L11 15.5H16.5L13.5 27.5L22.5 14H16.5L18.5 4.5Z" fill="#00d992" />
          </svg>
        </div>
      </div>

      {/* Typography */}
      <div class="flex flex-col items-center text-center px-4">
        <h1 class="font-mono font-bold text-lg tracking-tight text-[#ffffff] mb-1.5 flex items-center gap-2">
          <span>pkg-audit</span>
          <span class="w-1.5 h-1.5 rounded-full bg-[#00d992] inline-block animate-pulse" />
        </h1>

        <p class="font-mono text-xs text-[#8b949e] tracking-wide mb-5">{message}</p>

        {dir && (
          <div class="max-w-[380px] truncate px-3 py-1 bg-[#141414] border border-[#242221] rounded-[6px] font-mono text-[11px] text-[#00d992] mb-5">
            {dir}
          </div>
        )}

        {/* Minimal Shimmering Progress Track */}
        <div class="w-48 h-1 bg-[#1a1a1a] rounded-full overflow-hidden relative">
          <div class="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-[#00d992] to-transparent progress-shimmer" />
        </div>
      </div>
    </div>
  )
}
