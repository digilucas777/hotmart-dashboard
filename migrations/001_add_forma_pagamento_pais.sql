-- Run this migration in your Supabase SQL Editor
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS forma_pagamento TEXT;
ALTER TABLE vendas ADD COLUMN IF NOT EXISTS pais TEXT;
