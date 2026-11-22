# Volares

Aplicativo de reserva de voos desenvolvido com Expo e React Native.

Este guia permite instalar o Volares em outro computador e executar o produto.

## O que voce precisa

- Node.js 20 ou superior
- npm
- Git
- Expo Go no celular
- Um projeto Supabase para autenticação e reservas
- Um projeto Sanity para o catálogo de voos

Você pode executar o app no Expo Go, em emulador ou na versão web.

## 1. Baixe o projeto

```bash
git clone <LINK_DO_REPOSITORIO>
cd volares/Volares
```

## 2. Instale as dependencias

```bash
npm install
```

## 3. Configure o Supabase

Crie um arquivo `.env.local` dentro da pasta `Volares`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE
```

Obtenha a URL e a publishable key em:

**Supabase > Project Settings > API**

Use somente a chave publicável. Nunca coloque uma `secret key` ou uma chave
com prefixo `sb_secret_` no aplicativo.

Se o banco ainda não tiver sido criado, execute os arquivos SQL da pasta
`supabase/migrations` no Supabase SQL Editor nesta ordem:

1. `20261120154100_initial_schema.sql`
2. `20261120161800_aircraft_catalog.sql`
3. `20261120162100_aircraft_catalog.sql`
4. `20261120160200_seed_private_airports.sql`

Depois, em **Authentication > Providers > Email**, habilite o acesso por
email e senha. Informe em **Authentication > URL Configuration** os links
usados pelo aplicativo caso a confirmação de email esteja ativa.

## 4. Configure o Sanity

Ainda no arquivo `.env.local`, adicione:

```env
EXPO_PUBLIC_SANITY_PROJECT_ID=SEU_PROJECT_ID
EXPO_PUBLIC_SANITY_DATASET=production
EXPO_PUBLIC_SANITY_API_VERSION=2026-11-20
```

O Project ID está no painel do projeto Sanity. Não coloque token privado,
API secret ou outras credenciais administrativas neste arquivo.

## 5. Execute o aplicativo

Depois de salvar `.env.local`, reinicie o Expo:

```bash
npx expo start
```

Em seguida:

- pressione `a` para Android;
- pressione `i` para iOS no macOS;
- pressione `w` para abrir no navegador;
- escaneie o QR Code com o aplicativo Expo Go.

Para celular e computador na mesma rede, mantenha ambos conectados ao mesmo
Wi-Fi.

## Testar uma conta

1. Abra o app.
2. Escolha criar conta.
3. Informe nome, sobrenome, email e senha.
4. Confirme o email se essa opção estiver habilitada no Supabase.
5. Entre no app.
6. Escolha origem, destino e data.
7. Selecione um voo.
8. Conclua o pagamento de demonstração.
9. Confirme o tíquete em **Reservas**.

## Comandos principais

Na pasta `Volares`:

```bash
npm run web       # abre no navegador
npm run android   # abre no Android
npm run ios       # abre no iOS
npm run lint      # verifica problemas no codigo
npx expo start    # inicia o projeto Expo
```

## Opcional: executar o Studio Sanity

```bash
cd ../volastdio/studio
npm install
npx sanity login
npm run dev
```

O Studio fica disponível em uma URL exibida pelo terminal.

## Problemas comuns

### O app mostra erro de configuração

Verifique se `.env.local` está dentro da pasta `Volares` e se os nomes das
variáveis estão escritos exatamente como neste guia. Reinicie o Expo depois
de alterar o arquivo.

### Expo Go não encontra o projeto

Confirme que o computador e o celular estão no mesmo Wi-Fi. Reinicie
`npx expo start` ou use o modo tunnel:

```bash
npx expo start --tunnel
```

### Login não funciona

Confirme que o provedor Email está habilitado no Supabase e que a migration
de autenticação foi executada.

## Estrutura principal

```text
Volares/
├── src/app/               # rotas do aplicativo
├── src/components/       # telas e componentes
├── src/lib/              # integrações Supabase e Sanity
├── supabase/migrations/  # estrutura do banco
└── assets/               # imagens e ícones
```
