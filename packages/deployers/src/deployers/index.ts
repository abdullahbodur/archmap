import type { Deployer } from "../types";
import { GitDeployer } from "./git";
import { FilesDeployer } from "./files";

export type DeployerType = "git" | "files";

export interface DeployerOptions {
  git?: {
    commitMessage?: string;
    authorName?: string;
    authorEmail?: string;
  };
}

export function createDeployer(
  type: DeployerType,
  opts: DeployerOptions = {}
): Deployer {
  switch (type) {
    case "git":
      return new GitDeployer(opts.git);
    case "files":
      return new FilesDeployer();
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown deployer type: ${String(_exhaustive)}`);
    }
  }
}
