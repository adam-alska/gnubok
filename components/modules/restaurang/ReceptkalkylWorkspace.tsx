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
  Calculator,
  Package,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface Ingredient {
  id: string
  user_id: string
  name: string
  unit: string
  price_per_unit: number
  category: string | null
}

interface Recipe {
  id: string
  user_id: string
  name: string
  portions: number
  selling_price: number
  notes: string | null
}

interface RecipeIngredient {
  id: string
  recipe_id: string
  ingredient_id: string
  quantity: number
  unit: string
  ingredients?: Ingredient | null
}

interface RecipeWithCost extends Recipe {
  recipe_ingredients: RecipeIngredient[]
  total_cost: number
  cost_per_portion: number
  margin_percent: number
}

const UNIT_OPTIONS = ['kg', 'l', 'st', 'g', 'ml', 'dl']

const EMPTY_RECIPE_FORM = {
  name: '',
  portions: 4,
  selling_price: 0,
  notes: '',
}

const EMPTY_INGREDIENT_FORM = {
  name: '',
  unit: 'kg',
  price_per_unit: 0,
  category: '',
}

const EMPTY_RECIPE_INGREDIENT = {
  ingredient_id: '',
  quantity: 0,
  unit: 'kg',
}

export function ReceptkalkylWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState('recept')

  // Recipes state
  const [recipes, setRecipes] = useState<RecipeWithCost[]>([])
  const [recipesLoading, setRecipesLoading] = useState(true)
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null)

  // Recipe dialog
  const [recipeDialogOpen, setRecipeDialogOpen] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState<RecipeWithCost | null>(null)
  const [recipeForm, setRecipeForm] = useState(EMPTY_RECIPE_FORM)
  const [savingRecipe, setSavingRecipe] = useState(false)

  // Recipe ingredients (within recipe dialog)
  const [recipeIngredients, setRecipeIngredients] = useState<Array<{ ingredient_id: string; quantity: number; unit: string }>>([])

  // Ingredients state
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [ingredientsLoading, setIngredientsLoading] = useState(true)

  // Ingredient dialog
  const [ingredientDialogOpen, setIngredientDialogOpen] = useState(false)
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null)
  const [ingredientForm, setIngredientForm] = useState(EMPTY_INGREDIENT_FORM)
  const [savingIngredient, setSavingIngredient] = useState(false)

  // Inline editing for ingredients
  const [inlineEditId, setInlineEditId] = useState<string | null>(null)
  const [inlineForm, setInlineForm] = useState(EMPTY_INGREDIENT_FORM)

  // ===== Data fetching =====
  const fetchIngredients = useCallback(async () => {
    setIngredientsLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setIngredientsLoading(false); return }

    const { data } = await supabase
      .from('ingredients')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true })

    setIngredients(data ?? [])
    setIngredientsLoading(false)
  }, [supabase])

  const fetchRecipes = useCallback(async () => {
    setRecipesLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setRecipesLoading(false); return }

    const { data: recipesData } = await supabase
      .from('recipes')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true })

    if (!recipesData || recipesData.length === 0) {
      setRecipes([])
      setRecipesLoading(false)
      return
    }

    // Fetch all recipe_ingredients with joined ingredients
    const recipeIds = recipesData.map((r) => r.id)
    const { data: riData } = await supabase
      .from('recipe_ingredients')
      .select('*, ingredients(*)')
      .in('recipe_id', recipeIds)

    const riByRecipe = new Map<string, RecipeIngredient[]>()
    for (const ri of (riData ?? [])) {
      if (!riByRecipe.has(ri.recipe_id)) riByRecipe.set(ri.recipe_id, [])
      riByRecipe.get(ri.recipe_id)!.push(ri)
    }

    const recipesWithCost: RecipeWithCost[] = recipesData.map((recipe) => {
      const ris = riByRecipe.get(recipe.id) ?? []
      const total_cost = ris.reduce((sum, ri) => {
        const ingredientPrice = ri.ingredients?.price_per_unit ?? 0
        return sum + ri.quantity * ingredientPrice
      }, 0)
      const cost_per_portion = recipe.portions > 0 ? total_cost / recipe.portions : 0
      const margin_percent =
        recipe.selling_price > 0
          ? ((recipe.selling_price - cost_per_portion) / recipe.selling_price) * 100
          : 0

      return {
        ...recipe,
        recipe_ingredients: ris,
        total_cost,
        cost_per_portion,
        margin_percent,
      }
    })

    setRecipes(recipesWithCost)
    setRecipesLoading(false)
  }, [supabase])

  useEffect(() => { fetchIngredients() }, [fetchIngredients])
  useEffect(() => { fetchRecipes() }, [fetchRecipes])

  // ===== Recipe CRUD =====
  function openNewRecipe() {
    setEditingRecipe(null)
    setRecipeForm({ ...EMPTY_RECIPE_FORM })
    setRecipeIngredients([])
    setRecipeDialogOpen(true)
  }

  function openEditRecipe(recipe: RecipeWithCost) {
    setEditingRecipe(recipe)
    setRecipeForm({
      name: recipe.name,
      portions: recipe.portions,
      selling_price: recipe.selling_price,
      notes: recipe.notes ?? '',
    })
    setRecipeIngredients(
      recipe.recipe_ingredients.map((ri) => ({
        ingredient_id: ri.ingredient_id,
        quantity: ri.quantity,
        unit: ri.unit,
      }))
    )
    setRecipeDialogOpen(true)
  }

  function addRecipeIngredientRow() {
    setRecipeIngredients((prev) => [...prev, { ...EMPTY_RECIPE_INGREDIENT }])
  }

  function removeRecipeIngredientRow(index: number) {
    setRecipeIngredients((prev) => prev.filter((_, i) => i !== index))
  }

  function updateRecipeIngredient(index: number, field: string, value: string | number) {
    setRecipeIngredients((prev) =>
      prev.map((ri, i) => (i === index ? { ...ri, [field]: value } : ri))
    )
  }

  async function handleSaveRecipe() {
    setSavingRecipe(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingRecipe(false); return }

    const payload = {
      user_id: user.id,
      name: recipeForm.name,
      portions: recipeForm.portions,
      selling_price: recipeForm.selling_price,
      notes: recipeForm.notes || null,
    }

    let recipeId: string

    if (editingRecipe) {
      await supabase
        .from('recipes')
        .update(payload)
        .eq('id', editingRecipe.id)
        .eq('user_id', user.id)
      recipeId = editingRecipe.id

      // Delete existing recipe_ingredients and re-insert
      await supabase
        .from('recipe_ingredients')
        .delete()
        .eq('recipe_id', recipeId)
    } else {
      const { data } = await supabase
        .from('recipes')
        .insert(payload)
        .select('id')
        .single()

      if (!data) { setSavingRecipe(false); return }
      recipeId = data.id
    }

    // Insert recipe_ingredients
    const validIngredients = recipeIngredients.filter(
      (ri) => ri.ingredient_id && ri.quantity > 0
    )
    if (validIngredients.length > 0) {
      await supabase.from('recipe_ingredients').insert(
        validIngredients.map((ri) => ({
          recipe_id: recipeId,
          ingredient_id: ri.ingredient_id,
          quantity: ri.quantity,
          unit: ri.unit,
        }))
      )
    }

    setSavingRecipe(false)
    setRecipeDialogOpen(false)
    fetchRecipes()
  }

  async function handleDeleteRecipe(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Delete recipe_ingredients first
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', id)
    await supabase.from('recipes').delete().eq('id', id).eq('user_id', user.id)

    fetchRecipes()
  }

  // ===== Ingredient CRUD =====
  function openNewIngredient() {
    setEditingIngredient(null)
    setIngredientForm({ ...EMPTY_INGREDIENT_FORM })
    setIngredientDialogOpen(true)
  }

  function openEditIngredient(ingredient: Ingredient) {
    setEditingIngredient(ingredient)
    setIngredientForm({
      name: ingredient.name,
      unit: ingredient.unit,
      price_per_unit: ingredient.price_per_unit,
      category: ingredient.category ?? '',
    })
    setIngredientDialogOpen(true)
  }

  async function handleSaveIngredient() {
    setSavingIngredient(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingIngredient(false); return }

    const payload = {
      user_id: user.id,
      name: ingredientForm.name,
      unit: ingredientForm.unit,
      price_per_unit: ingredientForm.price_per_unit,
      category: ingredientForm.category || null,
    }

    if (editingIngredient) {
      await supabase
        .from('ingredients')
        .update(payload)
        .eq('id', editingIngredient.id)
        .eq('user_id', user.id)
    } else {
      await supabase.from('ingredients').insert(payload)
    }

    setSavingIngredient(false)
    setIngredientDialogOpen(false)
    fetchIngredients()
    // Re-fetch recipes too as ingredient prices may have changed
    fetchRecipes()
  }

  async function handleDeleteIngredient(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('ingredients').delete().eq('id', id).eq('user_id', user.id)
    fetchIngredients()
    fetchRecipes()
  }

  // Inline edit for ingredients
  function startInlineEdit(ingredient: Ingredient) {
    setInlineEditId(ingredient.id)
    setInlineForm({
      name: ingredient.name,
      unit: ingredient.unit,
      price_per_unit: ingredient.price_per_unit,
      category: ingredient.category ?? '',
    })
  }

  function cancelInlineEdit() {
    setInlineEditId(null)
  }

  async function saveInlineEdit(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('ingredients')
      .update({
        name: inlineForm.name,
        unit: inlineForm.unit,
        price_per_unit: inlineForm.price_per_unit,
        category: inlineForm.category || null,
      })
      .eq('id', id)
      .eq('user_id', user.id)

    setInlineEditId(null)
    fetchIngredients()
    fetchRecipes()
  }

  // ===== Helper: calculate cost preview in dialog =====
  function dialogTotalCost(): number {
    return recipeIngredients.reduce((sum, ri) => {
      const ingredient = ingredients.find((i) => i.id === ri.ingredient_id)
      return sum + ri.quantity * (ingredient?.price_per_unit ?? 0)
    }, 0)
  }

  function dialogCostPerPortion(): number {
    const total = dialogTotalCost()
    return recipeForm.portions > 0 ? total / recipeForm.portions : 0
  }

  function dialogMargin(): number {
    const cpp = dialogCostPerPortion()
    return recipeForm.selling_price > 0
      ? ((recipeForm.selling_price - cpp) / recipeForm.selling_price) * 100
      : 0
  }

  // ===== Margin badge helper =====
  function marginVariant(margin: number): 'success' | 'warning' | 'danger' {
    if (margin >= 70) return 'success'
    if (margin >= 50) return 'warning'
    return 'danger'
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
          activeTab === 'recept' ? (
            <Button onClick={openNewRecipe}>
              <Plus className="mr-2 h-4 w-4" />
              Nytt recept
            </Button>
          ) : (
            <Button onClick={openNewIngredient}>
              <Plus className="mr-2 h-4 w-4" />
              Ny ingrediens
            </Button>
          )
        }
        tabs={
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList>
              <TabsTrigger value="recept">Recept</TabsTrigger>
              <TabsTrigger value="ingredienser">Ingredienser</TabsTrigger>
            </TabsList>

            {/* ===== Recept tab ===== */}
            <TabsContent value="recept" className="mt-6">
              {recipesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : recipes.length === 0 ? (
                <EmptyModuleState
                  icon={Calculator}
                  title="Inga recept"
                  description="Skapa ditt f\u00f6rsta recept f\u00f6r att b\u00f6rja kalkylera r\u00e4tternas kostnader och marginaler."
                  actionLabel="Nytt recept"
                  onAction={openNewRecipe}
                />
              ) : (
                <div className="space-y-3">
                  {recipes.map((recipe) => {
                    const isExpanded = expandedRecipeId === recipe.id
                    return (
                      <div
                        key={recipe.id}
                        className="rounded-xl border border-border bg-card overflow-hidden"
                      >
                        {/* Recipe header row */}
                        <div className="flex items-center justify-between gap-4 px-5 py-4">
                          <button
                            type="button"
                            className="flex items-center gap-3 min-w-0 text-left"
                            onClick={() => setExpandedRecipeId(isExpanded ? null : recipe.id)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            )}
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium text-sm">{recipe.name}</span>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                <span>{recipe.portions} portioner</span>
                                <span>F\u00f6rs\u00e4ljning: {recipe.selling_price.toFixed(0)} kr</span>
                              </div>
                            </div>
                          </button>

                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="flex flex-col items-end text-xs">
                              <span className="text-muted-foreground">
                                Kostnad/portion: {recipe.cost_per_portion.toFixed(1)} kr
                              </span>
                              <span className="text-muted-foreground">
                                Totalkostnad: {recipe.total_cost.toFixed(1)} kr
                              </span>
                            </div>
                            <StatusBadge
                              label={`${recipe.margin_percent.toFixed(0)}% marginal`}
                              variant={marginVariant(recipe.margin_percent)}
                            />
                            {recipe.margin_percent >= 60 ? (
                              <TrendingUp className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-500" />
                            )}
                            <Button variant="ghost" size="icon" onClick={() => openEditRecipe(recipe)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleDeleteRecipe(recipe.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Expanded ingredient details */}
                        {isExpanded && (
                          <div className="border-t border-border px-5 py-3 bg-muted/30">
                            {recipe.recipe_ingredients.length === 0 ? (
                              <p className="text-sm text-muted-foreground py-2">
                                Inga ingredienser tillagda \u00e4nnu.
                              </p>
                            ) : (
                              <div className="space-y-1.5">
                                <div className="grid grid-cols-4 gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wider pb-1">
                                  <span>Ingrediens</span>
                                  <span>M\u00e4ngd</span>
                                  <span>Pris/enhet</span>
                                  <span className="text-right">Kostnad</span>
                                </div>
                                {recipe.recipe_ingredients.map((ri) => {
                                  const ingredientPrice = ri.ingredients?.price_per_unit ?? 0
                                  const lineCost = ri.quantity * ingredientPrice
                                  return (
                                    <div
                                      key={ri.id}
                                      className="grid grid-cols-4 gap-4 text-sm py-1"
                                    >
                                      <span>{ri.ingredients?.name ?? 'Ok\u00e4nd'}</span>
                                      <span>
                                        {ri.quantity} {ri.unit}
                                      </span>
                                      <span>
                                        {ingredientPrice.toFixed(2)} kr/{ri.ingredients?.unit ?? ri.unit}
                                      </span>
                                      <span className="text-right font-medium">
                                        {lineCost.toFixed(2)} kr
                                      </span>
                                    </div>
                                  )
                                })}
                                <div className="border-t border-border pt-2 mt-2 grid grid-cols-4 gap-4 text-sm font-semibold">
                                  <span className="col-span-3">Totalt</span>
                                  <span className="text-right">{recipe.total_cost.toFixed(2)} kr</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </TabsContent>

            {/* ===== Ingredienser tab ===== */}
            <TabsContent value="ingredienser" className="mt-6">
              {ingredientsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : ingredients.length === 0 ? (
                <EmptyModuleState
                  icon={Package}
                  title="Inga ingredienser"
                  description="L\u00e4gg till ingredienser f\u00f6r att kunna bygga recept och kalkylera kostnader."
                  actionLabel="Ny ingrediens"
                  onAction={openNewIngredient}
                />
              ) : (
                <div className="space-y-1">
                  {/* Header */}
                  <div className="grid grid-cols-5 gap-4 px-5 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <span>Namn</span>
                    <span>Enhet</span>
                    <span>Pris/enhet</span>
                    <span>Kategori</span>
                    <span className="text-right">\u00c5tg\u00e4rder</span>
                  </div>

                  {ingredients.map((ingredient) => {
                    const isInlineEditing = inlineEditId === ingredient.id

                    if (isInlineEditing) {
                      return (
                        <div
                          key={ingredient.id}
                          className="grid grid-cols-5 gap-4 items-center rounded-xl border border-primary/30 bg-card px-5 py-3"
                        >
                          <Input
                            value={inlineForm.name}
                            onChange={(e) => setInlineForm((f) => ({ ...f, name: e.target.value }))}
                            className="h-8 text-sm"
                          />
                          <Select
                            value={inlineForm.unit}
                            onValueChange={(val) => setInlineForm((f) => ({ ...f, unit: val }))}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {UNIT_OPTIONS.map((u) => (
                                <SelectItem key={u} value={u}>{u}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={inlineForm.price_per_unit}
                            onChange={(e) =>
                              setInlineForm((f) => ({ ...f, price_per_unit: parseFloat(e.target.value) || 0 }))
                            }
                            className="h-8 text-sm"
                          />
                          <Input
                            value={inlineForm.category}
                            onChange={(e) => setInlineForm((f) => ({ ...f, category: e.target.value }))}
                            className="h-8 text-sm"
                            placeholder="Kategori"
                          />
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-emerald-600"
                              onClick={() => saveInlineEdit(ingredient.id)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={cancelInlineEdit}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div
                        key={ingredient.id}
                        className="grid grid-cols-5 gap-4 items-center rounded-xl border border-border bg-card px-5 py-3"
                      >
                        <span className="text-sm font-medium">{ingredient.name}</span>
                        <span className="text-sm text-muted-foreground">{ingredient.unit}</span>
                        <span className="text-sm">{ingredient.price_per_unit.toFixed(2)} kr</span>
                        <span className="text-sm text-muted-foreground">
                          {ingredient.category ?? '\u2014'}
                        </span>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => startInlineEdit(ingredient)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-600 hover:text-red-700"
                            onClick={() => handleDeleteIngredient(ingredient.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        }
      >
        {null}
      </ModuleWorkspaceShell>

      {/* ===== Recipe Dialog ===== */}
      <Dialog open={recipeDialogOpen} onOpenChange={setRecipeDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRecipe ? 'Redigera recept' : 'Nytt recept'}</DialogTitle>
            <DialogDescription>
              {editingRecipe
                ? 'Uppdatera receptets uppgifter och ingredienser.'
                : 'Skapa ett nytt recept och l\u00e4gg till ingredienser f\u00f6r kostnadsber\u00e4kning.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="recipe-name">Receptnamn *</Label>
              <Input
                id="recipe-name"
                value={recipeForm.name}
                onChange={(e) => setRecipeForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Pasta Carbonara"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="recipe-portions">Antal portioner *</Label>
                <Input
                  id="recipe-portions"
                  type="number"
                  min={1}
                  value={recipeForm.portions}
                  onChange={(e) =>
                    setRecipeForm((f) => ({ ...f, portions: parseInt(e.target.value) || 1 }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="recipe-price">F\u00f6rs\u00e4ljningspris per portion (kr) *</Label>
                <Input
                  id="recipe-price"
                  type="number"
                  min={0}
                  step={1}
                  value={recipeForm.selling_price}
                  onChange={(e) =>
                    setRecipeForm((f) => ({ ...f, selling_price: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="recipe-notes">Anteckningar</Label>
              <Input
                id="recipe-notes"
                value={recipeForm.notes}
                onChange={(e) => setRecipeForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Tillagningsinstruktioner, kommentarer..."
              />
            </div>

            {/* Recipe ingredients section */}
            <div className="border-t border-border pt-4 mt-2">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">Ingredienser</Label>
                <Button variant="outline" size="sm" onClick={addRecipeIngredientRow}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  L\u00e4gg till
                </Button>
              </div>

              {recipeIngredients.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Inga ingredienser tillagda \u00e4nnu. Klicka &quot;L\u00e4gg till&quot; f\u00f6r att b\u00f6rja.
                </p>
              ) : (
                <div className="space-y-2">
                  {recipeIngredients.map((ri, index) => (
                    <div key={index} className="grid grid-cols-[1fr_80px_80px_32px] gap-2 items-center">
                      <Select
                        value={ri.ingredient_id}
                        onValueChange={(val) => updateRecipeIngredient(index, 'ingredient_id', val)}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="V\u00e4lj ingrediens" />
                        </SelectTrigger>
                        <SelectContent>
                          {ingredients.map((ing) => (
                            <SelectItem key={ing.id} value={ing.id}>
                              {ing.name} ({ing.price_per_unit.toFixed(2)} kr/{ing.unit})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={ri.quantity}
                        onChange={(e) =>
                          updateRecipeIngredient(index, 'quantity', parseFloat(e.target.value) || 0)
                        }
                        className="h-9 text-sm"
                        placeholder="M\u00e4ngd"
                      />
                      <Select
                        value={ri.unit}
                        onValueChange={(val) => updateRecipeIngredient(index, 'unit', val)}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNIT_OPTIONS.map((u) => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-red-600 hover:text-red-700"
                        onClick={() => removeRecipeIngredientRow(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Cost preview */}
              {recipeIngredients.length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-muted/50 border border-border">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground block text-xs">Totalkostnad</span>
                      <span className="font-medium">{dialogTotalCost().toFixed(2)} kr</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">Kostnad/portion</span>
                      <span className="font-medium">{dialogCostPerPortion().toFixed(2)} kr</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">Marginal</span>
                      <span className={cn(
                        'font-medium',
                        dialogMargin() >= 70 ? 'text-emerald-600' :
                        dialogMargin() >= 50 ? 'text-amber-600' : 'text-red-600'
                      )}>
                        {dialogMargin().toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRecipeDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleSaveRecipe}
              disabled={savingRecipe || !recipeForm.name}
            >
              {savingRecipe && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingRecipe ? 'Uppdatera' : 'Skapa recept'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Ingredient Dialog ===== */}
      <Dialog open={ingredientDialogOpen} onOpenChange={setIngredientDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingIngredient ? 'Redigera ingrediens' : 'Ny ingrediens'}</DialogTitle>
            <DialogDescription>
              {editingIngredient
                ? 'Uppdatera ingrediensens uppgifter.'
                : 'L\u00e4gg till en ny ingrediens i ditt lager.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="ing-name">Namn *</Label>
              <Input
                id="ing-name"
                value={ingredientForm.name}
                onChange={(e) => setIngredientForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Pasta, Gr\u00e4dde, Lax..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="ing-unit">Enhet *</Label>
                <Select
                  value={ingredientForm.unit}
                  onValueChange={(val) => setIngredientForm((f) => ({ ...f, unit: val }))}
                >
                  <SelectTrigger id="ing-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ing-price">Pris per enhet (kr) *</Label>
                <Input
                  id="ing-price"
                  type="number"
                  min={0}
                  step={0.01}
                  value={ingredientForm.price_per_unit}
                  onChange={(e) =>
                    setIngredientForm((f) => ({ ...f, price_per_unit: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ing-category">Kategori</Label>
              <Input
                id="ing-category"
                value={ingredientForm.category}
                onChange={(e) => setIngredientForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="Mejeri, K\u00f6tt, Gr\u00f6nsaker..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIngredientDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleSaveIngredient}
              disabled={savingIngredient || !ingredientForm.name}
            >
              {savingIngredient && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingIngredient ? 'Uppdatera' : 'L\u00e4gg till ingrediens'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
