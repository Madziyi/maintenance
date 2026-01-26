import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BuildingData } from '../../../types';
import { Search } from 'lucide-react';

type Props = {
  data: BuildingData[];
};

export const EquipmentReviewHome: React.FC<Props> = ({ data }) => {
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const buildings = useMemo(() => {
    const all = [...data].sort((a, b) => a.name.localeCompare(b.name));
    const query = q.trim().toLowerCase();
    if (!query) return all;
    return all.filter(b => b.code.toLowerCase().includes(query) || b.name.toLowerCase().includes(query));
  }, [data, q]);

  return (
    <div className="relative space-y-6 pb-20 animate-fade-in">
      {/* Mobile: block this feature */}
      <div className="md:hidden fixed inset-0 z-50 flex items-center justify-center p-6 bg-white/60 backdrop-blur-sm">
        <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-xl p-6 text-center">
          <div className="text-lg font-semibold text-slate-900">Equipment Review</div>
          <div className="text-sm text-slate-600 mt-2">
            Please use a desktop or tablet to use this feature.
          </div>
          <button
            onClick={() => navigate('/')}
            className="mt-5 w-full px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium"
          >
            Go to Dashboard
          </button>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Equipment Review</h1>
          <p className="text-slate-500 text-sm mt-1">Confirm and clean up equipment details.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => navigate('/equipment-review/latest')}
          className="text-left bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:border-slate-300 transition-colors"
        >
          <div className="font-semibold text-slate-900">Latest 50 needs review</div>
          <div className="text-sm text-slate-500 mt-1">Across all buildings. Toggle sort by created vs updated.</div>
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="font-semibold text-slate-900">Review by building</div>
          <div className="text-sm text-slate-500 mt-1">Pick a building to review its needs-review queue.</div>
          <div className="mt-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search buildings…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm"
              />
            </div>
            <div className="mt-3 max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
              {buildings.map(b => (
                <button
                  key={b.code}
                  onClick={() => navigate(`/equipment-review/building/${encodeURIComponent(b.code)}`)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-slate-900 text-sm truncate">{b.name}</div>
                    <div className="text-xs font-mono text-slate-500">{b.code}</div>
                  </div>
                </button>
              ))}
              {buildings.length === 0 && (
                <div className="px-3 py-6 text-sm text-slate-500 text-center">No buildings match.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

