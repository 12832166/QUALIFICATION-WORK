-- Qualification Works Repository - Unified workflow schema
-- Single migration that resets the old structure and creates the full workflow.

-- ============================================================================
-- DROP EVERYTHING (complete reset) - Order matters!
-- ============================================================================

-- Drop trigger first (before the function it depends on)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop tables (with CASCADE to drop dependent objects)
DROP TABLE IF EXISTS defense_scores CASCADE;
DROP TABLE IF EXISTS work_commission_members CASCADE;
DROP TABLE IF EXISTS work_reviews CASCADE;
DROP TABLE IF EXISTS work_messages CASCADE;
DROP TABLE IF EXISTS work_versions CASCADE;
DROP TABLE IF EXISTS qualification_works CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop all functions by signature (not just name) to remove all versions
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS current_user_role() CASCADE;
DROP FUNCTION IF EXISTS is_dean() CASCADE;
DROP FUNCTION IF EXISTS can_access_work(UUID) CASCADE;
DROP FUNCTION IF EXISTS recalculate_work_score(UUID) CASCADE;
DROP FUNCTION IF EXISTS assign_advisor_to_student(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS submit_work_request(TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS submit_work_version(UUID, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS send_work_message(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS assign_reviewer_to_work(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS submit_work_review(UUID, TEXT, TEXT, NUMERIC) CASCADE;
DROP FUNCTION IF EXISTS schedule_defense(UUID, DATE, TEXT) CASCADE;
DROP FUNCTION IF EXISTS assign_commission_member(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS submit_defense_score(UUID, NUMERIC, TEXT) CASCADE;

-- ============================================================================
-- TABLES
-- ============================================================================

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'dean')),
  advisor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE qualification_works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  advisor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  work_type TEXT NOT NULL CHECK (work_type IN ('coursework', 'diploma')),
  status TEXT NOT NULL DEFAULT 'awaiting_advisor' CHECK (
    status IN (
      'draft',
      'awaiting_advisor',
      'advisor_assigned',
      'in_progress',
      'ready_for_review',
      'under_review',
      'revision_required',
      'approved_for_defense',
      'defense_scheduled',
      'defense_completed',
      'archived'
    )
  ),
  submitted_at TIMESTAMPTZ,
  advisor_assigned_at TIMESTAMPTZ,
  reviewer_assigned_at TIMESTAMPTZ,
  defense_date DATE,
  defense_location TEXT,
  final_score NUMERIC(5,2),
  final_decision TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE work_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES qualification_works(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  notes TEXT,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (work_id, version_number)
);

CREATE TABLE work_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES qualification_works(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE work_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES qualification_works(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('revision_required', 'approved')),
  feedback TEXT NOT NULL,
  score NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE work_commission_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES qualification_works(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (work_id, teacher_id)
);

CREATE TABLE defense_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES qualification_works(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (work_id, teacher_id)
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  related_work_id UUID REFERENCES qualification_works(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_advisor_id ON users(advisor_id);
CREATE INDEX idx_qualification_works_student_id ON qualification_works(student_id);
CREATE INDEX idx_qualification_works_advisor_id ON qualification_works(advisor_id);
CREATE INDEX idx_qualification_works_reviewer_id ON qualification_works(reviewer_id);
CREATE INDEX idx_qualification_works_status ON qualification_works(status);
CREATE INDEX idx_work_versions_work_id ON work_versions(work_id);
CREATE INDEX idx_work_messages_work_id ON work_messages(work_id);
CREATE INDEX idx_work_reviews_work_id ON work_reviews(work_id);
CREATE INDEX idx_work_commission_members_work_id ON work_commission_members(work_id);
CREATE INDEX idx_defense_scores_work_id ON defense_scores(work_id);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);

-- ============================================================================
-- HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.users WHERE id = auth.uid()),
    NULLIF(auth.jwt() -> 'user_metadata' ->> 'role', ''),
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'role', '')
  );
$$;

CREATE OR REPLACE FUNCTION is_dean()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT current_user_role() = 'dean';
$$;

CREATE OR REPLACE FUNCTION can_access_work(p_work_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM qualification_works w
    WHERE w.id = p_work_id
      AND (
        w.student_id = auth.uid()
        OR w.advisor_id = auth.uid()
        OR w.reviewer_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM work_commission_members cm
          WHERE cm.work_id = w.id
            AND cm.teacher_id = auth.uid()
        )
        OR is_dean()
      )
  );
$$;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE qualification_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_commission_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE defense_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read users" ON users
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can read works they are related to" ON qualification_works
  FOR SELECT
  USING (
    auth.uid() = student_id
    OR auth.uid() = advisor_id
    OR auth.uid() = reviewer_id
    OR EXISTS (
      SELECT 1
      FROM work_commission_members cm
      WHERE cm.work_id = qualification_works.id
        AND cm.teacher_id = auth.uid()
    )
    OR is_dean()
  );

CREATE POLICY "Students can create their own work requests" ON qualification_works
  FOR INSERT
  WITH CHECK (auth.uid() = student_id AND current_user_role() = 'student');

CREATE POLICY "Students, advisors and dean can update works they manage" ON qualification_works
  FOR UPDATE
  USING (
    auth.uid() = student_id
    OR auth.uid() = advisor_id
    OR auth.uid() = reviewer_id
    OR is_dean()
  )
  WITH CHECK (
    auth.uid() = student_id
    OR auth.uid() = advisor_id
    OR auth.uid() = reviewer_id
    OR is_dean()
  );

CREATE POLICY "Work participants can read versions" ON work_versions
  FOR SELECT
  USING (can_access_work(work_id));

CREATE POLICY "Work participants can add versions" ON work_versions
  FOR INSERT
  WITH CHECK (
    auth.uid() = uploaded_by
    AND can_access_work(work_id)
    AND current_user_role() IN ('student', 'teacher')
  );

CREATE POLICY "Uploaders and dean can update versions" ON work_versions
  FOR UPDATE
  USING (auth.uid() = uploaded_by OR is_dean())
  WITH CHECK (auth.uid() = uploaded_by OR is_dean());

CREATE POLICY "Work participants can read messages" ON work_messages
  FOR SELECT
  USING (can_access_work(work_id));

CREATE POLICY "Work participants can write messages" ON work_messages
  FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND can_access_work(work_id));

CREATE POLICY "Work participants can read reviews" ON work_reviews
  FOR SELECT
  USING (can_access_work(work_id));

CREATE POLICY "Teachers and dean can add reviews" ON work_reviews
  FOR INSERT
  WITH CHECK (
    auth.uid() = reviewer_id
    AND current_user_role() = 'teacher'
    AND can_access_work(work_id)
  );

CREATE POLICY "Review authors and dean can update reviews" ON work_reviews
  FOR UPDATE
  USING (auth.uid() = reviewer_id OR is_dean())
  WITH CHECK (auth.uid() = reviewer_id OR is_dean());

CREATE POLICY "Work participants can read commission members" ON work_commission_members
  FOR SELECT
  USING (can_access_work(work_id));

CREATE POLICY "Dean can manage commission members" ON work_commission_members
  FOR INSERT
  WITH CHECK (is_dean());

CREATE POLICY "Dean can update commission members" ON work_commission_members
  FOR UPDATE
  USING (is_dean())
  WITH CHECK (is_dean());

CREATE POLICY "Dean can delete commission members" ON work_commission_members
  FOR DELETE
  USING (is_dean());

CREATE POLICY "Work participants can read defense scores" ON defense_scores
  FOR SELECT
  USING (can_access_work(work_id));

CREATE POLICY "Commission members and dean can add defense scores" ON defense_scores
  FOR INSERT
  WITH CHECK (
    auth.uid() = teacher_id
    AND (
      is_dean()
      OR EXISTS (
        SELECT 1
        FROM work_commission_members cm
        WHERE cm.work_id = defense_scores.work_id
          AND cm.teacher_id = auth.uid()
      )
    )
  );

CREATE POLICY "Score authors and dean can update defense scores" ON defense_scores
  FOR UPDATE
  USING (auth.uid() = teacher_id OR is_dean())
  WITH CHECK (auth.uid() = teacher_id OR is_dean());

CREATE POLICY "Users can read their notifications" ON notifications
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can create notifications" ON notifications
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their notifications" ON notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_qualification_works_updated_at
  BEFORE UPDATE ON qualification_works
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_work_versions_updated_at
  BEFORE UPDATE ON work_versions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_work_messages_updated_at
  BEFORE UPDATE ON work_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_work_reviews_updated_at
  BEFORE UPDATE ON work_reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_defense_scores_updated_at
  BEFORE UPDATE ON defense_scores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- RPC FUNCTIONS
-- ============================================================================

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

  UPDATE users
  SET advisor_id = p_advisor_id,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_student_id;

  UPDATE qualification_works
  SET advisor_id = p_advisor_id,
      advisor_assigned_at = COALESCE(advisor_assigned_at, CURRENT_TIMESTAMP),
      status = CASE
        WHEN status IN ('draft', 'awaiting_advisor') THEN 'advisor_assigned'
        ELSE status
      END,
      updated_at = CURRENT_TIMESTAMP
  WHERE student_id = p_student_id;

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
    'updated_works', v_updated_works
  );
END;
$$;

CREATE OR REPLACE FUNCTION submit_work_request(
  p_title TEXT,
  p_work_type TEXT,
  p_description TEXT
)
RETURNS qualification_works
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_work qualification_works;
BEGIN
  IF current_user_role() <> 'student' THEN
    RAISE EXCEPTION 'Only students can submit work requests';
  END IF;

  INSERT INTO qualification_works (
    student_id,
    title,
    description,
    work_type,
    status,
    submitted_at
  ) VALUES (
    auth.uid(),
    p_title,
    p_description,
    p_work_type,
    'awaiting_advisor',
    CURRENT_TIMESTAMP
  )
  RETURNING * INTO v_work;

  RETURN v_work;
END;
$$;

CREATE OR REPLACE FUNCTION submit_work_version(
  p_work_id UUID,
  p_file_name TEXT,
  p_file_url TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS work_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version work_versions;
  v_next_version INTEGER;
BEGIN
  IF NOT can_access_work(p_work_id) THEN
    RAISE EXCEPTION 'You do not have access to this work';
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_next_version
  FROM work_versions
  WHERE work_id = p_work_id;

  INSERT INTO work_versions (
    work_id,
    version_number,
    file_name,
    file_url,
    notes,
    uploaded_by
  ) VALUES (
    p_work_id,
    v_next_version,
    p_file_name,
    p_file_url,
    p_notes,
    auth.uid()
  )
  RETURNING * INTO v_version;

  UPDATE qualification_works
  SET status = CASE
        WHEN status IN ('awaiting_advisor', 'advisor_assigned', 'revision_required') THEN 'in_progress'
        ELSE status
      END,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_work_id;

  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION send_work_message(
  p_work_id UUID,
  p_content TEXT
)
RETURNS work_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message work_messages;
BEGIN
  IF NOT can_access_work(p_work_id) THEN
    RAISE EXCEPTION 'You do not have access to this work';
  END IF;

  INSERT INTO work_messages (work_id, sender_id, content)
  VALUES (p_work_id, auth.uid(), p_content)
  RETURNING * INTO v_message;

  RETURN v_message;
END;
$$;

CREATE OR REPLACE FUNCTION assign_reviewer_to_work(
  p_work_id UUID,
  p_reviewer_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_dean() THEN
    RAISE EXCEPTION 'Only dean can assign reviewers';
  END IF;

  UPDATE qualification_works
  SET reviewer_id = p_reviewer_id,
      reviewer_assigned_at = CURRENT_TIMESTAMP,
      status = 'under_review',
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_work_id;

  INSERT INTO notifications (user_id, type, title, message, related_work_id)
  VALUES (
    p_reviewer_id,
    'review_assignment',
    'Призначено рецензування',
    'Вам призначено рецензування кваліфікаційної роботи.',
    p_work_id
  );

  RETURN json_build_object('success', TRUE, 'work_id', p_work_id, 'reviewer_id', p_reviewer_id);
END;
$$;

CREATE OR REPLACE FUNCTION submit_work_review(
  p_work_id UUID,
  p_decision TEXT,
  p_feedback TEXT,
  p_score NUMERIC DEFAULT NULL
)
RETURNS work_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review work_reviews;
  v_new_status TEXT;
BEGIN
  IF current_user_role() NOT IN ('teacher', 'dean') THEN
    RAISE EXCEPTION 'Only teachers or dean can submit reviews';
  END IF;

  IF NOT can_access_work(p_work_id) THEN
    RAISE EXCEPTION 'You do not have access to this work';
  END IF;

  IF p_decision = 'approved' THEN
    v_new_status := 'approved_for_defense';
  ELSE
    v_new_status := 'revision_required';
  END IF;

  INSERT INTO work_reviews (
    work_id,
    reviewer_id,
    decision,
    feedback,
    score
  ) VALUES (
    p_work_id,
    auth.uid(),
    p_decision,
    p_feedback,
    p_score
  )
  RETURNING * INTO v_review;

  UPDATE qualification_works
  SET status = v_new_status,
      final_decision = p_decision,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_work_id;

  RETURN v_review;
END;
$$;

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

CREATE OR REPLACE FUNCTION assign_commission_member(
  p_work_id UUID,
  p_teacher_id UUID
)
RETURNS work_commission_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member work_commission_members;
BEGIN
  IF NOT is_dean() THEN
    RAISE EXCEPTION 'Only dean can assign commission members';
  END IF;

  INSERT INTO work_commission_members (work_id, teacher_id)
  VALUES (p_work_id, p_teacher_id)
  ON CONFLICT (work_id, teacher_id) DO NOTHING
  RETURNING * INTO v_member;

  RETURN v_member;
END;
$$;

CREATE OR REPLACE FUNCTION recalculate_work_score(
  p_work_id UUID
)
RETURNS qualification_works
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_average NUMERIC(5,2);
  v_total_members INTEGER;
  v_scored_members INTEGER;
  v_work qualification_works;
BEGIN
  SELECT ROUND(AVG(score)::NUMERIC, 2), COUNT(*)
  INTO v_average, v_scored_members
  FROM defense_scores
  WHERE work_id = p_work_id;

  SELECT COUNT(*)
  INTO v_total_members
  FROM work_commission_members
  WHERE work_id = p_work_id;

  UPDATE qualification_works
  SET final_score = v_average,
      status = CASE
        WHEN v_total_members > 0 AND v_scored_members >= v_total_members THEN 'defense_completed'
        ELSE status
      END,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_work_id
  RETURNING * INTO v_work;

  RETURN v_work;
END;
$$;

CREATE OR REPLACE FUNCTION submit_defense_score(
  p_work_id UUID,
  p_score NUMERIC,
  p_comment TEXT DEFAULT NULL
)
RETURNS defense_scores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score defense_scores;
BEGIN
  IF current_user_role() NOT IN ('teacher', 'dean') THEN
    RAISE EXCEPTION 'Only teachers or dean can submit defense scores';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM work_commission_members cm
    WHERE cm.work_id = p_work_id
      AND cm.teacher_id = auth.uid()
  ) AND NOT is_dean() THEN
    RAISE EXCEPTION 'You are not assigned to this commission';
  END IF;

  INSERT INTO defense_scores (work_id, teacher_id, score, comment)
  VALUES (p_work_id, auth.uid(), p_score, p_comment)
  ON CONFLICT (work_id, teacher_id) DO UPDATE
    SET score = EXCLUDED.score,
        comment = EXCLUDED.comment,
        updated_at = CURRENT_TIMESTAMP
  RETURNING * INTO v_score;

  PERFORM recalculate_work_score(p_work_id);

  RETURN v_score;
END;
$$;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
