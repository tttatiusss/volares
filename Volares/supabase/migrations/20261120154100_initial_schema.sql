-- Run this migration in Supabase Dashboard > SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_name text not null,
  last_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_normalized check (email = lower(trim(email)))
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_status_check
    check (status in ('pending', 'processing', 'paid', 'failed', 'refunded', 'cancelled'))
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  flight_id text not null,
  transaction_id uuid references public.transactions(id) on delete set null,
  departure_date timestamptz not null,
  passenger_count integer not null default 1,
  passenger jsonb not null default '[]'::jsonb,
  total_price numeric(12, 2) not null check (total_price >= 0),
  currency char(3) not null,
  status text not null default 'pending',
  booking_reference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_passenger_count_check check (passenger_count > 0),
  constraint reservations_status_check
    check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'expired')),
  constraint reservations_currency_check check (currency = upper(currency))
);

create unique index if not exists reservations_booking_reference_key
  on public.reservations (booking_reference);

create table if not exists public.seat_inventory (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions(id) on delete cascade,
  status text not null default 'available',
  total_seats integer not null check (total_seats >= 0),
  reserved_seats integer not null default 0 check (reserved_seats >= 0),
  available_seats integer generated always as (total_seats - reserved_seats) stored,
  updated_at timestamptz not null default now(),
  constraint seat_inventory_status_check
    check (status in ('available', 'limited', 'sold_out')),
  constraint seat_inventory_reserved_check
    check (reserved_seats <= total_seats)
);

create index if not exists transactions_user_id_idx on public.transactions (user_id);
create index if not exists reservations_user_id_idx on public.reservations (user_id);
create index if not exists reservations_flight_id_idx on public.reservations (flight_id);
create index if not exists reservations_departure_date_idx on public.reservations (departure_date);
create index if not exists seat_inventory_transaction_id_idx on public.seat_inventory (transaction_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create or replace trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

create or replace trigger reservations_set_updated_at
before update on public.reservations
for each row execute function public.set_updated_at();

create or replace trigger seat_inventory_set_updated_at
before update on public.seat_inventory
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (
    id,
    email,
    first_name,
    last_name,
    phone
  )
  values (
    new.id,
    lower(trim(coalesce(new.email, ''))),
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '')
  )
  on conflict (id) do update set
    email = excluded.email,
    first_name = case
      when excluded.first_name = '' then public.users.first_name
      else excluded.first_name
    end,
    last_name = case
      when excluded.last_name = '' then public.users.last_name
      else excluded.last_name
    end,
    phone = coalesce(excluded.phone, public.users.phone),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

alter table public.users enable row level security;
alter table public.transactions enable row level security;
alter table public.reservations enable row level security;
alter table public.seat_inventory enable row level security;

-- Users
drop policy if exists users_select_own on public.users;
drop policy if exists users_update_own on public.users;
drop policy if exists users_admin_update on public.users;

create policy users_select_own
on public.users for select
to authenticated
using (id = auth.uid() or public.is_admin());

create policy users_update_own
on public.users for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy users_admin_update
on public.users for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Transactions
drop policy if exists transactions_select_own on public.transactions;
drop policy if exists transactions_insert_own on public.transactions;
drop policy if exists transactions_admin_all on public.transactions;

create policy transactions_select_own
on public.transactions for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy transactions_insert_own
on public.transactions for insert
to authenticated
with check (user_id = auth.uid());

create policy transactions_admin_all
on public.transactions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Reservations
drop policy if exists reservations_select_own on public.reservations;
drop policy if exists reservations_insert_own on public.reservations;
drop policy if exists reservations_update_own on public.reservations;
drop policy if exists reservations_delete_own on public.reservations;
drop policy if exists reservations_admin_all on public.reservations;

create policy reservations_select_own
on public.reservations for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy reservations_insert_own
on public.reservations for insert
to authenticated
with check (
  user_id = auth.uid()
  and (
    transaction_id is null
    or exists (
      select 1
      from public.transactions t
      where t.id = transaction_id
        and t.user_id = auth.uid()
    )
  )
);

create policy reservations_update_own
on public.reservations for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and (
    transaction_id is null
    or exists (
      select 1
      from public.transactions t
      where t.id = transaction_id
        and t.user_id = auth.uid()
    )
  )
);

create policy reservations_delete_own
on public.reservations for delete
to authenticated
using (user_id = auth.uid());

create policy reservations_admin_all
on public.reservations for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Seat inventory: users can read inventory linked to their own transaction.
drop policy if exists seat_inventory_select_own on public.seat_inventory;
drop policy if exists seat_inventory_admin_all on public.seat_inventory;

create policy seat_inventory_select_own
on public.seat_inventory for select
to authenticated
using (
  exists (
    select 1
    from public.transactions t
    where t.id = seat_inventory.transaction_id
      and t.user_id = auth.uid()
  )
  or public.is_admin()
);

create policy seat_inventory_admin_all
on public.seat_inventory for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant usage on schema public to authenticated;
grant select, update on public.users to authenticated;
grant select, insert on public.transactions to authenticated;
grant select, insert, update, delete on public.reservations to authenticated;
grant select on public.seat_inventory to authenticated;

create table if not exists public.airports (
  code text primary key
    constraint airports_code_check check (code ~ '^[A-Z]{2}[A-Z0-9]{2}$'),
  name text not null,
  city text not null,
  state char(2) not null,
  region text not null
    constraint airports_region_check
    check (region in ('north', 'northeast', 'centralWest', 'southeast', 'south')),
  runway_length_meters integer not null
    constraint airports_runway_length_check check (runway_length_meters > 0),
  aircraft_categories text[] not null default '{}',
  private_operations boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists airports_city_idx on public.airports (city);
create index if not exists airports_state_idx on public.airports (state);
create index if not exists airports_region_idx on public.airports (region);

create or replace trigger airports_set_updated_at
before update on public.airports
for each row execute function public.set_updated_at();

alter table public.airports enable row level security;

drop policy if exists airports_public_select on public.airports;
drop policy if exists airports_admin_all on public.airports;

create policy airports_public_select
on public.airports for select
to anon, authenticated
using (private_operations = true);

create policy airports_admin_all
on public.airports for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.airports to anon, authenticated;
