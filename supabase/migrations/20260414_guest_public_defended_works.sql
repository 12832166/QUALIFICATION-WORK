-- Public guest access to defended works (read-only, limited fields)

CREATE OR REPLACE FUNCTION get_public_defended_works()
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  work_type TEXT,
  student_name TEXT,
  advisor_name TEXT,
  reviewer_name TEXT,
  file_name TEXT,
  file_url TEXT,
  defense_date DATE,
  defense_time TIME,
  defense_location TEXT,
  final_score NUMERIC,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
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
    lv.file_url,
    w.defense_date,
    w.defense_time,
    w.defense_location,
    w.final_score,
    w.created_at
  FROM qualification_works w
  JOIN users s ON s.id = w.student_id
  LEFT JOIN users a ON a.id = w.advisor_id
  LEFT JOIN users r ON r.id = w.reviewer_id
  LEFT JOIN LATERAL (
    SELECT vw.file_name, vw.file_url
    FROM work_versions vw
    WHERE vw.work_id = w.id
    ORDER BY vw.version_number DESC, vw.created_at DESC
    LIMIT 1
  ) lv ON TRUE
  WHERE w.status = 'defense_completed'
  ORDER BY COALESCE(w.defense_date, CURRENT_DATE) DESC, w.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_public_defended_works() TO anon;
GRANT EXECUTE ON FUNCTION get_public_defended_works() TO authenticated;
