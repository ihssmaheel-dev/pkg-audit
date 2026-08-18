export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div class="fixed bottom-5 right-5 z-[300] px-4 py-2.5 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-semibold shadow-xl toast-in">
      {message}
    </div>
  )
}
