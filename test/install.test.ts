import { test, expect } from "bun:test";
import { installGuard } from "../src/policy/guards/install";

test("asks on project + system installs", () => {
  expect(installGuard({ tool: "Bash", command: "npm install left-pad" })?.kind).toBe("ask");
  expect(installGuard({ tool: "Bash", command: "sudo apt-get install ripgrep" })?.kind).toBe("ask");
  expect(installGuard({ tool: "Bash", command: "pacman -S neovim" })?.kind).toBe("ask");
});

test("null for non-install + non-Bash", () => {
  expect(installGuard({ tool: "Bash", command: "npm run build" })).toBeNull();
  expect(installGuard({ tool: "Edit", command: "npm install foo" })).toBeNull();
});
