# Supabase setup

1. Open Supabase Dashboard > SQL Editor.
2. Run `migrations/20261120154100_initial_schema.sql`.
3. In Authentication > Providers > Email, enable email/password.
4. Enable confirmation if you want users to confirm their email before login.
5. In Authentication > URL Configuration, add the app redirect URLs used for recovery and confirmation.
6. In Authentication > Policies, do not weaken the SQL policies created by the migration.
7. Run `migrations/20261120162100_aircraft_catalog.sql` to add airport size and create/populate the aircraft catalog.
8. Run `migrations/20261120160200_seed_private_airports.sql` to import the 42 airports with their size classifications.

The app uses the public publishable key, never a Supabase secret key.
Keep `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`.

## Create an administrator

Administrators must be promoted on the server, never with app-side user metadata:

```sql
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where email = 'admin@example.com';
```

Ask that administrator to sign out and sign in again so the JWT contains the new role.

## Exclusão de conta

A opção **Excluir conta** exige que a pessoa digite o nome completo seguido de `Volares`.
Depois da confirmação, a função autenticada `delete-account` valida a sessão e obtém o ID
diretamente do usuário autenticado; ela não aceita IDs enviados pelo app. A conta é apagada
permanentemente e os dados vinculados são removidos conforme as regras de chave estrangeira
do banco.

Para publicar a função:

1. Instale e autentique o [Supabase CLI](https://supabase.com/docs/guides/cli).
2. Na pasta `Volares`, vincule o projeto: `supabase link --project-ref SEU_PROJECT_REF`.
3. Publique: `supabase functions deploy delete-account`.

A verificação JWT da função deve permanecer habilitada (padrão do Supabase). O segredo
administrativo é usado somente no ambiente seguro da Edge Function; não o coloque no app,
em `EXPO_PUBLIC_*` ou no `.env.local`. O app chama a função usando a sessão atual.
