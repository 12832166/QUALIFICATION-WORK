-- Do not expose the original uploaded file name in the public guest catalogue.
-- Keep the existing return signature to avoid breaking API consumers.

CREATE OR REPLACE FUNCTION public.get_public_defended_works()
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
    NULL::TEXT AS file_name,
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
    SELECT vw.id
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
