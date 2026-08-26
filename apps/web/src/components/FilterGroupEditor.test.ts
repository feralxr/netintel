import { describe, it, expect } from "vitest";
import {
  emptyEditableGroup,
  addConditionTo,
  addGroupTo,
  updateConditionInTree,
  removeNodeFromTree,
  setGroupLogic,
  toWireFilter,
  fromWireFilter,
  isEditableGroup,
} from "./FilterGroupEditor";

describe("toWireFilter", () => {
  it("returns undefined for an empty root (no filters = query everything)", () => {
    expect(toWireFilter(emptyEditableGroup())).toBeUndefined();
  });

  it("strips client-only ids from the wire format", () => {
    let root = emptyEditableGroup();
    root = addConditionTo(root, root.id);
    root = updateConditionInTree(root, root.conditions[0].id, { dimension: "domain", operator: "eq", value: "example.com" });
    const wire = toWireFilter(root)!;
    expect(wire.conditions[0]).toEqual({ dimension: "domain", operator: "eq", value: "example.com" });
    expect("id" in wire.conditions[0]).toBe(false);
  });

  it("drops an empty nested group rather than sending a vacuous filter", () => {
    let root = emptyEditableGroup();
    root = addConditionTo(root, root.id);
    root = updateConditionInTree(root, root.conditions[0].id, { dimension: "blocked", operator: "eq", value: true });
    root = addGroupTo(root, root.id); // never filled in
    const wire = toWireFilter(root)!;
    expect(wire.conditions).toHaveLength(1);
  });
});

describe("fromWireFilter round-trip", () => {
  it("is stable through toWireFilter -> fromWireFilter -> toWireFilter", () => {
    let root = emptyEditableGroup();
    root = addConditionTo(root, root.id);
    root = updateConditionInTree(root, root.conditions[0].id, { dimension: "domain", operator: "eq", value: "example.com" });
    root = addGroupTo(root, root.id);
    const nested = root.conditions[1];
    if (!isEditableGroup(nested)) throw new Error("expected a group");
    root = addConditionTo(root, nested.id);
    root = updateConditionInTree(root, root.conditions[1].conditions[0].id, { dimension: "queryType", operator: "eq", value: "A" });

    const wire1 = toWireFilter(root)!;
    const roundTripped = fromWireFilter(wire1);
    const wire2 = toWireFilter(roundTripped);
    expect(wire2).toEqual(wire1);
  });

  it("returns an empty group for undefined input", () => {
    const g = fromWireFilter(undefined);
    expect(g.conditions).toHaveLength(0);
  });
});

describe("deep tree mutations preserve sibling state", () => {
  // This is the exact bug class caught during development: an early
  // version threaded onChange such that a mutation inside a nested group
  // would replace the ENTIRE root with just that subtree, silently
  // discarding every sibling condition/group outside it. These tests
  // guard against that regressing.

  it("mutating a condition deep inside a nested group does not lose a sibling top-level condition", () => {
    let root = emptyEditableGroup();
    root = addConditionTo(root, root.id);
    root = updateConditionInTree(root, root.conditions[0].id, { dimension: "domain", operator: "eq", value: "example.com" });

    root = addGroupTo(root, root.id);
    const nested = root.conditions[1];
    if (!isEditableGroup(nested)) throw new Error("expected a group");
    root = addConditionTo(root, nested.id);
    root = addConditionTo(root, nested.id);

    const freshNested = root.conditions[1];
    if (!isEditableGroup(freshNested)) throw new Error("expected a group");
    root = updateConditionInTree(root, freshNested.conditions[0].id, { dimension: "queryType", operator: "eq", value: "A" });
    root = updateConditionInTree(root, freshNested.conditions[1].id, { dimension: "responseCode", operator: "eq", value: "NXDOMAIN" });
    root = setGroupLogic(root, freshNested.id, "OR");

    const wire = toWireFilter(root)!;
    const hasTopCondition = wire.conditions.some((c) => !("logic" in c) && c.dimension === "domain" && c.value === "example.com");
    expect(hasTopCondition).toBe(true);
    expect(wire.conditions).toHaveLength(2); // top-level condition + nested group, nothing lost or duplicated
  });

  it("supports 3 levels of nesting", () => {
    let root = emptyEditableGroup();
    root = addGroupTo(root, root.id);
    let level1 = root.conditions[0];
    if (!isEditableGroup(level1)) throw new Error("expected a group");
    root = addGroupTo(root, level1.id);
    level1 = root.conditions[0] as typeof level1;
    if (!isEditableGroup(level1)) throw new Error("expected a group");
    const level2 = level1.conditions[0];
    if (!isEditableGroup(level2)) throw new Error("expected a group");
    root = addConditionTo(root, level2.id);

    const wire = toWireFilter(root)!;
    expect("logic" in wire.conditions[0]).toBe(true);
    const l1 = wire.conditions[0] as { logic: string; conditions: unknown[] };
    expect("logic" in l1.conditions[0]).toBe(true);
  });

  it("removing a nested group leaves the rest of the tree intact", () => {
    let root = emptyEditableGroup();
    root = addConditionTo(root, root.id);
    root = updateConditionInTree(root, root.conditions[0].id, { dimension: "domain", operator: "eq", value: "example.com" });
    root = addGroupTo(root, root.id);
    const nested = root.conditions[1];
    if (!isEditableGroup(nested)) throw new Error("expected a group");

    root = removeNodeFromTree(root, nested.id);

    const wire = toWireFilter(root)!;
    expect(wire.conditions).toHaveLength(1);
    expect(wire.conditions[0]).toMatchObject({ dimension: "domain", value: "example.com" });
  });

  it("removing one condition among several siblings only removes that one", () => {
    let root = emptyEditableGroup();
    root = addConditionTo(root, root.id);
    root = addConditionTo(root, root.id);
    root = addConditionTo(root, root.id);
    const [c1, c2, c3] = root.conditions;
    root = updateConditionInTree(root, c1.id, { value: "a" });
    root = updateConditionInTree(root, c2.id, { value: "b" });
    root = updateConditionInTree(root, c3.id, { value: "c" });

    root = removeNodeFromTree(root, c2.id);

    const wire = toWireFilter(root)!;
    const values = wire.conditions.map((c) => (c as { value: unknown }).value);
    expect(values).toEqual(["a", "c"]);
  });
});
