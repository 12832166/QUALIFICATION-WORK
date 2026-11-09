-- Add group-based defense scheduling for entire academic groups

CREATE OR REPLACE FUNCTION schedule_defense_for_group(
  p_academic_group TEXT,
  p_defense_date DATE,
  p_defense_time TIME,
  p_location TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  IF NOT is_dean() THEN
    RAISE EXCEPTION 'Only dean can schedule defense';
  END IF;

  IF p_academic_group IS NULL OR btrim(p_academic_group) = '' THEN
    RAISE EXCEPTION 'Academic group is required';
  END IF;

  IF p_defense_date IS NULL THEN
    RAISE EXCEPTION 'Defense date is required';
  END IF;

  IF p_location IS NULL OR btrim(p_location) = '' THEN
    RAISE EXCEPTION 'Defense location is required';
  END IF;

  -- Update all works in the group that are ready for defense
  UPDATE qualification_works
  SET defense_date = p_defense_date,
      defense_time = p_defense_time,
      defense_location = p_location,
      status = 'defense_scheduled',
      updated_at = CURRENT_TIMESTAMP
  WHERE student_id IN (
    SELECT id FROM users
    WHERE role = 'student' AND academic_group = btrim(p_academic_group)
  )
  AND status IN ('approved_for_defense', 'defense_scheduled');

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN json_build_object(
    'success', TRUE,
    'academic_group', btrim(p_academic_group),
    'defense_date', p_defense_date,
    'defense_time', p_defense_time,
    'defense_location', p_location,
    'updated_works', v_updated_count
  );
END;
$$;
