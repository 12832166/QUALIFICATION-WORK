-- Assign advisor to a specific work (supports multiple works per student)

CREATE OR REPLACE FUNCTION assign_advisor_to_work(
  p_work_id UUID,
  p_advisor_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_work qualification_works;
  v_advisor_role TEXT;
BEGIN
  IF NOT is_dean() THEN
    RAISE EXCEPTION 'Only dean can assign advisors';
  END IF;

  SELECT * INTO v_work
  FROM qualification_works
  WHERE id = p_work_id;

  IF v_work.id IS NULL THEN
    RAISE EXCEPTION 'Work not found';
  END IF;

  IF COALESCE(v_work.theme_status, 'pending') <> 'approved' THEN
    RAISE EXCEPTION 'Work theme must be approved before assigning an advisor';
  END IF;

  SELECT role INTO v_advisor_role
  FROM users
  WHERE id = p_advisor_id;

  IF v_advisor_role IS NULL OR v_advisor_role <> 'teacher' THEN
    RAISE EXCEPTION 'Advisor (teacher) not found';
  END IF;

  UPDATE qualification_works
  SET advisor_id = p_advisor_id,
      advisor_assigned_at = COALESCE(advisor_assigned_at, CURRENT_TIMESTAMP),
      status = CASE
        WHEN status IN ('draft', 'awaiting_advisor') THEN 'advisor_assigned'
        ELSE status
      END,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_work_id;

  UPDATE users
  SET advisor_id = p_advisor_id,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = v_work.student_id;

  INSERT INTO notifications (user_id, type, title, message, related_work_id)
  VALUES (
    v_work.student_id,
    'assignment',
    'Призначено наукового керівника',
    'Деканат призначив наукового керівника для вашої роботи.',
    p_work_id
  );

  INSERT INTO notifications (user_id, type, title, message, related_work_id)
  VALUES (
    p_advisor_id,
    'assignment',
    'Нова робота студента',
    'Вас призначено науковим керівником нової роботи.',
    p_work_id
  );

  RETURN json_build_object(
    'success', TRUE,
    'work_id', p_work_id,
    'student_id', v_work.student_id,
    'advisor_id', p_advisor_id
  );
END;
$$;