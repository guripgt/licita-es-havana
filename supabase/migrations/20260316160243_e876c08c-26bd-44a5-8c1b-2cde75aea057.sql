CREATE POLICY "Authenticated can insert public_processes"
ON public.public_processes
FOR INSERT
TO authenticated
WITH CHECK (true);