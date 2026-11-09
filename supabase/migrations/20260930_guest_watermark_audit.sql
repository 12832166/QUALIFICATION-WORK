-- Dynamic guest watermarking and access audit.
-- Original work files are private after this migration and are only exposed to
-- guests as watermarked copies by the guest-files Edge Function.

CREATE TABLE public.guest_file_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  work_id UUID NOT NULL REFERENCES public.qualification_works(id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  first_downloaded_at TIMESTAMPTZ,
  last_downloaded_at TIMESTAMPTZ,
  download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  open_ip INET,
  download_ip INET,
  user_agent TEXT,
  referrer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

COMMENT ON TABLE public.guest_file_access IS
  'Audit log for guest openings and requested downloads of defended works.';
COMMENT ON COLUMN public.guest_file_access.download_count IS
  'Counts download responses requested from the server; it cannot prove that the browser saved the file to disk.';

CREATE INDEX idx_guest_file_access_session_id
  ON public.guest_file_access(session_id);
CREATE INDEX idx_guest_file_access_work_id_opened_at
  ON public.guest_file_access(work_id, opened_at DESC);
CREATE INDEX idx_guest_file_access_last_downloaded_at
  ON public.guest_file_access(last_downloaded_at DESC)
  WHERE last_downloaded_at IS NOT NULL;

ALTER TABLE public.guest_file_access ENABLE ROW LEVEL SECURITY;

-- Only deans may inspect the audit table through the regular API. The Edge
-- Function writes through the service role, which bypasses RLS.
CREATE POLICY guest_file_access_dean_read
  ON public.guest_file_access
  FOR SELECT
  TO authenticated
  USING (public.is_dean());

REVOKE ALL ON TABLE public.guest_file_access FROM anon;
GRANT SELECT ON TABLE public.guest_file_access TO authenticated;

CREATE TRIGGER set_guest_file_access_updated_at
  BEFORE UPDATE ON public.guest_file_access
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Atomic audit update used only by the Edge Function.
CREATE OR REPLACE FUNCTION public.record_guest_download(
  p_access_id UUID,
  p_session_id UUID,
  p_work_id UUID,
  p_ip INET,
  p_user_agent TEXT
)
RETURNS SETOF public.guest_file_access
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.guest_file_access
  SET
    first_downloaded_at = COALESCE(first_downloaded_at, clock_timestamp()),
    last_downloaded_at = clock_timestamp(),
    download_count = download_count + 1,
    download_ip = p_ip,
    user_agent = COALESCE(NULLIF(p_user_agent, ''), user_agent),
    updated_at = clock_timestamp()
  WHERE id = p_access_id
    AND session_id = p_session_id
    AND work_id = p_work_id
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.record_guest_download(UUID, UUID, UUID, INET, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_guest_download(UUID, UUID, UUID, INET, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.record_guest_download(UUID, UUID, UUID, INET, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_guest_download(UUID, UUID, UUID, INET, TEXT) TO service_role;

-- The public catalogue exposes metadata only. Direct Storage URLs are no
-- longer returned to anonymous clients.
DROP FUNCTION IF EXISTS public.get_public_defended_works();

CREATE FUNCTION public.get_public_defended_works()
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  work_type TEXT,
  student_name TEXT,
  advisor_name TEXT,
  reviewer_name TEXT,
  file_name TEXT,
  has_file BOOLEAN,
  defense_date DATE,
  defense_time TIME,
  defense_location TEXT,
  final_score NUMERIC,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    w.id,
    w.title,
    w.description,
    w.work_type::TEXT,
    s.full_name AS student_name,
    a.full_name AS advisor_name,
    r.full_name AS reviewer_name,
    lv.file_name,
    (lv.id IS NOT NULL) AS has_file,
    w.defense_date,
    w.defense_time,
    w.defense_location,
    w.final_score,
    w.created_at
  FROM public.qualification_works w
  JOIN public.users s ON s.id = w.student_id
  LEFT JOIN public.users a ON a.id = w.advisor_id
  LEFT JOIN public.users r ON r.id = w.reviewer_id
  LEFT JOIN LATERAL (
    SELECT vw.id, vw.file_name
    FROM public.work_versions vw
    WHERE vw.work_id = w.id
    ORDER BY vw.version_number DESC, vw.created_at DESC
    LIMIT 1
  ) lv ON TRUE
  WHERE w.status = 'defense_completed'
  ORDER BY COALESCE(w.defense_date, CURRENT_DATE) DESC, w.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_defended_works() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_defended_works() TO authenticated;

-- Existing URLs remain in work_versions for backwards compatibility, but the
-- bucket itself becomes private. New versions store a bucket-relative path.
UPDATE storage.buckets
SET public = FALSE
WHERE id = 'work-files';
