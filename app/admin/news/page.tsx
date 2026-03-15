import { AdminNewsForm } from '@/components/admin/news-form'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'

export default async function AdminNewsPage() {
  const supabase = createSupabaseServiceClient()
  const { data: news } = await supabase.from('news').select('*').order('published_at', { ascending: false }).limit(5)

  return (
    <div className="space-y-6">
      <div className="page-panel">
        <div className="page-header">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Comunicazioni</span>
          <h1 className="page-title">Pubblica una news</h1>
          <p className="page-subtitle">Editor rapido per aggiornamenti normativi o operativi visibili agli utenti.</p>
        </div>
        <div className="mt-8">
          <AdminNewsForm />
        </div>
      </div>

      <div className="page-panel">
        <div className="page-header">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Storico</span>
          <h2 className="page-title text-3xl">Ultime news pubblicate</h2>
        </div>
        <div className="mt-8 space-y-4">
          {(news ?? []).map(item => (
            <article key={item.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{formatDate(item.published_at)}</p>
              <h3 className="mt-3 text-xl">{item.title}</h3>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
