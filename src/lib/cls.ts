export type RoomStatus = "VACANT" | "OCCUPIED" | "MAINTENANCE" | "RESERVED"

export const STATUS_META: Record<
  RoomStatus,
  { label: string; badge: string; dot: string; bar: string; pin: string }
> = {
  VACANT: {
    label: "ว่าง",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    pin: "bg-emerald-500/60",
  },
  OCCUPIED: {
    label: "มีผู้ใช้งาน",
    badge: "bg-sky-100 text-sky-800 border-sky-200",
    dot: "bg-sky-500",
    bar: "bg-sky-500",
    pin: "bg-sky-500/60",
  },
  MAINTENANCE: {
    label: "ซ่อมบำรุง",
    badge: "bg-red-100 text-red-800 border-red-200",
    dot: "bg-red-500",
    bar: "bg-red-500",
    pin: "bg-red-500/60",
  },
  RESERVED: {
    label: "จอง",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
    pin: "bg-amber-500/60",
  },
}

export const STATUS_ORDER: RoomStatus[] = ["VACANT", "OCCUPIED", "MAINTENANCE", "RESERVED"]

export type CoolingSpec = {
  type?: string | null
  btu?: string | null
  btuTotal?: number | null
  unitsTotal?: number | null
  unitsReady?: number | null
  unitsDown?: number | null
  efficiencyPct?: number | null
}

export type PowerSpec = {
  type?: string | null
  capacity?: string | null
}

export type SecurityData = {
  cctvCount?: number | null
  accessControl?: string | null
  fireSuppression?: string | null
  vesda?: string | null
}

export const ACCESS_CONTROL_OPTIONS = [
  "RFID Proximity Card",
  "PIN Code",
  "Biometric (Facial + Fingerprint)",
  "Key",
] as const

export const FIRE_SUPPRESSION_OPTIONS = [
  "ไม่ติดตั้ง",
  "CO2 Clean Agent System",
  "FM-200 (HFC-227ea)",
  "Novec 1230 (FK-5-1-12)",
  "Stat-X Aerosol System",
] as const

export const SMOKE_DETECTOR_OPTIONS = ["ไม่ติดตั้ง", "VESDA"] as const

export function shortOptionLabel(v: string | null | undefined): string {
  const t = (v ?? "").trim()
  if (!t) return "ไม่ติดตั้ง"
  return t.replace(/\s*\(.*\)\s*$/, "").trim()
}

export type AccessControlOption = (typeof ACCESS_CONTROL_OPTIONS)[number]

export function splitAccessControl(v: string | null | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
}

export function joinAccessControl(vals: string[]): string | null {
  const cleaned = vals.map((x) => x.trim()).filter(Boolean)
  return cleaned.length > 0 ? cleaned.join(", ") : null
}

export type RoomPhotoFile = { url: string; name: string }

export type SerializedRoom = {
  id: number
  code: string
  no: number
  name: string
  status: RoomStatus
  areaSqm: number | null
  ceilingHeightM: number | null
  raisedFloorCm: number | null
  floorLoadKgm2: number | null
  tenant: string | null
  floorCode: string
  floorLabel: string
  level: number
  buildingCode: string
  buildingName: string
  siteCode: string
  siteName: string
  security: SecurityData | null
  cooling: { code: string; name: string; model: string | null; specs: CoolingSpec }[]
  photos: RoomPhotoFile[]
}

export type PlanPin = {
  id: number
  code: string
  x: number | null
  y: number | null
}

export type PlanRoom = {
  id: number
  code: string
  no: number
  name: string
  status: RoomStatus
  areaSqm: number | null
  tenant: string | null
  pin: PlanPin | null
}

export type SerializedFloorPlan = {
  code: string
  label: string
  level: number
  planImage: string | null
  siteCode: string
  siteName: string
  buildingCode: string
  buildingName: string
  rooms: PlanRoom[]
}

export type SerializedPowerAsset = {
  id: number
  code: string
  legacyCode: string | null
  name: string
  brand: string | null
  model: string | null
  status: string | null
  note: string | null
  specType: string | null
  capacity: string | null
  load: string | null
  floorId: number | null
  roomId: number | null
  siteCode: string | null
  buildingCode: string | null
  floorCode: string | null
  floorLabel: string | null
  roomCode: string | null
}

export type SerializedCoolingAsset = {
  id: number
  code: string
  legacyCode: string | null
  name: string
  model: string | null
  specType: string | null
  note: string | null
  btu: string | null
  btuTotal: number | null
  unitsTotal: number | null
  unitsReady: number | null
  unitsDown: number | null
  efficiencyPct: number | null
  roomId: number | null
  siteCode: string | null
  roomCode: string | null
}

export type SerializedCertificate = {
  id: number
  code: string
  name: string
  scope: string
  issuer: string | null
  certNo: string | null
  issuedAt: string | null
  expiresAt: string | null
  detail: string | null
  siteId: number
  siteCode: string
  siteName: string
  buildingCode: string | null
  roomCode: string | null
}

export type EngFloorOption = {
  id: number
  code: string
  label: string
  level: number
  rooms: { id: number; code: string; name: string }[]
}

export type EngHierarchyBuilding = {
  id: number
  code: string
  name: string
  floors: EngFloorOption[]
}

export type EngHierarchySite = {
  id: number
  code: string
  name: string
  buildings: EngHierarchyBuilding[]
}

export type SerializedRoomSecurityRow = {
  id: number
  code: string
  name: string
  siteCode: string
  floorLabel: string
  cctvCount: number | null
  accessControl: string | null
  fireSuppression: string | null
  vesda: string | null
}

export const CUSTOMER_STAGES = [
  "INQUIRY",
  "ROOM_INQUIRY",
  "RENTING",
  "CLOSED",
] as const

export type CustomerStage = (typeof CUSTOMER_STAGES)[number]

export const CUSTOMER_STAGE_META: Record<
  CustomerStage,
  { label: string; badge: string }
> = {
  INQUIRY: { label: "สอบถามทั่วไป", badge: "bg-slate-100 text-slate-700 border-slate-200" },
  ROOM_INQUIRY: { label: "สอบถามห้องว่าง", badge: "bg-sky-100 text-sky-800 border-sky-200" },
  RENTING: { label: "เช่าห้อง", badge: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  CLOSED: { label: "ปิดการติดต่อ", badge: "bg-zinc-100 text-zinc-600 border-zinc-200" },
}

export type SerializedCustomer = {
  id: number
  code: string
  name: string
  stage: CustomerStage
  contactName: string
  contactPosition: string | null
  contactPhone: string
  contactEmail: string | null
  interestedRooms: string[]
  inquiryDate: string
  contractNo: string | null
  contractStart: string | null
  contractEnd: string | null
  note: string | null
  rentedRoomCount: number
  rentedRooms: { code: string; name: string }[]
}

export type SerializedSite = {
  id: number
  code: string
  name: string
  province: string
  lat: number | null
  lng: number | null
  buildingCount: number
  floorCount: number
  roomCount: number
}

export type SerializedBuilding = {
  id: number
  code: string
  name: string
  siteCode: string
  siteName: string
  floorCount: number
  roomCount: number
}

export type SerializedFloor = {
  id: number
  code: string
  level: number
  label: string
  planImage: string | null
  buildingCode: string
  buildingName: string
  siteCode: string
  roomCount: number
}

export type SerializedLocationRoom = {
  id: number
  code: string
  no: number
  name: string
  status: RoomStatus
  areaSqm: number | null
  tenant: string | null
  floorCode: string
  floorLabel: string
}
