import React, { useState, useEffect } from 'react';
import { ArrowLeft, MapPin, Target, Wrench, Camera, Plus, X, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { BuildingData, Equipment, ViewState } from '../../../types';
import { api } from '../../../api';
import { useToast } from '../../common/Toast';

interface EquipmentDetailProps {
  equipment: Equipment | null;
  data: BuildingData[];
  onBack: () => void;
  onSave: (equipment: Equipment) => Promise<void>;
  onFindRoom: (equipment: Equipment) => void;
  onSetFullScreenImage: (url: string) => void;
  onDelete: () => Promise<void>;
}

export const EquipmentDetail: React.FC<EquipmentDetailProps> = ({
  equipment,
  data,
  onBack,
  onSave,
  onFindRoom,
  onSetFullScreenImage,
  onDelete
}) => {
  const { showToast } = useToast();
  if (!equipment) return null;

  const exists = data.some(b => b.equipment.some(e => e.id === equipment.id));
  const [isEditing, setIsEditing] = useState(!exists);
  const [form, setForm] = useState(equipment);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingImageIds, setUploadingImageIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const b = data.find(b => b.code === form.Location);
    if (b && b.name !== form.LocationDesc) {
      setForm(prev => ({ ...prev, LocationDesc: b.name }));
    }
  }, [form.Location, data]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const files = Array.from(e.target.files) as File[];
    const tempIds = files.map((_, idx) => `temp-${Date.now()}-${idx}`);
    
    // Mark all as uploading
    setUploadingImageIds(new Set(tempIds));
    setIsUploading(true);
    
    try {
      const uploadPromises = files.map(async (file, idx) => {
        const tempId = tempIds[idx];
        try {
          const url = await api.uploadFile(file);
          setUploadingImageIds(prev => {
            const next = new Set(prev);
            next.delete(tempId);
            return next;
          });
          return url;
        } catch (err) {
          setUploadingImageIds(prev => {
            const next = new Set(prev);
            next.delete(tempId);
            return next;
          });
          throw err;
        }
      });
      
      const urls = await Promise.all(uploadPromises);
      const updated = { ...form, images: [...(form.images || []), ...urls] };
      setForm(updated);
      showToast("Images uploaded successfully", 'success');
    } catch (err) {
      showToast("Failed to upload some images. Please try again.", 'error');
    } finally {
      setIsUploading(false);
      setUploadingImageIds(new Set());
      // Reset file input
      e.target.value = '';
    }
  };

  const handlePhotoDelete = async (imageUrl: string) => {
    await api.deleteImage(imageUrl);
    setForm({ ...form, images: (form.images || []).filter(img => img !== imageUrl) });
  };

  const saveChanges = async () => {
    setIsUploading(true);
    await onSave(form);
    setIsUploading(false);
    setIsEditing(false);
  };

  return (
    <div key={equipment.id} className="max-w-5xl mx-auto space-y-6 pb-20 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
        <button onClick={onBack} className="flex items-center text-slate-500 hover:text-brand-600 transition-colors font-medium">
          <ArrowLeft size={20} className="mr-1" /> Back to List
        </button>
        <div className="flex space-x-2 self-end sm:self-auto">
          {!isEditing && (
            <button onClick={() => setIsEditing(true)} className="flex items-center px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium">
              <Pencil size={16} className="mr-2" /> Edit
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-100">
        <div className="p-6 md:p-8 bg-gradient-to-r from-brand-900 to-brand-700 text-white">
          {isEditing ? (
            <div className="space-y-4">
              <input value={form.Equipment} onChange={e => setForm({...form, Equipment: e.target.value})} className="text-2xl md:text-3xl font-bold bg-white/10 p-2 rounded w-full border border-white/20 text-white placeholder-white/50" placeholder="Equipment Name"/>
              <input value={form.EquipmentDesc} onChange={e => setForm({...form, EquipmentDesc: e.target.value})} className="text-base md:text-lg bg-white/10 p-2 rounded w-full border border-white/20 text-white placeholder-white/50" placeholder="Description"/>
            </div>
          ) : (
            <div>
              <h1 className="text-2xl md:text-3xl font-bold break-all">{equipment.Equipment}</h1>
              <p className="text-brand-100 mt-2 text-base md:text-lg">{equipment.EquipmentDesc}</p>
            </div>
          )}
        </div>

        <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-12">
          <div className="lg:col-span-2 space-y-8">
            <section>
              <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-4">
                <h3 className="flex items-center text-sm font-bold text-slate-900 uppercase tracking-wider">
                  <MapPin className="mr-2 text-brand-500" size={18} /> Location
                </h3>
                {!isEditing && (
                  <button onClick={() => onFindRoom(equipment)} className="text-xs bg-brand-50 text-brand-600 px-2 py-1 rounded font-bold hover:bg-brand-100 flex items-center">
                    <Target size={14} className="mr-1"/> Find Room
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-xl border border-slate-100">
                <div>
                  <dt className="text-slate-500 text-xs uppercase font-bold mb-1">Building</dt>
                  {isEditing ? (
                    <select value={form.Location} onChange={e => setForm({...form, Location: e.target.value})} className="border rounded p-2 w-full text-sm">
                      {data.map(b => (
                        <option key={b.code} value={b.code}>{b.name} ({b.code})</option>
                      ))}
                    </select>
                  ) : (
                    <dd className="font-medium text-slate-800 text-lg">{form.LocationDesc} <span className="text-sm text-slate-400">({form.Location})</span></dd>
                  )}
                </div>
                <div>
                  <dt className="text-slate-500 text-xs uppercase font-bold mb-1">Room</dt>
                  {isEditing ? (
                    <input value={form.Room} onChange={e => setForm({...form, Room: e.target.value})} className="border rounded p-2 w-full" />
                  ) : (
                    <dd className="font-medium text-slate-800 text-lg">{form.Room || "N/A"}</dd>
                  )}
                </div>
              </div>
            </section>

            <section>
              <h3 className="flex items-center text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
                <Wrench className="mr-2 text-brand-500" size={18} /> Details
              </h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {[
                  {label: "Manufacturer", key: "Manufacturer"},
                  {label: "Serial Number", key: "SerialNum"},
                  {label: "Vendor", key: "Vendor"},
                  {label: "Status", key: "status", isStatus: true},
                ].map(({label, key, isStatus}) => (
                  <div key={key}>
                    <dt className="text-slate-500 text-sm mb-1">{label}</dt>
                    {isEditing ? (
                      isStatus ? (
                        <select
                          value={form.status || 'UNKNOWN'}
                          onChange={e => setForm({...form, status: e.target.value as 'INACTIVE' | 'ONSHELF' | 'OPERATING' | 'REPAIR' | 'UNKNOWN'})}
                          className="border rounded p-2 w-full text-sm"
                        >
                          <option value="INACTIVE">INACTIVE</option>
                          <option value="ONSHELF">ONSHELF</option>
                          <option value="OPERATING">OPERATING</option>
                          <option value="REPAIR">REPAIR</option>
                          <option value="UNKNOWN">UNKNOWN</option>
                        </select>
                      ) : (
                        // @ts-ignore
                        <input value={form[key] || ''} onChange={e => setForm({...form, [key]: e.target.value})} className="border rounded p-2 w-full text-sm" />
                      )
                    ) : (
                      // @ts-ignore
                      <dd className="font-medium text-slate-800 break-words">{key === 'status' ? (form.status || 'UNKNOWN') : (form[key] || "-")}</dd>
                    )}
                  </div>
                ))}
              </dl>
            </section>

            <section>
              <h3 className="flex items-center text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
                Notes
              </h3>
              {isEditing ? (
                <textarea 
                  value={form.Notes || ''} 
                  onChange={e => setForm({...form, Notes: e.target.value})} 
                  className="border rounded p-3 w-full min-h-[120px] resize-y text-sm"
                  placeholder="Add notes about this equipment..."
                />
              ) : (
                <div className="text-slate-700 whitespace-pre-wrap bg-slate-50 p-4 rounded-lg border border-slate-100 min-h-[120px]">
                  {form.Notes || 'No notes'}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-4">
            <h3 className="flex items-center text-sm font-bold text-slate-900 uppercase tracking-wider mb-2">
              <Camera className="mr-2 text-brand-500" size={18} /> Photos
            </h3>
            <div className="grid grid-cols-1 gap-4">
              {form.images?.map((img, idx) => (
                <div key={idx} className="relative rounded-lg overflow-hidden aspect-video border border-slate-200 group cursor-zoom-in" onClick={() => onSetFullScreenImage(img)}>
                  <img src={img} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" alt={`Equipment photo ${idx + 1}`} />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                  {isEditing && (
                    <button onClick={(e) => { e.stopPropagation(); handlePhotoDelete(img); }} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors z-10">
                      <X size={12}/>
                    </button>
                  )}
                </div>
              ))}
              
              {/* Uploading Placeholders */}
              {Array.from(uploadingImageIds).map((tempId) => (
                <div key={tempId} className="relative rounded-lg overflow-hidden aspect-video border-2 border-dashed border-brand-300 bg-brand-50 flex items-center justify-center">
                  <div className="w-full h-full flex flex-col items-center justify-center p-4">
                    <RefreshCw className="animate-spin text-brand-600 mb-3" size={32} />
                    <div className="w-full max-w-xs">
                      <div className="w-full bg-brand-200 rounded-full h-2 mb-2">
                        <div className="bg-brand-600 h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                      </div>
                      <span className="text-sm text-brand-600 text-center block">Uploading image...</span>
                    </div>
                  </div>
                </div>
              ))}
              
              {isEditing && (
                <label className={`border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center aspect-video cursor-pointer hover:bg-slate-50 transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  {isUploading ? (
                    <>
                      <RefreshCw className="animate-spin text-slate-400" size={24} />
                      <span className="text-sm text-slate-500 mt-2">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={24} className="text-slate-400" />
                      <span className="text-sm text-slate-500 mt-2">
                        {form.images && form.images.length > 0
                          ? `Add More Photos (${form.images.length} photos)`
                          : 'Add Photos (Multiple selection allowed)'
                        }
                      </span>
                    </>
                  )}
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*" 
                    multiple
                    onChange={handlePhotoUpload}
                    disabled={isUploading}
                  />
                </label>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Cancel, Save, and Delete buttons at bottom */}
      {isEditing && (
        <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4 rounded-lg shadow-lg flex justify-between items-center">
          <button 
            onClick={async () => {
              setIsDeleting(true);
              try {
                await onDelete();
              } finally {
                setIsDeleting(false);
              }
            }}
            disabled={isUploading || isDeleting}
            className="flex items-center px-6 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium disabled:opacity-50 transition-colors"
          >
            {isDeleting ? (
              <RefreshCw size={18} className="mr-2 animate-spin" />
            ) : (
              <Trash2 size={18} className="mr-2" />
            )}
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
          <div className="flex space-x-3">
            {exists && (
              <button 
                onClick={() => { setForm(equipment); setIsEditing(false); }} 
                className="flex items-center px-6 py-2 rounded-lg bg-slate-200 text-slate-700 font-medium hover:bg-slate-300 transition-colors"
              >
                Cancel
              </button>
            )}
            <button 
              disabled={isUploading} 
              onClick={saveChanges} 
              className="flex items-center px-6 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 font-medium disabled:opacity-50 transition-colors"
            >
              {isUploading ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

