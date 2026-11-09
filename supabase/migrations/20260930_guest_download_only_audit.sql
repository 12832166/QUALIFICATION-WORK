-- Guest audit now records successful protected download responses only.
-- Opening a preview still receives a server timestamp/session watermark, but
-- it does not create a database row.

DELETE FROM public.guest_file_access
WHERE download_count = 0;

COMMENT ON TABLE public.guest_file_access IS
  'One row per protected guest download response. Preview openings are not persisted.';
COMMENT ON COLUMN public.guest_file_access.opened_at IS
  'Server opening time carried by the signed preview token and stored only if a download occurs.';
COMMENT ON COLUMN public.guest_file_access.open_ip IS
  'Deprecated. Preview IP addresses are no longer collected; new rows keep this column NULL.';
COMMENT ON COLUMN public.guest_file_access.download_count IS
  'Always 1 for new rows because every protected download is logged separately.';

DROP FUNCTION IF EXISTS public.record_guest_download(UUID, UUID, UUID, INET, TEXT);
