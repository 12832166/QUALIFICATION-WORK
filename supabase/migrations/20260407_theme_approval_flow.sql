-- Theme approval flow for dean
-- Adds explicit theme moderation and enforces advisor assignment only after approval.

ALTER TABLE qualification_works
  ADD COLUMN IF NOT EXISTS theme_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (theme_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS theme_decision_comment TEXT,
  ADD COLUMN IF NOT EXISTS theme_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS theme_decided_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_qualification_works_theme_status
  ON qualification_works(theme_status);

CREATE OR REPLACE FUNCTION decide_work_theme(
  p_work_id UUID,
  p_decision TEXT,
  p_comment TEXT DEFAULT NULL
)
RETURNS qualification_works
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_work qualification_works;
  v_new_status TEXT;
BEGIN
  IF NOT is_dean() THEN
    RAISE EXCEPTION 'Only dean can approve or reject themes';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Theme decision must be approved or rejected';
  END IF;

  IF p_decision = 'approved' THEN
    v_new_status := 'awaiting_advisor';
  ELSE
    v_new_status := 'revision_required';
  END IF;

  UPDATE qualification_works
  SET theme_status = p_decision,
      theme_decision_comment = NULLIF(TRIM(COALESCE(p_comment, '')), ''),
      theme_decided_at = CURRENT_TIMESTAMP,
      theme_decided_by = auth.uid(),
      status = CASE
        WHEN status IN ('draft', 'awaiting_advisor', 'advisor_assigned', 'in_progress', 'ready_for_review') THEN v_new_status
        ELSE status
      END,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_work_id
  RETURNING * INTO v_work;

  IF v_work.id IS NULL THEN
    RAISE EXCEPTION 'Work not found';
  END IF;

  INSERT INTO notifications (user_id, type, title, message, related_work_id)
  VALUES (
    v_work.student_id,
    'theme_decision',
    CASE WHEN p_decision = 'approved' THEN 'Тему погоджено' ELSE 'Тему відхилено' END,
    CASE
      WHEN p_decision = 'approved' THEN 'Деканат погодив тему. Можна переходити до призначення керівника.'
      ELSE COALESCE(NULLIF(TRIM(COALESCE(p_comment, '')), ''), 'Деканат відхилив тему. Оновіть тему і подайте повторно.')
    END,
    v_work.id
  );

  RETURN v_work;
END;
$$;

CREATE OR REPLACE FUNCTION assign_advisor_to_student(
  p_student_id UUID,
  p_advisor_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_role TEXT;
  v_advisor_role TEXT;
  v_approved_themes INTEGER;
  v_updated_works INTEGER;
BEGIN
  IF NOT is_dean() THEN
    RAISE EXCEPTION 'Only dean can assign advisors';
  END IF;

  SELECT role INTO v_student_role FROM users WHERE id = p_student_id;
  SELECT role INTO v_advisor_role FROM users WHERE id = p_advisor_id;

  IF v_student_role IS NULL OR v_student_role <> 'student' THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  IF v_advisor_role IS NULL OR v_advisor_role <> 'teacher' THEN
    RAISE EXCEPTION 'Advisor (teacher) not found';
  END IF;

  SELECT COUNT(*) INTO v_approved_themes
  FROM qualification_works
  WHERE student_id = p_student_id
    AND theme_status = 'approved';

  IF v_approved_themes = 0 THEN
    RAISE EXCEPTION 'Cannot assign advisor: no approved theme for this student';
  END IF;

  UPDATE users
  SET advisor_id = p_advisor_id,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_student_id;

  UPDATE qualification_works
  SET advisor_id = p_advisor_id,
      advisor_assigned_at = COALESCE(advisor_assigned_at, CURRENT_TIMESTAMP),
      status = CASE
        WHEN status IN ('draft', 'awaiting_advisor', 'revision_required') THEN 'advisor_assigned'
        ELSE status
      END,
      updated_at = CURRENT_TIMESTAMP
  WHERE student_id = p_student_id
    AND theme_status = 'approved';

  GET DIAGNOSTICS v_updated_works = ROW_COUNT;

  INSERT INTO notifications (user_id, type, title, message)
  VALUES (
    p_student_id,
    'assignment',
    'Призначено наукового керівника',
    'Деканат призначив вам наукового керівника.'
  );

  INSERT INTO notifications (user_id, type, title, message)
  VALUES (
    p_advisor_id,
    'assignment',
    'Новий студент',
    'Вас призначено науковим керівником студента.'
  );

  RETURN json_build_object(
    'success', TRUE,
    'student_id', p_student_id,
    'advisor_id', p_advisor_id,
    'approved_themes', v_approved_themes,
    'updated_works', v_updated_works
  );
END;
$$;
