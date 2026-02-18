'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BookOpen,
  UtensilsCrossed,
  Plus,
  Pencil,
  Trash2,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface Menu {
  id: string
  user_id: string
  name: string
  is_active: boolean
  valid_from: string | null
  valid_to: string | null
}

interface MenuCategory {
  id: string
  user_id: string
  name: string
  sort_order: number
}

interface MenuItem {
  id: string
  user_id: string
  menu_id: string | null
  category_id: string | null
  name: string
  description: string | null
  price: number
  allergens: string[] | null
  is_available: boolean
  menu_categories?: MenuCategory | null
}

const COMMON_ALLERGENS = [
  'Gluten',
  'Laktos',
  'N\u00f6tter',
  'Skaldjur',
  '\u00c4gg',
  'Soja',
  'Fisk',
  'Selleri',
]

const EMPTY_MENU_FORM = {
  name: '',
  valid_from: '',
  valid_to: '',
}

const EMPTY_ITEM_FORM = {
  name: '',
  description: '',
  price: 0,
  allergens: [] as string[],
  is_available: true,
  category_id: '',
}

export function MenyhanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState('menyer')
  const [loading, setLoading] = useState(true)

  // Menus state
  const [menus, setMenus] = useState<Menu[]>([])
  const [menuDialogOpen, setMenuDialogOpen] = useState(false)
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null)
  const [menuForm, setMenuForm] = useState(EMPTY_MENU_FORM)
  const [savingMenu, setSavingMenu] = useState(false)

  // Items state
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [itemForm, setItemForm] = useState(EMPTY_ITEM_FORM)
  const [savingItem, setSavingItem] = useState(false)

  // ===== Data fetching =====
  const fetchMenus = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('menus')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    setMenus(data ?? [])
    setLoading(false)
  }, [supabase])

  const fetchItems = useCallback(async () => {
    setItemsLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setItemsLoading(false); return }

    const [itemsResult, categoriesResult] = await Promise.all([
      supabase
        .from('menu_items')
        .select('*, menu_categories(*)')
        .eq('user_id', user.id)
        .order('name', { ascending: true }),
      supabase
        .from('menu_categories')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true }),
    ])

    setMenuItems(itemsResult.data ?? [])
    setCategories(categoriesResult.data ?? [])
    setItemsLoading(false)
  }, [supabase])

  useEffect(() => { fetchMenus() }, [fetchMenus])
  useEffect(() => { fetchItems() }, [fetchItems])

  // ===== Menu active toggle =====
  async function handleToggleMenuActive(menuId: string, activate: boolean) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (activate) {
      // Deactivate all other menus first
      await supabase
        .from('menus')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .neq('id', menuId)
    }

    await supabase
      .from('menus')
      .update({ is_active: activate })
      .eq('id', menuId)
      .eq('user_id', user.id)

    fetchMenus()
  }

  // ===== Menu CRUD =====
  function openNewMenu() {
    setEditingMenu(null)
    setMenuForm({ ...EMPTY_MENU_FORM })
    setMenuDialogOpen(true)
  }

  function openEditMenu(menu: Menu) {
    setEditingMenu(menu)
    setMenuForm({
      name: menu.name,
      valid_from: menu.valid_from ?? '',
      valid_to: menu.valid_to ?? '',
    })
    setMenuDialogOpen(true)
  }

  async function handleSaveMenu() {
    setSavingMenu(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingMenu(false); return }

    const payload = {
      user_id: user.id,
      name: menuForm.name,
      valid_from: menuForm.valid_from || null,
      valid_to: menuForm.valid_to || null,
    }

    if (editingMenu) {
      await supabase
        .from('menus')
        .update(payload)
        .eq('id', editingMenu.id)
        .eq('user_id', user.id)
    } else {
      await supabase.from('menus').insert({ ...payload, is_active: false })
    }

    setSavingMenu(false)
    setMenuDialogOpen(false)
    fetchMenus()
  }

  async function handleDeleteMenu(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('menus')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    fetchMenus()
  }

  // ===== Item CRUD =====
  function openNewItem() {
    setEditingItem(null)
    setItemForm({ ...EMPTY_ITEM_FORM })
    setItemDialogOpen(true)
  }

  function openEditItem(item: MenuItem) {
    setEditingItem(item)
    setItemForm({
      name: item.name,
      description: item.description ?? '',
      price: item.price,
      allergens: item.allergens ?? [],
      is_available: item.is_available,
      category_id: item.category_id ?? '',
    })
    setItemDialogOpen(true)
  }

  async function handleSaveItem() {
    setSavingItem(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingItem(false); return }

    const payload = {
      user_id: user.id,
      name: itemForm.name,
      description: itemForm.description || null,
      price: itemForm.price,
      allergens: itemForm.allergens.length > 0 ? itemForm.allergens : null,
      is_available: itemForm.is_available,
      category_id: itemForm.category_id || null,
    }

    if (editingItem) {
      await supabase
        .from('menu_items')
        .update(payload)
        .eq('id', editingItem.id)
        .eq('user_id', user.id)
    } else {
      await supabase.from('menu_items').insert(payload)
    }

    setSavingItem(false)
    setItemDialogOpen(false)
    fetchItems()
  }

  async function handleDeleteItem(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('menu_items')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    fetchItems()
  }

  async function handleToggleItemAvailable(itemId: string, available: boolean) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('menu_items')
      .update({ is_available: available })
      .eq('id', itemId)
      .eq('user_id', user.id)

    fetchItems()
  }

  function toggleAllergen(allergen: string) {
    setItemForm((f) => ({
      ...f,
      allergens: f.allergens.includes(allergen)
        ? f.allergens.filter((a) => a !== allergen)
        : [...f.allergens, allergen],
    }))
  }

  // ===== Group items by category =====
  function groupedItems(): { category: MenuCategory | null; items: MenuItem[] }[] {
    const grouped = new Map<string | null, MenuItem[]>()

    for (const item of menuItems) {
      const key = item.category_id
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(item)
    }

    const result: { category: MenuCategory | null; items: MenuItem[] }[] = []

    // Add categorized items first, sorted by category sort_order
    for (const cat of categories) {
      const items = grouped.get(cat.id)
      if (items && items.length > 0) {
        result.push({ category: cat, items })
      }
    }

    // Add uncategorized items
    const uncategorized = grouped.get(null) ?? grouped.get('') ?? []
    if (uncategorized.length > 0) {
      result.push({ category: null, items: uncategorized })
    }

    return result
  }

  // ===== Render =====
  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName={sectorSlug}
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          activeTab === 'menyer' ? (
            <Button onClick={openNewMenu}>
              <Plus className="mr-2 h-4 w-4" />
              Ny meny
            </Button>
          ) : (
            <Button onClick={openNewItem}>
              <Plus className="mr-2 h-4 w-4" />
              Ny r\u00e4tt
            </Button>
          )
        }
        tabs={
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList>
              <TabsTrigger value="menyer">Menyer</TabsTrigger>
              <TabsTrigger value="ratter">R\u00e4tter</TabsTrigger>
            </TabsList>

            {/* ===== Menyer tab ===== */}
            <TabsContent value="menyer" className="mt-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : menus.length === 0 ? (
                <EmptyModuleState
                  icon={BookOpen}
                  title="Inga menyer"
                  description="Skapa din f\u00f6rsta meny f\u00f6r att b\u00f6rja hantera restaurangens utbud."
                  actionLabel="Ny meny"
                  onAction={openNewMenu}
                />
              ) : (
                <div className="space-y-3">
                  {menus.map((menu) => (
                    <div
                      key={menu.id}
                      className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4"
                    >
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{menu.name}</span>
                          {menu.is_active && (
                            <StatusBadge label="Aktiv" variant="success" />
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          {menu.valid_from && <span>Fr\u00e5n: {menu.valid_from}</span>}
                          {menu.valid_to && <span>Till: {menu.valid_to}</span>}
                          {!menu.valid_from && !menu.valid_to && <span>Inget datumintervall</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={menu.is_active}
                            onCheckedChange={(checked) => handleToggleMenuActive(menu.id, checked)}
                          />
                          <span className="text-xs text-muted-foreground">
                            {menu.is_active ? 'Aktiv' : 'Inaktiv'}
                          </span>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => openEditMenu(menu)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDeleteMenu(menu.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ===== R\u00e4tter tab ===== */}
            <TabsContent value="ratter" className="mt-6">
              {itemsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : menuItems.length === 0 ? (
                <EmptyModuleState
                  icon={UtensilsCrossed}
                  title="Inga r\u00e4tter"
                  description="L\u00e4gg till r\u00e4tter f\u00f6r att bygga upp din meny."
                  actionLabel="Ny r\u00e4tt"
                  onAction={openNewItem}
                />
              ) : (
                <div className="space-y-8">
                  {groupedItems().map(({ category, items }) => (
                    <div key={category?.id ?? 'uncategorized'}>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        {category?.name ?? '\u00d6vrigt'}
                      </h3>
                      <div className="space-y-3">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4"
                          >
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{item.name}</span>
                                <span className="text-sm text-muted-foreground">
                                  {item.price.toFixed(0)} kr
                                </span>
                              </div>
                              {item.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                  {item.description}
                                </p>
                              )}
                              {item.allergens && item.allergens.length > 0 && (
                                <div className="flex items-center gap-1 mt-1.5">
                                  {item.allergens.map((allergen) => (
                                    <Badge key={allergen} variant="outline" className="text-[10px] px-1.5 py-0">
                                      {allergen}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-3 flex-shrink-0">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={item.is_available}
                                  onCheckedChange={(checked) => handleToggleItemAvailable(item.id, checked)}
                                />
                                <span className="text-xs text-muted-foreground">
                                  {item.is_available ? 'Tillg\u00e4nglig' : 'Ej tillg\u00e4nglig'}
                                </span>
                              </div>
                              <Button variant="ghost" size="icon" onClick={() => openEditItem(item)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => handleDeleteItem(item.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        }
      >
        {null}
      </ModuleWorkspaceShell>

      {/* ===== Menu Dialog ===== */}
      <Dialog open={menuDialogOpen} onOpenChange={setMenuDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMenu ? 'Redigera meny' : 'Ny meny'}</DialogTitle>
            <DialogDescription>
              {editingMenu
                ? 'Uppdatera menyens uppgifter.'
                : 'Skapa en ny meny f\u00f6r din restaurang.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="menu-name">Menynamn *</Label>
              <Input
                id="menu-name"
                value={menuForm.name}
                onChange={(e) => setMenuForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Lunchmeny, Kvällsmeny, etc."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="menu-from">Giltig fr\u00e5n</Label>
                <Input
                  id="menu-from"
                  type="date"
                  value={menuForm.valid_from}
                  onChange={(e) => setMenuForm((f) => ({ ...f, valid_from: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="menu-to">Giltig till</Label>
                <Input
                  id="menu-to"
                  type="date"
                  value={menuForm.valid_to}
                  onChange={(e) => setMenuForm((f) => ({ ...f, valid_to: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMenuDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleSaveMenu}
              disabled={savingMenu || !menuForm.name}
            >
              {savingMenu && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingMenu ? 'Uppdatera' : 'Skapa meny'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Item Dialog ===== */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Redigera r\u00e4tt' : 'Ny r\u00e4tt'}</DialogTitle>
            <DialogDescription>
              {editingItem
                ? 'Uppdatera r\u00e4ttens uppgifter.'
                : 'L\u00e4gg till en ny r\u00e4tt p\u00e5 menyn.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="item-name">Namn *</Label>
              <Input
                id="item-name"
                value={itemForm.name}
                onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Pasta Carbonara"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="item-desc">Beskrivning</Label>
              <Input
                id="item-desc"
                value={itemForm.description}
                onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Krämig pasta med guanciale och pecorino"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="item-price">Pris (kr) *</Label>
                <Input
                  id="item-price"
                  type="number"
                  min={0}
                  step={1}
                  value={itemForm.price}
                  onChange={(e) => setItemForm((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="item-category">Kategori</Label>
                <Select
                  value={itemForm.category_id}
                  onValueChange={(val) => setItemForm((f) => ({ ...f, category_id: val }))}
                >
                  <SelectTrigger id="item-category">
                    <SelectValue placeholder="V\u00e4lj kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Allergener</Label>
              <div className="grid grid-cols-2 gap-2">
                {COMMON_ALLERGENS.map((allergen) => (
                  <label key={allergen} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={itemForm.allergens.includes(allergen)}
                      onCheckedChange={() => toggleAllergen(allergen)}
                    />
                    <span className="text-sm">{allergen}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="item-available"
                checked={itemForm.is_available}
                onCheckedChange={(checked) => setItemForm((f) => ({ ...f, is_available: checked }))}
              />
              <Label htmlFor="item-available">Tillg\u00e4nglig</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleSaveItem}
              disabled={savingItem || !itemForm.name}
            >
              {savingItem && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingItem ? 'Uppdatera' : 'L\u00e4gg till r\u00e4tt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
