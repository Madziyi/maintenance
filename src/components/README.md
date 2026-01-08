# Component Refactoring Guide

This directory contains extracted components from the main `App.tsx` file to improve code organization and maintainability.

## ✅ Completed Extractions

### Authentication
- **`auth/LoginScreen.tsx`** - Login page with form validation

### Common Components
- **`common/FullScreenViewer.tsx`** - Modal image viewer
- **`common/LoadingScreen.tsx`** - Loading state indicator
- **`common/SidebarItem.tsx`** - Reusable sidebar navigation item

### Dashboard
- **`dashboard/Dashboard.tsx`** - Main dashboard with statistics and charts

## 📋 Components Ready for Extraction

The following components are still inline in `App.tsx` but follow clear boundaries and can be extracted:

### Equipment Components (`src/components/equipment/`)

**EquipmentList.tsx** (~140 lines, lines 308-448 in App.tsx)
- Props needed: `data`, `searchTerm`, `onSearchChange`, `onSelectEquipment`, `onNavigate`
- Handles equipment listing with search, export, and add functionality
- Responsive design with table (desktop) and card (mobile) views

**EquipmentDetail.tsx** (~170 lines, lines 450-620 in App.tsx)
- Props needed: `equipment`, `data`, `onBack`, `onSave`, `onFindRoom`, `onSetFullScreenImage`
- Equipment detail view with edit mode, photo management
- Location tracking and "Find Room" feature

### Room Components (`src/components/rooms/`)

**RoomList.tsx** (~200 lines, lines 622-820 in App.tsx)
- Props needed: `data`, `selectedBuilding`, `searchTerm`, `onSearchChange`, `onSelectBuilding`, `onSelectRoom`, `onNavigate`, `onAddBuilding`, `onUpdateBuilding`, `onSetFullScreenImage`
- Two modes: building list and room list for selected building
- Building card view with room table

**RoomDetail.tsx** (~200 lines, lines 822-1020 in App.tsx)
- Props needed: `room`, `building`, `onBack`, `onSave`, `onNavigate`, `onSetFullScreenImage`
- Room details with floor plan location picker
- Pin placement on floor plan images
- Room panorama image upload

**FloorPlanManager.tsx** (~190 lines, lines 1022-1210 in App.tsx)
- Props needed: `building`, `onBack`, `onUpdateFloorPlans`, `onDeleteFloorPlan`, `onSetFullScreenImage`
- Floor plan CRUD operations
- Image upload with replace functionality
- Grid layout for floor plan cards

### Layout Components (`src/components/layout/`)

**Sidebar.tsx** (~40 lines, lines 1280-1320 in App.tsx)
- Desktop sidebar with navigation and logout
- Brand logo and navigation items

**MobileMenu.tsx** (~30 lines, lines 1330-1360 in App.tsx)  
- Mobile hamburger menu overlay
- Navigation and logout

## 🔧 Extraction Steps

To extract a component:

1. **Create the file** in the appropriate directory
2. **Copy the component code** from App.tsx
3. **Add imports** for React, icons, types, and API
4. **Define props interface** (see `src/components/types.ts`)
5. **Export the component**
6. **Update App.tsx** to import and use the new component
7. **Remove the inline definition** from App.tsx

### Example: Extracting EquipmentList

```tsx
// src/components/equipment/EquipmentList.tsx
import React from 'react';
import { Search, Download, Plus } from 'lucide-react';
import { BuildingData, Equipment, ViewState } from '../../types';

interface EquipmentListProps {
  data: BuildingData[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onSelectEquipment: (equipment: Equipment) => void;
  onNavigate: (view: ViewState) => void;
}

export const EquipmentList: React.FC<EquipmentListProps> = ({
  data,
  searchTerm,
  onSearchChange,
  onSelectEquipment,
  onNavigate
}) => {
  // Copy component logic here
  const allEquipment = data.flatMap(b => b.equipment);
  const filtered = allEquipment.filter(/* ... */);
  
  const handleCreate = () => {
    // Create new equipment logic
  };
  
  const handleExport = () => {
    // Export logic
  };
  
  return (
    // Copy JSX here
  );
};
```

Then in App.tsx:
```tsx
import { EquipmentList } from './src/components/equipment/EquipmentList';

// In render:
{view === ViewState.EQUIPMENT_LIST && (
  <EquipmentList
    data={data}
    searchTerm={searchTerm}
    onSearchChange={setSearchTerm}
    onSelectEquipment={setSelectedEquipment}
    onNavigate={setView}
  />
)}
```

## 📦 Current State

- **App.tsx**: ~1,343 lines
- **Extracted**: ~250 lines
- **Remaining**: ~1,093 lines in inline components

## 🎯 Benefits

- **Modularity**: Each component is self-contained
- **Reusability**: Components can be reused across views
- **Testability**: Individual components can be unit tested
- **Maintainability**: Easier to find and modify specific features
- **Collaboration**: Multiple developers can work on different components
- **Performance**: Potential for lazy loading and code splitting

## 📝 Notes

- All component prop interfaces are defined in `src/components/types.ts`
- The `api` module must be imported for components that make API calls
- Icon imports from `lucide-react` are needed for components using icons
- State management is currently prop-based; consider Context API for deeply nested props

