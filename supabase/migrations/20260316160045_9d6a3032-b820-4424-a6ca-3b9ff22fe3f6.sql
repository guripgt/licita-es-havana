CREATE UNIQUE INDEX IF NOT EXISTS idx_public_processes_source_external_id 
ON public.public_processes (source, external_id) 
WHERE source IS NOT NULL AND external_id IS NOT NULL;