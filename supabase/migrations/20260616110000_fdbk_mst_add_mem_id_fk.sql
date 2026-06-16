ALTER TABLE public.fdbk_mst
  ADD CONSTRAINT fdbk_mst_mem_id_fkey
  FOREIGN KEY (mem_id) REFERENCES public.mem_mst(mem_id);
