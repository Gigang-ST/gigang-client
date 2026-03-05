-- Add provider-specific columns
ALTER TABLE member ADD COLUMN kakao_user_id uuid UNIQUE;
ALTER TABLE member ADD COLUMN google_user_id uuid UNIQUE;

-- Migrate existing auth_user_id to correct provider column
UPDATE member m
SET kakao_user_id = m.auth_user_id
FROM auth.identities i
WHERE i.user_id = m.auth_user_id AND i.provider = 'kakao';

UPDATE member m
SET google_user_id = m.auth_user_id
FROM auth.identities i
WHERE i.user_id = m.auth_user_id AND i.provider = 'google';
