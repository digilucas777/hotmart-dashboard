ALTER TABLE projetos ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
UPDATE projetos SET user_id = (SELECT id FROM auth.users LIMIT 1) WHERE user_id IS NULL;
