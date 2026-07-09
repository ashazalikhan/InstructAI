import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname;

  // Protect admin and tech routes
  const isAdminRoute = pathname.startsWith('/admin')
  const isTechRoute = pathname.startsWith('/tech')

  if (isAdminRoute || isTechRoute) {
    if (!user) {
      // Redirect unauthenticated users to the login page
      return NextResponse.redirect(new URL('/', request.url))
    }

    // Fetch user role from profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = profile?.role || 'technician'

    // Route guards based on role
    if (isAdminRoute && role !== 'admin') {
      return NextResponse.redirect(new URL('/tech/queue', request.url))
    }

    if (isTechRoute && role !== 'technician') {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    }
  } else if (pathname === '/' && user) {
    // Redirect authenticated users away from the login page based on their role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = profile?.role || 'technician'

    if (role === 'admin') {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    } else {
      return NextResponse.redirect(new URL('/tech/queue', request.url))
    }
  }

  return supabaseResponse
}