import { createSupabaseServerClient } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import type { NewsItem } from '@/types'

export default async function NewsPage() {
  const supabase = await createSupabaseServerClient()

  const { data: news } = await supabase
    .from('news')
    .select('*')
    .eq('visible', true)
    .order('published_at', { ascending: false })

  const items = (news ?? []) as NewsItem[]

  return (
    <div className="page-panel">
      <div className="page-header">
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Aggiornamenti</span>
        <h1 className="page-title">News fiscali e operative</h1>
        <p className="page-subtitle">
          Comunicazioni interne, note normative e aggiornamenti sulla piattaforma pubblicati dall amministrazione.
        </p>
      </div>

      <div className="mt-8 grid gap-5">
        {items.length ? (
          items.map(item => (
            <article key={item.id} className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{formatDate(item.published_at)}</p>
              <h2 className="mt-3 text-2xl">{item.title}</h2>
              <div
                className="mt-4 text-sm leading-7 text-slate-700 [&_a]:font-medium [&_a]:text-slate-900 [&_p+p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6"
                dangerouslySetInnerHTML={{ __html: item.content }}
              />
            </article>
          ))
        ) : (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600">
            Nessuna news disponibile al momento.
          </div>
        )}
      </div>
    </div>
  )
}
