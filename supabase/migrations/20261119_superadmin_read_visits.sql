create policy visits_select_superadmin on public.visits for select to authenticated using (public.is_superadmin());
