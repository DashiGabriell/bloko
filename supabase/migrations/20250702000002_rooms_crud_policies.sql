-- ============================================
-- BLOKO - Rooms CRUD policies for admin
-- ============================================

-- Adicionar políticas admin para rooms (service role via supabaseAdmin)
-- A política existente "rooms_select" já permite leitura para todos
-- Adicionar políticas de escrita para service role

-- Rooms: permitir INSERT via service role (admin)
create policy "rooms_insert_service" on rooms
  for insert with check (true);

-- Rooms: permitir UPDATE via service role (admin)
create policy "rooms_update_admin" on rooms
  for update using (true)
  with check (true);

-- Rooms: permitir DELETE via service role (admin)
create policy "rooms_delete_admin" on rooms
  for delete using (true);

-- Room players: política de delete mais permissiva para admin
-- (já existe room_players_delete, mas garantir que service role pode remover)
drop policy if exists "room_players_delete" on room_players;
create policy "room_players_delete" on room_players
  for delete using (true);
