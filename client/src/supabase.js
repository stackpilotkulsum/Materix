import { createClient } from '@supabase/supabase-js'

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const getSupabaseRefFromKey = (key) => {
  try {
    const payload = JSON.parse(window.atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.ref || null
  } catch (error) {
    console.warn('Unable to read Supabase anon key project ref:', error)
    return null
  }
}

const normalizeSupabaseUrl = (url, key) => {
  const keyRef = getSupabaseRefFromKey(key)
  const configuredUrl = (url || '').replace(/\/+$/, '')

  if (!keyRef) {
    return configuredUrl
  }

  const keyUrl = `https://${keyRef}.supabase.co`
  if (!configuredUrl || !configuredUrl.includes(keyRef)) {
    console.warn(`Supabase URL/key mismatch. Using anon key project URL: ${keyUrl}`)
    return keyUrl
  }

  return configuredUrl
}

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL, supabaseAnonKey)

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing in .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
