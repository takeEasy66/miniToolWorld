# 恋爱 100 件事打卡 H5

这是一个免登录、可分享链接的轻量 H5 工具，支持：

- 100 件事卡片打卡（完成状态、备注）
- 自动进度统计（已完成 / 总数）
- 恋爱开始日期与在一起天数
- 云端持久存储（Supabase）
- 导出 Excel
- 生成永久链接与二维码
- 独立管理员登录页 + 管理页（`admin-login.html` / `admin.html`，与用户页分离）

## 0) 免重复初始化配置（推荐）

可在项目根目录的 `app-config.js` 预置：

- `supabaseUrl`
- `supabaseAnonKey`

这样浏览器首次打开时会自动写入本地缓存，后续不会反复要求云端初始化。

> 说明：`anon key` 可放前端；`service_role` 绝对不能放前端。

## 1) 为什么推荐 Supabase（性价比）

对这个场景（免登录 + 云端 + 导出）而言，Supabase 通常是最省事且性价比高的：

- Postgres 数据库开箱可用，前端直连成本低
- 免费额度足够个人/情侣长期使用
- URL 参数（`?board=xxx`）天然可做“免登录分享板”
- 当前 `board_id` 使用更长随机串，降低穷举命中风险

## 2) 需要你先在 Supabase 做的初始化

### 2.1 建表 SQL（在 SQL Editor 执行）

```sql
create table if not exists public.couple_boards (
  board_id text primary key,
  start_date date not null,
  access_code_enabled boolean not null default false,
  access_code_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.checkins (
  board_id text not null,
  item_id int not null,
  title text not null,
  completed boolean not null default false,
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (board_id, item_id)
);

create table if not exists public.admin_users (
  username text primary key,
  password_hash text not null,
  must_change_password boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.board_sessions (
  session_token text primary key,
  board_id text not null references public.couple_boards(board_id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
```

如果你是从旧版本升级，请补字段：

```sql
alter table public.couple_boards add column if not exists access_code_enabled boolean not null default false;
alter table public.couple_boards add column if not exists access_code_hash text;
create table if not exists public.board_sessions (
  session_token text primary key,
  board_id text not null references public.couple_boards(board_id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
```

### 2.2 Row Level Security 与策略（免登录可读写）

> 说明：以下策略是“免登录即用”的极简策略，任何拿到 `board_id` 的人都可读写该板数据。  
> 如果后续要更安全，可以改成“邀请码 + 签名令牌 + 边缘函数”模式。

```sql
alter table public.couple_boards enable row level security;
alter table public.checkins enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "public read boards" on public.couple_boards;
drop policy if exists "public write boards" on public.couple_boards;
drop policy if exists "public read checkins" on public.checkins;
drop policy if exists "public write checkins" on public.checkins;
drop policy if exists "public read admin users" on public.admin_users;
drop policy if exists "public write admin users" on public.admin_users;

create policy "public read boards"
on public.couple_boards
for select
to anon
using (true);

create policy "public write boards"
on public.couple_boards
for all
to anon
using (true)
with check (true);

create policy "public read checkins"
on public.checkins
for select
to anon
using (true);

create policy "public write checkins"
on public.checkins
for all
to anon
using (true)
with check (true);

create policy "public read admin users"
on public.admin_users
for select
to anon
using (true);

create policy "public write admin users"
on public.admin_users
for all
to anon
using (true)
with check (true);
```

### 2.3 收紧到“仅函数可访问业务表”（推荐）

当你部署了 `supabase/functions` 里的函数后，执行以下 SQL，把用户业务表对前端 anon 直接访问全部关闭：

```sql
alter table public.couple_boards enable row level security;
alter table public.checkins enable row level security;
alter table public.board_sessions enable row level security;

drop policy if exists "public read boards" on public.couple_boards;
drop policy if exists "public write boards" on public.couple_boards;
drop policy if exists "public read checkins" on public.checkins;
drop policy if exists "public write checkins" on public.checkins;

create policy "deny anon boards select"
on public.couple_boards
for select to anon
using (false);

create policy "deny anon boards write"
on public.couple_boards
for all to anon
using (false)
with check (false);

create policy "deny anon checkins select"
on public.checkins
for select to anon
using (false);

create policy "deny anon checkins write"
on public.checkins
for all to anon
using (false)
with check (false);

create policy "deny anon sessions all"
on public.board_sessions
for all to anon
using (false)
with check (false);
```

## 2.4 部署 Edge Functions（B 方案）

本项目已内置函数模板目录：`supabase/functions/`

建议使用 Supabase CLI 执行（在项目根目录）：

```bash
supabase login
supabase link --project-ref <你的project-ref>
supabase functions deploy user_login_with_code
supabase functions deploy create_board_with_code
supabase functions deploy get_board_data
supabase functions deploy upsert_checkin
supabase functions deploy set_start_date
supabase functions deploy set_access_code
```

如果函数端开启了 JWT 校验，请在部署时关闭（本方案不走 Supabase Auth）：

```bash
supabase functions deploy user_login_with_code --no-verify-jwt
supabase functions deploy create_board_with_code --no-verify-jwt
supabase functions deploy get_board_data --no-verify-jwt
supabase functions deploy upsert_checkin --no-verify-jwt
supabase functions deploy set_start_date --no-verify-jwt
supabase functions deploy set_access_code --no-verify-jwt
```

> 函数使用 `SUPABASE_SERVICE_ROLE_KEY` 在服务端读写，前端只调用函数接口。

## 3) 本地启动

直接用任意静态服务打开页面，例如：

```bash
# 在当前目录
python -m http.server 8080
```

浏览器访问：

- 用户页：`http://localhost:8080/index.html`
- 管理员登录页：`http://localhost:8080/admin-login.html`
- 管理页：`http://localhost:8080/admin.html`（需登录后进入）

首次请先进入管理员登录页做配置与登录：

- Supabase URL
- Supabase ANON KEY

默认管理用户：

- 用户名：`y00416`
- 密码：`123456`
- 首次登录后必须修改密码

## 4) 部署到 GitHub Pages（推荐）

### 4.1 新建 GitHub 仓库并上传代码

把当前目录的 `index.html`、`admin-login.html`、`admin.html`、`README.md` 推到一个公开仓库（私有仓库也可，但公开更省心）。

### 4.2 开启 GitHub Pages

1. 进入仓库 `Settings` -> `Pages`  
2. `Build and deployment` 选择 `Deploy from a branch`  
3. Branch 选择 `main`（或你的默认分支）和 `/root`  
4. 保存后等待 1-2 分钟生成站点链接

### 4.3 访问与分享

部署后即为长期访问链接。每对情侣使用不同 `board` 参数即可隔离数据：

`https://你的域名/index.html?board=love-xxxxxxxx`

二维码本质就是这个 URL 的编码形式；扫码会打开对应 `board`，也就是对应你们自己的打卡板。

补充：页面会优先读取 URL 中的 `board` 参数；没有参数时才自动生成并写回地址栏。
补充：管理功能只在 `admin.html`，且必须先经 `admin-login.html` 登录；用户页不包含管理入口。

## 5) 安全与成本建议

- 当前方案主打“使用门槛低”：免登录，链接即用
- 如需更高隐私：可加口令验证、服务端签名令牌
- 因为已移除图片上传，后续成本主要来自数据库读写，通常很低
- 当前管理登录是前端直连数据库方案，适合个人轻量使用；若要强安全，建议后续改成服务端鉴权（Edge Function / 自建后端）
- 用户页支持“首次打开可选设置访问码”（可不设置）；建议对隐私要求较高的打卡板启用访问码
