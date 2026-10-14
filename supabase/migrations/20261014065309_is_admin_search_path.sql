-- Security advisor: a SECURITY-relevant function should pin its search_path.
alter function public.is_admin() set search_path = '';
