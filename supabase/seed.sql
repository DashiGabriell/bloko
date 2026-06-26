-- BLOKO - Seed Data

-- Sala padrão
insert into rooms (name, max_players, current_players)
values ('Quadra Principal', 10, 0)
on conflict (id) do nothing;

-- Lojas de exemplo
insert into stores (slug, name, description, category, site_url, position, collision_box) values
  ('cafe-bloko', 'Café BLOKO', 'Cafeteria e coworking no coração da quadra', 'alimentacao', 'https://example.com/cafe', '{"x": 5, "y": 0, "z": -3}', '{"width": 2, "depth": 2, "height": 3}'),
  ('farmacia-bloko', 'Farmácia BLOKO', 'Farmácia e produtos de saúde', 'saude', 'https://example.com/farmacia', '{"x": -5, "y": 0, "z": -3}', '{"width": 2, "depth": 2, "height": 3}'),
  ('tech-bloko', 'Tech BLOKO', 'Loja de tecnologia e eletrônicos', 'servicos', 'https://example.com/tech', '{"x": 5, "y": 0, "z": 3}', '{"width": 2, "depth": 2, "height": 3}')
on conflict (slug) do nothing;
