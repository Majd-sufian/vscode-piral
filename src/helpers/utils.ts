import * as vscode from 'vscode';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export enum RepoType {
  Piral = 0,
  Pilet = 1,
  Mono = 2,
  Undefined = 3,
}

export const bundlers = ['piral-cli-parcel', 'piral-cli-webpack'];

export const piralFramework = ['piral-base', 'piral-core', 'piral'];

export function readPackageJson(filePath: string) {
  try {
    const packageFile = readFileSync(filePath, 'utf8');
    return JSON.parse(packageFile);
  } catch {
    return undefined;
  }
}

export function getRepoType(): RepoType {
  const workspaceFolder = getWorkspaceRoot();

  if (workspaceFolder !== undefined) {
    const filePath = resolve(workspaceFolder.uri.fsPath, 'package.json');
    const packageJson = readPackageJson(filePath);

    if (packageJson) {
      const { pilets, piral, dependencies = {} } = packageJson;

      if (pilets !== undefined || Object.keys(dependencies).some((m) => piralFramework.includes(m))) {
        return RepoType.Piral;
      } else if (piral !== undefined) {
        vscode.window.showInformationMessage('Pilet workspace found.');
        return RepoType.Pilet;
      }
    }
  }

  return RepoType.Undefined;
}

export function getWorkspaceRoot() {
  return vscode.workspace.workspaceFolders?.[0];
}

export function getVersionOfDependency(dependency: string) {
  const workspaceFolder = getWorkspaceRoot();

  if (workspaceFolder != undefined) {
    const filePath = resolve(workspaceFolder.uri.fsPath, 'node_modules', dependency, 'package.json');
    const packageJson = readPackageJson(filePath);

    if (packageJson && packageJson.version !== undefined) {
      return packageJson.version;
    }
  }

  return '';
}

export function getBundler(packageJson: any) {
  const { devDependencies = {} } = packageJson;

  for (const bundler of bundlers) {
    if (devDependencies[bundler] !== undefined) {
      return {
        name: bundler,
        version: getVersionOfDependency(bundler),
      };
    }
  }

  return undefined;
}

function installDependencies(workspaceFsPath: string) {
  if (existsSync(`${workspaceFsPath}/yarn.lock`)) {
    execCommand('yarn install')  
  } else if (existsSync(`${workspaceFsPath}/pnpm-lock-.yaml`)){
    execCommand('pnpm install')  
  } else {
    execCommand('npm install')
  }
}

function execCommand(cmd: string | undefined): vscode.Terminal | undefined {
  if (cmd) {
    const term = vscode.window.createTerminal({
      name: 'Piral',
    });
    term.sendText(cmd, true);
    term.show(true);

    return term;
  }

  return undefined;
}

export function runCommand(cmd: string, requiredRepoType = RepoType.Undefined) {
  const workspace = getWorkspaceRoot();
  if (requiredRepoType === RepoType.Undefined) {
    return execCommand(cmd);
  }

  if (!workspace) {
    vscode.window.showErrorMessage('Require a workspace to run the command.');
  } else if (getRepoType() !== requiredRepoType) {
    vscode.window.showErrorMessage(`Command works only with ${requiredRepoType} projects!`);
  } else {
    const nodeModulesAreAvailable = existsSync(`${workspace.uri.fsPath}/node_modules`);

    if (!nodeModulesAreAvailable) {
      // ask user to install node-modules
      vscode.window
        .showInformationMessage(
          'Dependencies are not installed yet, should we install the dependencies now?',
          'Yes',
          'No',
        )
        .then((answer) => {
          if (answer === 'Yes') {
            installDependencies(workspace.uri.fsPath)
          }
        });
    } else {
      // execute the command - cmd
      const project = resolve(workspace.uri.fsPath, 'package.json');

      try {
        const { scripts = {} } = __non_webpack_require__(project) || {};
        const candidates = Object.keys(scripts).filter((m) => scripts[m].trim().startsWith(cmd));
        const shellCommand =
          candidates.length === 0 ? cmd : candidates.length === 1 ? scripts[candidates.pop() ?? ''] : undefined;

        if (shellCommand !== undefined) {
          execCommand(shellCommand);
        } else {
          vscode.window.showQuickPick(candidates).then(execCommand);
        }
      } catch (err) {
        vscode.window.showErrorMessage(
          `Could not load the "package.json". Make sure the works pace is valid "${project}".`,
        );
      }
    }
  }
}
