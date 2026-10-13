CREATE TABLE IF NOT EXISTS public.partner_application_documents (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL CHECK (length(trim(phone)) BETWEEN 8 AND 30),
  city text NOT NULL CHECK (length(trim(city)) BETWEEN 2 AND 120),
  state text NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  office_name text,
  crc_document_path text NOT NULL,
  identity_document_path text NOT NULL,
  address_document_path text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_application_documents ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.partner_application_documents TO authenticated;

DROP POLICY IF EXISTS "Partner applicants can read their own documents" ON public.partner_application_documents;
CREATE POLICY "Partner applicants can read their own documents"
ON public.partner_application_documents FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Partner applicants can submit their own documents" ON public.partner_application_documents;
CREATE POLICY "Partner applicants can submit their own documents"
ON public.partner_application_documents FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.partner_requests AS pr
    WHERE pr.user_id = (SELECT auth.uid())
      AND pr.status <> 'rejected'
  )
);

DROP POLICY IF EXISTS "Partner applicants can update their own documents" ON public.partner_application_documents;
CREATE POLICY "Partner applicants can update their own documents"
ON public.partner_application_documents FOR UPDATE TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  AND EXISTS (
    SELECT 1
    FROM public.partner_requests AS pr
    WHERE pr.user_id = (SELECT auth.uid())
      AND pr.status = 'rejected'
  )
)
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND EXISTS (
    SELECT 1
    FROM public.partner_requests AS pr
    WHERE pr.user_id = (SELECT auth.uid())
      AND pr.status = 'rejected'
  )
);

DROP POLICY IF EXISTS "Administrators can review partner documents" ON public.partner_application_documents;
CREATE POLICY "Administrators can review partner documents"
ON public.partner_application_documents FOR SELECT TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'partner-application-documents',
  'partner-application-documents',
  false,
  10485760,
  ARRAY[
      'application/pdf',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

DROP POLICY IF EXISTS "Applicants upload their own partner documents" ON storage.objects;
CREATE POLICY "Applicants upload their own partner documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'partner-application-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND (
    (lower(name) LIKE '%.pdf' AND COALESCE(metadata->>'mimetype', '') = 'application/pdf')
    OR (lower(name) LIKE '%.csv' AND COALESCE(metadata->>'mimetype', '') = 'text/csv')
    OR (lower(name) LIKE '%.xls' AND COALESCE(metadata->>'mimetype', '') = 'application/vnd.ms-excel')
    OR (lower(name) LIKE '%.xlsx' AND COALESCE(metadata->>'mimetype', '') = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.partner_requests AS pr
    WHERE pr.user_id = (SELECT auth.uid())
      AND pr.status <> 'rejected'
  )
);

DROP POLICY IF EXISTS "Applicants and administrators read partner documents" ON storage.objects;
CREATE POLICY "Applicants and administrators read partner documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'partner-application-documents'
  AND (
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  )
);
