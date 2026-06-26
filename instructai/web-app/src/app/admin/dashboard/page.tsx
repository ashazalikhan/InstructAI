"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/src/utils/supabase/client'
import LogoutButton from './logout-button'

export default function AdminDashboard() {
  const [jobType, setJobType] = useState('Setup')
  const [routerModel, setRouterModel] = useState('TP-Link Archer AX73 (Wi-Fi 6)')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [jobs, setJobs] = useState<any[]>([])
  const router = useRouter()
  const supabase = createClient()

  const fetchJobs = async () => {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (data) {
      setJobs(data)
    }
  }

  useEffect(() => {
    fetchJobs()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSuccessMessage('')
    setErrorMessage('')

    try {
      const finalAddress = addressLine2.trim() ? `${addressLine1}, ${addressLine2}` : addressLine1;

      const { error } = await supabase
        .from('jobs')
        .insert({
          job_type: jobType,
          router_model: routerModel,
          address: finalAddress,
          status: 'Pending'
        })

      if (error) {
        throw error
      }

      setJobType('Setup')
      setRouterModel('TP-Link Archer AX73 (Wi-Fi 6)')
      setAddressLine1('')
      setAddressLine2('')
      setSuccessMessage('Job dispatched successfully!')
      
      // Refresh real-time table
      await fetchJobs()
      router.refresh()
      
      setTimeout(() => {
        setSuccessMessage('')
      }, 5000)

    } catch (err: any) {
      console.error("Error dispatching job:", err)
      setErrorMessage(err.message || 'An error occurred while dispatching the job.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* Dashboard Header - Full Width */}
      <header className="w-full bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-8 py-5 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Admin Dashboard</h1>
          <LogoutButton />
        </div>
      </header>

      {/* Main Container - Desktop First */}
      <main className="max-w-5xl mx-auto p-8">
        
        {/* Panel Design */}
        <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-8 md:p-10">
          <div className="mb-8 border-b border-gray-100 pb-6">
            <h2 className="text-xl font-bold text-gray-900">Dispatch New Job</h2>
            <p className="text-sm text-gray-500 mt-1 font-medium">Assign new router installations and configuration tasks to the technician queue.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            
            {/* Grid Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Dropdowns Stacked */}
              <div className="flex flex-col gap-4">
                <div>
                  <label htmlFor="jobType" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Job Type
                  </label>
                  <select
                    id="jobType"
                    required
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1.2rem center', backgroundSize: '1.2em' }}
                  >
                    <option value="Setup">Setup</option>
                    <option value="Diagnostic">Diagnostic</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="routerModel" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Router Model
                  </label>
                  <select
                  id="routerModel"
                  required
                  value={routerModel}
                  onChange={(e) => setRouterModel(e.target.value)}
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1.2rem center', backgroundSize: '1.2em' }}
                >
                  <option value="TP-Link Archer AX73 (Wi-Fi 6)">TP-Link Archer AX73 (Wi-Fi 6)</option>
                  <option value="TP-Link Archer AX23 (Wi-Fi 6)">TP-Link Archer AX23 (Wi-Fi 6)</option>
                  <option value="TP-Link Archer C6 AC1200">TP-Link Archer C6 AC1200</option>
                  <option value="D-Link DIR-825 AC1200">D-Link DIR-825 AC1200</option>
                  <option value="D-Link Eagle Pro AI M15">D-Link Eagle Pro AI M15</option>
                  <option value="Netgear Nighthawk AX12">Netgear Nighthawk AX12</option>
                  <option value="Tenda AC10 AC1200">Tenda AC10 AC1200</option>
                  <option value="JioFiber Home Gateway">JioFiber Home Gateway</option>
                  <option value="Airtel Xstream Digital Gateway">Airtel Xstream Digital Gateway</option>
                </select>
                </div>
              </div>

              {/* Address Inputs Stacked */}
              <div className="flex flex-col gap-4">
                <div>
                  <label htmlFor="addressLine1" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Address Line 1
                  </label>
                  <input
                    id="addressLine1"
                    type="text"
                    required
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                  />
                </div>
                <div>
                  <label htmlFor="addressLine2" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Address Line 2 (Optional)
                  </label>
                  <input
                    id="addressLine2"
                    type="text"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Submit Button aligned right */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-10 py-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-70 text-white font-bold rounded-xl transition-all shadow-md shadow-indigo-200 touch-manipulation"
              >
                {isSubmitting ? 'Dispatching...' : 'Dispatch Job'}
              </button>
            </div>
          </form>

          {successMessage && (
            <div className="mt-8 p-4 bg-green-50 text-green-700 border border-green-100 rounded-xl text-sm font-semibold flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="mt-8 p-4 bg-red-50 text-red-700 border border-red-100 rounded-xl text-sm font-medium flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {errorMessage}
            </div>
          )}
        </div>

        {/* Live Tracking Table */}
        <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-6 mt-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6 px-2">Live Job Tracking</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Address</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Router Model</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Dispatched At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-4 text-sm font-medium text-gray-900">{job.address}</td>
                    <td className="px-4 py-4 text-sm text-gray-600">{job.router_model}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide
                        ${job.status?.toLowerCase() === 'pending' ? 'bg-gray-100 text-gray-800' :
                          job.status?.toLowerCase() === 'in-progress' || job.status?.toLowerCase() === 'in progress' ? 'bg-blue-100 text-blue-800' :
                          job.status?.toLowerCase() === 'completed' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-600'
                        }
                      `}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500 whitespace-nowrap">
                      {new Date(job.created_at).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                      No jobs have been dispatched yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  )
}
