// ============================================================
// Restaurant Module Types
// TypeScript interfaces for all restaurant module database tables
// ============================================================

// ============================================================
// Status Union Types
// ============================================================

export type ReservationStatus = 'confirmed' | 'seated' | 'completed' | 'no_show' | 'cancelled'

export type ShiftStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled'

export type OrderStatus = 'draft' | 'sent' | 'confirmed' | 'delivered' | 'cancelled'

export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed'

// ============================================================
// Shared Base Fields
// ============================================================

/** Common fields present on every module table row */
interface BaseEntity {
  id: string
  userId: string
  createdAt: string
  updatedAt: string
}

// ============================================================
// Service Hours
// ============================================================

export interface ServiceHours {
  lunchStart: string
  lunchEnd: string
  dinnerStart: string
  dinnerEnd: string
}

// ============================================================
// Core Interfaces
// ============================================================

/** restaurant_tables */
export interface RestaurantTable extends BaseEntity {
  name: string
  capacity: number
  zone: string | null
  isActive: boolean
  sortOrder: number
}

/** reservations */
export interface Reservation extends BaseEntity {
  tableId: string
  guestName: string
  guestPhone: string | null
  guestEmail: string | null
  partySize: number
  date: string
  timeStart: string
  timeEnd: string
  status: ReservationStatus
  notes: string | null
  source: string | null
}

/** menus */
export interface Menu extends BaseEntity {
  name: string
  isActive: boolean
  validFrom: string | null
  validTo: string | null
}

/** menu_categories */
export interface MenuCategory extends BaseEntity {
  menuId: string
  name: string
  sortOrder: number
}

/** menu_items */
export interface MenuItem extends BaseEntity {
  categoryId: string
  name: string
  description: string | null
  price: number
  allergens: string[]
  isAvailable: boolean
  sortOrder: number
}

/** ingredients */
export interface Ingredient extends BaseEntity {
  name: string
  unit: string
  pricePerUnit: number
  category: string | null
}

/** recipes */
export interface Recipe extends BaseEntity {
  name: string
  portions: number
  sellingPrice: number
  notes: string | null
}

/** recipe_ingredients */
export interface RecipeIngredient extends BaseEntity {
  recipeId: string
  ingredientId: string
  quantity: number
  unit: string
  sortOrder: number
}

/** staff_members */
export interface StaffMember extends BaseEntity {
  name: string
  email: string | null
  phone: string | null
  role: string
  hourlyRate: number
  isActive: boolean
}

/** shifts */
export interface Shift extends BaseEntity {
  staffMemberId: string
  date: string
  timeStart: string
  timeEnd: string
  role: string
  status: ShiftStatus
  notes: string | null
}

/** suppliers */
export interface Supplier extends BaseEntity {
  name: string
  contactEmail: string | null
  contactPhone: string | null
  deliveryDays: string[]
  minOrder: number | null
  notes: string | null
}

/** supplier_orders */
export interface SupplierOrder extends BaseEntity {
  supplierId: string
  orderDate: string
  deliveryDate: string | null
  status: OrderStatus
  totalAmount: number
  notes: string | null
}

/** supplier_order_items */
export interface SupplierOrderItem extends BaseEntity {
  orderId: string
  ingredientId: string | null
  description: string
  quantity: number
  unit: string
  unitPrice: number
  lineTotal: number
}

/** waste_entries */
export interface WasteEntry extends BaseEntity {
  date: string
  itemName: string
  category: string | null
  quantity: number
  unit: string
  estimatedCost: number
  reason: string | null
  notes: string | null
}

/** module_kpi_targets */
export interface ModuleKpiTarget extends BaseEntity {
  sectorSlug: string
  moduleSlug: string
  kpiKey: string
  targetValue: number
  periodType: string
}

/** restaurant_capacity */
export interface RestaurantCapacity extends BaseEntity {
  totalSeats: number
  serviceHours: ServiceHours
}

/** module_imports */
export interface ModuleImport extends BaseEntity {
  sectorSlug: string
  moduleSlug: string
  filename: string
  status: ImportStatus
  rowsImported: number
  errorMessage: string | null
  importData: Record<string, unknown> | null
}

/** module_config */
export interface ModuleConfig extends BaseEntity {
  sectorSlug: string
  moduleSlug: string
  configKey: string
  configValue: unknown
}

// ============================================================
// Create / Update Input Types
// ============================================================

/** Create a new reservation */
export interface CreateReservationInput {
  tableId: string
  guestName: string
  guestPhone?: string
  guestEmail?: string
  partySize: number
  date: string
  timeStart: string
  timeEnd: string
  status?: ReservationStatus
  notes?: string
  source?: string
}

/** Partial update for an existing reservation */
export type UpdateReservationInput = Partial<CreateReservationInput>

/** Create a new menu */
export interface CreateMenuInput {
  name: string
  isActive?: boolean
  validFrom?: string
  validTo?: string
}

/** Partial update for an existing menu */
export type UpdateMenuInput = Partial<CreateMenuInput>

/** Create a new menu category */
export interface CreateMenuCategoryInput {
  menuId: string
  name: string
  sortOrder?: number
}

/** Partial update for an existing menu category */
export type UpdateMenuCategoryInput = Partial<CreateMenuCategoryInput>

/** Create a new menu item */
export interface CreateMenuItemInput {
  categoryId: string
  name: string
  description?: string
  price: number
  allergens?: string[]
  isAvailable?: boolean
  sortOrder?: number
}

/** Partial update for an existing menu item */
export type UpdateMenuItemInput = Partial<CreateMenuItemInput>

/** Create a new ingredient */
export interface CreateIngredientInput {
  name: string
  unit: string
  pricePerUnit: number
  category?: string
}

/** Partial update for an existing ingredient */
export type UpdateIngredientInput = Partial<CreateIngredientInput>

/** Create a new recipe */
export interface CreateRecipeInput {
  name: string
  portions: number
  sellingPrice: number
  notes?: string
}

/** Partial update for an existing recipe */
export type UpdateRecipeInput = Partial<CreateRecipeInput>

/** Create a new recipe ingredient */
export interface CreateRecipeIngredientInput {
  recipeId: string
  ingredientId: string
  quantity: number
  unit: string
  sortOrder?: number
}

/** Partial update for an existing recipe ingredient */
export type UpdateRecipeIngredientInput = Partial<CreateRecipeIngredientInput>

/** Create a new staff member */
export interface CreateStaffMemberInput {
  name: string
  email?: string
  phone?: string
  role: string
  hourlyRate: number
  isActive?: boolean
}

/** Partial update for an existing staff member */
export type UpdateStaffMemberInput = Partial<CreateStaffMemberInput>

/** Create a new shift */
export interface CreateShiftInput {
  staffMemberId: string
  date: string
  timeStart: string
  timeEnd: string
  role: string
  status?: ShiftStatus
  notes?: string
}

/** Partial update for an existing shift */
export type UpdateShiftInput = Partial<CreateShiftInput>

/** Create a new supplier */
export interface CreateSupplierInput {
  name: string
  contactEmail?: string
  contactPhone?: string
  deliveryDays?: string[]
  minOrder?: number
  notes?: string
}

/** Partial update for an existing supplier */
export type UpdateSupplierInput = Partial<CreateSupplierInput>

/** Create a new supplier order */
export interface CreateSupplierOrderInput {
  supplierId: string
  orderDate: string
  deliveryDate?: string
  status?: OrderStatus
  totalAmount: number
  notes?: string
}

/** Partial update for an existing supplier order */
export type UpdateSupplierOrderInput = Partial<CreateSupplierOrderInput>

/** Create a new supplier order item */
export interface CreateSupplierOrderItemInput {
  orderId: string
  ingredientId?: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  lineTotal: number
}

/** Partial update for an existing supplier order item */
export type UpdateSupplierOrderItemInput = Partial<CreateSupplierOrderItemInput>

/** Create a new waste entry */
export interface CreateWasteEntryInput {
  date: string
  itemName: string
  category?: string
  quantity: number
  unit: string
  estimatedCost: number
  reason?: string
  notes?: string
}

/** Partial update for an existing waste entry */
export type UpdateWasteEntryInput = Partial<CreateWasteEntryInput>

/** Create a new restaurant table */
export interface CreateRestaurantTableInput {
  name: string
  capacity: number
  zone?: string
  isActive?: boolean
  sortOrder?: number
}

/** Partial update for an existing restaurant table */
export type UpdateRestaurantTableInput = Partial<CreateRestaurantTableInput>

/** Create a new KPI target */
export interface CreateModuleKpiTargetInput {
  sectorSlug: string
  moduleSlug: string
  kpiKey: string
  targetValue: number
  periodType: string
}

/** Partial update for an existing KPI target */
export type UpdateModuleKpiTargetInput = Partial<CreateModuleKpiTargetInput>

// ============================================================
// Swedish Status Label Maps
// ============================================================

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  confirmed: 'Bekräftad',
  seated: 'Sittande',
  completed: 'Avslutad',
  no_show: 'Utebliven',
  cancelled: 'Avbokad',
}

export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
  scheduled: 'Schemalagd',
  confirmed: 'Bekräftad',
  completed: 'Avslutad',
  cancelled: 'Avbokad',
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Utkast',
  sent: 'Skickad',
  confirmed: 'Bekräftad',
  delivered: 'Levererad',
  cancelled: 'Avbruten',
}
