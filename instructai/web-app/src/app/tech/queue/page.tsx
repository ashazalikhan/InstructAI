export const dynamic = 'force-dynamic';

import { createClient } from '@/src/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import LogoutButton from '../../admin/dashboard/logout-button'
import Link from 'next/link'
import ProfileDropdown from './ProfileDropdown'
import RecentActivityClient from './RecentActivityClient'

function getJobTypeBadge(job_type: string | undefined | null) {
  const type = job_type || 'Setup';
  if (type === 'Diagnostic') {
    return (
      <span className="px-2 py-1 text-[10px] uppercase font-bold rounded-md border bg-amber-50 text-amber-700 border-amber-100">
        Diagnostic
      </span>
    );
  }
  return (
    <span className="px-2 py-1 text-[10px] uppercase font-bold rounded-md border bg-blue-50 text-blue-700 border-blue-100">
      Setup
    </span>
  );
}

export default async function TechQueue() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const currentUserId = user?.id;

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', currentUserId)
    .single();

  const technicianName = profile?.first_name && profile?.last_name
    ? `${profile.first_name} ${profile.last_name}`
    : 'Technician';

  // 1. Data Fetching
  const { data: unassignedJobs } = await supabase
    .from('jobs')
    .select('*')
    .is('assigned_tech_id', null)
    .order('created_at', { ascending: false })

  const { data: activeWork } = await supabase
    .from('jobs')
    .select('*')
    .eq('assigned_tech_id', currentUserId)
    .order('created_at', { ascending: false })

  // 2. The Claim Action (Server Action)
  async function claimJob(jobId: string) {
    'use server'
    console.log('Claiming job:', jobId)

    const supabase = await createClient()

    if (!jobId) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('jobs')
      .update({
        assigned_tech_id: user.id,
        status: 'in-progress'
      })
      .eq('id', jobId)
      .is('assigned_tech_id', null) // Prevent race conditions

    if (error) {
      console.error('Supabase Error:', error)
      return
    }

    revalidatePath('/tech/queue')
    revalidatePath('/admin/dashboard')
  }

  // 3. The UI (Mobile-First Design)
  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-24 text-gray-900 overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-5 bg-gray-50/90 backdrop-blur-md">
        <div className="w-10"></div> {/* Spacer for centering */}
        <h1 className="text-xl font-bold text-gray-900 tracking-tight text-center flex-1">{technicianName}</h1>
        <div className="w-10 flex justify-end">
          <ProfileDropdown />
        </div>
      </header>

      <main className="px-6 space-y-8 max-w-md mx-auto">
        
        {/* Priority Audits (Horizontal Cards) */}
        <section>
          <div className="flex justify-between items-end mb-4">
            <h2 className="text-xl font-bold text-gray-900">Priority Audits</h2>
          </div>
          <div className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory hide-scrollbar -mx-6 px-6">
            {(() => {
              const priorityJobs = activeWork ? activeWork.filter(job => job.status?.toLowerCase() !== 'completed') : [];
              return priorityJobs.length > 0 ? (
                priorityJobs.slice(0, 2).map((job) => (
                  <Link key={job.id} href={`/tech/audit/${job.id}`} className="shrink-0 w-72 bg-indigo-100 rounded-3xl p-6 snap-center relative overflow-hidden shadow-sm flex flex-col justify-between min-h-[160px] transition-transform active:scale-95">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm text-indigo-600">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 18h.01"/><path d="M10 18h.01"/><path d="M16 18h.01"/><path d="M12 14v-4"/><path d="M8.5 7.5a4.99 4.99 0 0 1 7 0"/><path d="M6 4.5a8.99 8.99 0 0 1 12 0"/></svg>
                      </div>
                      <span className="px-3 py-1 bg-white/60 text-indigo-800 text-xs font-bold rounded-full backdrop-blur-sm">Active</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg leading-tight mb-1 truncate">{job.address}</h3>
                      <p className="text-sm text-indigo-600/80 font-medium truncate mb-2">{job.router_model}</p>
                      {getJobTypeBadge(job.job_type)}
                    </div>
                  </Link>
                ))
              ) : (
                <div className="w-full shrink-0 bg-indigo-50 rounded-3xl p-6 text-center text-indigo-400">
                  <p>No priority audits assigned.</p>
                </div>
              );
            })()}
          </div>
        </section>

        {/* Filter Pills & Recent Activity */}
        {(() => {
          const priorityJobs = activeWork ? activeWork.filter(job => job.status?.toLowerCase() !== 'completed').slice(0, 2) : [];
          const priorityJobIds = new Set(priorityJobs.map(j => j.id));
          const recentActiveWork = activeWork ? activeWork.filter(job => !priorityJobIds.has(job.id)) : [];
          return <RecentActivityClient activeWork={recentActiveWork} unassignedJobs={unassignedJobs || []} claimJob={claimJob} />;
        })()}

      </main>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-100 px-6 py-3 pb-safe flex justify-center items-center shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-40">
        <button className="flex flex-col items-center gap-1 text-indigo-600 w-16">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
          <span className="text-[10px] font-semibold">Audits</span>
        </button>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @supports (padding-bottom: env(safe-area-inset-bottom)) {
          .pb-safe {
            padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
          }
        }
      `}} />
    </div>
  )
}