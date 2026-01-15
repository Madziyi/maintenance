import React, { useMemo } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
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

  return (
      <EquipmentDetail
          equipment={selectedEquipment}
          data={data}
          onBack={() => navigate(`/building/${selectedEquipment.Location}`)}
          onSave={onSave}
          onFindRoom={onFindRoom}
          onSetFullScreenImage={onSetFullScreenImage}
          onDelete={() => onDelete(selectedEquipment.id)}
          canEdit={canEdit}
      />
  );
};
