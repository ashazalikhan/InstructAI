'use client'

import { useState } from 'react'
import Link from 'next/link'

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

export default function RecentActivityClient({ activeWork, unassignedJobs, claimJob }: { activeWork: any[], unassignedJobs: any[], claimJob: any }) {
  const [activeTab, setActiveTab] = useState('All')

  // Combine jobs for the queue
  const queueActive = activeWork || []
  const queuePending = unassignedJobs || []
  
  const allJobs = [
    ...queueActive.map(job => ({ ...job, _type: 'active' })),
    ...queuePending.map(job => ({ ...job, _type: 'pending' }))
  ]

  const filteredJobs = allJobs.filter(job => {
    if (activeTab === 'All') return true
    if (activeTab === 'Pending') return job.status?.toLowerCase() === 'pending' || job._type === 'pending'
    if (activeTab === 'Completed') return job.status?.toLowerCase() === 'completed'
    return false
  })

  return (
    <>
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Activity</h2>
        <div className="flex overflow-x-auto gap-2 pb-2 hide-scrollbar -mx-6 px-6">
          {['All', 'Pending', 'Completed'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 px-5 py-2 rounded-full text-sm font-semibold shadow-md transition-colors ${
                activeTab === tab 
                  ? 'bg-gray-900 text-white' 
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        {filteredJobs.length === 0 ? (
          <div className="bg-white p-6 rounded-3xl border border-gray-100 text-center shadow-sm">
            <p className="text-gray-400">No jobs found in this category.</p>
          </div>
        ) : (
          filteredJobs.map(job => {
            const isPending = job._type === 'pending' || job.status?.toLowerCase() === 'pending';
            return (
              <div key={job.id} className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 flex flex-col gap-4 relative group hover:border-indigo-200 transition-colors">
                <Link href={`/tech/audit/${job.id}`} className="absolute inset-0 z-0 rounded-3xl"></Link>
                
                {/* Top Row: Icon & Address */}
                <div className="flex items-start gap-3 z-10 pointer-events-none">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${isPending ? 'bg-gray-50 text-gray-400' : 'bg-indigo-50 text-indigo-500'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <h3 className="font-bold text-gray-900 leading-tight line-clamp-3">{job.address}</h3>
                    <p className="text-xs text-gray-500 font-mono mt-1">ID: {job.id.substring(0,8)}</p>
                  </div>
                </div>
                
                {/* Bottom Row: Badges & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 z-10 pt-3 border-t border-gray-50">
                  <div className="flex flex-wrap items-center gap-2">
                    {getJobTypeBadge(job.job_type)}
                    <span className={`px-3 py-1 text-[10px] font-bold rounded-full uppercase tracking-wide ${isPending ? 'bg-indigo-50 text-indigo-600' : (job.status?.toLowerCase() === 'completed' ? 'bg-green-100 text-green-800' : 'bg-green-50 text-green-600')}`}>
                      {isPending ? 'Pending' : (job.status?.toLowerCase() === 'completed' ? 'Completed' : 'In Progress')}
                    </span>
                  </div>
                  
                  {isPending && (
                    <div className="flex items-center gap-2 relative z-20 w-full sm:w-auto">
                      <form action={claimJob.bind(null, job.id)} className="flex-1 sm:flex-initial">
                        <button type="submit" className="w-full text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 py-2.5 rounded-full shadow-sm active:scale-95 transition-transform">Claim</button>
                      </form>
                      <Link href={`/tech/audit/${job.id}`} className="flex-1 sm:flex-initial">
                        <button className="w-full text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 rounded-full shadow-sm active:scale-95 transition-transform">Start Audit</button>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </section>
    </>
  )
}
