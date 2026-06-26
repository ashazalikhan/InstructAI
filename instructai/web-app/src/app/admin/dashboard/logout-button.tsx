'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/src/utils/supabase/client'

export default function LogoutButton() {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="px-4 py-2 text-sm font-medium text-white bg-slate-700 rounded hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500 transition-colors"
    >
      Logout
    </button>
  )
}
