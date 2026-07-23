import { test, expect } from "bun:test";
import { declaresCustomHook } from "../src/policy/conventions/react-hooks";
import { declaresStore, countStores } from "../src/policy/conventions/stores";
import { importsTanstackQuery, declaresQueryHook } from "../src/policy/conventions/query";
import { langOfPath, isVendorPath, isInterfacesPath, isTypesPath, isHooksPath, isStoresPath, isQueryPath, isComponentsPath } from "../src/policy/conventions/langs";

test("react-hooks: exported use* decl; comments/strings rejected", () => {
  expect(declaresCustomHook("export function useAuth() {\n  return null;\n}")).toBe(true);
  expect(declaresCustomHook("export const useCounter = () => 0;")).toBe(true);
  expect(declaresCustomHook("export default function useTheme() {}")).toBe(true);
  expect(declaresCustomHook("// export function useFake() {}")).toBe(false);
  expect(declaresCustomHook("export function helper() {}")).toBe(false);
});

test("stores: zustand + pinia decls; multi-store counted; comments rejected", () => {
  expect(declaresStore("export const useAuthStore = create<Auth>()((set) => ({}));", "zustand")).toBe(true);
  const pinia = "import { defineStore } from 'pinia';\nexport const useAuth = defineStore('auth', () => {});";
  expect(declaresStore(pinia, "pinia")).toBe(true);
  expect(declaresStore("// export const useFake = create(() => ({}));", "zustand")).toBe(false);
  expect(countStores("export const a = create(() => ({}));\nexport const b = create(() => ({}));", "zustand")).toBe(2);
});

test("stores FP: Object.create, home-made factory, pinia without import never match", () => {
  expect(declaresStore("export const obj = Object.create(null);", "zustand")).toBe(false);
  expect(declaresStore("export const widget = create(() => ({ render() {} }));", "zustand")).toBe(false);
  expect(declaresStore("export const useAuth = defineStore('auth', () => {});", "pinia")).toBe(false); // no pinia import
});

test("query: import signal + exported definition vs inline consumption", () => {
  const def = "import { useQuery } from '@tanstack/react-query';\nexport const useUsers = () => useQuery({ queryKey: ['u'] });";
  expect(importsTanstackQuery(def)).toBe(true);
  expect(declaresQueryHook(def)).toBe(true);
  const inline = "import { useUsers } from '../query/users';\nexport const Page = () => useUsers();";
  expect(importsTanstackQuery(inline)).toBe(false);
  expect(declaresQueryHook(inline)).toBe(false);
});

test("langs: families, vendor exclusion, canonical path predicates", () => {
  expect(langOfPath("/p/a.tsx")).toBe("ts");
  expect(langOfPath("/p/a.vue")).toBe("vue");
  expect(langOfPath("/p/a.css")).toBeNull();
  expect(isVendorPath("/p/node_modules/x/a.ts")).toBe(true);
  expect(isInterfacesPath("/p/modules/u/src/interfaces/a.ts")).toBe(true);
  expect(isTypesPath("/p/modules/u/src/types/a.ts")).toBe(true);
  expect(isHooksPath("/p/modules/u/src/hooks/useA.ts")).toBe(true);
  expect(isHooksPath("/p/composables/useA.ts")).toBe(true);
  expect(isStoresPath("/p/modules/u/src/stores/a.store.ts")).toBe(true);
  expect(isQueryPath("/p/modules/u/src/query/users.ts")).toBe(true);
  expect(isComponentsPath("/p/modules/u/components/Btn.tsx")).toBe(true);
});
