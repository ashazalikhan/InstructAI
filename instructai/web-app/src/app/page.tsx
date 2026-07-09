"use client";

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../utils/supabase/client'

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.push('/tech/queue')
      }
    }
    checkSession()
  }, [router, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    try {
      if (isLogin) {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password
        })
        
        if (authError) throw authError
        
        if (authData.user) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', authData.user.id)
            .single()
            
          if (profileError && profileError.code !== 'PGRST116') {
            throw profileError
          }
          
          if (profile?.role === 'admin') {
            router.push('/admin/dashboard')
          } else {
            router.push('/tech/queue')
          }
        } else {
          router.push('/tech/queue')
        }
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          phone
        })
        
        if (signUpError) throw signUpError
        
        if (data.user) {
          const { error: insertError } = await supabase
            .from('profiles')
            .insert([
              {
                id: data.user.id,
                email,
                first_name: firstName,
                last_name: lastName,
                phone,
                role: 'technician'
              }
            ])
            
          if (insertError) throw insertError
        }

        router.push('/tech/queue')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred during authentication'
      setErrorMsg(message)
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = () => {
    setIsLogin(!isLogin)
    setErrorMsg('')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 font-sans">
      <div className="w-full max-w-sm p-8 space-y-8 bg-white rounded-[40px] shadow-xl relative">
        
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 mb-6 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 18h.01"/><path d="M10 18h.01"/><path d="M16 18h.01"/><path d="M12 14v-4"/><path d="M8.5 7.5a4.99 4.99 0 0 1 7 0"/><path d="M6 4.5a8.99 8.99 0 0 1 12 0"/></svg>
          </div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight text-center">{isLogin ? 'Welcome' : 'Create Account'}</h2>
          <p className="text-gray-500 font-medium mt-2 text-center">
            {isLogin ? 'Enter your login credentials' : 'Sign up for a new account'}
          </p>
        </div>

        {errorMsg && (
          <div className="text-red-600 text-sm font-medium text-center bg-red-50 p-3 rounded-2xl">
            {errorMsg}
          </div>
        )}

        <form className="space-y-5" onSubmit={handleSubmit}>
          {isLogin ? (
            <>
              <div>
                <input
                  id="login-email"
                  name="login-email"
                  type="email"
                  required
                  autoComplete="username"
                  className="w-full px-4 py-4 bg-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 text-center font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                />
              </div>
              <div>
                <input
                  id="login-password"
                  name="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-4 bg-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 text-center font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-4">
                <input
                  id="register-firstName"
                  name="register-firstName"
                  type="text"
                  required
                  autoComplete="given-name"
                  className="w-full px-4 py-4 bg-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 text-center font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First Name"
                />
                <input
                  id="register-lastName"
                  name="register-lastName"
                  type="text"
                  required
                  autoComplete="family-name"
                  className="w-full px-4 py-4 bg-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 text-center font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last Name"
                />
              </div>

              <div>
                <input
                  id="register-email"
                  name="register-email"
                  type="email"
                  required
                  autoComplete="username"
                  className="w-full px-4 py-4 bg-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 text-center font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                />
              </div>
              
              <div>
                <input
                  id="register-phone"
                  name="register-phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  className="w-full px-4 py-4 bg-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 text-center font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number"
                />
              </div>

              <div>
                <input
                  id="register-password"
                  name="register-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  className="w-full px-4 py-4 bg-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 text-center font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`touch-manipulation w-full py-4 text-white font-bold rounded-full transition-all active:scale-95 shadow-lg ${
              loading ? 'bg-indigo-400 shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
            }`}
          >
            {loading ? (isLogin ? 'Authenticating...' : 'Registering...') : (isLogin ? 'Sign In' : 'Register')}
          </button>
        </form>

        <div className="text-center mt-6">
          <button
            type="button"
            onClick={toggleMode}
            className="text-sm text-indigo-600 font-bold hover:text-indigo-700 transition-colors bg-transparent border-none p-2 touch-manipulation"
          >
            {isLogin ? 'Need an account? Register here' : 'Already have an account? Login here'}
          </button>
        </div>

      </div>
    </div>
  )
}
