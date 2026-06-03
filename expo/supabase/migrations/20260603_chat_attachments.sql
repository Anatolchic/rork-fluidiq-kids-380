-- Bucket для прикреплений чата (используем существующие file_url + file_name)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-attachments', 'chat-attachments', true, 26214400,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf',
        'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain'])
ON CONFLICT (id) DO UPDATE SET public=true, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS ca_authenticated_upload ON storage.objects;
CREATE POLICY ca_authenticated_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

DROP POLICY IF EXISTS ca_public_read ON storage.objects;
CREATE POLICY ca_public_read ON storage.objects FOR SELECT TO authenticated, anon
  USING (bucket_id = 'chat-attachments');

DROP POLICY IF EXISTS ca_owner_delete ON storage.objects;
CREATE POLICY ca_owner_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-attachments' AND owner = auth.uid()::text);

SELECT 'ok' AS done;
