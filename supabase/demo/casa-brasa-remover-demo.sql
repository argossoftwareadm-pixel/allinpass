-- Remove TODOS os dados fictícios da demonstração do Casa Brasa (project 0d61ea5c-777e-4dc5-9075-a096ac8f0aa4).
-- Dados reais (cartão da Bruna e recompensa "Entrada gratuita") são mantidos.
begin;
with demo as (
  select id from public.user_passes
  where project_id = '0d61ea5c-777e-4dc5-9075-a096ac8f0aa4' and metadata->>'demo' = 'true'
)
, del_jobs as (delete from public.notification_jobs where idempotency_key like 'demo:%' returning notification_id)
delete from public.notifications where id in (select notification_id from del_jobs);
delete from public.automations where project_id = '0d61ea5c-777e-4dc5-9075-a096ac8f0aa4'
  and message in ('Sentimos sua falta há 15 dias! Volte e ganhe um ponto extra na sua próxima visita.',
                  'Seu cartão Casa Brasa vence em 7 dias. Passe aqui e renove seus pontos!');
delete from public.customer_lists where project_id = '0d61ea5c-777e-4dc5-9075-a096ac8f0aa4'
  and name in ('Almoço executivo', 'Happy hour', 'Família no fim de semana');
delete from public.remote_scoring_log where actor_email = 'equipe@casabrasa.demo';
delete from public.reward_redemptions where user_pass_id in (select id from public.user_passes where project_id = '0d61ea5c-777e-4dc5-9075-a096ac8f0aa4' and metadata->>'demo' = 'true');
delete from public.visits where user_pass_id in (select id from public.user_passes where project_id = '0d61ea5c-777e-4dc5-9075-a096ac8f0aa4' and metadata->>'demo' = 'true');
delete from public.customers where project_id = '0d61ea5c-777e-4dc5-9075-a096ac8f0aa4' and google_sub like 'demo-casabrasa-%';
delete from public.user_passes where project_id = '0d61ea5c-777e-4dc5-9075-a096ac8f0aa4' and metadata->>'demo' = 'true';
delete from public.rewards where project_id = '0d61ea5c-777e-4dc5-9075-a096ac8f0aa4' and name = 'Caipirinha cortesia';
commit;
