import { test, expect } from "bun:test";
import { declaresStore, countStores } from "../src/policy/conventions/stores";
import { declaresQueryHook } from "../src/policy/conventions/query";
import { checkSolidFromTranscript } from "../src/runtime/lifecycle/aipilot/solid-transcript";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("G1: generic store forms — create<S>(, create<Store<T>>(, create(, curried all match", () => {
  const imp = "import { create } from 'zustand';\n";
  expect(declaresStore(imp + "export const useCartStore = create<CartState>((set) => ({}));", "zustand")).toBe(true);
  expect(declaresStore(imp + "export const useS = create<Store<Auth>>((set) => ({}));", "zustand")).toBe(true);
  expect(declaresStore(imp + "export const useS = create((set) => ({}));", "zustand")).toBe(true);
  expect(declaresStore("export const useS = create<S>()((set) => ({}));", "zustand")).toBe(true);
  expect(declaresStore("export const o = Object.create(null);", "zustand")).toBe(false);
  expect(declaresStore("export const w = create(() => ({ render() {} }));", "zustand")).toBe(false);
  expect(countStores("export const a = create<A>()((s) => ({}));\nexport const b = create<B>()((s) => ({}));", "zustand")).toBe(2);
});

test("G2: query generics — useQuery<T>(, useMutation<D, E>(, useInfiniteQuery<T>( match", () => {
  expect(declaresQueryHook("import { useQuery } from '@tanstack/react-query';\nexport const useCart = () => useQuery<CartItem[]>({ queryKey: ['c'] });")).toBe(true);
  expect(declaresQueryHook("export const useM = () => useMutation<Data, Error>({ mutationFn: f });")).toBe(true);
  expect(declaresQueryHook("export const useI = () => useInfiniteQuery<Page>({ queryKey: ['p'] });")).toBe(true);
  expect(declaresQueryHook("export const useQ = () => useQuery({ queryKey: ['c'] });")).toBe(true); // no generic, unchanged
});

test("G3: livetest-app project — interfaces/ and types/ exempt; real component fires", async () => {
  const root = mkdtempSync(join(tmpdir(), "livetest-app-"));
  mkdirSync(join(root, "modules/x/src/interfaces"), { recursive: true });
  mkdirSync(join(root, "modules/x/src/types"), { recursive: true });
  mkdirSync(join(root, "components"), { recursive: true });
  const iface = join(root, "modules/x/src/interfaces/user.ts");
  const type = join(root, "modules/x/src/types/user.ts");
  const comp = join(root, "components/Btn.tsx");
  writeFileSync(iface, "export interface User { id: string }\n");
  writeFileSync(type, "export type User = { id: string };\n");
  writeFileSync(comp, "export interface Props { label: string }\n");
  const transcript = join(root, "agent.jsonl");
  const line = (fp: string) => JSON.stringify({ message: { content: [{ type: "tool_use", name: "Write", input: { file_path: fp } }] } });
  writeFileSync(transcript, [line(iface), line(type), line(comp)].join("\n"));
  const out = await checkSolidFromTranscript(transcript);
  expect(out).toContain("Btn.tsx");
  expect(out).not.toContain("user.ts");
});
