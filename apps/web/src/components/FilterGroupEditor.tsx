import type { Dimension, FilterCondition, FilterGroup, FilterOperator } from "../lib/explorer-api";

// The backend's FilterGroup/FilterCondition types have no stable identity
// needed for editing — a saved/loaded query is just plain JSON. For the
// editor we need something to React-key and locate-by-id while the user
// is rearranging an arbitrarily deep tree, so every node gets a
// client-only id that's stripped again in toWireFilter() before the
// query is ever sent to the server.
let idCounter = 0;
const nextId = () => `f${idCounter++}`;

export interface EditableCondition extends FilterCondition {
  id: string;
}
export interface EditableGroup {
  id: string;
  logic: "AND" | "OR";
  conditions: (EditableCondition | EditableGroup)[];
}
type EditableNode = EditableCondition | EditableGroup;

export function isEditableGroup(node: EditableNode): node is EditableGroup {
  return "logic" in node;
}

export function emptyEditableGroup(): EditableGroup {
  return { id: nextId(), logic: "AND", conditions: [] };
}

function newCondition(): EditableCondition {
  return { id: nextId(), dimension: "domain", operator: "eq", value: "" };
}

/** Strips client-only ids, and drops empty nested groups so an accidentally-added but unfilled group doesn't get sent as a real (vacuously-true) filter. */
export function toWireFilter(group: EditableGroup): FilterGroup | undefined {
  const conditions = group.conditions
    .map((n): FilterCondition | FilterGroup | null => {
      if (isEditableGroup(n)) return toWireFilter(n) ?? null;
      const { id, ...rest } = n;
      return rest;
    })
    .filter((n): n is FilterCondition | FilterGroup => n !== null);
  if (conditions.length === 0) return undefined;
  return { logic: group.logic, conditions };
}

/** Recreates an editable tree (with fresh client-only ids) from a saved/loaded FilterGroup. */
export function fromWireFilter(filter: FilterGroup | undefined): EditableGroup {
  if (!filter) return emptyEditableGroup();
  return {
    id: nextId(),
    logic: filter.logic,
    conditions: filter.conditions.map((c) => ("logic" in c ? fromWireFilter(c) : { ...c, id: nextId() })),
  };
}

// --- Immutable tree operations, all applied against the TRUE ROOT by node
// id — never against a local subtree, since node ids are unique across the
// whole tree (global counter) and mutating anything less than the true
// root would silently discard the rest of the tree. See FilterGroupEditor
// below: every handler calls these with `root`, never with the locally
// rendered `node`.

export function mapGroup(group: EditableGroup, fn: (g: EditableGroup) => EditableGroup): EditableGroup {
  const updated = fn(group);
  return { ...updated, conditions: updated.conditions.map((n) => (isEditableGroup(n) ? mapGroup(n, fn) : n)) };
}

export function addConditionTo(root: EditableGroup, groupId: string): EditableGroup {
  return mapGroup(root, (g) => (g.id === groupId ? { ...g, conditions: [...g.conditions, newCondition()] } : g));
}

export function addGroupTo(root: EditableGroup, groupId: string): EditableGroup {
  return mapGroup(root, (g) => (g.id === groupId ? { ...g, conditions: [...g.conditions, emptyEditableGroup()] } : g));
}

export function setGroupLogic(root: EditableGroup, groupId: string, logic: "AND" | "OR"): EditableGroup {
  return mapGroup(root, (g) => (g.id === groupId ? { ...g, logic } : g));
}

export function updateConditionInTree(root: EditableGroup, conditionId: string, patch: Partial<FilterCondition>): EditableGroup {
  function walk(g: EditableGroup): EditableGroup {
    return {
      ...g,
      conditions: g.conditions.map((n) => {
        if (isEditableGroup(n)) return walk(n);
        return n.id === conditionId ? { ...n, ...patch } : n;
      }),
    };
  }
  return walk(root);
}

export function removeNodeFromTree(root: EditableGroup, nodeId: string): EditableGroup {
  function walk(g: EditableGroup): EditableGroup {
    return {
      ...g,
      conditions: g.conditions.filter((n) => n.id !== nodeId).map((n) => (isEditableGroup(n) ? walk(n) : n)),
    };
  }
  return walk(root);
}

// --- UI ----------------------------------------------------------------

const DIMENSIONS: Dimension[] = [
  "domain",
  "registeredDomain",
  "clientId",
  "clientIp",
  "protocol",
  "queryType",
  "responseCode",
  "cached",
  "blocked",
  "recursive",
  "category",
];

const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: "eq", label: "=" },
  { value: "ne", label: "!=" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "gte", label: ">=" },
  { value: "lte", label: "<=" },
  { value: "contains", label: "contains" },
];

const GROUP_DEPTH_BORDERS = ["border-accent/40", "border-blue-400/40", "border-purple-400/40", "border-green-400/40"];
const MAX_NESTING_DEPTH = 3;

/**
 * `root` is always the true top-level filter tree, threaded unchanged
 * through every level of recursion. `node` is the subtree actually being
 * rendered at this level (equal to `root` at the top call). Every mutation
 * handler below operates on `root` located by `node.id`/child id — never
 * mutates `node` directly — so a change made three groups deep still
 * produces a correct, complete new root rather than silently discarding
 * everything outside that subtree.
 */
export function FilterGroupEditor({
  root,
  node,
  onChange,
  isRoot = true,
  depth = 0,
}: {
  root: EditableGroup;
  node: EditableGroup;
  onChange: (newRoot: EditableGroup) => void;
  isRoot?: boolean;
  depth?: number;
}) {
  return (
    <div className={isRoot ? "" : `ml-4 border-l-2 pl-3 ${GROUP_DEPTH_BORDERS[depth % GROUP_DEPTH_BORDERS.length]}`}>
      <div className="mb-2 flex items-center gap-2">
        {!isRoot && <span className="text-xs text-faint">group:</span>}
        {node.conditions.length > 1 && (
          <select
            value={node.logic}
            onChange={(e) => onChange(setGroupLogic(root, node.id, e.target.value as "AND" | "OR"))}
            className="rounded border border-border bg-bg px-1.5 py-0.5 text-xs text-text outline-none"
          >
            <option value="AND">AND</option>
            <option value="OR">OR</option>
          </select>
        )}
        <button onClick={() => onChange(addConditionTo(root, node.id))} className="rounded border border-border px-2 py-0.5 text-xs text-muted hover:text-accent">
          + filter
        </button>
        {depth < MAX_NESTING_DEPTH && (
          <button onClick={() => onChange(addGroupTo(root, node.id))} className="rounded border border-border px-2 py-0.5 text-xs text-muted hover:text-accent">
            + group
          </button>
        )}
        {!isRoot && (
          <button onClick={() => onChange(removeNodeFromTree(root, node.id))} className="text-xs text-faint hover:text-crit">
            remove group
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {node.conditions.map((child) =>
          isEditableGroup(child) ? (
            <FilterGroupEditor key={child.id} root={root} node={child} onChange={onChange} isRoot={false} depth={depth + 1} />
          ) : (
            <div key={child.id} className="flex items-center gap-2">
              <select
                value={child.dimension}
                onChange={(e) => onChange(updateConditionInTree(root, child.id, { dimension: e.target.value as Dimension }))}
                className="rounded border border-border bg-bg px-2 py-1 text-xs text-text outline-none"
              >
                {DIMENSIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                value={child.operator}
                onChange={(e) => onChange(updateConditionInTree(root, child.id, { operator: e.target.value as FilterOperator }))}
                className="rounded border border-border bg-bg px-2 py-1 text-xs text-text outline-none"
              >
                {OPERATORS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              <input
                value={String(child.value)}
                onChange={(e) => onChange(updateConditionInTree(root, child.id, { value: e.target.value }))}
                placeholder="value"
                className="w-40 rounded border border-border bg-bg px-2 py-1 text-xs text-text outline-none focus:border-accent"
              />
              <button onClick={() => onChange(removeNodeFromTree(root, child.id))} className="text-xs text-faint hover:text-crit">
                remove
              </button>
            </div>
          )
        )}
        {node.conditions.length === 0 && isRoot && <p className="text-xs text-faint">No filters — querying all events in range.</p>}
      </div>
    </div>
  );
}
