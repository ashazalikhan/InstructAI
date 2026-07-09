'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/src/utils/supabase/client'

export default function ProfilePage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setEmail(user.email || '');
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, last_name, phone')
            .eq('id', user.id)
            .single();

          if (profile) {
            setPhone(profile.phone || '');
            const fetchedFullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
            setFullName(fetchedFullName);
          }
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setIsFetching(false);
      }
    };
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const nameParts = fullName.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      await supabase
        .from('profiles')
        .update({ first_name: firstName, last_name: lastName, phone: phone })
        .eq('id', user.id);

      router.refresh();
      router.push('/tech/queue');
    } catch (error) {
      console.error('Error updating profile:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-24 text-gray-900 overflow-x-hidden flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-5 bg-gray-50/90 backdrop-blur-md">
        <button 
          onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-sm text-gray-600 hover:bg-gray-100 transition-colors touch-manipulation focus:outline-none"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight text-center flex-1">My Profile</h1>
        <div className="w-10"></div> {/* Spacer to perfectly center the title */}
      </header>

      <main className="px-6 mt-6 max-w-md mx-auto sm:max-w-xl w-full">
        <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 text-center">
          <form onSubmit={handleSave} className="space-y-6">
            
            <div className="flex flex-col items-center">
              <label htmlFor="fullName" className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 text-center">Full Name</label>
              <input
                id="fullName"
                type="text"
                disabled={isFetching}
                className="w-full px-5 py-4 bg-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 text-center font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all disabled:opacity-50"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
              />
            </div>

            <div className="flex flex-col items-center">
              <label htmlFor="phone" className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 text-center">Phone Number</label>
              <input
                id="phone"
                type="tel"
                disabled={isFetching}
                className="w-full px-5 py-4 bg-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 text-center font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all disabled:opacity-50"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter your phone number"
              />
            </div>

            <div className="flex flex-col items-center">
              <label htmlFor="email" className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 text-center">Email Address</label>
              <input
                id="email"
                type="email"
                disabled={isFetching}
                className="w-full px-5 py-4 bg-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 text-center font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all disabled:opacity-50"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className={`touch-manipulation w-full py-4 text-white font-bold rounded-full transition-all active:scale-95 shadow-lg ${
                  loading ? 'bg-indigo-400 shadow-none cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
                }`}
              >
                {loading ? 'Saving...' : 'Save Details'}
              </button>
            </div>

          </form>
        </div>
      </main>
    </div>
  )
}
