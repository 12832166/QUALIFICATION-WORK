-- Allow dean to delete any qualification work

CREATE OR REPLACE FUNCTION delete_work_as_dean(
  p_work_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_dean() THEN
    RAISE EXCEPTION 'Only dean can delete works';
  END IF;

  DELETE FROM qualification_works
  WHERE id = p_work_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work not found';
  END IF;

  RETURN json_build_object('success', TRUE, 'work_id', p_work_id);
END;
$$;