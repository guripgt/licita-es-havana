
-- 1. Companies
create table public.companies (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  cnpj text unique not null,
  email text,
  created_at timestamptz default now()
);

-- 2. Profiles
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  company_id uuid references public.companies(id),
  full_name text,
  email text,
  role text default 'user',
  created_at timestamptz default now()
);

-- 3. Public Processes (mock of external APIs)
create table public.public_processes (
  id uuid default gen_random_uuid() primary key,
  external_id text,
  source text,
  title text not null,
  object_description text,
  agency text,
  government_level text,
  modality text,
  estimated_value numeric(15,2),
  is_srp boolean default false,
  state char(2),
  city text,
  publication_date date,
  opening_date date,
  closing_date timestamptz,
  status text,
  source_portal text,
  external_url text,
  created_at timestamptz default now()
);

-- 4. Saved Processes (company funnel)
create table public.saved_processes (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references public.companies(id) on delete cascade not null,
  public_process_id uuid references public.public_processes(id) not null,
  funnel_stage text default 'Encontrado',
  is_favorite boolean default false,
  notes text,
  created_at timestamptz default now()
);

-- 5. Company Documents
create table public.company_documents (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references public.companies(id) on delete cascade not null,
  name text not null,
  category text,
  expiry_date date,
  file_url text,
  notes text,
  created_at timestamptz default now()
);

-- 6. Process Documents
create table public.process_documents (
  id uuid default gen_random_uuid() primary key,
  saved_process_id uuid references public.saved_processes(id) on delete cascade not null,
  company_document_id uuid references public.company_documents(id) not null,
  created_at timestamptz default now()
);

-- RLS
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.public_processes enable row level security;
alter table public.saved_processes enable row level security;
alter table public.company_documents enable row level security;
alter table public.process_documents enable row level security;

-- Security definer function to get user's company_id
create or replace function public.get_user_company_id(_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = _user_id
$$;

-- Profiles: user sees own profile
create policy "Users can view own profile" on public.profiles
  for select using (id = auth.uid());

create policy "Users can update own profile" on public.profiles
  for update using (id = auth.uid());

-- Companies: user sees own company
create policy "Users can view own company" on public.companies
  for select using (id = public.get_user_company_id(auth.uid()));

create policy "Users can update own company" on public.companies
  for update using (id = public.get_user_company_id(auth.uid()));

-- Public processes: everyone authenticated can read
create policy "Authenticated can read public_processes" on public.public_processes
  for select to authenticated using (true);

-- Saved processes: company scoped
create policy "Company scoped saved_processes" on public.saved_processes
  for all using (company_id = public.get_user_company_id(auth.uid()));

-- Company documents: company scoped
create policy "Company scoped company_documents" on public.company_documents
  for all using (company_id = public.get_user_company_id(auth.uid()));

-- Process documents: via saved_processes company scope
create policy "Company scoped process_documents" on public.process_documents
  for all using (
    saved_process_id in (
      select id from public.saved_processes
      where company_id = public.get_user_company_id(auth.uid())
    )
  );

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Storage bucket for company documents
insert into storage.buckets (id, name, public) values ('company-documents', 'company-documents', false);

-- Storage RLS
create policy "Users can upload to their company folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'company-documents' and (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text);

create policy "Users can view their company files" on storage.objects
  for select to authenticated
  using (bucket_id = 'company-documents' and (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text);

create policy "Users can delete their company files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'company-documents' and (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text);
