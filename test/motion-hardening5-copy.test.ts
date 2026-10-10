import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { artifactMutationViolation } from "../src/policy/motion/guard-artifact";
import { loadMotionProject } from "../src/policy/motion/project";
import { projectStoreDir } from "../src/policy/motion/store";

const root = mkdtempSync(join(tmpdir(), "motion-copy5-"));
const home = join(root, "isolated-home");
mkdirSync(join(root, ".motion/stills"), { recursive: true });
mkdirSync(join(root, "out"));
writeFileSync(join(root, ".motion/project.json"), JSON.stringify({ draft: "out/draft.mp4", masters: ["out/master.mp4"] }));
const project = loadMotionProject(root, home)!;
const store = projectStoreDir(project.root, home);
mkdirSync(store, { recursive: true });
writeFileSync(join(store, "approvals.json"), JSON.stringify({ approvals: [{ artifact: project.contact }, { artifact: project.draft }] }));
const guard = (command: string) => artifactMutationViolation(command, project, root, home);
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("R1 benign copies to project root do not remove approved artifacts", () => {
  for (const command of ["cp ../x.txt .", "cp ../x.txt ./", "cp ../x.txt notes.txt", "cp -t . ../x.txt", "cp out/draft.mp4 notes.mp4"]) expect(guard(command)).toBeNull();
});

test("R1 real replacement and destructive ancestor operations stay refused", () => {
  for (const command of ["cp ../draft.mp4 out/", "cp ../x.txt out/draft.mp4", "cp ../contact.png .motion/stills/", "cp -R ../.motion .", "rm -rf .", "mv . elsewhere", "sh -c 'cp ../draft.mp4 out/'", "cd out && cp ../../draft.mp4 ."]) expect(guard(command)?.kind).toBe("block");
});
