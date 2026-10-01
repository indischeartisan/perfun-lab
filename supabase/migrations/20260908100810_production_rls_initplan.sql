alter policy production_staff_read on public.production_jobs using ((select exists(select 1 from public.profiles where id=(select auth.uid()) and role in ('perfumer','admin'))));
