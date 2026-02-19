'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, ChevronDown, FolderTree, Pencil, Trash2, Plus } from 'lucide-react'
import type { CostCenter } from '@/types/budget-costcenters'

interface CostCenterTreeProps {
  costCenters: CostCenter[]
  onEdit?: (costCenter: CostCenter) => void
  onDelete?: (costCenter: CostCenter) => void
  onAddChild?: (parentId: string) => void
  selectedId?: string
  onSelect?: (costCenter: CostCenter) => void
}

interface TreeNode extends CostCenter {
  children: TreeNode[]
}

function buildTree(costCenters: CostCenter[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  // Create nodes
  for (const cc of costCenters) {
    map.set(cc.id, { ...cc, children: [] })
  }

  // Build tree
  for (const cc of costCenters) {
    const node = map.get(cc.id)!
    if (cc.parent_id && map.has(cc.parent_id)) {
      map.get(cc.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

function TreeNodeRow({
  node,
  level,
  onEdit,
  onDelete,
  onAddChild,
  selectedId,
  onSelect,
}: {
  node: TreeNode
  level: number
  onEdit?: (costCenter: CostCenter) => void
  onDelete?: (costCenter: CostCenter) => void
  onAddChild?: (parentId: string) => void
  selectedId?: string
  onSelect?: (costCenter: CostCenter) => void
}) {
  const [isExpanded, setIsExpanded] = useState(true)
  const hasChildren = node.children.length > 0
  const isSelected = selectedId === node.id

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 py-2 px-3 rounded-md group transition-colors',
          isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/50',
          !node.is_active && 'opacity-50'
        )}
        style={{ paddingLeft: `${level * 24 + 12}px` }}
      >
        {/* Expand/collapse toggle */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'h-5 w-5 flex items-center justify-center rounded-sm hover:bg-muted transition-colors',
            !hasChildren && 'invisible'
          )}
        >
          {isExpanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </button>

        {/* Icon */}
        <FolderTree className="h-4 w-4 text-muted-foreground flex-shrink-0" />

        {/* Content */}
        <button
          className="flex-1 flex items-center gap-2 min-w-0 text-left"
          onClick={() => onSelect?.(node)}
        >
          <Badge variant="outline" className="font-mono text-xs flex-shrink-0">
            {node.code}
          </Badge>
          <span className="text-sm font-medium truncate">{node.name}</span>
          {node.manager_name && (
            <span className="text-xs text-muted-foreground truncate hidden sm:inline">
              ({node.manager_name})
            </span>
          )}
          {!node.is_active && (
            <Badge variant="secondary" className="text-xs">Inaktiv</Badge>
          )}
        </button>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onAddChild && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => onAddChild(node.id)}
              title="Lägg till underställe"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => onEdit(node)}
              title="Redigera"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={() => onDelete(node)}
              title="Ta bort"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {node.children
            .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
            .map(child => (
              <TreeNodeRow
                key={child.id}
                node={child}
                level={level + 1}
                onEdit={onEdit}
                onDelete={onDelete}
                onAddChild={onAddChild}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ))}
        </div>
      )}
    </div>
  )
}

export default function CostCenterTree({
  costCenters,
  onEdit,
  onDelete,
  onAddChild,
  selectedId,
  onSelect,
}: CostCenterTreeProps) {
  const tree = buildTree(costCenters)

  if (tree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <FolderTree className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Inga kostnadsställen</p>
        <p className="text-sm">Skapa ditt första kostnadsställe</p>
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {tree
        .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
        .map(node => (
          <TreeNodeRow
            key={node.id}
            node={node}
            level={0}
            onEdit={onEdit}
            onDelete={onDelete}
            onAddChild={onAddChild}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
    </div>
  )
}
