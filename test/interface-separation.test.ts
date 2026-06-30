import { test, expect } from "bun:test";
import { interfaceSeparationGuard } from "../src/policy/guards/interface-separation";

test("blocks top-level interface in a .tsx component", () => {
  expect(interfaceSeparationGuard({ tool: "Write", filePath: "src/components/Button.tsx", content: "export interface ButtonProps {\n  label: string;\n}\n" })?.kind).toBe("block");
});

test("blocks abstract class in a PHP controller", () => {
  expect(interfaceSeparationGuard({ tool: "Edit", filePath: "app/Http/Controllers/UserController.php", content: "<?php\nabstract class BaseController {}\n" })?.kind).toBe("block");
});

test("blocks `class …Request/DTO/Interface` in a PHP controller (Python parity)", () => {
  expect(interfaceSeparationGuard({ tool: "Write", filePath: "app/Http/Controllers/UserController.php", content: "<?php\nclass UserRequest extends FormRequest {}\n" })?.kind).toBe("block");
  expect(interfaceSeparationGuard({ tool: "Write", filePath: "src/Controllers/PayController.php", content: "<?php\nclass PaymentDTO {}\n" })?.kind).toBe("block");
  // Plain class with no DTO/Request/Interface suffix is allowed (matches Python).
  expect(interfaceSeparationGuard({ tool: "Write", filePath: "app/Controllers/UserController.php", content: "<?php\nclass UserService {}\n" })).toBeNull();
});

test("singular directory variants also match (view/, controller/)", () => {
  expect(interfaceSeparationGuard({ tool: "Write", filePath: "app/view/Home.py", content: "class HomeView(BaseModel):\n    pass\n" })?.kind).toBe("block");
  expect(interfaceSeparationGuard({ tool: "Write", filePath: "src/Controller/Pay.php", content: "<?php\nabstract class BasePay {}\n" })?.kind).toBe("block");
});

test("null without a top-level decl, on path/content mismatch, and non Write/Edit", () => {
  expect(interfaceSeparationGuard({ tool: "Write", filePath: "src/components/Button.tsx", content: "export function Button() { return null; }\n" })).toBeNull();
  expect(interfaceSeparationGuard({ tool: "Write", filePath: "app/Http/Controllers/U.php", content: "export interface Foo { a: number }\n" })).toBeNull();
  expect(interfaceSeparationGuard({ tool: "Read", filePath: "src/components/Button.tsx", content: "export interface P { a: number }\n" })).toBeNull();
});
