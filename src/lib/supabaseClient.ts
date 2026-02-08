
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 通常のクライアント（公開/認証済みユーザー用）
export const supabase = createClient(supabaseUrl, supabaseKey);

// 管理者権限クライアント（Service Role Keyがある場合のみ）
// 開発環境やビルド時にエラーにならないよう、キーがない場合はnullを返す
export const supabaseAdmin = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey)
    : null;
