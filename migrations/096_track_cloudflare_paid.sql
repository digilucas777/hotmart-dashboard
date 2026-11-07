-- O dono marca se a conta Cloudflare do rastreamento está no Workers Paid (US$ 5/mês).
-- Quando o token tem permissão de faturamento, o sistema reconhece sozinho.
alter table public.track_installations add column if not exists cloudflare_paid boolean not null default false;
notify pgrst, 'reload schema';
