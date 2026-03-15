'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function AdminNewsForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)

    const response = await fetch('/api/news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content }),
    })

    const data = (await response.json()) as { error?: string }

    if (!response.ok) {
      setError(data.error ?? 'Impossibile pubblicare la news')
      return
    }

    setTitle('')
    setContent('')
    setMessage('News pubblicata correttamente.')
    startTransition(() => router.refresh())
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 rounded-[28px] border border-slate-200 bg-white p-6">
      <div className="space-y-2">
        <label htmlFor="news-title" className="text-sm font-semibold text-slate-900">
          Titolo
        </label>
        <input id="news-title" value={title} onChange={event => setTitle(event.target.value)} required />
      </div>

      <div className="space-y-2">
        <label htmlFor="news-content" className="text-sm font-semibold text-slate-900">
          Contenuto HTML
        </label>
        <textarea
          id="news-content"
          value={content}
          onChange={event => setContent(event.target.value)}
          rows={10}
          required
        />
      </div>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Pubblicazione...' : 'Pubblica news'}
      </Button>
    </form>
  )
}
