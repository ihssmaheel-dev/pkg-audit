import { IconCheckCircle } from "./icons"

interface ToastProps {
  message: string | null
}

export function Toast({ message }: ToastProps) {
  return (
    <div class={`toast ${message ? "show" : ""}`} role="status" aria-live="polite">
      <IconCheckCircle size={14} />
      <span>{message ?? ""}</span>
    </div>
  )
}
