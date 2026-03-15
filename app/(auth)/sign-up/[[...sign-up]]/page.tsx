import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <aside className="auth-aside">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Registrazione</p>
          <h1 className="mt-6 text-5xl leading-tight text-white">Attiva il tuo flusso fiscale per conti trading.</h1>
          <p className="mt-6 max-w-md text-base leading-8 text-slate-300">
            Dopo la registrazione puoi scegliere il piano, caricare i report HTML e scaricare i PDF fiscali dal tuo archivio.
          </p>
        </aside>
        <div className="auth-content">
          <SignUp />
        </div>
      </div>
    </div>
  )
}
