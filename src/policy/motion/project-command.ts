/** @module motion/project-command Resolve command-local motion projects. */
import { dirname } from "node:path";
import type { MotionCommand, MotionProject } from "../interfaces/motion";
import { loadMotionProject } from "./project";
import { commandContexts, homePath, renderEntryPaths } from "./command-context";
import { classifyMotionCommand, invokesRender, shellMotionWriteTargets } from "./command";

/** Locate the cwd project or a child project named by cd/script path arguments. */
export function commandMotionProject(command: string | undefined, cwd: string, home: string): MotionProject | null {
  const direct = loadMotionProject(cwd, home);
  if (!command) return direct;
  const projects = new Map<string, MotionProject>();
  const directories = new Map<string, MotionProject | null>();
  const at = (directory: string): MotionProject | null => {
    if (!directories.has(directory)) directories.set(directory, loadMotionProject(directory, home));
    return directories.get(directory) ?? null;
  };
  for (const [segment, current] of commandContexts(command, cwd, home)) {
    const classifications = new Map<string, MotionCommand>();
    const classification = (project: MotionProject): MotionCommand => {
      let result = classifications.get(project.root);
      if (!result) { result = classifyMotionCommand(segment, current, project, home); classifications.set(project.root, result); }
      return result;
    };
    let explicitRender = false;
    for (const token of renderEntryPaths(segment)) {
      const child = at(dirname(homePath(token, current, home)));
      if (child && invokesRender(segment, child.render)) { projects.set(child.root, child); explicitRender = true; }
    }
    const project = at(current);
    if (project && !explicitRender && classification(project).renderStage) projects.set(project.root, project);
    for (const target of shellMotionWriteTargets(segment)) {
      if (/[$*?[]/.test(target)) continue;
      const destination = at(dirname(homePath(target, current, home)));
      if (destination && classification(destination).ffmpegMaster) projects.set(destination.root, destination);
    }
  }
  if (projects.size > 1) throw new Error("Multiple protected motion projects in one command require separate tool calls");
  return projects.values().next().value ?? direct;
}
