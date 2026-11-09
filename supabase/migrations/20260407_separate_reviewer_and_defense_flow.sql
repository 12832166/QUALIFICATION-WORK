-- Separate reviewer assignment from defense scheduling in workflow rules
-- Defense can be scheduled only after review approval stage.

CREATE OR REPLACE FUNCTION schedule_defense(
  p_work_id UUID,
  p_defense_date DATE,
  p_location TEXT
)
RETURNS qualification_works
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_work qualification_works;
BEGIN
  IF NOT is_dean() THEN
    RAISE EXCEPTION 'Only dean can schedule defense';
  END IF;

  SELECT *
  INTO v_work
  FROM qualification_works
  WHERE id = p_work_id;

  IF v_work.id IS NULL THEN
    RAISE EXCEPTION 'Work not found';
  END IF;

  IF v_work.reviewer_id IS NULL THEN
    RAISE EXCEPTION 'Reviewer must be assigned before scheduling defense';
  END IF;

  IF v_work.status NOT IN ('approved_for_defense', 'defense_scheduled') THEN
    RAISE EXCEPTION 'Defense can be scheduled only after work is approved for defense';
  END IF;

  UPDATE qualification_works
  SET defense_date = p_defense_date,
      defense_location = p_location,
      status = 'defense_scheduled',
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_work_id
  RETURNING * INTO v_work;

  RETURN v_work;
END;
$$;
