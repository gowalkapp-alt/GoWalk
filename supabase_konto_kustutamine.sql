-- Käivita Supabase → SQL Editor → New query → Run (üks kord)

create or replace function public.delete_my_account()
returns void language plpgsql security definer
set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Pole sisse logitud'; end if;
  delete from public.user_states where user_id::text = auth.uid()::text;
  delete from auth.users where id = auth.uid();
end; $$;

create or replace function public.reset_my_data()
returns void language plpgsql security definer
set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Pole sisse logitud'; end if;
  delete from public.user_states where user_id::text = auth.uid()::text;
end; $$;

revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.reset_my_data() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.reset_my_data() to authenticated;
