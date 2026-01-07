import { Equipment, BuildingData } from './types';

// Raw CSV Data
const RAW_EQUIPMENT_CSV = `Equipment,EquipmentDesc,Notes,Location,LocationDesc,Room,Key For Access,CreationDate,AssetTag,SerialNum,PurchaseDate,FailureClass,Hazardous,Instructions,ItemNum,Manufacturer,PurchaseDate,PurchasePrice,Vendor,WarrantyDate
CHWP04-BIO,PUMP,,BIO,Biology Building (Caution Mca),M01,,,,,,,0,,,,,0,,
CHWP05-BIO,PUMP,,BIO,Biology Building (Caution Mca),M01,,,,,,,0,,,,,0,,
CHWP14-BIO,PUMP,,BIO,Biology Building (Caution Mca),M01,,,,,,,0,,,,,0,,
DHWCP01-BIO,PUMP,,BIO,Biology Building (Caution Mca),M01,,,,,,,0,,,,,0,,
DHWCP02-BIO,PUMP,,BIO,Biology Building (Caution Mca),M01,,,,,,,0,,,,,0,,
FP02-BIO,PUMP,,BIO,Biology Building (Caution Mca),M01,,,,,,,0,,,,,0,,
HWHPCP07-BIO,PUMP,,BIO,Biology Building (Caution Mca),M01,,,,,,,0,,,,,0,,
HWHPCP08-BIO,PUMP,,BIO,Biology Building (Caution Mca),M01,,,,,,,0,,,,,0,,
HWHPCP09-BIO,PUMP,,BIO,Biology Building (Caution Mca),M01,,,,,,,0,,,,,0,,
HWHPCP10-BIO,PUMP,,BIO,Biology Building (Caution Mca),M01,,,,,,,0,,,,,0,,
HWHPCP12-BIO,PUMP,,BIO,Biology Building (Caution Mca),M01,,,,,,,0,,,,,0,,
HWHPCP13-BIO,PUMP,,BIO,Biology Building (Caution Mca),M01,,,,,,,0,,,,,0,,
SP01-BIO,PUMP,,BIO,Biology Building (Caution Mca),M01,,,,,,,0,,,,,0,,
SP02-BIO,PUMP,,BIO,Biology Building (Caution Mca),M01,,,,,,,0,,,,,0,,
VP01-BIO,PUMP,,BIO,Biology Building (Caution Mca),M01,,,,,,,0,,,,,0,,
VP02-BIO,PUMP,,BIO,Biology Building (Caution Mca),M01,,,,,,,0,,,,,0,,
DHWCP01-CART,PUMP,,CART,Cartier Hall,M103,,,,,,,0,,,,,0,,
DHWCP02-CART,PUMP,,CART,Cartier Hall,M103,,,,,,,0,,,,,0,,
SP01-CART,PUMP,,CART,Cartier Hall,,,,,,,,0,,,,,0,,
SP02-CART,PUMP,,CART,Cartier Hall,,,,,,,,0,,,,,0,,
SP03-CART,PUMP,,CART,Cartier Hall,,,,,,,,0,,,,,0,,
BP01-CAWSC,PUMP,,CAWSC,Caw Student Centre,,,,,,,,0,,,,,0,,
BP02-CAWSC,PUMP,,CAWSC,Caw Student Centre,MB03,,,,,,,0,,,,,0,,
BP03-CAWSC,PUMP,,CAWSC,Caw Student Centre,MB03,,,,,,,0,,,,,0,,
CHWCP05B-CAWSC,PUMP,,CAWSC,Caw Student Centre,MB03,,,,,,,0,,,,,0,,
CHWP02-CAWSC,PUMP,,CAWSC,Caw Student Centre,NORTH PENTHSE,,,,,,,0,,,,,0,,
CHWP05A-CAWSC,PUMP,,CAWSC,Caw Student Centre,MB03,,,,,,,0,,,,,0,,
CHWP06-CAWSC,PUMP,,CAWSC,Caw Student Centre,,,,,,,,0,,,,,0,,
CIRCP03-CAWSC,PUMP,,CAWSC,Caw Student Centre,NORTH PENTHSE,,,,,,,0,,,,,0,,
CIRCP04-CAWSC,PUMP,,CAWSC,Caw Student Centre,PENTHSE,,,,,,,0,,,,,0,,
CIRCP05A-CAWSC,PUMP,,CAWSC,Caw Student Centre,MB03,,,,,,,0,,,,,0,,
CIRCP06-CAWSC,PUMP,,CAWSC,Caw Student Centre,MB03,,,,,,,0,,,,,0,,
CIRCP07-CAWSC,PUMP,,CAWSC,Caw Student Centre,MB03,,,,,,,0,,,,,0,,
CIRCP09-CAWSC,PUMP,,CAWSC,Caw Student Centre,PENTHSE,,,,,,,0,,,,,0,,
CIRCP10-CAWSC,PUMP,,CAWSC,Caw Student Centre,NORTH PENTHSE,,,,,,,0,,,,,0,,
CIRCP11-CAWSC,PUMP,,CAWSC,Caw Student Centre,NORTH PENTHSE,,,,,,,0,,,,,0,,
CIRCP13-CAWSC,PUMP,,CAWSC,Caw Student Centre,MB03,,,,,,,0,,,,,0,,
DHWCP01-CAWSC,PUMP,,CAWSC,Caw Student Centre,,,,,,,,0,,,,,0,,
GHRP15-CAWSC,PUMP,,CAWSC,Caw Student Centre,NORTH PENTHSE,,,,,,,0,,,,,0,,
SP01-CAWSC,PUMP,,CAWSC,Caw Student Centre,MB03,,,,,,,0,,,,,0,,
SP31-CAWSC,PUMP,,CAWSC,Caw Student Centre,B53,,,,,,,0,,,,,0,,
SP32-CAWSC,PUMP,,CAWSC,Caw Student Centre,157,,,,,,,0,,,,,0,,
SP33-CAWSC,PUMP,,CAWSC,Caw Student Centre,B101Z,,,,,,,0,,,,,0,,
SP34-CAWSC,PUMP,,CAWSC,Caw Student Centre,B101A,,,,,,,0,,,,,0,,
SP35-CAWSC,PUMP,,CAWSC,Caw Student Centre,B189,,,,,,,0,,,,,0,,
SP36-CAWSC,PUMP,,CAWSC,Caw Student Centre,B189,,,,,,,0,,,,,0,,
SP39-CAWSC,PUMP,,CAWSC,Caw Student Centre,B205,,,,,,,0,,,,,0,,
SP40-CAWSC,PUMP,,CAWSC,Caw Student Centre,B205,,,,,,,0,,,,,0,,
TPCP37-CAWSC,PUMP,,CAWSC,Caw Student Centre,B205,,,,,,,0,,,,,0,,
TPCP38-CAWSC,PUMP,,CAWSC,Caw Student Centre,B205,,,,,,,0,,,,,0,,
TPCP39-CAWSC,PUMP,,CAWSC,Caw Student Centre,B205,,,,,,,0,,,,,0,,
TPCP40-CAWSC,PUMP,,CAWSC,Caw Student Centre,B205,,,,,,,0,,,,,0,,
TRCP08-CAWSC,PUMP,,CAWSC,Caw Student Centre,PENTHSE,,,,,,,0,,,,,0,,
DHWH04-CEI,PUMP,,CEI,Centre Engineering Innovation,,,,,,,,0,,,,,0,,
DHWH05-CEI,PUMP,,CEI,Centre Engineering Innovation,,,,,,,,0,,,,,0,,
DHWH06-CEI,PUMP,,CEI,Centre Engineering Innovation,,,,,,,,0,,,,,0,,
DHWH07-CEI,PUMP,,CEI,Centre Engineering Innovation,,,,,,,,0,,,,,0,,
HWHPCP06-CHN,PUMP,,CHN,Chrysler Hall North (Caution Mca),MG11,,,,,,,0,,,,,0,,
HWHPCP07-CHN,PUMP,,CHN,Chrysler Hall North (Caution Mca),MG11,,,,,,,0,,,,,0,,
SP01-CHN,PUMP,,CHN,Chrysler Hall North (Caution Mca),MG11,,,,,,,0,,,,,0,,
CHWP04-CHNE,PUMP,,CHNE,CHRYSLER NORTH EXT. (caution MCA),MG13,,,,,,,0,,,,,0,,
SP01-CHNE,PUMP,,CHNE,CHRYSLER NORTH EXT. (caution MCA),MG13,,,,,,,0,,,,,0,,
HWHRCP08-CHS,PUMP,,CHS,Chrysler Hall South (Caution Mca),M09,,,,,,,0,,,,,0,,
HWHRCP09-CHS,PUMP,,CHS,Chrysler Hall South (Caution Mca),M09,,,,,,,0,,,,,0,,
SP01-CHS,PUMP,,CHS,Chrysler Hall South (Caution Mca),M09,,,,,,,0,,,,,0,,
DBP01-CHT,PUMP,,CHT,Chrysler Tower (Caution Mca),M01,,,,,,,0,,,,,0,,
DBPCP03-CHT,PUMP,,CHT,Chrysler Tower (Caution Mca),M01,,,,,,,0,,,,,0,,
DBPCP05-CHT,PUMP,,CHT,Chrysler Tower (Caution Mca),M01,,,,,,,0,,,,,0,,
DHWCP01-CHT,PUMP,,CHT,Chrysler Tower (Caution Mca),M01,,,,,,,0,,,,,0,,
DHWCP02-CHT,PUMP,,CHT,Chrysler Tower (Caution Mca),M01,,,,,,,0,,,,,0,,
SP01-CHT,PUMP,,CHT,Chrysler Tower (Caution Mca),07,,,,,,,0,,,,,0,,
CIRCP01-CLAR-1,PUMP,Demolished,CLAR 1,CLARK PHASE 1,M1A,,,,,,,0,,,,,0,,
CHWP01-CRP,PUMP,,CRP,Central Refrigeration Plant,,,,,,,,0,,,,,0,,
CHWP02-CRP,PUMP,,CRP,Central Refrigeration Plant,,,,,,,,0,,,,,0,,
CHWP03-CRP,PUMP,,CRP,Central Refrigeration Plant,,,,,,,,0,,,,,0,,
CHWP04-CRP,PUMP,,CRP,Central Refrigeration Plant,,,,,,,,0,,,,,0,,
DBP01-CRP,PUMP,,CRP,Central Refrigeration Plant,,,,,,,,0,,,,,0,,
DHWCP01-CRP,PUMP,,CRP,Central Refrigeration Plant,,,,,,,,0,,,,,0,,
DHWCP02-CRP,PUMP,,CRP,Central Refrigeration Plant,,,,,,,,0,,,,,0,,
SP01-CRP,PUMP,,CRP,Central Refrigeration Plant,,,,,,,,0,,,,,0,,
CHWP01-EDUC,PUMP,,EDUC,Faculty Of Education,MB01,,,,,,,0,,,,,0,,
CHWP02-EDUC,PUMP,,EDUC,Faculty Of Education,MB01,,,,,,,0,,,,,0,,
DHWCP01-EDUC,PUMP,,EDUC,Faculty Of Education,MB01,,,,,,,0,,,,,0,,
FP01-EDUC,PUMP,,EDUC,Faculty Of Education,MB01,,,,,,,0,,,,,0,,
HWHP03-EDUC,PUMP,,EDUC,Faculty Of Education,MB01,,,,,,,0,,,,,0,,
HWHP04-EDUC,PUMP,,EDUC,Faculty Of Education,MB01,,,,,,,0,,,,,0,,
HWHP05-EDUC,PUMP,,EDUC,Faculty Of Education,MB01,,,,,,,0,,,,,0,,
SWP01-EDUC,PUMP,,EDUC,Faculty Of Education,MB01,,,,,,,0,,,,,0,,
SWP02-EDUC,PUMP,,EDUC,Faculty Of Education,MB01,,,,,,,0,,,,,0,,
DHWCP09-ERIE,PUMP,,ERIE,Erie Hall (Caution Mca),MG03,,,,,,,0,,,,,0,,
HWHP01-ERIE,PUMP,,ERIE,Erie Hall (Caution Mca),G143,,,,,,,0,,,,,0,,
CHWP01-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),M06,,,,,,,0,,,,,0,,
CHWP02-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),PENTHSE,,,,,,,0,,,,,0,,
CHWPHV08-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),CENTRE PENTHSE,,,,,,,0,,,,,0,,
CIRCP01-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),CENTRE PENTHSE,,,,,,,0,,,,,0,,
CIRCP02-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),PENTHOUS,,,,,,,0,,,,,0,,
CIRCP03-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),PENTHOUS,,,,,,,0,,,,,0,,
CIRCP04-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),PENTHOUS,,,,,,,0,,,,,0,,
DCWB01-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),366A,,,,,,,0,,,,,0,,
HWHP01-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),CENTRE PENTHSE,,,,,,,0,,,,,0,,
HWHP02-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),PENTHSE,,,,,,,0,,,,,0,,
HWHP03-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),PENTHSE,,,,,,,0,,,,,0,,
HWHP04-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),NORTH PENTHSE,,,,,,,0,,,,,0,,
HWHP09-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),PENTHSE,,,,,,,0,,,,,0,,
HWHP10-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),PENTHSE,,,,,,,0,,,,,0,,
HWHP11-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),PENTHSE,,,,,,,0,,,,,0,,
HWRP01-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),M06,,,,,,,0,,,,,0,,
HWRP02-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),M09,,,,,,,0,,,,,0,,
HYP01-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),PENTHSE,,,,,,,0,,,,,0,,
SP01-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),M06,,,,,,,0,,,,,0,,
SP02-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),B55,,,,,,,0,,,,,0,,
SP03-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),B05,,,,,,,0,,,,,0,,
SP05-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),B65,,,,,,,0,,,,,0,,
SP06-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),B05,,,,,,,0,,,,,0,,
SP07-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),B15,,,,,,,0,,,,,0,,
SP41-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),M06,,,,,,,0,,,,,0,,
SP42-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),M06,,,,,,,0,,,,,0,,
SP43-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),M06,,,,,,,0,,,,,0,,
SP44-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),M06,,,,,,,0,,,,,0,,
SWP01-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),M09,,,,,,,0,,,,,0,,
SWP02-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),M09,,,,,,,0,,,,,0,,
SWP05-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),M09,,,,,,,0,,,,,0,,
SWP06-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),M09,,,,,,,0,,,,,0,,
SWP07-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),M09,,,,,,,0,,,,,0,,
SWP08-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),M09,,,,,,,0,,,,,0,,
SWP22-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),J02,,,,,,,0,,,,,0,,
SWP23-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),J02,,,,,,,0,,,,,0,,
SWP29-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),M09,,,,,,,0,,,,,0,,
SWP30-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),M09,,,,,,,0,,,,,0,,
VP02-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),M07,,,,,,,0,,,,,0,,
VPA01-ESSX,PUMP,,ESSX,Essex Hall (Caution Mca),M07,,,,,,,0,,,,,0,,
CHWP01-GL,PUMP,,GLIER,Great Lakes Inst.Env.Rsch,M103,,,,,,,0,,,,,0,,
CHWP02-GL,PUMP,,GLIER,Great Lakes Inst.Env.Rsch,M103,,,,,,,0,,,,,0,,
CIRCP01-GL,PUMP,,GLIER,Great Lakes Inst.Env.Rsch,M103A,,,,,,,0,,,,,0,,
CIRCP02-GL,PUMP,,GLIER,Great Lakes Inst.Env.Rsch,M103A,,,,,,,0,,,,,0,,
CIRCP03-GL,PUMP,,GLIER,Great Lakes Inst.Env.Rsch,M103,,,,,,,0,,,,,0,,
CIRCP04-GL,PUMP,,GLIER,Great Lakes Inst.Env.Rsch,M124,,,,,,,0,,,,,0,,
CIRCP05-GL,PUMP,,GLIER,Great Lakes Inst.Env.Rsch,M124,,,,,,,0,,,,,0,,
CIRCP06-GL,PUMP,,GLIER,Great Lakes Inst.Env.Rsch,M301,,,,,,,0,,,,,0,,
HWHP01-GL,PUMP,,GLIER,Great Lakes Inst.Env.Rsch,M103A,,,,,,,0,,,,,0,,
HWHP02-GL,PUMP,,GLIER,Great Lakes Inst.Env.Rsch,M103A,,,,,,,0,,,,,0,,
HWHP03-GL,PUMP,,GLIER,Great Lakes Inst.Env.Rsch,M103A,,,,,,,0,,,,,0,,
HWHP04-GL,PUMP,,GLIER,Great Lakes Inst.Env.Rsch,M103A,,,,,,,0,,,,,0,,
HWHP05-GL,PUMP,,GLIER,Great Lakes Inst.Env.Rsch,M103,,,,,,,0,,,,,0,,
HWHP06-GL,PUMP,,GLIER,Great Lakes Inst.Env.Rsch,M103,,,,,,,0,,,,,0,,
VP01-GL,PUMP,,GLIER,Great Lakes Inst.Env.Rsch,M319,,,,,,,0,,,,,0,,
CHWP01-HK,PUMP,,HK,Faculty Of Human Kinetics,M02,,,,,,,0,,,,,0,,
DHWCP01-HK,PUMP,,HK,Faculty Of Human Kinetics,M02,,,,,,,0,,,,,0,,
DHWCP02-HK,PUMP,,HK,Faculty Of Human Kinetics,M02,,,,,,,0,,,,,0,,
HWHP01-HK,PUMP,,HK,Faculty Of Human Kinetics,M02,,,,,,,0,,,,,0,,
HWHP02-HK,PUMP,,HK,Faculty Of Human Kinetics,M02,,,,,,,0,,,,,0,,
MISC01-UNASSIGNED,PUMP,,,,,Maint Room,,,,,,,0,,,,,0,,
`;

export const loadData = (): BuildingData[] => {
  const lines = RAW_EQUIPMENT_CSV.trim().split('\n');
  const headers = lines[0].split(',');
  
  const buildingMap = new Map<string, BuildingData>();

  // Process data rows
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    
    // Map standard CSV fields to Equipment interface
    // CSV Header: Equipment,EquipmentDesc,Notes,Location,LocationDesc,Room,Key For Access,CreationDate,AssetTag,SerialNum,PurchaseDate,FailureClass,Hazardous,Instructions,ItemNum,Manufacturer,PurchaseDate,PurchasePrice,Vendor,WarrantyDate
    
    // Handle unassigned locations by forcing them to MISC
    let locCode = values[3]?.trim();
    let locDesc = values[4]?.trim();

    if (!locCode) {
      locCode = 'MISC';
      locDesc = 'Miscellaneous Equipment';
    }

    const eq: Equipment = {
      id: `EQ-${i}`,
      Equipment: values[0] || `Unknown-${i}`,
      EquipmentDesc: values[1] || '',
      Notes: values[2] || '',
      Location: locCode,
      LocationDesc: locDesc,
      Room: values[5] || '',
      KeyAccess: values[6] || '',
      AssetTag: values[8] || '',
      SerialNum: values[9] || '',
      PurchaseDate: values[10] || '', // First PurchaseDate occurrence
      Manufacturer: values[15] || '',
      Model: '', // Not in CSV explicitly, mapping generic
      Vendor: values[18] || '',
      WarrantyDate: values[19] || '',
      images: []
    };

    if (!buildingMap.has(locCode)) {
      buildingMap.set(locCode, {
        code: locCode,
        name: locDesc || locCode,
        maintenanceRooms: [], 
        equipment: [],
        floorPlans: [],
        googleMapsLink: '',
        buildingImage: ''
      });
    }

    const building = buildingMap.get(locCode)!;
    building.equipment.push(eq);
  }

  // Populate maintenance rooms from equipment room list (deduplicated)
  buildingMap.forEach(building => {
    const uniqueRooms = new Set(building.equipment.map(e => e.Room).filter(r => r));
    building.maintenanceRooms = Array.from(uniqueRooms).map((r, idx) => ({
      id: `${building.code}-${r}`,
      Building: building.code,
      Floor: 'N/A', // CSV doesn't have floor info per room
      RoomNumber: r,
      Description: 'Maintenance Room',
      floorPlanId: undefined,
      doorImage: undefined
    })).sort((a,b) => a.RoomNumber.localeCompare(b.RoomNumber));
  });

  return Array.from(buildingMap.values()).sort((a, b) => a.name.localeCompare(b.name));
};