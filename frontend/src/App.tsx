import React from 'react';
import GsmPage from './pages/GsmPage';
import { Toaster } from 'react-hot-toast';
import { Radio, ShieldCheck } from 'lucide-react';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 antialiased selection:bg-red-500 selection:text-white font-sans">
      <Toaster 
        position="top-right" 
        toastOptions={{
          style: {
            background: '#ffffff',
            color: '#0f172a',
            border: '1px solid #e2e8f0',
            borderRadius: '0.75rem',
            fontSize: '0.875rem',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)'
          }
        }} 
      />

      {/* ─── Top Brand Header / Label Title ─── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            
            {/* Title & Badge */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-red-600 to-rose-600 flex items-center justify-center text-white shadow-sm shadow-red-500/20">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-extrabold tracking-tight text-slate-900 uppercase">
                    GSM ATTACHMENT MODULE
                  </h1>
                  <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-red-50 text-red-700 border border-red-200">
                    Standalone Localhost
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 hidden sm:block font-medium">
                  GoIP Hardware Gateway &amp; 3-Stage Automated Appointment Reminder Subsystem
                </p>
              </div>
            </div>

            {/* Quick Info */}
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 border border-slate-200">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[11px]">GoIP Driver Active</span>
              </div>
            </div>

          </div>
        </div>
      </header>

      {/* ─── Main Content / GsmPage ─── */}
      <main className="py-2">
        <GsmPage />
      </main>
    </div>
  );
}
