-- ============================================
-- BLOKO - Fix upsert_setting to MERGE JSONB values
-- ============================================

-- Corrigir a função upsert_setting para fazer merge dos valores JSONB
-- ao invés de substituir inteiramente
create or replace function upsert_setting(p_section text, p_value jsonb)
returns uuid
language plpgsql
security definer
as $$
declare
  new_id uuid;
  current_value jsonb;
begin
  -- Buscar valor atual
  select value into current_value from settings where section = p_section;

  if current_value is null then
    -- Seção não existe, inserir
    insert into settings (section, value)
    values (p_section, p_value)
    returning id into new_id;
  else
    -- Seção existe, fazer merge dos JSONBs (p_value sobrescreve chaves duplicadas)
    update settings
    set value = current_value || p_value,
        updated_at = now()
    where section = p_section
    returning id into new_id;
  end if;

  return new_id;
end;
$$;
