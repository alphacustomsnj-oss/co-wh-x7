-- C&O Warehouse live-sync schema (run in Supabase SQL editor)
create table if not exists inventory (
  number int primary key,
  name text,
  qty int not null default 0,
  bin_qty int not null default 0,
  updated_at timestamptz default now()
);
create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  vendor text, cost_per_unit numeric,
  counts jsonb not null,
  total_units int,
  created_at timestamptz default now()
);
create table if not exists pack_batches (
  id uuid primary key default gen_random_uuid(),
  show_date text, packer_no int,
  orders jsonb not null,
  created_at timestamptz default now()
);
create table if not exists pack_events (
  id uuid primary key default gen_random_uuid(),
  tracking text, packer text,
  items jsonb, flagged text,
  seconds int, at timestamptz default now()
);
create table if not exists upc_map (
  upc text primary key,
  number int not null
);
-- open policies for the warehouse anon key (private project; tighten later if needed)
alter table inventory   enable row level security;
alter table shipments   enable row level security;
alter table pack_batches enable row level security;
alter table pack_events enable row level security;
alter table upc_map     enable row level security;
create policy anon_all_inventory    on inventory    for all using (true) with check (true);
create policy anon_all_shipments    on shipments    for all using (true) with check (true);
create policy anon_all_batches      on pack_batches for all using (true) with check (true);
create policy anon_all_events       on pack_events  for all using (true) with check (true);
create policy anon_all_upc          on upc_map      for all using (true) with check (true);
-- realtime
alter publication supabase_realtime add table inventory, pack_batches, pack_events;
