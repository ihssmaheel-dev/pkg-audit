export type ToastVariant = "success" | "error" | "info"

export interface ToastProps {
  message: string | null
  variant?: ToastVariant
}

export function Toast({ message, variant = "success" }: ToastProps) {
  if (!message) return null

  const isError =
    variant === "error" ||
    message.toLowerCase().includes("failed") ||
    message.toLowerCase().includes("error") ||
    message.toLowerCase().includes("refusing")
  const isInfo = variant === "info"

  const borderColor = isError ? "border-[#f43f5e]" : isInfo ? "border-[#38bdf8]" : "border-[#00d992]"
  const dotColor = isError ? "bg-[#f43f5e]" : isInfo ? "bg-[#38bdf8]" : "bg-[#00d992]"

  return (
    <div
      class={`fixed bottom-6 right-6 z-[300] flex items-center gap-2.5 px-4 py-3 bg-[#101010] border ${borderColor} text-[#f2f2f2] rounded-[6px] text-xs font-mono font-medium shadow-2xl toast-in`}
    >
      <span class={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`} />
      <span>{message}</span>
    </div>
  )
}
