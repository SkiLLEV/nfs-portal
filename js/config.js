// js/config.js
const SUPABASE_URL = 'https://obeavooabtzadlcmybel.supabase.co';
const SUPABASE_KEY = 'sb_publishable_qLmZZzwjyqF6ZO8BCoKj2A_a9oHPA2z';

// Глобальный клиент Supabase для всего приложения
export const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
