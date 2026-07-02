-- ============================================
-- BLOKO - Initial Schema
-- Bairro Virtual Comercial 3D (Micro-Metaverso)
-- ============================================

-- 1. EXTENSIONS
create extension if not exists "pgcrypto";

-- 2. ENUMS
create type player_status as enum ('online', 'offline', 'idle');
create type store_category as enum ('alimentacao', 'saude', 'educacao', 'servicos', 'vestuario', 'entretenimento', 'outros', 'lazer');

-- 3. TABLES

-- Stores (comércios locais)
create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  category store_category default 'outros',
  site_url text not null,
  logo_url text,
  position jsonb not null default '{"x": 0, "y": 0, "z": 0}',
  collision_box jsonb not null default '{"width": 2, "depth": 2, "height": 3}',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Players (jogadores)
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  avatar_color text default '#4F46E5',
  last_position jsonb default '{"x": 0, "y": 0, "z": 0}',
  last_rotation float default 0,
  status player_status default 'offline',
  current_store_id uuid references stores(id) on delete set null,
  created_at timestamptz default now(),
  last_seen_at timestamptz default now()
);

-- Rooms (salas/lobby)
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  max_players int default 10,
  current_players int default 0,
  is_full boolean default false,
  created_at timestamptz default now()
);

-- Room players (controle de quem está em cada sala)
create table if not exists room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  joined_at timestamptz default now(),
  unique(room_id, player_id)
);

-- Player visits (log de visitas às lojas)
create table if not exists player_visits (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  store_id uuid references stores(id) on delete cascade,
  entered_at timestamptz default now(),
  left_at timestamptz,
  unique(player_id, store_id, entered_at)
);

-- Settings (configurações do admin)
create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  section text unique not null,
  value jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. INDEXES
create index if not exists idx_players_status on players(status);
create index if not exists idx_players_last_seen on players(last_seen_at);
create index if not exists idx_stores_active on stores(is_active);
create index if not exists idx_stores_category on stores(category);
create index if not exists idx_room_players_room on room_players(room_id);
create index if not exists idx_player_visits_player on player_visits(player_id);
create index if not exists idx_player_visits_store on player_visits(store_id);
create index if not exists idx_settings_section on settings(section);

-- 5. ROW LEVEL SECURITY

-- Players: cada um vê/altera apenas seus próprios dados
alter table players enable row level security;

create policy "players_select_own" on players
  for select using (auth.uid() = id);

create policy "players_insert_own" on players
  for insert with check (auth.uid() = id);

create policy "players_update_own" on players
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- Players: qualquer um autenticado pode ver lista básica (para multiplayer)
create policy "players_select_basic" on players
  for select using (auth.role() = 'authenticated');

-- Stores: qualquer um pode ver lojas ativas
alter table stores enable row level security;

create policy "stores_select_active" on stores
  for select using (is_active = true);

-- Rooms: qualquer um pode ver salas disponíveis
alter table rooms enable row level security;

create policy "rooms_select" on rooms
  for select using (true);

create policy "rooms_update" on rooms
  for update using (auth.role() = 'authenticated');

-- Rooms: políticas admin via service role
create policy "rooms_insert_service" on rooms
  for insert with check (true);

create policy "rooms_update_admin" on rooms
  for update using (true)
  with check (true);

create policy "rooms_delete_admin" on rooms
  for delete using (true);

-- Room players: qualquer autenticado pode gerenciar entrada/saída
alter table room_players enable row level security;

create policy "room_players_select" on room_players
  for select using (auth.role() = 'authenticated');

create policy "room_players_insert" on room_players
  for insert with check (auth.role() = 'authenticated');

create policy "room_players_delete" on room_players
  for delete using (true);

-- Player visits: cada um vê suas visitas
alter table player_visits enable row level security;

create policy "player_visits_select_own" on player_visits
  for select using (auth.uid() = player_id);

create policy "player_visits_insert_own" on player_visits
  for insert with check (auth.uid() = player_id);

create policy "player_visits_update_own" on player_visits
  for update using (auth.uid() = player_id);

-- Settings: apenas service role pode acessar
alter table settings enable row level security;

create policy "settings_service_all" on settings
  for all using (true)
  with check (true);

-- 6. FUNCTIONS

-- Função para criar sala padrão se não existir
create or replace function ensure_default_room()
returns uuid
language plpgsql
security definer
as $$
declare
  default_room_id uuid;
begin
  select id into default_room_id from rooms where name = 'Quadra Principal' limit 1;
  if default_room_id is null then
    insert into rooms (name, max_players, current_players)
    values ('Quadra Principal', 10, 0)
    returning id into default_room_id;
  end if;
  return default_room_id;
end;
$$;

-- Trigger para atualizar updated_at em stores
create or replace function update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Função para upsert de settings por seção (com merge JSONB)
create or replace function upsert_setting(p_section text, p_value jsonb)
returns uuid
language plpgsql
security definer
as $$
declare
  new_id uuid;
  current_value jsonb;
begin
  select value into current_value from settings where section = p_section;

  if current_value is null then
    insert into settings (section, value)
    values (p_section, p_value)
    returning id into new_id;
  else
    update settings
    set value = current_value || p_value,
        updated_at = now()
    where section = p_section
    returning id into new_id;
  end if;

  return new_id;
end;
$$;

-- Função para obter todas as settings como objeto único
create or replace function get_all_settings()
returns jsonb
language plpgsql
security definer
as $$
declare
  result jsonb := '{}';
  row_record record;
begin
  for row_record in select section, value from settings loop
    result := result || jsonb_build_object(row_record.section, row_record.value);
  end loop;
  return result;
end;
$$;

-- 7. TRIGGERS

create trigger set_updated_at
  before update on stores
  for each row
  execute function update_updated_at_column();

create trigger set_settings_updated_at
  before update on settings
  for each row
  execute function update_updated_at_column();

-- Trigger para atualizar current_players em rooms
create or replace function update_room_player_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update rooms set current_players = current_players + 1
    where id = new.room_id;
    update rooms set is_full = (current_players >= max_players)
    where id = new.room_id;
  elsif tg_op = 'DELETE' then
    update rooms set current_players = current_players - 1
    where id = old.room_id;
    update rooms set is_full = false
    where id = old.room_id;
  end if;
  return new;
end;
$$;

create trigger trg_room_player_count
  after insert or delete on room_players
  for each row
  execute function update_room_player_count();

-- 8. SEED DATA

-- Inserir configurações padrão se a tabela estiver vazia
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM settings LIMIT 1) THEN
    INSERT INTO settings (section, value) VALUES
      ('features', '{
        "multiplayer": true,
        "iframePortals": true,
        "collisionDetection": true,
        "touchControls": true,
        "autoCreateRooms": true,
        "sceneShadows": true,
        "fog": true,
        "vertexColors": true,
        "trees": true,
        "lamps": true,
        "streetMarkings": true
      }'),
      ('environment', '{
        "worldBounds": 18,
        "playerSize": 0.5,
        "playerHeight": 0.5,
        "playerSpeed": 5,
        "lerpFactor": 0.1,
        "skyColor": "#87CEEB",
        "fogColor": "#87CEEB",
        "fogNear": 25,
        "fogFar": 45,
        "ambientLightIntensity": 0.5,
        "directionalLightIntensity": 1.0,
        "fillLightIntensity": 0.3,
        "hemisphereLightIntensity": 0.6,
        "cameraFov": 55,
        "cameraDistance": 14,
        "cameraHeight": 12,
        "toneMappingExposure": 1.2
      }'),
      ('network', '{
        "tickRate": 15,
        "corsOrigin": "*",
        "serverPort": 3000
      }'),
      ('rooms', '{
        "maxPlayersPerRoom": 10,
        "defaultRoomName": "Quadra Principal"
      }'),
      ('debug', '{
        "showFps": false,
        "showHitboxes": false,
        "showPlayerCoordinates": false,
        "showGrid": false,
        "showCollisionBounds": false,
        "enableServerLogs": true,
        "logLevel": "info",
        "showWireframe": false
      }'),
      ('build', '{
        "dracoCompression": true,
        "vertexBakingEnabled": true,
        "ambientOcclusion": true,
        "sceneOutputPath": "public/assets/scene.glb",
        "includeTrees": true,
        "includeLamps": true,
        "includeStreetMarkings": true,
        "halfStreet": 20,
        "streetWidth": 8,
        "sidewalkWidth": 1.5,
        "buildingWidth": 5,
        "buildingDepth": 4,
        "buildingHeight": 3.2,
        "lightDirection": {"x": 0.4, "y": 0.7, "z": 0.3},
        "ambientIntensity": 0.35,
        "lightIntensity": 0.65
      }'),
      ('admin', '{
        "title": "BLOKO Admin",
        "theme": "dark",
        "autoRefresh": true,
        "refreshInterval": 5000
      }');
  END IF;
END
$$;

-- Inserir lojas mapeadas pelas doorPositions
insert into stores (slug, name, description, category, site_url, position, collision_box, is_active) values
  ('cafe', 'Café BLOKO', 'Cafeteria no coração da quadra', 'alimentacao', 'https://example.com/cafe', '{"x": -5.0, "y": 0, "z": -5.5}', '{"width": 2, "depth": 2, "height": 3}', true),
  ('farmacia', 'Farmácia BLOKO', 'Farmácia e produtos de saúde', 'saude', 'https://example.com/farmacia', '{"x": 5.0, "y": 0, "z": -5.5}', '{"width": 2, "depth": 2, "height": 3}', true),
  ('padaria', 'Padaria BLOKO', 'Padaria e confeitaria artesanal', 'alimentacao', 'https://example.com/padaria', '{"x": -5.0, "y": 0, "z": 5.5}', '{"width": 2, "depth": 2, "height": 3}', true),
  ('barbearia', 'Barbearia BLOKO', 'Barbearia clássica e cuidados masculinos', 'servicos', 'https://example.com/barbearia', '{"x": 5.0, "y": 0, "z": 5.5}', '{"width": 2, "depth": 2, "height": 3}', true),
  ('loja1-002', 'Loja 1', 'Loja comercial', 'outros', 'https://example.com/loja1', '{"x": -10.87, "y": 0, "z": -5.3}', '{"width": 2, "depth": 2, "height": 3}', true),
  ('hotel', 'Hotel BLOKO', 'Hotel e hospedagem', 'servicos', 'https://example.com/hotel', '{"x": 14.88, "y": 0, "z": -4.41}', '{"width": 2, "depth": 2, "height": 3}', true),
  ('restaurant', 'Restaurant BLOKO', 'Restaurante e gastronomia', 'alimentacao', 'https://example.com/restaurant', '{"x": 17.87, "y": 0, "z": -4.42}', '{"width": 2, "depth": 2, "height": 3}', true),
  ('new-building', 'New Building', 'Novo edifício comercial', 'outros', 'https://example.com/newbuilding', '{"x": 19.56, "y": 0, "z": 5.15}', '{"width": 2, "depth": 2, "height": 3}', true)
on conflict (slug) do nothing;
