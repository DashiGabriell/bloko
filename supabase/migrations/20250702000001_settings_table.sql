-- ============================================
-- BLOKO - Settings table for admin persistence
-- ============================================

-- Tabela de configurações do admin (cada seção = 1 row)
create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  section text unique not null,
  value jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Índice para lookup rápido por seção
create index if not exists idx_settings_section on settings(section);

-- RLS: apenas service role pode acessar (admin via server.js)
alter table settings enable row level security;

-- Políticas: service role tem acesso total (via supabaseAdmin)
create policy "settings_service_all" on settings
  for all using (true)
  with check (true);

-- Trigger para atualizar updated_at
create trigger set_settings_updated_at
  before update on settings
  for each row
  execute function update_updated_at_column();

-- Função para upsert de settings por seção
create or replace function upsert_setting(p_section text, p_value jsonb)
returns uuid
language plpgsql
security definer
as $$
declare
  new_id uuid;
begin
  insert into settings (section, value)
  values (p_section, p_value)
  on conflict (section)
  do update set value = p_value, updated_at = now()
  returning id into new_id;
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

-- Seed: inserir configurações padrão se a tabela estiver vazia
-- (será executado apenas se não houver settings)
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
