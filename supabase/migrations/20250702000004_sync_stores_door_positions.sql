-- ============================================
-- BLOKO - Sync stores with door positions
-- Garante que todas as lojas tenham slugs
-- correspondentes às doorPositions do
-- scene-metadata.json
-- ============================================

-- Adiciona 'lazer' ao enum store_category se ainda não existir
-- (necessário porque o admin usa esta categoria)
do $$ begin
  if not exists (select 1 from pg_enum where enumlabel = 'lazer' and enumtypid = 'store_category'::regtype) then
    alter type store_category add value 'lazer';
  end if;
end $$;

-- Upsert das 8 lojas mapeadas pelas doorPositions
insert into stores (slug, name, description, category, site_url, position, collision_box, is_active) values
  ('cafe', 'Café BLOKO', 'Cafeteria no coração da quadra', 'alimentacao', 'https://example.com/cafe', '{"x": -5.0, "y": 0, "z": -5.5}', '{"width": 2, "depth": 2, "height": 3}', true),
  ('farmacia', 'Farmácia BLOKO', 'Farmácia e produtos de saúde', 'saude', 'https://example.com/farmacia', '{"x": 5.0, "y": 0, "z": -5.5}', '{"width": 2, "depth": 2, "height": 3}', true),
  ('padaria', 'Padaria BLOKO', 'Padaria e confeitaria artesanal', 'alimentacao', 'https://example.com/padaria', '{"x": -5.0, "y": 0, "z": 5.5}', '{"width": 2, "depth": 2, "height": 3}', true),
  ('barbearia', 'Barbearia BLOKO', 'Barbearia clássica e cuidados masculinos', 'servicos', 'https://example.com/barbearia', '{"x": 5.0, "y": 0, "z": 5.5}', '{"width": 2, "depth": 2, "height": 3}', true),
  ('loja1-002', 'Loja 1', 'Loja comercial', 'outros', 'https://example.com/loja1', '{"x": -10.87, "y": 0, "z": -5.3}', '{"width": 2, "depth": 2, "height": 3}', true),
  ('hotel', 'Hotel BLOKO', 'Hotel e hospedagem', 'servicos', 'https://example.com/hotel', '{"x": 14.88, "y": 0, "z": -4.41}', '{"width": 2, "depth": 2, "height": 3}', true),
  ('restaurant', 'Restaurant BLOKO', 'Restaurante e gastronomia', 'alimentacao', 'https://example.com/restaurant', '{"x": 17.87, "y": 0, "z": -4.42}', '{"width": 2, "depth": 2, "height": 3}', true),
  ('new-building', 'New Building', 'Novo edifício comercial', 'outros', 'https://example.com/newbuilding', '{"x": 19.56, "y": 0, "z": 5.15}', '{"width": 2, "depth": 2, "height": 3}', true)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  position = excluded.position,
  collision_box = excluded.collision_box,
  is_active = excluded.is_active,
  updated_at = now();

-- Remove lojas obsoletas com slugs antigos que não devem mais existir
delete from stores where slug in ('cafe-bloko', 'farmacia-bloko', 'tech-bloko');
