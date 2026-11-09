-- Allow users to delete their own notifications

CREATE POLICY "Users can delete their notifications" ON notifications
  FOR DELETE
  USING (auth.uid() = user_id);