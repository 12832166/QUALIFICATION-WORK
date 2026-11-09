-- Separate reviewer review from advisor feedback
-- and add chat timeline system events for uploads and scores.

ALTER TABLE work_reviews
  ADD COLUMN IF NOT EXISTS review_type TEXT;

UPDATE work_reviews
SET review_type = 'reviewer_review'
WHERE review_type IS NULL;

ALTER TABLE work_reviews
  ALTER COLUMN review_type SET DEFAULT 'reviewer_review';

ALTER TABLE work_reviews
  ALTER COLUMN review_type SET NOT NULL;

ALTER TABLE work_reviews
  DROP CONSTRAINT IF EXISTS work_reviews_review_type_check;

ALTER TABLE work_reviews
  ADD CONSTRAINT work_reviews_review_type_check
  CHECK (review_type IN ('reviewer_review', 'advisor_feedback'));

DROP POLICY IF EXISTS "Teachers and dean can add reviews" ON work_reviews;

CREATE POLICY "Only assigned teacher can add own review entries" ON work_reviews
  FOR INSERT
  WITH CHECK (
    auth.uid() = reviewer_id
    AND current_user_role() = 'teacher'
    AND can_access_work(work_id)
    AND (
      (
        review_type = 'reviewer_review'
        AND EXISTS (
          SELECT 1
          FROM qualification_works w
          WHERE w.id = work_reviews.work_id
            AND w.reviewer_id = auth.uid()
        )
      )
      OR
      (
        review_type = 'advisor_feedback'
        AND EXISTS (
          SELECT 1
          FROM qualification_works w
          WHERE w.id = work_reviews.work_id
            AND w.advisor_id = auth.uid()
        )
      )
    )
  );

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

  INSERT INTO work_messages (work_id, sender_id, content)
  VALUES (
    p_work_id,
    auth.uid(),
    '[SYSTEM] Додано нову версію файлу: ' || p_file_name || ' (v' || v_next_version || ')'
  );

  RETURN v_version;
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
  IF current_user_role() <> 'teacher' THEN
    RAISE EXCEPTION 'Only teachers can submit reviews';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM qualification_works w
    WHERE w.id = p_work_id
      AND w.reviewer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only assigned reviewer can submit review';
  END IF;

  IF p_decision = 'approved' THEN
    v_new_status := 'approved_for_defense';
  ELSE
    v_new_status := 'revision_required';
  END IF;

  INSERT INTO work_reviews (
    work_id,
    reviewer_id,
    review_type,
    decision,
    feedback,
    score
  ) VALUES (
    p_work_id,
    auth.uid(),
    'reviewer_review',
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

  INSERT INTO work_messages (work_id, sender_id, content)
  VALUES (
    p_work_id,
    auth.uid(),
    '[SYSTEM] Рецензент залишив рецензію: '
      || CASE WHEN p_decision = 'approved' THEN 'допущено до захисту' ELSE 'потрібне доопрацювання' END
      || CASE WHEN p_score IS NOT NULL THEN '. Оцінка рецензента: ' || p_score::TEXT ELSE '' END
  );

  RETURN v_review;
END;
$$;

CREATE OR REPLACE FUNCTION submit_advisor_feedback(
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
  v_feedback work_reviews;
  v_new_status TEXT;
BEGIN
  IF current_user_role() <> 'teacher' THEN
    RAISE EXCEPTION 'Only teachers can submit advisor feedback';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM qualification_works w
    WHERE w.id = p_work_id
      AND w.advisor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only assigned advisor can submit advisor feedback';
  END IF;

  IF p_decision = 'approved' THEN
    v_new_status := 'ready_for_review';
  ELSE
    v_new_status := 'revision_required';
  END IF;

  INSERT INTO work_reviews (
    work_id,
    reviewer_id,
    review_type,
    decision,
    feedback,
    score
  ) VALUES (
    p_work_id,
    auth.uid(),
    'advisor_feedback',
    p_decision,
    p_feedback,
    p_score
  )
  RETURNING * INTO v_feedback;

  UPDATE qualification_works
  SET status = v_new_status,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_work_id;

  INSERT INTO work_messages (work_id, sender_id, content)
  VALUES (
    p_work_id,
    auth.uid(),
    '[SYSTEM] Керівник залишив відгук: '
      || CASE WHEN p_decision = 'approved' THEN 'роботу передано на рецензування' ELSE 'потрібне доопрацювання' END
      || CASE WHEN p_score IS NOT NULL THEN '. Оцінка керівника: ' || p_score::TEXT ELSE '' END
  );

  RETURN v_feedback;
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

  INSERT INTO work_messages (work_id, sender_id, content)
  VALUES (
    p_work_id,
    auth.uid(),
    '[SYSTEM] Член комісії виставив бал: ' || p_score::TEXT || COALESCE('. Коментар: ' || p_comment, '')
  );

  RETURN v_score;
END;
$$;
