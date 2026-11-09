-- Student academic groups and group-based commission assignment

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS academic_group TEXT;

CREATE INDEX IF NOT EXISTS idx_users_academic_group ON users(academic_group);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, academic_group)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    NULLIF(NEW.raw_user_meta_data->>'academic_group', '')
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION assign_commission_to_group(
  p_academic_group TEXT,
  p_teacher_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_role TEXT;
  v_assigned_count INTEGER;
BEGIN
  IF NOT is_dean() THEN
    RAISE EXCEPTION 'Only dean can assign commission members';
  END IF;

  IF p_academic_group IS NULL OR btrim(p_academic_group) = '' THEN
    RAISE EXCEPTION 'Academic group is required';
  END IF;

  SELECT role INTO v_teacher_role
  FROM users
  WHERE id = p_teacher_id;

  IF v_teacher_role IS NULL OR v_teacher_role <> 'teacher' THEN
    RAISE EXCEPTION 'Teacher not found';
  END IF;

  WITH target_works AS (
    SELECT w.id
    FROM qualification_works w
    JOIN users s ON s.id = w.student_id
    WHERE s.academic_group = btrim(p_academic_group)
      AND w.status IN ('approved_for_defense', 'defense_scheduled')
  ), inserted_rows AS (
    INSERT INTO work_commission_members (work_id, teacher_id)
    SELECT tw.id, p_teacher_id
    FROM target_works tw
    ON CONFLICT (work_id, teacher_id) DO NOTHING
    RETURNING work_id
  )
  SELECT COUNT(*) INTO v_assigned_count
  FROM inserted_rows;

  RETURN json_build_object(
    'success', TRUE,
    'academic_group', btrim(p_academic_group),
    'teacher_id', p_teacher_id,
    'assigned_works', v_assigned_count
  );
END;
$$;