import Link from 'next/link'

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07080d] px-4 py-16 text-white">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.055] p-8 text-center shadow-2xl shadow-black/40 backdrop-blur-2xl">
        <h1 className="text-2xl font-black">Cadastro por convite</h1>
        <p className="mt-3 text-sm text-slate-400">
          O acesso ao Dash Speed é liberado apenas por convite de um administrador. Se você esperava um convite, confira seu e-mail ou fale com quem administra sua conta.
        </p>
        <Link href="/login" className="mt-6 inline-block font-semibold text-cyan-200 hover:text-white">
          Voltar ao login
        </Link>
      </div>
    </div>
  )
}
