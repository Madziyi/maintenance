import React, { useState, useEffect, useRef } from 'react';
import { Plus, Pencil, Trash2, Check, X, UserCircle2, Lock, LockOpen } from 'lucide-react';
import { api } from '../../../api';
import type { Staff } from '../../../types';

interface Props {
  canEdit: boolean;
}

interface StaffForm {
  name: string;
  employeeNumber: string;
  craft: string;
}

const emptyForm: StaffForm = { name: '', employeeNumber: '', craft: '' };

export const StaffManager: React.FC<Props> = ({ canEdit }) => {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [savingId, setSavingId] = useState<string | null>(null);

  // PIN management
  const [pinModalId, setPinModalId] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getStaff()
      .then(setStaff)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load staff'))
      .finally(() => setLoading(false));
  }, []);

  // ── Add ──────────────────────────────────────────────────────────────────────

  const startAdding = () => {
    setForm(emptyForm);
    setEditingId(null);
    setIsAdding(true);
  };

  const cancelAdding = () => {
    setIsAdding(false);
    setForm(emptyForm);
  };

  const saveNew = async () => {
    if (!form.name.trim()) return;
    setSavingId('new');
    try {
      const created = await api.createStaff({
        name: form.name.trim(),
        employeeNumber: form.employeeNumber.trim() || null as unknown as string,
        craft: form.craft.trim() || null as unknown as string,
      });
      setStaff(prev => [created, ...prev]);
      setIsAdding(false);
      setForm(emptyForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create staff member');
    } finally {
      setSavingId(null);
    }
  };

  // ── Edit ─────────────────────────────────────────────────────────────────────

  const startEditing = (member: Staff) => {
    setIsAdding(false);
    setEditingId(member.id);
    setForm({
      name: member.name,
      employeeNumber: member.employeeNumber ?? '',
      craft: member.craft ?? '',
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const saveEdit = async (id: string) => {
    if (!form.name.trim()) return;
    setSavingId(id);
    try {
      const updated = await api.updateStaff(id, {
        name: form.name.trim(),
        employeeNumber: form.employeeNumber.trim() || null,
        craft: form.craft.trim() || null,
      });
      setStaff(prev => prev.map(s => (s.id === id ? updated : s)));
      setEditingId(null);
      setForm(emptyForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update staff member');
    } finally {
      setSavingId(null);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = async (member: Staff) => {
    if (!window.confirm(`Delete staff member "${member.name}"? This cannot be undone.`)) return;
    setSavingId(member.id);
    try {
      await api.deleteStaff(member.id);
      setStaff(prev => prev.filter(s => s.id !== member.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete staff member');
    } finally {
      setSavingId(null);
    }
  };

  // ── PIN ──────────────────────────────────────────────────────────────────────

  const openPinModal = (id: string) => {
    setPinModalId(id);
    setPinInput('');
    setPinError(null);
    setTimeout(() => pinInputRef.current?.focus(), 50);
  };

  const savePin = async (id: string, pin: string | null) => {
    if (pin && !/^\d{5}$/.test(pin)) {
      setPinError('PIN must be exactly 5 digits');
      return;
    }
    setPinSaving(true);
    setPinError(null);
    try {
      const updated = await api.setStaffPin(id, pin);
      setStaff(prev => prev.map(s => s.id === id ? updated : s));
      setPinModalId(null);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Failed to save PIN');
    } finally {
      setPinSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Staff Directory</h1>
        {canEdit && (
          <button
            onClick={startAdding}
            disabled={isAdding}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={15} />
            Add Staff Member
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="animate-pulse divide-y divide-slate-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-3">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="h-4 bg-slate-100 rounded flex-1" />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="px-4 py-3 font-medium text-slate-600">Name</th>
                <th className="px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Employee #</th>
                <th className="px-4 py-3 font-medium text-slate-600">Craft</th>
                <th className="px-4 py-3 font-medium text-slate-600">Status</th>
                {canEdit && <th className="px-4 py-3 font-medium text-slate-600 text-center">PIN</th>}
                {canEdit && <th className="px-4 py-3 font-medium text-slate-600 w-24">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Add row */}
              {isAdding && (
                <tr className="bg-indigo-50">
                  <td className="px-4 py-2">
                    <input
                      autoFocus
                      type="text"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Full name"
                      className="w-full px-2 py-1 border border-indigo-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={form.employeeNumber}
                      onChange={e => setForm(f => ({ ...f, employeeNumber: e.target.value }))}
                      placeholder="e.g. 834"
                      className="w-full px-2 py-1 border border-indigo-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={form.craft}
                      onChange={e => setForm(f => ({ ...f, craft: e.target.value }))}
                      placeholder="e.g. ENG"
                      className="w-full px-2 py-1 border border-indigo-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                    />
                  </td>
                  <td className="px-4 py-2 text-slate-400 text-xs">Active</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={saveNew}
                        disabled={!form.name.trim() || savingId === 'new'}
                        title="Save"
                        className="p-1.5 rounded hover:bg-green-100 text-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {savingId === 'new' ? (
                          <div className="w-3.5 h-3.5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Check size={14} />
                        )}
                      </button>
                      <button
                        onClick={cancelAdding}
                        title="Cancel"
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-500 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Staff rows */}
              {staff.length === 0 && !isAdding ? (
                <tr>
                  <td colSpan={canEdit ? 6 : 4} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <UserCircle2 size={40} strokeWidth={1.2} />
                      <p className="font-medium text-slate-500">No staff members yet.</p>
                      {canEdit && (
                        <p className="text-sm">
                          <button
                            onClick={startAdding}
                            className="text-indigo-600 hover:underline"
                          >
                            Add your first staff member
                          </button>
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                staff.map(member => {
                  const isEditing = editingId === member.id;
                  const isSaving = savingId === member.id;
                  return (
                    <tr key={member.id} className={isEditing ? 'bg-indigo-50' : 'hover:bg-slate-50 transition-colors'}>
                      {/* Name */}
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <input
                            autoFocus
                            type="text"
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            className="w-full px-2 py-1 border border-indigo-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                          />
                        ) : (
                          <span className="font-medium text-slate-800">{member.name}</span>
                        )}
                      </td>

                      {/* Employee # */}
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={form.employeeNumber}
                            onChange={e => setForm(f => ({ ...f, employeeNumber: e.target.value }))}
                            className="w-full px-2 py-1 border border-indigo-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                          />
                        ) : (
                          <span className="font-mono text-slate-600">
                            {member.employeeNumber ?? <span className="text-slate-400">—</span>}
                          </span>
                        )}
                      </td>

                      {/* Craft */}
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={form.craft}
                            onChange={e => setForm(f => ({ ...f, craft: e.target.value }))}
                            className="w-full px-2 py-1 border border-indigo-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                          />
                        ) : (
                          <span className="text-slate-600">
                            {member.craft ?? <span className="text-slate-400">—</span>}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            member.active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {member.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* PIN */}
                      {canEdit && (
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() => openPinModal(member.id)}
                            title={member.hasPin ? 'Change or clear PIN' : 'Set PIN'}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                              member.hasPin
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600'
                            }`}
                          >
                            {member.hasPin ? <Lock size={11} /> : <LockOpen size={11} />}
                            {member.hasPin ? 'Set' : 'None'}
                          </button>
                        </td>
                      )}

                      {/* Actions */}
                      {canEdit && (
                        <td className="px-4 py-2">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => saveEdit(member.id)}
                                disabled={!form.name.trim() || isSaving}
                                title="Save"
                                className="p-1.5 rounded hover:bg-green-100 text-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                {isSaving ? (
                                  <div className="w-3.5 h-3.5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Check size={14} />
                                )}
                              </button>
                              <button
                                onClick={cancelEditing}
                                title="Cancel"
                                className="p-1.5 rounded hover:bg-slate-100 text-slate-500 transition-colors"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => startEditing(member)}
                                title="Edit"
                                disabled={isSaving}
                                className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 disabled:opacity-40 transition-colors"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => handleDelete(member)}
                                title="Delete"
                                disabled={isSaving}
                                className="p-1.5 rounded hover:bg-red-50 text-slate-500 hover:text-red-600 disabled:opacity-40 transition-colors"
                              >
                                {isSaving ? (
                                  <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* PIN modal */}
      {pinModalId && (() => {
        const member = staff.find(s => s.id === pinModalId);
        if (!member) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    {member.hasPin ? 'Change PIN' : 'Set PIN'} — {member.name}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">5 digits, numbers only</p>
                </div>
                <button onClick={() => setPinModalId(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                  <X size={16} />
                </button>
              </div>

              <div className="px-5 py-4 space-y-4">
                {pinError && (
                  <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{pinError}</p>
                )}
                <input
                  ref={pinInputRef}
                  type="tel"
                  inputMode="numeric"
                  maxLength={5}
                  value={pinInput}
                  onChange={e => { setPinInput(e.target.value.replace(/\D/g, '').slice(0, 5)); setPinError(null); }}
                  placeholder="e.g. 84201"
                  className="w-full px-3 py-2.5 text-center text-2xl font-mono tracking-[0.5em] border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/35 focus:border-brand-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => savePin(pinModalId, pinInput)}
                    disabled={pinInput.length !== 5 || pinSaving}
                    className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 disabled:opacity-40 transition-colors"
                  >
                    {pinSaving ? 'Saving…' : 'Save PIN'}
                  </button>
                  {member.hasPin && (
                    <button
                      onClick={() => savePin(pinModalId, null)}
                      disabled={pinSaving}
                      className="px-4 py-2.5 border border-red-200 text-red-600 text-sm font-medium rounded-xl hover:bg-red-50 disabled:opacity-40 transition-colors"
                    >
                      Clear PIN
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
