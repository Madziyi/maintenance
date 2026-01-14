import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { ArrowLeft, Plus, X, Upload, RefreshCw, Trash2, Image as ImageIcon, Share2 } from 'lucide-react';
import { BuildingData, FloorPlan } from '@/types';
import { api } from '@/api';
import { useToast } from '../common/Toast';

// Slug helper (lowercase, hyphenated, unique per building)
const generateFloorPlanSlug = (name: string, existingPlans: FloorPlan[]): string => {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'floor-plan';
  
  // Add counter only if duplicate exists in THIS building
  let finalSlug = slug;
  let counter = 2;
  while (existingPlans.some(p => p.slug === finalSlug)) {
    finalSlug = `${slug}-${counter++}`;
  }
  
  return finalSlug;
};

interface FloorPlanManagerProps {
  data: BuildingData[];
  onUpdateFloorPlans: (buildingCode: string, plans: FloorPlan[], newPlan?: FloorPlan) => Promise<void>;
  onDeleteFloorPlan: (buildingCode: string, planId: string) => Promise<void>;
  onSetFullScreenImage: (url: string | null) => void;
  canEdit: boolean;
}

export const FloorPlanManager: React.FC<FloorPlanManagerProps> = ({
  data,
  onUpdateFloorPlans,
  onDeleteFloorPlan,
  onSetFullScreenImage,
  canEdit,
}) => {
  const { code, planSlug } = useParams<{ code: string; planSlug?: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const selectedBuilding = useMemo(() => {
      return data.find(b => b.code === code) || null;
  }, [data, code]);

  // Auto-open a specific floor plan when deep-linked via slug
  useEffect(() => {
    if (!planSlug || !selectedBuilding) return;
    const plan = selectedBuilding.floorPlans.find(
      p => p.slug === planSlug || p.id === planSlug
    );
    if (plan && plan.imageUrl) {
      onSetFullScreenImage(plan.imageUrl);
    }
  }, [planSlug, selectedBuilding, onSetFullScreenImage]);

  if (!selectedBuilding) {
      return <Navigate to="/building" replace />;
  }

  const [isUploading, setIsUploading] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [uploadingPlan, setUploadingPlan] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!canEdit) return;
      if (e.target.files && e.target.files[0]) {
          setUploadingPlan(true);
          try {
              let url: string;
              
              if (editingPlanId) {
                  // Replacing existing floor plan image
                  const existingPlan = selectedBuilding.floorPlans.find(p => p.id === editingPlanId);
                  if (!existingPlan) {
                      showToast("Floor plan not found", 'error');
                      setUploadingPlan(false);
                      setEditingPlanId(null);
                      return;
                  }
                  const oldImageUrl = existingPlan.imageUrl;
                  url = await api.uploadFile(e.target.files[0], oldImageUrl);
                  
                  const updatedPlan: FloorPlan = {
                      id: editingPlanId,
                      name: existingPlan.name,
                      imageUrl: url,
                      slug: existingPlan.slug // Preserve existing slug
                  };
                  const updatedPlans = selectedBuilding.floorPlans.map(p => 
                      p.id === editingPlanId ? updatedPlan : p
                  );
                  await onUpdateFloorPlans(selectedBuilding.code, updatedPlans, updatedPlan);
                  setEditingPlanId(null);
              } else if (newPlanName) {
                  // Creating new floor plan
                  url = await api.uploadFile(e.target.files[0]);
                  const slug = generateFloorPlanSlug(newPlanName, selectedBuilding.floorPlans);
                  const newPlan: FloorPlan = {
                      id: `FP-${Date.now()}`,
                      name: newPlanName,
                      imageUrl: url,
                      slug
                  };
                  await onUpdateFloorPlans(selectedBuilding.code, [...selectedBuilding.floorPlans, newPlan], newPlan);
                  setNewPlanName('');
                  setIsUploading(false);
              } else {
                  // This should only happen when creating a new plan without a name
                  showToast("Please enter a floor plan name", 'warning');
                  setUploadingPlan(false);
                  return;
              }
              showToast("Floor plan uploaded successfully", 'success');
          } catch (e) { 
              showToast("Upload failed", 'error'); 
          } 
          finally { 
              setUploadingPlan(false);
              setEditingPlanId(null);
          }
      }
  };

  const handleReplaceImage = (planId: string) => {
      if (!canEdit) return;
      // Trigger file input click with planId in closure
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e) => {
          const fileInput = e.target as HTMLInputElement;
          if (fileInput.files && fileInput.files[0]) {
              setUploadingPlan(true);
              setEditingPlanId(planId);
              try {
                  const existingPlan = selectedBuilding.floorPlans.find(p => p.id === planId);
                  if (!existingPlan) {
                      showToast("Floor plan not found", 'error');
                      setUploadingPlan(false);
                      setEditingPlanId(null);
                      return;
                  }
                  const oldImageUrl = existingPlan.imageUrl;
                  const url = await api.uploadFile(fileInput.files[0], oldImageUrl);
                  
                  const updatedPlan: FloorPlan = {
                      id: planId,
                      name: existingPlan.name,
                      imageUrl: url,
                      slug: existingPlan.slug // Preserve existing slug
                  };
                  const updatedPlans = selectedBuilding.floorPlans.map(p => 
                      p.id === planId ? updatedPlan : p
                  );
                  await onUpdateFloorPlans(selectedBuilding.code, updatedPlans, updatedPlan);
                  showToast("Floor plan updated successfully", 'success');
              } catch (e) {
                  showToast("Upload failed", 'error');
              } finally {
                  setUploadingPlan(false);
                  setEditingPlanId(null);
              }
          }
      };
      input.click();
  };

  const handleDelete = async (id: string) => {
      if (!canEdit) return;
      if (window.confirm("Are you sure you want to delete this floor plan?")) {
          const plan = selectedBuilding.floorPlans.find(p => p.id === id);
          if (plan?.imageUrl) {
              await api.deleteImage(plan.imageUrl);
          }
          await onDeleteFloorPlan(selectedBuilding.code, id);
      }
  };

  const handleShare = async (plan: FloorPlan) => {
    const slug = plan.slug || plan.id; // Fallback to id if slug doesn't exist
    const url = `${window.location.origin}/building/${selectedBuilding.code}/floor-plans/${slug}`;
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${plan.name} - ${selectedBuilding.name}`,
          text: `Check out this floor plan for ${selectedBuilding.name}`,
          url: url
        });
        showToast("Link shared successfully", 'success');
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(url);
        showToast("Link copied to clipboard", 'success');
      }
    } catch (err: any) {
      // User cancelled share dialog or clipboard failed
      if (err.name !== 'AbortError') {
        // Try clipboard fallback if share failed for other reasons
        try {
          await navigator.clipboard.writeText(url);
          showToast("Link copied to clipboard", 'success');
        } catch (clipboardErr) {
          showToast("Failed to share link", 'error');
        }
      }
    }
  };

  return (
      <div className="space-y-6 pb-20 animate-fade-in">
           <div className="flex items-center space-x-4 mb-6">
              <button 
                  onClick={() => navigate(`/building/${selectedBuilding.code}`)} 
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-500"
              >
                  <ArrowLeft size={24}/>
              </button>
              <div>
                  <h1 className="text-2xl font-bold text-slate-800">Floor Plans</h1>
                  <p className="text-slate-500 text-sm">Manage blueprints for {selectedBuilding.name}</p>
              </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {canEdit && (
              <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors">
                  {isUploading ? (
                      <div className="w-full space-y-4">
                          <h3 className="font-bold text-brand-700">New Floor Plan</h3>
                          <input 
                              className="w-full border rounded p-2 text-sm" 
                              placeholder="Floor Name (e.g. 2nd Floor)"
                              value={newPlanName}
                              onChange={e => setNewPlanName(e.target.value)}
                          />
                          <div className="flex gap-2">
                              <label className={`flex-1 py-2 rounded text-white font-medium text-sm cursor-pointer flex items-center justify-center ${newPlanName && !uploadingPlan ? 'bg-brand-600 hover:bg-brand-700' : 'bg-slate-300 cursor-not-allowed'}`}>
                                  {uploadingPlan ? <RefreshCw className="animate-spin mr-2"/> : <Upload size={16} className="mr-2"/>}
                                  {uploadingPlan ? 'Uploading...' : 'Upload Image'}
                                  <input type="file" className="hidden" accept="image/*" disabled={!newPlanName || uploadingPlan} onChange={handleUpload}/>
                              </label>
                              <button 
                                  onClick={() => setIsUploading(false)} 
                                  className="px-3 bg-slate-200 rounded text-slate-600 hover:bg-slate-300"
                              >
                                  <X size={20}/>
                              </button>
                          </div>
                      </div>
                  ) : (
                      <button 
                          onClick={() => setIsUploading(true)} 
                          className="w-full h-full flex flex-col items-center justify-center py-8"
                      >
                          <div className="p-4 bg-brand-50 text-brand-500 rounded-full mb-3">
                              <Plus size={32} />
                          </div>
                          <span className="font-bold text-slate-700">Add Floor Plan</span>
                          <span className="text-xs text-slate-400 mt-1">Supports PNG, JPG</span>
                      </button>
                  )}
              </div>
              )}

              {selectedBuilding.floorPlans.map(plan => (
                  <div key={plan.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden group relative">
                      <div className="aspect-video bg-slate-100 border-b border-slate-100 relative overflow-hidden">
                           {plan.imageUrl ? (
                               <>
                                   {uploadingPlan && editingPlanId === plan.id && (
                                       <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
                                           <div className="flex flex-col items-center">
                                               <RefreshCw className="animate-spin text-white mb-3" size={32} />
                                               <div className="w-full max-w-xs px-4">
                                                   <div className="w-full bg-white/30 rounded-full h-2 mb-2">
                                                       <div className="bg-white h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                                                   </div>
                                                   <span className="text-sm text-white text-center block">Uploading image...</span>
                                               </div>
                                           </div>
                                       </div>
                                   )}
                                   <img src={plan.imageUrl} className="w-full h-full object-contain" alt={plan.name} />
                                   <div 
                                       className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors cursor-zoom-in z-0" 
                                       onClick={() => !uploadingPlan && onSetFullScreenImage(plan.imageUrl)}
                                   />
                                   {!uploadingPlan && (
                                       <button
                                           onClick={(e) => {
                                               e.stopPropagation();
                                               handleReplaceImage(plan.id);
                                           }}
                                           className="absolute top-2 right-2 bg-brand-600 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-brand-700 shadow-lg z-10"
                                           title="Replace image"
                                       >
                                           <Upload size={16} />
                                       </button>
                                   )}
                               </>
                           ) : (
                               <>
                                   {uploadingPlan && editingPlanId === plan.id ? (
                                       <div className="w-full h-full flex flex-col items-center justify-center p-4">
                                           <RefreshCw className="animate-spin text-brand-600 mb-3" size={48} />
                                           <div className="w-full max-w-xs px-4">
                                               <div className="w-full bg-brand-200 rounded-full h-2 mb-2">
                                                   <div className="bg-brand-600 h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                                               </div>
                                               <span className="text-sm text-brand-600 text-center block">Uploading image...</span>
                                           </div>
                                       </div>
                                   ) : (
                                       <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-4">
                                           <ImageIcon size={48} className="mb-2 opacity-50" />
                                           <p className="text-sm text-center mb-2">No image uploaded</p>
                                           <button
                                               onClick={() => handleReplaceImage(plan.id)}
                                               className="bg-brand-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-brand-700"
                                           >
                                               Upload Image
                                           </button>
                                       </div>
                                   )}
                               </>
                           )}
                      </div>
                      <div className="p-4 flex justify-between items-center bg-white relative z-10">
                          <span className="font-bold text-slate-700">{plan.name}</span>
                          <div className="flex items-center gap-2">
                              <button 
                                  onClick={(e) => {
                                      e.stopPropagation();
                                      handleShare(plan);
                                  }} 
                                  className="text-slate-400 hover:text-brand-600 transition-colors p-2"
                                  title="Share floor plan"
                              >
                                  <Share2 size={18} />
                              </button>
                              <button 
                                  onClick={() => handleDelete(plan.id)} 
                                  className="text-slate-400 hover:text-red-500 transition-colors p-2"
                                  title="Delete floor plan"
                              >
                                  <Trash2 size={18} />
                              </button>
                          </div>
                      </div>
                  </div>
              ))}
          </div>
      </div>
  );
};
