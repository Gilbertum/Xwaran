-- XWARAN PUZZLES · Database & Storage · Supabase SQL Editor
-- Run as project owner. Do not put service_role keys anywhere in the website.
create extension if not exists pgcrypto;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.admins where user_id=auth.uid()); $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create table if not exists public.packs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);
create table if not exists public.puzzles (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.packs(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  image_path text not null,
  sort_order integer not null default 0,
  cols integer not null default 5 check (cols between 2 and 8),
  rows integer not null default 4 check (rows between 2 and 6),
  created_at timestamptz not null default now()
);
create index if not exists puzzles_pack_idx on public.puzzles(pack_id,sort_order);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.packs(id) on delete cascade,
  current_index integer not null default 0 check(current_index >= 0),
  phase text not null default 'playing' check(phase in ('playing','transition','finished')),
  advance_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists rooms_pack_idx on public.rooms(pack_id);

create table if not exists public.room_pieces (
  room_id uuid not null references public.rooms(id) on delete cascade,
  piece_index integer not null check(piece_index>=0 and piece_index<500),
  x double precision not null,
  y double precision not null,
  locked boolean not null default false,
  moved_by text,
  updated_at timestamptz not null default now(),
  primary key(room_id,piece_index)
);

alter table public.admins enable row level security;
alter table public.packs enable row level security;
alter table public.puzzles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_pieces enable row level security;

-- Public reads so viewers can play without registering.
drop policy if exists "packs-public-read" on public.packs;
create policy "packs-public-read" on public.packs for select to anon,authenticated using (true);
drop policy if exists "packs-admin-insert" on public.packs;
create policy "packs-admin-insert" on public.packs for insert to authenticated with check(public.is_admin());
drop policy if exists "packs-admin-update" on public.packs;
create policy "packs-admin-update" on public.packs for update to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "packs-admin-delete" on public.packs;
create policy "packs-admin-delete" on public.packs for delete to authenticated using(public.is_admin());

drop policy if exists "puzzles-public-read" on public.puzzles;
create policy "puzzles-public-read" on public.puzzles for select to anon,authenticated using (true);
drop policy if exists "puzzles-admin-insert" on public.puzzles;
create policy "puzzles-admin-insert" on public.puzzles for insert to authenticated with check(public.is_admin());
drop policy if exists "puzzles-admin-update" on public.puzzles;
create policy "puzzles-admin-update" on public.puzzles for update to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "puzzles-admin-delete" on public.puzzles;
create policy "puzzles-admin-delete" on public.puzzles for delete to authenticated using(public.is_admin());

drop policy if exists "rooms-public-read" on public.rooms;
create policy "rooms-public-read" on public.rooms for select to anon,authenticated using (true);
drop policy if exists "rooms-admin-insert" on public.rooms;
create policy "rooms-admin-insert" on public.rooms for insert to authenticated with check(public.is_admin());
-- Client-side room updates are deliberately denied; state changes only via checked RPCs.
drop policy if exists "pieces-public-read" on public.room_pieces;
create policy "pieces-public-read" on public.room_pieces for select to anon,authenticated using (true);
-- Client-side piece writes are denied. The atomic RPC checks the move and locks the row.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('puzzle-arts','puzzle-arts',true,10485760,array['image/webp'])
on conflict (id) do update set public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "puzzle-arts-public-read" on storage.objects;
create policy "puzzle-arts-public-read" on storage.objects for select to anon,authenticated using(bucket_id='puzzle-arts');
drop policy if exists "puzzle-arts-admin-insert" on storage.objects;
create policy "puzzle-arts-admin-insert" on storage.objects for insert to authenticated with check(bucket_id='puzzle-arts' and public.is_admin());
drop policy if exists "puzzle-arts-admin-delete" on storage.objects;
create policy "puzzle-arts-admin-delete" on storage.objects for delete to authenticated using(bucket_id='puzzle-arts' and public.is_admin());

-- Initialises the first image for a brand-new room. Admin only.
create or replace function public.start_room(p_room_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare v_room public.rooms%rowtype; v_puzzle public.puzzles%rowtype;
begin
 if not public.is_admin() then raise exception 'admin_required'; end if;
 select * into v_room from public.rooms where id=p_room_id for update;
 if not found then raise exception 'room_not_found'; end if;
 select * into v_puzzle from public.puzzles where pack_id=v_room.pack_id order by sort_order,id limit 1;
 if not found then raise exception 'empty_pack'; end if;
 delete from public.room_pieces where room_id=p_room_id;
 update public.rooms set current_index=0,phase='playing',advance_at=null where id=p_room_id;
 insert into public.room_pieces(room_id,piece_index,x,y)
 select p_room_id,i,
  -1.35 + (i % (v_puzzle.cols+3)) * ((v_puzzle.cols+2.7)/(v_puzzle.cols+2)::double precision),
  v_puzzle.rows + .48 + floor(i/(v_puzzle.cols+3)::numeric)*.65
 from generate_series(0,v_puzzle.cols*v_puzzle.rows-1) as i;
end $$;
revoke all on function public.start_room(uuid) from public;
grant execute on function public.start_room(uuid) to authenticated;

-- Every viewer can move a loose piece. Invalid snaps are rejected by the DB.
-- Locking the room serializes win detection under concurrent moves.
create or replace function public.move_piece(
 p_room_id uuid, p_piece_index integer, p_x double precision, p_y double precision, p_nickname text
) returns void language plpgsql security definer set search_path=public
as $$
declare v_room public.rooms%rowtype; v_puzzle public.puzzles%rowtype;
 v_snap boolean; v_targ_x integer; v_targ_y integer; v_name text;
begin
 if not (p_x between -2 and 12 and p_y between -1 and 12) then raise exception 'invalid_position'; end if;
 if p_nickname is null or char_length(p_nickname)>26 then raise exception 'invalid_nickname'; end if;
 select * into v_room from public.rooms where id=p_room_id for update;
 if not found or v_room.phase<>'playing' then return; end if;
 select * into v_puzzle from public.puzzles where pack_id=v_room.pack_id order by sort_order,id offset v_room.current_index limit 1;
 if not found then return; end if;
 if p_piece_index<0 or p_piece_index>=v_puzzle.cols*v_puzzle.rows then raise exception 'invalid_piece'; end if;
 if (select locked from public.room_pieces where room_id=p_room_id and piece_index=p_piece_index) is distinct from false then return; end if;
 v_targ_x=p_piece_index%v_puzzle.cols;
 v_targ_y=p_piece_index/v_puzzle.cols;
 v_snap=sqrt(power(p_x-v_targ_x,2)+power(p_y-v_targ_y,2))<=.45;
 v_name=left(regexp_replace(coalesce(p_nickname,'Гость'),'[[:cntrl:]]','','g'),26);
 update public.room_pieces set
  x=case when v_snap then v_targ_x else p_x end,
  y=case when v_snap then v_targ_y else p_y end,
  locked=v_snap,
  moved_by=case when v_snap then v_name else moved_by end,
  updated_at=now()
 where room_id=p_room_id and piece_index=p_piece_index;
 if not exists(select 1 from public.room_pieces where room_id=p_room_id and locked=false) then
  update public.rooms set phase='transition',advance_at=now()+interval '5 seconds' where id=p_room_id;
 end if;
end $$;
revoke all on function public.move_piece(uuid,integer,double precision,double precision,text) from public;
grant execute on function public.move_piece(uuid,integer,double precision,double precision,text) to anon,authenticated;

-- Any online viewer can advance *after* the server's five-second deadline.
create or replace function public.advance_room(p_room_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare v_room public.rooms%rowtype; v_puzzle public.puzzles%rowtype; v_total integer;
begin
 select * into v_room from public.rooms where id=p_room_id for update;
 if not found or v_room.phase<>'transition' or now()<v_room.advance_at then return; end if;
 select count(*) into v_total from public.puzzles where pack_id=v_room.pack_id;
 if v_room.current_index+1>=v_total then
  update public.rooms set phase='finished',advance_at=null where id=p_room_id;
  return;
 end if;
 select * into v_puzzle from public.puzzles where pack_id=v_room.pack_id order by sort_order,id offset v_room.current_index+1 limit 1;
 delete from public.room_pieces where room_id=p_room_id;
 update public.rooms set current_index=v_room.current_index+1,phase='playing',advance_at=null where id=p_room_id;
 insert into public.room_pieces(room_id,piece_index,x,y)
 select p_room_id,i,
  -1.35 + (i % (v_puzzle.cols+3)) * ((v_puzzle.cols+2.7)/(v_puzzle.cols+2)::double precision),
  v_puzzle.rows + .48 + floor(i/(v_puzzle.cols+3)::numeric)*.65
 from generate_series(0,v_puzzle.cols*v_puzzle.rows-1) as i;
end $$;
revoke all on function public.advance_room(uuid) from public;
grant execute on function public.advance_room(uuid) to anon,authenticated;

-- Tell Supabase Realtime to broadcast piece updates and stage changes.
do $$ begin
  alter publication supabase_realtime add table public.room_pieces;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null;
end $$;

-- AFTER creating the host in Authentication > Users, run the following separately
-- with the real email. Do NOT publish the email in the repository:
-- insert into public.admins(user_id)
-- select id from auth.users where email='YOUR_PRIVATE_EMAIL_HERE'
-- on conflict do nothing;
