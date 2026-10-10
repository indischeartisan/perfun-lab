-- Public checkout wrappers are SECURITY INVOKER; callers need execute on the private implementation.
grant usage on schema private to authenticated;
grant execute on function private.checkout(uuid,jsonb,uuid,uuid,text,boolean) to authenticated;
