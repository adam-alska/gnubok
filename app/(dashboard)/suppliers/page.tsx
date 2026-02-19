'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Search, Building2, Mail, Phone, MapPin, Loader2 } from 'lucide-react'
import SupplierForm from '@/components/suppliers/SupplierForm'
import Link from 'next/link'
import type { Supplier, CreateSupplierInput } from '@/types/suppliers'

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
      toast({
        title: 'Fel',
        description: result.error || 'Kunde inte skapa leverantör',
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

  const filteredSuppliers = suppliers.filter((supplier) =>
    supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.org_number?.includes(searchTerm)
  )

  const activeSuppliers = filteredSuppliers.filter((s) => s.is_active)
  const inactiveSuppliers = filteredSuppliers.filter((s) => !s.is_active)

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
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              {searchTerm ? (
                <>
                  <h3 className="text-lg font-medium">Inga träffar</h3>
                  <p className="text-muted-foreground text-center mt-1">
                    Inga leverantörer matchar &quot;{searchTerm}&quot;
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-medium">Inga leverantörer</h3>
                  <p className="text-muted-foreground text-center mt-1">
                    Lägg till din första leverantör för att börja registrera fakturor
                  </p>
                  <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Lägg till leverantör
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeSuppliers.map((supplier) => (
              <Link key={supplier.id} href={`/suppliers/${supplier.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{supplier.name}</CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {supplier.email || 'Ingen e-post'}
                          </p>
                        </div>
                      </div>
                      {supplier.category && (
                        <Badge variant="secondary">{supplier.category}</Badge>
                      )}
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
                      {supplier.plusgiro && (
                        <p>Plusgiro: {supplier.plusgiro}</p>
                      )}
                      {supplier.city && (
                        <p className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {supplier.city}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Inactive suppliers */}
          {inactiveSuppliers.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                Inaktiva leverantörer ({inactiveSuppliers.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {inactiveSuppliers.map((supplier) => (
                  <Link key={supplier.id} href={`/suppliers/${supplier.id}`}>
                    <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full opacity-60">
                      <CardHeader>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{supplier.name}</CardTitle>
                            <Badge variant="secondary" className="text-xs">Inaktiv</Badge>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
