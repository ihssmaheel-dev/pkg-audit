export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div class="fixed bottom-6 right-6 z-[300] flex items-center gap-2 px-4 py-3 bg-[#101010] border border-[#00d992] text-[#f2f2f2] rounded-[6px] text-xs font-mono font-medium shadow-2xl toast-in">
      <span class="w-1.5 h-1.5 rounded-full bg-[#00d992]" />
      <span>{message}</span>
    </div>
  )
}
