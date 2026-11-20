-- Add airport size and the aircraft catalog. Safe to run repeatedly.

alter table public.airports
  add column if not exists porte text;

update public.airports
set porte = case code
  when 'SBMT' then 'Pequeno'
  when 'SDUB' then 'Pequeno'
  when 'SBJR' then 'Pequeno'
  when 'SDAG' then 'Pequeno'
  when 'SBJD' then 'Medio'
  when 'SDCO' then 'Medio'
  when 'SBRJ' then 'Medio'
  when 'SSBZ' then 'Medio'
  when 'SBBI' then 'Medio'
  when 'SBNF' then 'Medio'
  when 'SBCX' then 'Medio'
  when 'SBTV' then 'Medio'
  when 'SWSI' then 'Medio'
  else 'Grande'
end
where code in (
  'SBMT', 'SBJH', 'SBSP', 'SBGR', 'SBJD', 'SDCO', 'SBKP', 'SBRP',
  'SDUB', 'SBJR', 'SBRJ', 'SBGL', 'SDAG', 'SSBZ', 'SBBH', 'SBCF',
  'SBUL', 'SBVT', 'SBBI', 'SBCT', 'SBLO', 'SBFL', 'SBNF', 'SBPA',
  'SBCX', 'SBBR', 'SBGO', 'SBCY', 'SWSI', 'SBCG', 'SBSV', 'SBPS',
  'SBTV', 'SBTC', 'SBRF', 'SBFZ', 'SBJE', 'SBSG', 'SBMO', 'SBEG',
  'SBBE', 'SBPJ'
);

do $$
begin
  if exists (select 1 from public.airports where porte is null) then
    raise exception 'Existem aeroportos sem porte. Classifique-os antes de exigir o campo porte.';
  end if;
end;
$$;

alter table public.airports
  alter column porte set not null;

alter table public.airports
  drop constraint if exists airports_porte_check;

alter table public.airports
  add constraint airports_porte_check
  check (porte in ('Pequeno', 'Medio', 'Grande'));

create table if not exists public.aircraft (
  id uuid primary key default gen_random_uuid(),
  modelo text not null unique,
  tipo text not null
    constraint aircraft_type_check
    check (tipo in ('Helicóptero', 'Pistão', 'Turboélice', 'Jato')),
  assentos integer not null check (assentos > 0),
  porte_minimo text not null
    constraint aircraft_min_airport_size_check
    check (porte_minimo in ('Pequeno', 'Medio', 'Grande')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists aircraft_min_airport_size_idx
  on public.aircraft (porte_minimo);

create or replace trigger aircraft_set_updated_at
before update on public.aircraft
for each row execute function public.set_updated_at();

alter table public.aircraft enable row level security;
drop policy if exists aircraft_public_select on public.aircraft;
drop policy if exists aircraft_admin_all on public.aircraft;

create policy aircraft_public_select
on public.aircraft for select
to anon, authenticated
using (true);

create policy aircraft_admin_all
on public.aircraft for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.aircraft to anon, authenticated;

insert into public.aircraft (modelo, tipo, assentos, porte_minimo) values
  ('Robinson R44', 'Helicóptero', 3, 'Pequeno'),
  ('Airbus Esquilo / H125', 'Helicóptero', 5, 'Pequeno'),
  ('Leonardo AW109', 'Helicóptero', 6, 'Pequeno'),
  ('Leonardo AW139', 'Helicóptero', 12, 'Pequeno'),
  ('Cirrus SR22', 'Pistão', 3, 'Pequeno'),
  ('Beechcraft Baron 58', 'Pistão', 5, 'Pequeno'),
  ('Piper Seneca V', 'Pistão', 5, 'Pequeno'),
  ('Cessna Grand Caravan', 'Turboélice', 9, 'Pequeno'),
  ('Pilatus PC-12', 'Turboélice', 8, 'Pequeno'),
  ('Beechcraft King Air C90', 'Turboélice', 6, 'Medio'),
  ('Beechcraft King Air B200', 'Turboélice', 8, 'Medio'),
  ('Beechcraft King Air 350i', 'Turboélice', 9, 'Medio'),
  ('Embraer Phenom 100', 'Jato', 4, 'Medio'),
  ('Embraer Phenom 300', 'Jato', 8, 'Medio'),
  ('Cessna Citation CJ3', 'Jato', 7, 'Medio'),
  ('HondaJet', 'Jato', 5, 'Medio'),
  ('Learjet 45', 'Jato', 8, 'Medio'),
  ('Learjet 75', 'Jato', 8, 'Medio'),
  ('Cessna Citation XLS+', 'Jato', 9, 'Medio'),
  ('Embraer Praetor 500', 'Jato', 9, 'Grande'),
  ('Embraer Praetor 600', 'Jato', 12, 'Grande'),
  ('Bombardier Challenger 350', 'Jato', 9, 'Grande'),
  ('Gulfstream G280', 'Jato', 10, 'Grande'),
  ('Embraer Legacy 650', 'Jato', 13, 'Grande'),
  ('Gulfstream G550', 'Jato', 14, 'Grande'),
  ('Gulfstream G650', 'Jato', 16, 'Grande'),
  ('Bombardier Global 6000', 'Jato', 14, 'Grande'),
  ('Dassault Falcon 7X', 'Jato', 14, 'Grande')
on conflict (modelo) do update set
  tipo = excluded.tipo,
  assentos = excluded.assentos,
  porte_minimo = excluded.porte_minimo,
  updated_at = now();
