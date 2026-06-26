'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/src/utils/supabase/client'

export default function ProfileDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()

  const handleLogout = async () => {
    setIsOpen(false)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.refresh()
    router.push('/')
  }

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 hover:bg-indigo-200 transition-colors shadow-sm focus:outline-none"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
          <button 
            onClick={() => {
              setIsOpen(false)
              router.push('/tech/profile')
            }}
            className="w-full text-left px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors border-b border-gray-100"
          >
            Edit Profile
          </button>
          <button 
            onClick={handleLogout}
            className="w-full text-left px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  )
}
