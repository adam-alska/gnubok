'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Search, Building2, Globe } from 'lucide-react'
import SupplierForm from '@/components/suppliers/SupplierForm'
import Link from 'next/link'
import type { Supplier, SupplierType, CreateSupplierInput } from '@/types'

const supplierTypeLabels: Record<SupplierType, string> = {
  swedish_business: 'Svenskt företag',
  eu_business: 'EU-företag',
  non_eu_business: 'Utanför EU',
}

const supplierTypeIcons: Record<SupplierType, React.ElementType> = {
  swedish_business: Building2,
  eu_business: Globe,
  non_eu_business: Globe,
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchSuppliers()
  }, [])

  async function fetchSuppliers() {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta leverantörer',
        variant: 'destructive',
      })
    } else {
      setSuppliers(data || [])
    }
    setIsLoading(false)
  }

  async function handleCreateSupplier(data: CreateSupplierInput) {
    setIsCreating(true)

    const response = await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    const result = await response.json()

    if (!response.ok) {
      const fieldErrors = result.errors?.map((e: { field: string; message: string }) => `${e.field}: ${e.message}`).join(', ')
      toast({
        title: 'Fel',
        description: fieldErrors || result.error || 'Kunde inte skapa leverantör',
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Leverantör skapad',
        description: `${data.name} har lagts till`,
      })
      setSuppliers([...suppliers, result.data])
      setIsDialogOpen(false)
    }

    setIsCreating(false)
  }

  const filteredSuppliers = suppliers.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.org_number?.includes(searchTerm)
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leverantörer</h1>
          <p className="text-muted-foreground">
            Hantera dina leverantörer och deras betalningsuppgifter
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Ny leverantör
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Lägg till leverantör</DialogTitle>
            </DialogHeader>
            <SupplierForm
              onSubmit={handleCreateSupplier}
              isLoading={isCreating}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Sök på namn, e-post eller org.nr..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Supplier list */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 bg-muted rounded w-1/2" />
                <div className="h-4 bg-muted rounded w-1/3 mt-2" />
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-muted rounded w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <Card>
          <CardContent>
            {searchTerm ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Inga träffar</h3>
                <p className="text-muted-foreground text-center mt-1">
                  Inga leverantörer matchar &quot;{searchTerm}&quot;
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Inga leverantörer</h3>
                <p className="text-muted-foreground text-center mt-1">
                  Lägg till din första leverantör för att börja registrera inköpsfakturor
                </p>
                <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Ny leverantör
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredSuppliers.map((supplier) => {
            const Icon = supplierTypeIcons[supplier.supplier_type]
            return (
              <Link key={supplier.id} href={`/suppliers/${supplier.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{supplier.name}</CardTitle>
                          <CardDescription>{supplier.email || 'Ingen e-post'}</CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary">
                        {supplierTypeLabels[supplier.supplier_type]}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground space-y-1">
                      {supplier.org_number && (
                        <p>Org.nr: {supplier.org_number}</p>
                      )}
                      {supplier.bankgiro && (
                        <p>Bankgiro: {supplier.bankgiro}</p>
                      )}
                      {supplier.city && (
                        <p>{supplier.city}, {supplier.country}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
