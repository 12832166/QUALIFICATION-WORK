-- Create storage bucket for uploaded work versions.
-- Separate migration by request: does not modify the main schema file.

-- 1) Ensure bucket exists.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'work-files',
  'work-files',
  true,
  104857600,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) Allow authenticated users to upload files into this bucket.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'work_files_upload_authenticated'
  ) THEN
    CREATE POLICY work_files_upload_authenticated
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'work-files'
        AND owner = auth.uid()
      );
  END IF;
END;
$$;

-- 3) Let uploaders update/delete only their own files.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'work_files_update_own'
  ) THEN
    CREATE POLICY work_files_update_own
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'work-files'
        AND owner = auth.uid()
      )
      WITH CHECK (
        bucket_id = 'work-files'
        AND owner = auth.uid()
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'work_files_delete_own'
  ) THEN
    CREATE POLICY work_files_delete_own
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'work-files'
        AND owner = auth.uid()
      );
  END IF;
END;
$$;

-- 4) Optional read policy for authenticated users via Storage API.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'work_files_read_authenticated'
  ) THEN
    CREATE POLICY work_files_read_authenticated
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'work-files');
  END IF;
END;
$$;
