-- Compatible with the existing profiles/auth trigger; also bootstraps a clean project.
create schema if not exists private;
do $$ begin
  if not exists (select 1 from pg_type where typname = 'app_role' and typnamespace = 'public'::regnamespace) then
    create type public.app_role as enum ('customer','admin','perfumer','vendor');
  end if;
end $$;
alter type public.app_role add value if not exists 'vendor';

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'customer',
  full_name text not null default '', email text not null default '', whatsapp text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles enable row level security;
-- Column grants prevent self-promotion, including for existing policies.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, whatsapp, avatar_url) on public.profiles to authenticated;
drop policy if exists profiles_select_own_or_admin on public.profiles;
drop policy if exists profiles_update_own_or_admin on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Only an auth.users trigger may create profiles; metadata never controls role.
  insert into public.profiles (id, role, full_name, email, avatar_url)
  values (new.id, 'customer', coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), coalesce(new.email,''), new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();
insert into public.profiles (id, full_name, email, avatar_url)
select id, coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name',''), coalesce(email,''),raw_user_meta_data->>'avatar_url' from auth.users on conflict (id) do nothing;

create or replace function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function private.touch_updated_at();

create table public.notes (
  id text primary key, name text not null, category text not null,
  short_description text not null, sticker_color text not null, icon text,
  sticker_asset text check (sticker_asset is null or (sticker_asset like '/%' and sticker_asset not like '//%')),
  profile jsonb not null check (jsonb_typeof(profile) = 'object'), active boolean not null default true
);
create table public.note_phases (
  note_id text not null references public.notes(id), phase text not null check (phase in ('top','middle','base')),
  prediction_text text not null, sort_order integer not null default 0, primary key (note_id,phase)
);
create table public.products (
  id text primary key, label text not null, description text not null, badge text,
  volume_ml integer not null check (volume_ml > 0), bottle_count integer not null default 1 check (bottle_count > 0),
  sort_order integer not null default 0, active boolean not null default true
);
create table public.product_prices (
  product_id text not null references public.products(id), kind text not null check (kind in ('normal','launch')),
  amount integer not null check (amount > 0), currency text not null default 'IDR' check (currency = 'IDR'),
  primary key (product_id,kind)
);
create table public.creations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index creations_user_created_idx on public.creations (user_id,created_at desc);
create trigger creations_touch_updated_at before update on public.creations for each row execute function private.touch_updated_at();
create table public.creation_notes (
  creation_id uuid not null references public.creations(id) on delete cascade,
  phase text not null, note_id text not null,
  primary key (creation_id,phase), foreign key (note_id,phase) references public.note_phases(note_id,phase)
);
create index creation_notes_note_phase_idx on public.creation_notes (note_id,phase);
-- Race-safe enforcement even with concurrent/direct API writes.
create unique index creation_one_soapy_idx on public.creation_notes (creation_id) where note_id = 'soapy';

alter table public.notes enable row level security;
alter table public.note_phases enable row level security;
alter table public.products enable row level security;
alter table public.product_prices enable row level security;
alter table public.creations enable row level security;
alter table public.creation_notes enable row level security;
revoke all on public.notes, public.note_phases, public.products, public.product_prices, public.creations, public.creation_notes from anon, authenticated;
grant select on public.notes, public.note_phases, public.products, public.product_prices to anon, authenticated;
grant select, insert, update, delete on public.creations, public.creation_notes to authenticated;
create policy notes_read on public.notes for select to anon, authenticated using (true);
create policy note_phases_read on public.note_phases for select to anon, authenticated using (true);
create policy products_read on public.products for select to anon, authenticated using (true);
create policy product_prices_read on public.product_prices for select to anon, authenticated using (true);
create policy creations_select_own on public.creations for select to authenticated using ((select auth.uid()) = user_id);
create policy creations_insert_own on public.creations for insert to authenticated with check ((select auth.uid()) = user_id);
create policy creations_update_own on public.creations for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy creations_delete_own on public.creations for delete to authenticated using ((select auth.uid()) = user_id);
create policy creation_notes_select_own on public.creation_notes for select to authenticated using (exists (select 1 from public.creations c where c.id = creation_id and c.user_id = (select auth.uid())));
create policy creation_notes_insert_own on public.creation_notes for insert to authenticated with check (exists (select 1 from public.creations c where c.id = creation_id and c.user_id = (select auth.uid())));
create policy creation_notes_update_own on public.creation_notes for update to authenticated using (exists (select 1 from public.creations c where c.id = creation_id and c.user_id = (select auth.uid()))) with check (exists (select 1 from public.creations c where c.id = creation_id and c.user_id = (select auth.uid())));
create policy creation_notes_delete_own on public.creation_notes for delete to authenticated using (exists (select 1 from public.creations c where c.id = creation_id and c.user_id = (select auth.uid())));

-- Deferred check makes even direct table writes preserve complete three-phase formulas.
create function private.check_creation_complete() returns trigger language plpgsql set search_path = '' as $$
declare target uuid;
begin
  if tg_table_name = 'creations' then target := new.id;
  elsif tg_op = 'DELETE' then target := old.creation_id;
  else target := new.creation_id;
  end if;
  if exists (select 1 from public.creations where id=target) and (select count(*) from public.creation_notes where creation_id=target) <> 3 then
    raise exception 'A creation must contain one top, middle and base note' using errcode='23514';
  end if;
  if tg_op = 'UPDATE' and tg_table_name = 'creation_notes' then
    if old.creation_id <> new.creation_id and exists (select 1 from public.creations where id=old.creation_id) and (select count(*) from public.creation_notes where creation_id=old.creation_id) <> 3 then
      raise exception 'Original creation must remain complete' using errcode='23514';
    end if;
  end if;
  return null;
end $$;
create constraint trigger creations_complete after insert or update on public.creations deferrable initially deferred for each row execute function private.check_creation_complete();
create constraint trigger creation_notes_complete after insert or update or delete on public.creation_notes deferrable initially deferred for each row execute function private.check_creation_complete();

create function public.save_creation(p_id uuid, p_name text, p_top text, p_middle text, p_base text)
returns uuid language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to save your creation' using errcode='42501'; end if;
  if exists (select 1 from public.creations where id=p_id) then return p_id; end if;
  if (select count(*) from public.notes where active and id = any(array[p_top,p_middle,p_base])) <> 3 then
    raise exception 'Select three available, distinct notes' using errcode='23514';
  end if;
  insert into public.creations (id,user_id,name) values (p_id,auth.uid(),btrim(p_name));
  insert into public.creation_notes (creation_id,phase,note_id) values (p_id,'top',p_top),(p_id,'middle',p_middle),(p_id,'base',p_base);
  return p_id;
end $$;
revoke all on function public.save_creation(uuid,text,text,text,text) from public, anon;
grant execute on function public.save_creation(uuid,text,text,text,text) to authenticated;
revoke all on function private.check_creation_complete(), private.touch_updated_at() from public, anon, authenticated;

insert into public.products (id,label,description,badge,volume_ml,bottle_count,sort_order) values
('10ml','10 ML','Try the experiment.',null,10,1,0),
('30ml','30 ML','Go all in.',null,30,1,1),
('bundle-3x10ml','PLAY SET — 3 × 10 ML','Build three fragrances.','Best for Exploring',10,3,2);
insert into public.product_prices (product_id,kind,amount) values
('10ml','normal',129000),('10ml','launch',109000),('30ml','normal',229000),('30ml','launch',199000),('bundle-3x10ml','normal',299000);
insert into public.notes (id,name,category,short_description,sticker_color,icon,sticker_asset,profile) values
('yuzu','Yuzu','Citrus','Tart · zesty · sparkling','#f4dc55','☼',null,'{"fresh":10,"sweet":2,"floral":0,"green":2,"warm":1,"woody":0,"clean":6,"creamy":0,"aquatic":1}'),
('berries','Berries','Fruity','Juicy · sweet · playful','#d86b91','●',null,'{"fresh":6,"sweet":8,"floral":2,"green":0,"warm":1,"woody":0,"clean":2,"creamy":0,"aquatic":0}'),
('pink-pepper','Pink Pepper','Spicy','Sparkling · spicy · lively','#f28a92','✺',null,'{"fresh":7,"sweet":2,"floral":1,"green":2,"warm":4,"woody":1,"clean":4,"creamy":0,"aquatic":0}'),
('mint','Mint','Herbal / Cool','Cool · green · refreshing','#86d1ad','✦',null,'{"fresh":10,"sweet":0,"floral":0,"green":9,"warm":0,"woody":0,"clean":8,"creamy":0,"aquatic":1}'),
('green-leaves','Green Leaves','Green','Crisp · leafy · fresh','#7fb77a','❧',null,'{"fresh":8,"sweet":0,"floral":0,"green":10,"warm":1,"woody":1,"clean":6,"creamy":0,"aquatic":1}'),
('sea-breeze','Sea Breeze','Aquatic','Airy · watery · fresh','#79bfd4','≋',null,'{"fresh":9,"sweet":0,"floral":0,"green":2,"warm":0,"woody":0,"clean":8,"creamy":0,"aquatic":10}'),
('soapy','Soapy','Clean / Aldehydic','Soapy · airy · clean','#d8e7e4','○',null,'{"fresh":7,"sweet":1,"floral":1,"green":0,"warm":1,"woody":0,"clean":10,"creamy":1,"aquatic":3}'),
('peony','Peony','Floral','Soft · floral · airy','#eba8bd','✿',null,'{"fresh":4,"sweet":3,"floral":10,"green":1,"warm":2,"woody":0,"clean":5,"creamy":1,"aquatic":1}'),
('matcha','Matcha','Green / Creamy','Green · creamy · earthy','#9fbd6b','◉',null,'{"fresh":5,"sweet":2,"floral":0,"green":10,"warm":3,"woody":1,"clean":4,"creamy":8,"aquatic":0}'),
('tea','Tea','Tea / Aromatic','Airy · aromatic · dry','#b9cfb4','〰',null,'{"fresh":6,"sweet":1,"floral":1,"green":7,"warm":3,"woody":1,"clean":6,"creamy":0,"aquatic":0}'),
('coffee','Coffee','Roasted / Gourmand','Roasted · dark · rich','#80604f','◒',null,'{"fresh":0,"sweet":3,"floral":0,"green":0,"warm":8,"woody":4,"clean":0,"creamy":3,"aquatic":0}'),
('jasmine','Jasmine','Floral','Luminous · floral · rich','#f0d59a','✦',null,'{"fresh":4,"sweet":3,"floral":10,"green":1,"warm":4,"woody":0,"clean":4,"creamy":1,"aquatic":0}'),
('clean-musk','Clean Musk','Clean / Musk','Soft · clean · skin-like','#ead8d0','◌',null,'{"fresh":3,"sweet":2,"floral":1,"green":0,"warm":3,"woody":1,"clean":10,"creamy":4,"aquatic":0}'),
('vanilla','Vanilla','Sweet / Gourmand','Sweet · creamy · comforting','#ead7a0','✦',null,'{"fresh":0,"sweet":10,"floral":1,"green":0,"warm":8,"woody":0,"clean":1,"creamy":8,"aquatic":0}'),
('sandalwood','Sandalwood','Woody / Creamy','Smooth · woody · creamy','#d7a579','⌁',null,'{"fresh":1,"sweet":2,"floral":0,"green":1,"warm":7,"woody":10,"clean":2,"creamy":7,"aquatic":0}'),
('amber','Amber','Warm / Resinous','Warm · resinous · rich','#df9847','◆',null,'{"fresh":0,"sweet":5,"floral":0,"green":0,"warm":10,"woody":5,"clean":1,"creamy":2,"aquatic":0}'),
('coconut-milk','Coconut Milk','Milky / Creamy','Milky · creamy · soft','#eee4cf','◐',null,'{"fresh":1,"sweet":6,"floral":0,"green":0,"warm":5,"woody":0,"clean":2,"creamy":10,"aquatic":0}'),
('honey','Honey','Sweet / Gourmand','Golden · sweet · warm','#e9b84f','⬡',null,'{"fresh":0,"sweet":10,"floral":1,"green":0,"warm":7,"woody":0,"clean":0,"creamy":4,"aquatic":0}');
insert into public.note_phases (note_id,phase,prediction_text,sort_order) values
('yuzu','top','Opens tart, zesty and sparkling.',0),
('berries','top','A juicy, tart burst of fruit opens the scent.',1),
('pink-pepper','top','Adds a sparkling spicy kick at the start.',2),
('mint','top','Brings a cool, sharp and refreshing opening.',3),
('green-leaves','top','Opens with a dewy, leafy green character.',4),
('sea-breeze','top','Opens with a clean breeze of salt and open water.',5),
('soapy','top','Opens bright, airy and freshly soapy.',6),
('peony','middle','Builds an airy heart of soft peony petals.',0),
('matcha','middle','Turns the middle green, earthy and softly creamy.',1),
('tea','middle','Adds a transparent heart of steeped tea.',2),
('coffee','middle','Adds a dark, roasted coffee heart.',3),
('jasmine','middle','Brings a luminous and rich floral character through the middle.',4),
('soapy','middle','Adds a clean, airy soapy character through the middle.',5),
('clean-musk','base','Settles into a soft, clean, skin-like finish.',0),
('vanilla','base','Finishes sweet, creamy and comforting.',1),
('sandalwood','base','Dries down creamy, smooth and woody.',2),
('amber','base','Leaves a warm, resinous and rich finish.',3),
('coconut-milk','base','Settles into a milky, cocooning coconut finish.',4),
('honey','base','Settles into a golden, sweet and softly warm finish.',5),
('soapy','base','Settles into a soft, freshly soapy finish.',6);

