-- Restrict chat access to advisor and student only
-- and stop adding system chat messages for commission scores.

DROP POLICY IF EXISTS "Work participants can read messages" ON work_messages;
DROP POLICY IF EXISTS "Work participants can write messages" ON work_messages;

CREATE POLICY "Advisor and student can read messages" ON work_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM qualification_works w
      WHERE w.id = work_messages.work_id
        AND (w.student_id = auth.uid() OR w.advisor_id = auth.uid())
    )
  );

CREATE POLICY "Advisor and student can write messages" ON work_messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1
      FROM qualification_works w
      WHERE w.id = work_messages.work_id
        AND (w.student_id = auth.uid() OR w.advisor_id = auth.uid())
    )
  );

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
