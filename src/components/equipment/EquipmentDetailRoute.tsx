import React, { useMemo } from 'react';
import { useNavigate, useParams, Navigate, useLocation } from 'react-router-dom';
import { BuildingData, Equipment } from '@/types';
import { EquipmentDetail } from './EquipmentDetail';

interface EquipmentDetailRouteProps {
  data: BuildingData[];
  onSave: (eq: Equipment) => Promise<void>;
  onFindRoom: (eq: Equipment) => void;
  onSetFullScreenImage: (url: string | null) => void;
  onDelete: (equipmentId: string) => Promise<void>;
  canEdit: boolean;
}

export const EquipmentDetailRoute: React.FC<EquipmentDetailRouteProps> = ({
  data,
  onSave,
  onFindRoom,
  onSetFullScreenImage,
  onDelete,
  canEdit,
}) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  
  const selectedEquipment = useMemo(() => {
      if (!id) return null;
      for (const building of data) {
          const eq = building.equipment.find(e => e.id === id);
          if (eq) return eq;
      }
      return null;
  }, [data, id]);

  if (!selectedEquipment) {
      return <Navigate to="/equipment" replace />;
  }

  // Go back to where user came from, preserving page position when possible.
  const handleBack = () => {
    // Prefer real history back (enables browser-like restoration).
    const idx = (typeof window !== 'undefined' && (window.history.state?.idx as number | undefined)) ?? 0;
    if (idx > 0) {
      navigate(-1);
      return;
    }

    const state = location.state as { from?: string; fromKey?: string } | null | undefined;
    const from = state?.from;
    const fromKey = state?.fromKey;

    if (from) {
      navigate(from, { state: fromKey ? { restoreKey: fromKey } : undefined });
      return;
    }

    // Fallback: go to building if equipment has a location, otherwise equipment list
    if (selectedEquipment.Location) {
      navigate(`/building/${selectedEquipment.Location}`);
    } else {
      navigate('/equipment');
    }
  };

  return (
      <EquipmentDetail
          equipment={selectedEquipment}
          data={data}
          onBack={handleBack}
          onSave={onSave}
          onFindRoom={onFindRoom}
          onSetFullScreenImage={onSetFullScreenImage}
          onDelete={() => onDelete(selectedEquipment.id)}
          canEdit={canEdit}
      />
  );
};
