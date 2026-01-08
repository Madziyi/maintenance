# Extraction Instructions for Remaining Components

## Summary

You have successfully extracted 7 out of 10 components! The remaining 3 components (RoomList, RoomDetail, FloorPlanManager) are ready to be extracted from `App.tsx`.

## Component Boundaries in App.tsx

### 1. RoomList
- **Start Line**: 270
- **End Line**: 468
- **Total Lines**: ~198
- **Signature**: `const RoomList = () => {`

### 2. RoomDetail
- **Start Line**: 470  
- **End Line**: 673
- **Total Lines**: ~203
- **Signature**: `const RoomDetail = () => {`

### 3. FloorPlanManager
- **Start Line**: 675
- **End Line**: 872
- **Total Lines**: ~197
- **Signature**: `const FloorPlanManager = () => {`

## Step-by-Step Extraction Process

### For Each Component:

1. **Read the component** from App.tsx using the line ranges above
2. **Create new file** in `src/components/rooms/`
3. **Add imports** at the top
4. **Convert to functional export** with proper TypeScript typing
5. **Replace state setters** with prop callbacks
6. **Export the component**
7. **Delete from App.tsx**
8. **Update App.tsx** render section to use the new component

---

## Detailed Instructions per Component

### 1. Extracting RoomList (lines 270-468)

#### Required Imports:
```typescript
import React, { useState } from 'react';
import { 
  Search, Plus, X, MapPin, ArrowLeft, Camera, 
  BuildingIcon, ChevronRight, ExternalLink 
} from 'lucide-react';
import { BuildingData, MaintenanceRoom, ViewState } from '../../types';
import { api } from '../../api';
```

####Props Interface:
```typescript
interface RoomListProps {
  data: BuildingData[];
  selectedBuilding: BuildingData | null;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onSelectBuilding: (building: BuildingData | null) => void;
  onSelectRoom: (room: MaintenanceRoom) => void;
  onNavigate: (view: ViewState) => void;
  onAddBuilding: (code: string, name: string) => void;
  onUpdateBuilding: (code: string, updates: Partial<BuildingData>) => void;
  onSetFullScreenImage: (url: string) => void;
}
```

#### Replacements Needed:
- `setSearchTerm(e.target.value)` → `onSearchChange(e.target.value)`
- `setSelectedBuilding(b)` → `onSelectBuilding(b)`
- `setSelectedBuilding(null)` → `onSelectBuilding(null)`
- `setSelectedRoom(room)` → `onSelectRoom(room)`
- `setView(ViewState.X)` → `onNavigate(ViewState.X)`
- `addBuilding(code, name)` → `onAddBuilding(code, name)`
- `updateBuilding(code, updates)` → `onUpdateBuilding(code, updates)`
- `setFullScreenImage(url)` → `onSetFullScreenImage(url)`

---

### 2. Extracting RoomDetail (lines 470-673)

#### Required Imports:
```typescript
import React, { useState } from 'react';
import { 
  ArrowLeft, Wrench, BuildingIcon, Pencil, Camera, 
  MapPin, ImageIcon, Target, Map 
} from 'lucide-react';
import { BuildingData, MaintenanceRoom, ViewState } from '../../types';
import { api } from '../../api';
```

#### Props Interface:
```typescript
interface RoomDetailProps {
  room: MaintenanceRoom | null;
  building: BuildingData | null;
  onBack: () => void;
  onSave: (room: MaintenanceRoom, buildingCode: string) => Promise<void>;
  onNavigate: (view: ViewState) => void;
  onSetFullScreenImage: (url: string) => void;
}
```

#### Replacements Needed:
- `selectedRoom` → `room`
- `selectedBuilding` → `building`
- `setView(ViewState.X)` → `onNavigate(ViewState.X)`
- `saveRoom(form, selectedBuilding.code)` → `onSave(form, building.code)`
- `setFullScreenImage(url)` → `onSetFullScreenImage(url)`

---

### 3. Extracting FloorPlanManager (lines 675-872)

#### Required Imports:
```typescript
import React, { useState } from 'react';
import { 
  ArrowLeft, Plus, X, Upload, ImageIcon, Trash2, 
  RefreshCw, Pencil, Check 
} from 'lucide-react';
import { BuildingData, FloorPlan, ViewState } from '../../types';
import { api } from '../../api';
```

#### Props Interface:
```typescript
interface FloorPlanManagerProps {
  building: BuildingData | null;
  onBack: () => void;
  onUpdateFloorPlans: (
    buildingCode: string,
    plans: FloorPlan[],
    newPlan?: FloorPlan
  ) => Promise<void>;
  onDeleteFloorPlan: (buildingCode: string, planId: string) => Promise<void>;
  onSetFullScreenImage: (url: string) => void;
}
```

#### Replacements Needed:
- `selectedBuilding` → `building`
- `setView(ViewState.X)` → `onBack()`
- `updateFloorPlans(...)` → `onUpdateFloorPlans(...)`
- `deleteFloorPlan(...)` → `onDeleteFloorPlan(...)`
- `setFullScreenImage(url)` → `onSetFullScreenImage(url)`

---

## Final App.tsx Updates

After extracting all three components, update the render section in App.tsx (around lines 1000-1010):

### Add Imports:
```typescript
import { RoomList } from './src/components/rooms/RoomList';
import { RoomDetail } from './src/components/rooms/RoomDetail';
import { FloorPlanManager } from './src/components/rooms/FloorPlanManager';
```

### Update Render Section:
```typescript
{view === ViewState.ROOM_LIST && (
  <RoomList
    data={data}
    selectedBuilding={selectedBuilding}
    searchTerm={searchTerm}
    onSearchChange={setSearchTerm}
    onSelectBuilding={setSelectedBuilding}
    onSelectRoom={setSelectedRoom}
    onNavigate={setView}
    onAddBuilding={addBuilding}
    onUpdateBuilding={updateBuilding}
    onSetFullScreenImage={setFullScreenImage}
  />
)}
{view === ViewState.ROOM_DETAIL && (
  <RoomDetail
    room={selectedRoom}
    building={selectedBuilding}
    onBack={() => setView(ViewState.ROOM_LIST)}
    onSave={saveRoom}
    onNavigate={setView}
    onSetFullScreenImage={setFullScreenImage}
  />
)}
{view === ViewState.FLOOR_PLAN_MANAGER && (
  <FloorPlanManager
    building={selectedBuilding}
    onBack={() => setView(ViewState.ROOM_LIST)}
    onUpdateFloorPlans={updateFloorPlans}
    onDeleteFloorPlan={deleteFloorPlan}
    onSetFullScreenImage={setFullScreenImage}
  />
)}
```

---

## Quick Checklist

- [ ] Extract RoomList (lines 270-468) to `src/components/rooms/RoomList.tsx`
- [ ] Extract RoomDetail (lines 470-673) to `src/components/rooms/RoomDetail.tsx`
- [ ] Extract FloorPlanManager (lines 675-872) to `src/components/rooms/FloorPlanManager.tsx`
- [ ] Delete lines 270-872 from App.tsx
- [ ] Add imports for the 3 new components in App.tsx
- [ ] Update render section with proper component usage and props
- [ ] Run linter and fix any errors
- [ ] Test all functionality

---

## Expected Results

**Before:**
- App.tsx: ~980 lines
- Inline components: 3 (RoomList, RoomDetail, FloorPlanManager)

**After:**
- App.tsx: ~380 lines
- Extracted components: 10 total
- Lines extracted: ~600 lines from App.tsx

---

**Good luck with the extraction!** 🚀

