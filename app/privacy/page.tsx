export const metadata = {
  title: 'Política de Privacidade - Dash Speed',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--dash-bg)] text-[var(--dash-text)]">
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-black tracking-tight">Política de Privacidade</h1>
        <p className="mt-1 text-sm text-[var(--dash-faint)]">Dash Speed · Última atualização: maio de 2025</p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-[var(--dash-muted)]">
          <section>
            <h2 className="mb-3 text-base font-black text-[var(--dash-text)]">1. Dados coletados</h2>
            <p>
              O Dash Speed coleta dados de desempenho de anúncios diretamente da plataforma Meta Ads (Facebook / Instagram)
              por meio de autorização OAuth concedida pelo próprio usuário. Isso inclui métricas como gasto, impressões,
              alcance, cliques, CTR, CPM e conversões das contas de anúncio vinculadas ao dashboard.
            </p>
            <p className="mt-3">
              Também armazenamos informações de conta necessárias para o funcionamento da plataforma, como e-mail,
              nome e dados de acesso à sessão (via Supabase Auth).
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-black text-[var(--dash-text)]">2. Uso dos dados</h2>
            <p>
              Os dados coletados são usados exclusivamente para exibir métricas e relatórios dentro do dashboard do
              próprio usuário. Nenhum dado é processado para fins de publicidade, perfilamento ou treinamento de modelos.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-black text-[var(--dash-text)]">3. Compartilhamento com terceiros</h2>
            <p>
              Não compartilhamos, vendemos ou transferimos dados dos usuários a terceiros. Os dados trafegam
              exclusivamente entre a plataforma Meta Ads, nosso servidor e o dashboard do próprio usuário.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-black text-[var(--dash-text)]">4. Armazenamento e segurança</h2>
            <p>
              Os dados são armazenados em banco de dados gerenciado pelo Supabase, com controle de acesso por
              Row Level Security (RLS), garantindo que cada usuário acesse somente seus próprios dados.
              Os tokens de acesso à Meta API são criptografados em repouso.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-black text-[var(--dash-text)]">5. Exclusão de dados</h2>
            <p>
              O usuário pode solicitar a exclusão de todos os seus dados a qualquer momento entrando em contato
              pelo e-mail abaixo. A desconexão da conta Meta também revoga o acesso da plataforma aos dados de anúncios.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-black text-[var(--dash-text)]">6. Contato</h2>
            <p>
              Para dúvidas, solicitações ou reclamações relacionadas à privacidade, entre em contato:
            </p>
            <a
              href="mailto:guilhermeventuranogueira29@gmail.com"
              className="mt-2 inline-block font-semibold text-[var(--dash-neon)] hover:underline"
            >
              guilhermeventuranogueira29@gmail.com
            </a>
          </section>
        </div>
      </main>
    </div>
  )
}
