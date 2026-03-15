import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <aside className="auth-aside">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Accesso</p>
          <h1 className="mt-6 text-5xl leading-tight text-white">Rientra nel tuo spazio operativo fiscale.</h1>
          <p className="mt-6 max-w-md text-base leading-8 text-slate-300">
            Storico report, upload dei file broker e monitoraggio dello stato di elaborazione in un unica area riservata.
          </p>
        </aside>
        <div className="auth-content">
          <SignIn />
        </div>
      </div>
    </div>
  )
}
